-- Payton Admin Panel - modules 2 (run ONCE in Supabase > SQL Editor, after 001_admin_foundation.sql)
-- Adds: administrator management, system status snapshot, user_feedback table + admin review functions.
-- Non-destructive: no drops of data, no changes to existing RLS policies, no changes to existing tables.
-- Existing function replaced: admin_log_event (same signature and grants; allows two more event names).

-- 1) Audit events the admin may log about themselves (password change, sign-out of other devices).
create or replace function public.admin_log_event(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action not in ('login','logout','password_changed','sessions_revoked') then
    raise exception 'unsupported action';
  end if;
  insert into public.admin_audit_logs (actor_id, action) values (auth.uid(), p_action);
end $$;

-- 2) Roles and permissions -------------------------------------------------------------------
-- Read: any administrator. Write: super_admin only, checked here in the database.
-- Because you cannot change or remove your own account, a super admin always remains.
create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, access_role text,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, p.full_name::text, a.admin_role, a.created_at, u.last_sign_in_at
      from public.admin_users a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = a.user_id
     order by a.created_at;
end $$;

create or replace function public.admin_add_admin(p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.admin_role() is distinct from 'super_admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_role not in ('super_admin','support') then
    raise exception 'Invalid role';
  end if;
  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and u.email_confirmed_at is not null
     and (u.banned_until is null or u.banned_until < now())
   limit 1;
  if v_id is null then
    raise exception 'No verified, active account was found with that email';
  end if;
  if exists (select 1 from public.admin_users x where x.user_id = v_id) then
    raise exception 'That account is already an administrator';
  end if;
  insert into public.admin_users (user_id, admin_role) values (v_id, p_role);
  insert into public.admin_audit_logs (actor_id, action, target_user_id, details)
  values (auth.uid(), 'admin_added', v_id, jsonb_build_object('reason', 'Role: ' || p_role));
end $$;

create or replace function public.admin_set_admin_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if public.admin_role() is distinct from 'super_admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_role not in ('super_admin','support') then
    raise exception 'Invalid role';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  select a.admin_role into v_old from public.admin_users a where a.user_id = p_user_id for update;
  if v_old is null then
    raise exception 'That account is not an administrator';
  end if;
  if v_old = p_role then
    return;
  end if;
  update public.admin_users set admin_role = p_role where user_id = p_user_id;
  insert into public.admin_audit_logs (actor_id, action, target_user_id, details)
  values (auth.uid(), 'admin_role_changed', p_user_id,
          jsonb_build_object('reason', v_old || ' to ' || p_role));
end $$;

create or replace function public.admin_remove_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if public.admin_role() is distinct from 'super_admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove your own administrator access';
  end if;
  delete from public.admin_users where user_id = p_user_id returning admin_role into v_old;
  if v_old is null then
    raise exception 'That account is not an administrator';
  end if;
  insert into public.admin_audit_logs (actor_id, action, target_user_id, details)
  values (auth.uid(), 'admin_removed', p_user_id, jsonb_build_object('reason', 'Was: ' || v_old));
end $$;

-- 3) System monitoring snapshot (counts and size only; no personal data) ----------------------
create or replace function public.admin_system_status()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return json_build_object(
    'server_time',          now(),
    'database_size_bytes',  pg_database_size(current_database()),
    'signed_in_24h',        (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
    'new_users_24h',        (select count(*) from auth.users where created_at > now() - interval '24 hours'),
    'suspended_users',      (select count(*) from public.profiles where account_status = 'suspended'),
    'admin_count',          (select count(*) from public.admin_users),
    'admin_actions_24h',    (select count(*) from public.admin_audit_logs
                              where created_at > now() - interval '24 hours'
                                and action not in ('login','logout')),
    'last_admin_action_at', (select max(created_at) from public.admin_audit_logs)
  );
end $$;

-- 4) Reports and feedback ----------------------------------------------------------------------
-- No feedback/report table existed in the app or in the schema information we have, so one is added.
-- Technical reports are feedback with category 'bug'.
create table if not exists public.user_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  category    text not null default 'other' check (category in ('bug','feature','account','ai','other')),
  message     text not null check (char_length(message) between 1 and 2000),
  status      text not null default 'new' check (status in ('new','in_review','resolved','dismissed')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists user_feedback_status_created_idx on public.user_feedback (status, created_at desc);

alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from anon, authenticated;
grant select, insert on public.user_feedback to authenticated;

-- Users can only add feedback as themselves (status and review fields cannot be preset) and read their own.
drop policy if exists "users insert own feedback" on public.user_feedback;
create policy "users insert own feedback" on public.user_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new'
              and admin_note is null and reviewed_by is null and reviewed_at is null);

