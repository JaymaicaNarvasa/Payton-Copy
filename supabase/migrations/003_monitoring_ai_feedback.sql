-- Payton - migration 003 (run ONCE in Supabase > SQL Editor, after 001 and 002).
-- Adds: feedback hardening for the mobile app, AI usage log, database heartbeat, reminder run log,
--       and admin-only read functions for them.
-- Non-destructive: no drops of data, no changes to existing policies, tables only added.

-- 1) Feedback from the mobile app -----------------------------------------------------------------
-- user_id is filled in by the database from the signed-in session, so the app never sends it.
-- The existing insert policy still requires user_id = auth.uid(), so rows can only ever be your own.
alter table public.user_feedback alter column user_id set default auth.uid();

-- Stops accidental double-sends and spam: same message within 10 minutes, or more than 10 per day.
create or replace function public.guard_feedback_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.user_feedback f
              where f.user_id = new.user_id and f.message = new.message
                and f.created_at > now() - interval '10 minutes') then
    raise exception 'You already sent this feedback a moment ago.';
  end if;
  if (select count(*) from public.user_feedback f
       where f.user_id = new.user_id and f.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Daily feedback limit reached. Please try again tomorrow.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_feedback_insert on public.user_feedback;
create trigger trg_guard_feedback_insert
  before insert on public.user_feedback
  for each row execute function public.guard_feedback_insert();

-- 2) AI usage log: written only by the ai-proxy Edge Function (service role). No prompts or answers. --
create table if not exists public.ai_usage_logs (
  id            bigint generated always as identity primary key,
  user_id       uuid references auth.users(id) on delete set null,
  operation     text not null check (operation in ('help','scan','insight','coach','pacing')),
  model         text not null,
  status        text not null check (status in ('success','error','rate_limited')),
  error_code    text,
  latency_ms    integer,
  prompt_tokens integer,
  output_tokens integer,
  total_tokens  integer,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
create index if not exists ai_usage_logs_user_created_idx on public.ai_usage_logs (user_id, created_at desc);
alter table public.ai_usage_logs enable row level security;
revoke all on public.ai_usage_logs from anon, authenticated;   -- no policies: clients cannot read or write

-- 3) Database heartbeat: a scheduled job proves the database was running at each timestamp. ----------
create table if not exists public.system_heartbeat (
  id      bigint generated always as identity primary key,
  beat_at timestamptz not null default now()
);
create index if not exists system_heartbeat_beat_idx on public.system_heartbeat (beat_at desc);
alter table public.system_heartbeat enable row level security;
revoke all on public.system_heartbeat from anon, authenticated;

-- pg_cron is available on the Supabase free plan. If it cannot be enabled, this prints a notice and
-- the Monitoring page will say that no heartbeat is recorded (nothing is faked).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'payton-db-heartbeat', '*/10 * * * *',
    $cmd$ insert into public.system_heartbeat default values;
          delete from public.system_heartbeat where beat_at < now() - interval '30 days'; $cmd$);
exception when others then
  raise notice 'Heartbeat job not scheduled (pg_cron unavailable): %', sqlerrm;
end $$;

-- 4) Reminder runs: written by the send-reminders Edge Function. Counts only, no emails or titles. ---
create table if not exists public.reminder_runs (
  id           bigint generated always as identity primary key,
  run_at       timestamptz not null default now(),
  due_count    integer not null default 0,
  sent_count   integer not null default 0,
  failed_count integer not null default 0,
  status       text not null check (status in ('ok','partial','error'))
);
create index if not exists reminder_runs_run_at_idx on public.reminder_runs (run_at desc);
alter table public.reminder_runs enable row level security;
revoke all on public.reminder_runs from anon, authenticated;

-- 5) Admin read functions (any administrator; each re-checks admin status in the database). ----------
create or replace function public.admin_ai_usage_summary(p_days int default 7)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_days int := least(greatest(coalesce(p_days, 7), 1), 90);
        v_since timestamptz;
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_since := now() - make_interval(days => v_days);
  return json_build_object(
    'days',                     v_days,
    'total_logged',             (select count(*) from public.ai_usage_logs),
    'requests',                 (select count(*) from public.ai_usage_logs l where l.created_at >= v_since),
    'success',                  (select count(*) from public.ai_usage_logs l where l.created_at >= v_since and l.status = 'success'),
    'error',                    (select count(*) from public.ai_usage_logs l where l.created_at >= v_since and l.status = 'error'),
    'rate_limited',             (select count(*) from public.ai_usage_logs l where l.created_at >= v_since and l.status = 'rate_limited'),
    'avg_latency_ms',           (select round(avg(l.latency_ms)) from public.ai_usage_logs l
                                  where l.created_at >= v_since and l.status = 'success' and l.latency_ms is not null),
    'tokens_total',             (select sum(l.total_tokens) from public.ai_usage_logs l where l.created_at >= v_since),
    'requests_with_token_data', (select count(l.total_tokens) from public.ai_usage_logs l where l.created_at >= v_since),
    'by_operation',             (select coalesce(json_object_agg(x.op, x.n), '{}'::json)
                                  from (select l.operation as op, count(*) as n from public.ai_usage_logs l
                                         where l.created_at >= v_since group by l.operation) x),
    'last_success_at',          (select max(l.created_at) from public.ai_usage_logs l where l.status = 'success'),
    'last_error_at',            (select max(l.created_at) from public.ai_usage_logs l where l.status = 'error'),
    'recent_errors',            (select coalesce(json_agg(json_build_object('at', e.created_at, 'operation', e.operation,
                                                                           'model', e.model, 'code', e.error_code)
                                                          order by e.created_at desc), '[]'::json)
                                  from (select * from public.ai_usage_logs l where l.status = 'error'
                                         order by l.created_at desc limit 5) e)
  );
end $$;

create or replace function public.admin_monitoring_history()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if public.admin_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return json_build_object(
    'heartbeat', json_build_object(
      'first_at',  (select min(b.beat_at) from public.system_heartbeat b),
      'last_at',   (select max(b.beat_at) from public.system_heartbeat b),
      'count_24h', (select count(*) from public.system_heartbeat b where b.beat_at > now() - interval '24 hours'),
      'gaps',      (select coalesce(json_agg(json_build_object('from', x.prev_at, 'to', x.beat_at)
                                             order by x.beat_at desc), '[]'::json)
                      from (select h.beat_at, h.prev_at
                              from (select b.beat_at, lag(b.beat_at) over (order by b.beat_at) as prev_at
                                      from public.system_heartbeat b
                                     where b.beat_at > now() - interval '7 days') h
                             where h.prev_at is not null and h.beat_at - h.prev_at > interval '25 minutes'
                             order by h.beat_at desc limit 5) x)
    ),
    'reminders', json_build_object(
      'runs_7d',        (select count(*) from public.reminder_runs r where r.run_at > now() - interval '7 days'),
      'failed_runs_7d', (select count(*) from public.reminder_runs r where r.run_at > now() - interval '7 days' and r.status <> 'ok'),
      'last_run',       (select json_build_object('at', r.run_at, 'due', r.due_count, 'sent', r.sent_count,
                                                  'failed', r.failed_count, 'status', r.status)
                           from public.reminder_runs r order by r.run_at desc limit 1)
    )
  );
end $$;

revoke all on function public.admin_ai_usage_summary(int)   from public, anon;
revoke all on function public.admin_monitoring_history()    from public, anon;
grant execute on function public.admin_ai_usage_summary(int) to authenticated;
grant execute on function public.admin_monitoring_history()  to authenticated;
