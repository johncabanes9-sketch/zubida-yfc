-- Extend the 0020 reconciliation to soft-deleted events.
--
-- 0020 rebuilt slots_taken from the registrations that actually hold a seat, but
-- scoped the update to `deleted_at is null` on the grounds that a retired event
-- publishes nothing. That leaves the invariant only locally true: the retired
-- 'Zubida Provincial Youth Camp 2026' still carries slots_taken = 1 against zero
-- holding registrations.
--
-- Restoring a soft-deleted event is a plausible administrative action — 0019
-- retired four events precisely so they *could* be reviewed rather than lost — and
-- it would bring the stale counter back with it, publishing a wrong "N left" the
-- moment the event became visible again.
--
-- A trigger now maintains the counter going forward, so this is the last of the
-- historical drift. Making the invariant hold for every row (not just visible
-- ones) is what lets it be asserted as an invariant rather than a spot check.
--
-- This is deliberately a separate migration rather than an edit to 0020, which has
-- already been applied. On a fresh database 0020 runs first and this is a no-op.

update events e
   set slots_taken = coalesce(r.n, 0),
       updated_at = now()
  from (
    select ev.id,
           count(reg.id) filter (
             where reg.deleted_at is null
               and reg.status in ('pending', 'approved')
           ) as n
      from events ev
      left join event_registrations reg on reg.event_id = ev.id
     group by ev.id
  ) r
 where r.id = e.id
   and e.slots_taken is distinct from coalesce(r.n, 0);