drop policy if exists "users read own feedback" on public.user_feedback;
create policy "users read own feedback" on public.user_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No UPDATE or DELETE policy: users cannot edit or delete feedback. Admins act only through the functions below.

create or replace function public.admin_list_feedback(
  p_status text default null, p_category text default null, p_search text default '',
  p_from date default null, p_to date default null, p_limit int default 10, p_offset int default 0)
returns table (id uuid, created_at timestamptz, category text, status text, message text,
               admin_note text, user_email text, user_name text, reviewed_by_email text,
               reviewed_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select f.id, f.created_at, f.category, f.status, f.message, f.admin_note,
           u.email::text, p.full_name::text, r.email::text, f.reviewed_at, count(*) over()
      from public.user_feedback f
      left join auth.users u on u.id = f.user_id
      left join public.profiles p on p.id = f.user_id
      left join auth.users r on r.id = f.reviewed_by
     where (coalesce(p_status, '')   = '' or f.status   = p_status)
       and (coalesce(p_category, '') = '' or f.category = p_category)
       and (p_from is null or f.created_at >= p_from::timestamptz)
       and (p_to   is null or f.created_at <  (p_to + 1)::timestamptz)
       and (coalesce(p_search, '') = ''
            or f.message ilike '%' || p_search || '%'
            or u.email::text ilike '%' || p_search || '%')
     order by f.created_at desc
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_feedback_summary()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return json_build_object(
    'total',     (select count(*) from public.user_feedback),
    'by_status', (select coalesce(json_object_agg(s.status, s.n), '{}'::json)
                    from (select f.status, count(*) as n from public.user_feedback f group by f.status) s)
  );
end $$;

create or replace function public.admin_update_feedback(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.admin_role() is distinct from 'super_admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('new','in_review','resolved','dismissed') then
    raise exception 'Invalid status';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'The note is too long (500 characters maximum)';
  end if;
  update public.user_feedback
     set status = p_status, admin_note = nullif(trim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  if not found then
    raise exception 'Feedback item not found';
  end if;
  -- The audit entry stores the new status only, never the message text.
  insert into public.admin_audit_logs (actor_id, action, details)
  values (auth.uid(), 'feedback_updated', jsonb_build_object('reason', 'Marked ' || p_status));
end $$;

-- 5) Only signed-in users may call these; each function re-checks administrator status itself.
revoke all on function public.admin_list_admins()                                  from public, anon;
revoke all on function public.admin_add_admin(text, text)                          from public, anon;
revoke all on function public.admin_set_admin_role(uuid, text)                     from public, anon;
revoke all on function public.admin_remove_admin(uuid)                             from public, anon;
revoke all on function public.admin_system_status()                                from public, anon;
revoke all on function public.admin_list_feedback(text, text, text, date, date, int, int) from public, anon;
revoke all on function public.admin_feedback_summary()                             from public, anon;
revoke all on function public.admin_update_feedback(uuid, text, text)              from public, anon;
grant execute on function public.admin_list_admins()                               to authenticated;
grant execute on function public.admin_add_admin(text, text)                       to authenticated;
grant execute on function public.admin_set_admin_role(uuid, text)                  to authenticated;
grant execute on function public.admin_remove_admin(uuid)                          to authenticated;
grant execute on function public.admin_system_status()                             to authenticated;
grant execute on function public.admin_list_feedback(text, text, text, date, date, int, int) to authenticated;
grant execute on function public.admin_feedback_summary()                          to authenticated;
grant execute on function public.admin_update_feedback(uuid, text, text)           to authenticated;
