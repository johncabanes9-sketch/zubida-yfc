-- admin_cluster(uuid) and is_pyh(uuid) already exist, defined in
-- 0008b_admins_rbac.sql (which runs before this migration). This migration
-- deliberately does NOT redefine them: a second `create or replace` here would
-- be a duplicate-definition hazard — a later edit to 0008b would silently have
-- no effect on a fresh database, because this migration runs after it and would
-- win. Ten existing policy clauses across events, event_registrations,
-- event_images, and chapters depend on the originals. See the same note in
-- 0024_chapters_rls.sql. The policies below simply call them.

-- cluster_id is derived, never trusted from the client. Without this, a row
-- could name a chapter in one cluster and a cluster_id in another, and every
-- policy below would be reasoning about the wrong one.
--
-- Not security definer on purpose: the lookup runs as the writer, so a chapter
-- the writer cannot read yields no row and leaves cluster_id null, which the
-- cluster-head `with check` below denies. A security-definer lookup would hand
-- back a cluster the caller was never allowed to see.
create or replace function leaders_set_cluster() returns trigger
language plpgsql as $$
begin
  if new.chapter_id is not null then
    select cluster_id into new.cluster_id from chapters where id = new.chapter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leaders_derive_cluster on leaders;
create trigger leaders_derive_cluster
  before insert or update on leaders
  for each row execute function leaders_set_cluster();

-- Public: published, undeleted rows only.
drop policy if exists leaders_public_read on leaders;
create policy leaders_public_read on leaders for select to anon, authenticated
  using (is_published = true and deleted_at is null);

-- Any active cluster-scoped admin, plus the PYH, reads the whole province.
-- Read is deliberately NOT scoped: hiding the province from the people running
-- parts of it buys no confidentiality.
drop policy if exists leaders_admin_read on leaders;
create policy leaders_admin_read on leaders for select to authenticated
  using (is_pyh(auth.uid()) or admin_cluster(auth.uid()) is not null);

drop policy if exists leaders_pyh_write on leaders;
create policy leaders_pyh_write on leaders for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- Cluster heads get insert and update, not delete. The app soft-deletes
-- (deleted_at); a hard delete would bypass that trail entirely. With no policy
-- covering DELETE for a cluster head, Postgres RLS denies the command outright
-- (0 rows affected, no error). The PYH keeps delete via leaders_pyh_write.
--
-- `with check` as well as `using` on the update policy: without it a cluster
-- head could move a row into another cluster, which `using` alone does not
-- prevent.
--
-- admin_cluster() returns null for a PYH, so `cluster_id = null` evaluates to
-- null, which is falsy — the PYH is covered solely by leaders_pyh_write. The
-- same holds for a provincial-level leader (cluster_id null) and for a
-- malformed cluster head with a null cluster_id: the comparison denies rather
-- than permits. Do not "fix" this with coalesce.
--
-- Both clauses are evaluated against the row AFTER leaders_derive_cluster has
-- rewritten cluster_id, which is what stops the chapter_id escalation path: a
-- head who names another cluster's chapter has the derived cluster_id checked,
-- not the one they sent. prove:leaders asserts that ordering rather than
-- trusting it.
drop policy if exists leaders_cluster_head_insert on leaders;
create policy leaders_cluster_head_insert on leaders for insert to authenticated
  with check (cluster_id = admin_cluster(auth.uid()));

drop policy if exists leaders_cluster_head_update on leaders;
create policy leaders_cluster_head_update on leaders for update to authenticated
  using (cluster_id = admin_cluster(auth.uid()))
  with check (cluster_id = admin_cluster(auth.uid()));
