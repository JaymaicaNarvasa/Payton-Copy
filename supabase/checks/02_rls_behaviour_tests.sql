-- Behaviour tests. Run in Supabase > SQL Editor AFTER 001, 002 and 003.
-- Replace NORMAL_USER_EMAIL with a NON-admin test account (with a profile row), and
-- SUPPORT_ADMIN_EMAIL with an admin whose role is 'support' (or leave it to skip that section).
-- The script ends with an intentional error whose message is the report. That error rolls back
-- every change, so nothing is left in your database.
do $$
declare
  v_user    uuid := (select id from auth.users where email = 'NORMAL_USER_EMAIL');
  v_other   uuid := (select id from auth.users where email <> 'NORMAL_USER_EMAIL' limit 1);
  v_support uuid := (select id from auth.users where email = 'SUPPORT_ADMIN_EMAIL');
  v_report  text := '';
  v_n       int;
  v_before  text;
  v_after   text;
begin
  if v_user is null then raise exception 'NORMAL_USER_EMAIL was not found in auth.users'; end if;
  select p.role::text into v_before from public.profiles p where p.id = v_user;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  set local role authenticated;

  -- ordinary user: administrative functions and tables
  begin perform public.admin_dashboard_stats();
        v_report := v_report || E'FAIL  ordinary user can call admin_dashboard_stats\n';
  exception when others then v_report := v_report || E'PASS  admin_dashboard_stats blocked (' || sqlerrm || E')\n'; end;

  begin perform public.admin_add_admin('x@example.com', 'super_admin');
        v_report := v_report || E'FAIL  ordinary user can call admin_add_admin\n';
  exception when others then v_report := v_report || E'PASS  admin_add_admin blocked (' || sqlerrm || E')\n'; end;

  begin perform 1 from public.admin_users;
        v_report := v_report || E'FAIL  ordinary user can read admin_users\n';
  exception when others then v_report := v_report || E'PASS  admin_users unreadable (' || sqlerrm || E')\n'; end;

  begin insert into public.admin_users (user_id, admin_role) values (v_user, 'super_admin');
        v_report := v_report || E'FAIL  ordinary user can insert into admin_users\n';
  exception when others then v_report := v_report || E'PASS  admin_users not writable (' || sqlerrm || E')\n'; end;

  begin insert into public.admin_audit_logs (action) values ('forged');
        v_report := v_report || E'FAIL  ordinary user can insert audit log rows\n';
  exception when others then v_report := v_report || E'PASS  audit log insert blocked (' || sqlerrm || E')\n'; end;

  begin update public.admin_audit_logs set action = 'edited';
        v_report := v_report || E'FAIL  ordinary user can update audit log rows\n';
  exception when others then v_report := v_report || E'PASS  audit log update blocked (' || sqlerrm || E')\n'; end;

  -- monitoring records cannot be forged by clients
  begin insert into public.ai_usage_logs (operation, model, status) values ('help', 'x', 'success');
        v_report := v_report || E'FAIL  ordinary user can insert ai_usage_logs\n';
  exception when others then v_report := v_report || E'PASS  ai_usage_logs insert blocked (' || sqlerrm || E')\n'; end;

  begin insert into public.system_heartbeat default values;
        v_report := v_report || E'FAIL  ordinary user can insert system_heartbeat\n';
  exception when others then v_report := v_report || E'PASS  system_heartbeat insert blocked (' || sqlerrm || E')\n'; end;

  begin insert into public.reminder_runs (status) values ('ok');
        v_report := v_report || E'FAIL  ordinary user can insert reminder_runs\n';
  exception when others then v_report := v_report || E'PASS  reminder_runs insert blocked (' || sqlerrm || E')\n'; end;

  -- role escalation on the profile
  begin update public.profiles set role = 'super_admin' where id = v_user; exception when others then null; end;
  select p.role::text into v_after from public.profiles p where p.id = v_user;
  v_report := v_report || case when v_after is not distinct from v_before
    then E'PASS  profile role could not be changed to super_admin\n'
    else E'FAIL  profile role changed to ' || coalesce(v_after, 'null') || E'\n' end;

  -- feedback: own rows only
  begin insert into public.user_feedback (category, message) values ('other', 'rls test ' || gen_random_uuid()::text);
        select count(*) into v_n from public.user_feedback where user_id = v_user;
        v_report := v_report || case when v_n >= 1 then E'PASS  feedback saved with user_id taken from the session\n'
                                     else E'FAIL  feedback insert left no row for this user\n' end;
  exception when others then v_report := v_report || E'FAIL  own feedback insert rejected (' || sqlerrm || E') - did 003 run?\n'; end;

  begin insert into public.user_feedback (category, message, status) values ('other', 'preset status', 'resolved');
        v_report := v_report || E'FAIL  user can preset status = resolved\n';
  exception when others then v_report := v_report || E'PASS  preset status rejected (' || sqlerrm || E')\n'; end;

  if v_other is not null then
    begin insert into public.user_feedback (user_id, category, message) values (v_other, 'other', 'as someone else');
          v_report := v_report || E'FAIL  user can submit feedback as another user\n';
    exception when others then v_report := v_report || E'PASS  feedback as another user rejected (' || sqlerrm || E')\n'; end;
  end if;

  begin update public.user_feedback set status = 'resolved';
        v_report := v_report || E'FAIL  user can update feedback\n';
  exception when others then v_report := v_report || E'PASS  feedback update blocked (' || sqlerrm || E')\n'; end;

  select count(*) into v_n from public.user_feedback where user_id is distinct from v_user;
  v_report := v_report || case when v_n = 0 then E'PASS  user sees only their own feedback\n'
                               else E'FAIL  user can read ' || v_n || E' feedback rows of others\n' end;

  -- support administrator is read-only
  if v_support is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_support, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_support::text, true);
    begin perform public.admin_dashboard_stats();
          v_report := v_report || E'PASS  support admin can read dashboard stats\n';
    exception when others then v_report := v_report || E'FAIL  support admin cannot read stats (' || sqlerrm || E')\n'; end;
    begin perform public.admin_update_feedback(gen_random_uuid(), 'resolved', null);
          v_report := v_report || E'FAIL  support admin can update feedback\n';
    exception when others then v_report := v_report || E'PASS  support admin blocked from updating feedback (' || sqlerrm || E')\n'; end;
    begin perform public.admin_add_admin('x@example.com', 'support');
          v_report := v_report || E'FAIL  support admin can add administrators\n';
    exception when others then v_report := v_report || E'PASS  support admin blocked from adding administrators (' || sqlerrm || E')\n'; end;
  end if;

  raise exception E'RLS TEST REPORT (this error is intentional and rolls everything back):\n%', v_report;
end $$;
