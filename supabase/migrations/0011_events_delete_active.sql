-- 0011_events_delete_active.sql — require an ACTIVE admin to delete events
-- (aligns events_delete with events_insert/events_update, which already gate on is_admin).
drop policy if exists events_delete on events;
create policy events_delete on events
  for delete to authenticated
  using (
    is_pyh(auth.uid())
    or (
      is_admin(auth.uid())
      and created_by = auth.uid()
      and cluster_id is not distinct from admin_cluster(auth.uid())
    )
  );
