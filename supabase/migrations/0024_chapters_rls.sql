-- admin_cluster(uuid) already exists, defined in 0008b_admins_rbac.sql (which
-- runs before this migration). Ten existing policy clauses across
-- 0010_rls_rbac.sql, 0011_events_delete_active.sql, and 0015_event_images.sql
-- depend on it for events, event_registrations, and event_images. This
-- migration deliberately does NOT redefine it: a second `create or replace`
-- here would be a duplicate-definition hazard — a later edit to 0008b would
-- silently have no effect on a fresh database, because this migration runs
-- after it and would win. The policies below simply call the existing
-- function.

-- Public: published, undeleted rows only.
drop policy if exists chapters_public_read on chapters;
create policy chapters_public_read on chapters for select to anon, authenticated
  using (is_published = true and deleted_at is null);

-- Any active admin reads the whole province. Read is deliberately NOT scoped:
-- hiding the province from the people running parts of it buys no
-- confidentiality, and the admin list is more useful whole.
drop policy if exists chapters_admin_read on chapters;
create policy chapters_admin_read on chapters for select to authenticated
  using (is_pyh(auth.uid()) or admin_cluster(auth.uid()) is not null);

drop policy if exists chapters_pyh_write on chapters;
create policy chapters_pyh_write on chapters for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- `with check` as well as `using`: without it a cluster head could move a row
-- into another cluster, which `using` alone does not prevent.
--
-- admin_cluster() returns null for a PYH, so `cluster_id = null` evaluates to
-- null, which is falsy — the PYH is covered solely by chapters_pyh_write. The
-- same holds for a malformed cluster head with a null cluster_id: the
-- comparison denies rather than permits. Do not "fix" this with coalesce.
drop policy if exists chapters_cluster_write on chapters;
create policy chapters_cluster_write on chapters for all to authenticated
  using (cluster_id = admin_cluster(auth.uid()))
  with check (cluster_id = admin_cluster(auth.uid()));
