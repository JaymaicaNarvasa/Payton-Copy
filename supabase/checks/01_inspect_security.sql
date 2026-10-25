-- Read-only. Run once in Supabase > SQL Editor and export the single result cell (or copy it) to review.
-- Shows RLS status, columns, policies, triggers and client table privileges for the tables Payton's
-- admin features depend on. Contains no user data.
select jsonb_pretty(jsonb_build_object(
  'rls', (select jsonb_agg(jsonb_build_object('table', c.relname, 'rls_enabled', c.relrowsecurity) order by c.relname)
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'),
  'columns', (select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type,
                                                  'nullable', is_nullable, 'default', column_default)
                               order by table_name, ordinal_position)
                from information_schema.columns
               where table_schema = 'public'
                 and table_name in ('profiles','user_feedback','admin_users','admin_audit_logs','ai_usage_logs',
                                    'system_heartbeat','reminder_runs')),
  'policies', (select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'command', cmd,
                                                   'roles', roles, 'using', qual, 'with_check', with_check)
                                order by tablename, policyname)
                 from pg_policies where schemaname = 'public'),
  'triggers', (select jsonb_agg(jsonb_build_object('table', event_object_table, 'trigger', trigger_name,
                                                   'event', event_manipulation) order by event_object_table, trigger_name)
                 from information_schema.triggers where trigger_schema = 'public'),
  'client_privileges', (select jsonb_agg(jsonb_build_object('table', table_name, 'role', grantee, 'privilege', privilege_type)
                                         order by table_name, grantee, privilege_type)
                          from information_schema.role_table_grants
                         where table_schema = 'public' and grantee in ('anon','authenticated')
                           and table_name in ('profiles','user_feedback','admin_users','admin_audit_logs','ai_usage_logs',
                                              'system_heartbeat','reminder_runs'))
)) as security_report;
