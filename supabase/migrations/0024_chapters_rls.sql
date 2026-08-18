-- Returns the cluster an active admin is scoped to, or null for a PYH (whose
-- cluster_id is null) and for anyone who is not an active admin. Mirrors
-- is_pyh() in 0008b_admins_rbac.sql.
create or replace function admin_cluster(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cluster_id from admins
  where user_id = uid and deleted_at is null and is_active = true
$$;

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
