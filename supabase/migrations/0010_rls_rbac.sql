-- 0010_rls_rbac.sql — two-tier RBAC policies
alter table clusters enable row level security;

-- EVENTS ---------------------------------------------------------------
drop policy if exists events_admin_write on events;

drop policy if exists events_insert on events;
create policy events_insert on events
  for insert to authenticated
  with check (
    is_pyh(auth.uid())
    or (is_admin(auth.uid()) and cluster_id is not distinct from admin_cluster(auth.uid()))
  );

drop policy if exists events_update on events;
create policy events_update on events
  for update to authenticated
  using (
    is_pyh(auth.uid())
    or (is_admin(auth.uid()) and cluster_id is not distinct from admin_cluster(auth.uid()))
  )
  with check (
    is_pyh(auth.uid())
    or (is_admin(auth.uid()) and cluster_id is not distinct from admin_cluster(auth.uid()))
  );

drop policy if exists events_delete on events;
create policy events_delete on events
  for delete to authenticated
  using (
    is_pyh(auth.uid())
    or (created_by = auth.uid() and cluster_id is not distinct from admin_cluster(auth.uid()))
  );

-- EVENT_REGISTRATIONS --------------------------------------------------
drop policy if exists registrations_admin_read on event_registrations;
create policy registrations_admin_read on event_registrations
  for select to authenticated
  using (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_registrations.event_id
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
        and is_admin(auth.uid())
    )
  );

drop policy if exists registrations_admin_update on event_registrations;
create policy registrations_admin_update on event_registrations
  for update to authenticated
  using (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_registrations.event_id
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
        and is_admin(auth.uid())
    )
  )
  with check (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_registrations.event_id
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
        and is_admin(auth.uid())
    )
  );

-- ADMINS ---------------------------------------------------------------
-- self/all read stays (needed for role checks); writes are PYH-only.
drop policy if exists admins_pyh_write on admins;
create policy admins_pyh_write on admins
  for all to authenticated
  using (is_pyh(auth.uid()))
  with check (is_pyh(auth.uid()));

-- CLUSTERS -------------------------------------------------------------
drop policy if exists clusters_admin_read on clusters;
create policy clusters_admin_read on clusters
  for select to authenticated using (is_admin(auth.uid()));

drop policy if exists clusters_pyh_write on clusters;
create policy clusters_pyh_write on clusters
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- AUDIT_LOG ------------------------------------------------------------
drop policy if exists audit_admin_read on audit_log;
create policy audit_pyh_read on audit_log
  for select to authenticated using (is_pyh(auth.uid()));
