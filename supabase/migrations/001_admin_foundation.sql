-- Payton Admin Panel - foundation (run once in Supabase > SQL Editor)
-- Adds: admin allowlist, audit log, account_status, protection trigger, admin-only functions.
-- Does NOT change existing RLS policies or existing mobile-app tables (except one new column on profiles).

-- 1) Admin allowlist: who is an administrator. Not editable from any app.
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  admin_role text not null check (admin_role in ('super_admin','support')),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;   -- no policies = no direct access

-- 2) Audit log: written only by the server (Edge Function / SECURITY DEFINER functions).
create table if not exists public.admin_audit_logs (
  id             bigint generated always as identity primary key,
  actor_id       uuid references auth.users(id) on delete set null,
  action         text not null,
  target_user_id uuid,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;

-- 3) Account status on profiles (new column, existing rows become 'active').
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active','suspended'));

-- 4) Protect sensitive profile columns from ordinary users.
--    Requests from the mobile app have auth.uid() set; the SQL Editor and the service-role
--    key (Edge Functions) do not, so server-side changes are still allowed.
create or replace function public.guard_profile_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'account_status can only be changed by the server';
  end if;
  if new.role is distinct from old.role then
    if old.role is not null then
      raise exception 'role cannot be changed after it is chosen';
    end if;
    if new.role::text not in ('Personal','Spender','Sponsor') then
      raise exception 'invalid role';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_changes on public.profiles;
create trigger trg_guard_profile_changes
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- 5) Admin helper + admin-only functions (all check admin status inside the database).
create or replace function public.admin_role()
returns text language sql stable security definer set search_path = '' as $$
  select admin_role from public.admin_users where user_id = auth.uid()
$$;

create or replace function public.admin_dashboard_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return json_build_object(
    'total_users',     (select count(*) from public.profiles),
    'by_role',         (select coalesce(json_object_agg(r.k, r.n), '{}'::json)
                          from (select coalesce(role::text, 'Not chosen yet') as k, count(*) as n
                                  from public.profiles group by 1) r),
    'verified_users',  (select count(*) from auth.users where email_confirmed_at is not null),
    'suspended_users', (select count(*) from public.profiles where account_status = 'suspended'),
    'active_last_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'new_last_7d',     (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_14d',     (select coalesce(json_agg(json_build_object('day', s.d, 'n', s.n) order by s.d), '[]'::json)
                          from (select created_at::date as d, count(*) as n
                                  from auth.users where created_at > now() - interval '14 days'
                                 group by 1) s),
    -- row counts only: no amounts, descriptions, or personal financial details
    'records', json_build_object(
      'expenses',       (select count(*) from public.expenses),
      'income',         (select count(*) from public.income),
      'allowances',     (select count(*) from public.allowances),
      'reminders',      (select count(*) from public.reminders),
      'split_expenses', (select count(*) from public.split_expenses)
    )
  );
end $$;

create or replace function public.admin_list_users(
  p_search text default '', p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, email text, full_name text, role text, account_status text,
  email_verified boolean, created_at timestamptz, last_sign_in_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select p.id, p.email::text, p.full_name::text, p.role::text, p.account_status,
           (u.email_confirmed_at is not null), u.created_at, u.last_sign_in_at, count(*) over()
      from public.profiles p
      join auth.users u on u.id = p.id
     where coalesce(p_search, '') = ''
        or p.email::text     ilike '%' || p_search || '%'
        or p.full_name::text ilike '%' || p_search || '%'
     order by u.created_at desc
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_list_audit_logs(p_limit int default 25, p_offset int default 0)
returns table (
  id bigint, created_at timestamptz, action text, actor_email text,
  target_user_id uuid, target_email text, details jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select l.id, l.created_at, l.action, ua.email::text, l.target_user_id, ut.email::text,
           l.details, count(*) over()
      from public.admin_audit_logs l
      left join auth.users ua on ua.id = l.actor_id
      left join auth.users ut on ut.id = l.target_user_id
     order by l.id desc
     limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_log_event(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action not in ('login','logout') then
    raise exception 'unsupported action';
  end if;
  insert into public.admin_audit_logs (actor_id, action) values (auth.uid(), p_action);
end $$;

-- 6) Only signed-in users may call these (and each one re-checks admin status itself).
revoke all on function public.admin_role()                          from public, anon;
revoke all on function public.admin_dashboard_stats()               from public, anon;
revoke all on function public.admin_list_users(text, int, int)      from public, anon;
revoke all on function public.admin_list_audit_logs(int, int)       from public, anon;
revoke all on function public.admin_log_event(text)                 from public, anon;
grant execute on function public.admin_role()                       to authenticated;
grant execute on function public.admin_dashboard_stats()            to authenticated;
grant execute on function public.admin_list_users(text, int, int)   to authenticated;
grant execute on function public.admin_list_audit_logs(int, int)    to authenticated;
grant execute on function public.admin_log_event(text)              to authenticated;

-- 7) Create your FIRST admin manually (replace the email; the account must already exist
--    in Authentication > Users). Run this separately, once.
-- insert into public.admin_users (user_id, admin_role)
-- select id, 'super_admin' from auth.users where email = 'YOUR_ADMIN_EMAIL';
