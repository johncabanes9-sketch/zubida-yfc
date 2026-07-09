-- 0005_rls.sql
alter table events enable row level security;
alter table event_registrations enable row level security;
alter table admins enable row level security;
alter table audit_log enable row level security;
alter table email_log enable row level security;
alter table rate_limits enable row level security;

drop policy if exists events_public_read on events;
create policy events_public_read on events
  for select using (deleted_at is null);

drop policy if exists events_admin_write on events;
create policy events_admin_write on events
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists registrations_admin_read on event_registrations;
create policy registrations_admin_read on event_registrations
  for select to authenticated using (is_admin(auth.uid()));

drop policy if exists registrations_admin_update on event_registrations;
create policy registrations_admin_update on event_registrations
  for update to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists admins_self_read on admins;
create policy admins_self_read on admins
  for select to authenticated using (is_admin(auth.uid()));

drop policy if exists audit_admin_read on audit_log;
create policy audit_admin_read on audit_log
  for select to authenticated using (is_admin(auth.uid()));
-- email_log, rate_limits: no policies => only service role / SECURITY DEFINER funcs touch them.
