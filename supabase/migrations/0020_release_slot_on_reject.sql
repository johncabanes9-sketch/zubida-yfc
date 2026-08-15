-- Release an event slot when a registration stops holding one.
--
-- ZUBIDA_CONTENT_AUDIT.md §12 (ADR-5). register_for_event claims slots_taken
-- atomically before inserting, but the only decrement in the schema was on the
-- duplicate-insert path. Rejecting a registration therefore held its seat
-- forever: the published "N left" figure overstated how full an event was, and
-- register_for_event — which gates on `slots_taken < slots_total` — refused
-- genuine applicants with FULL while seats were actually free.
--
-- Confirmed policy: a rejection returns the seat to the pool.
--
-- A registration HOLDS a seat when it is live and still in play:
--   deleted_at is null and status in ('pending', 'approved')
-- and releases it otherwise ('rejected', 'cancelled', or soft-deleted).
--
-- Why a trigger rather than fixing the one admin action: the counter must not be
-- able to drift again from a path nobody remembered to update. The trigger owns
-- every transition, so any future code that changes a status — a cancellation
-- flow, a bulk tool, a manual SQL correction — stays consistent for free.
--
-- Why INSERT is deliberately NOT handled here: register_for_event increments as
-- part of its conditional UPDATE, and that single atomic statement IS the
-- capacity gate under concurrency (proved by prove:concurrency). Moving the
-- claim into an insert trigger would evaluate capacity after the row exists and
-- reintroduce the overbooking race. The RPC keeps the claim; this trigger only
-- handles what happens to a seat afterwards.

create or replace function sync_event_slots()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old_holds boolean := false;
  v_new_holds boolean := false;
  v_delta int;
  v_total int;
  v_taken int;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_holds := old.deleted_at is null and old.status in ('pending', 'approved');
  end if;
  if tg_op = 'UPDATE' then
    v_new_holds := new.deleted_at is null and new.status in ('pending', 'approved');
  end if;

  v_delta := (case when v_new_holds then 1 else 0 end)
           - (case when v_old_holds then 1 else 0 end);

  if v_delta = 0 then
    return coalesce(new, old);
  end if;

  -- Re-claiming a seat (for example un-rejecting a registration) must not
  -- overbook. The slots_not_overbooked constraint would catch it, but a bare
  -- constraint violation tells an administrator nothing useful.
  if v_delta > 0 then
    select slots_total, slots_taken into v_total, v_taken
      from events where id = new.event_id for update;
    if v_taken + v_delta > v_total then
      raise exception
        'Cannot restore this registration: % of % slots are already taken.',
        v_taken, v_total
        using errcode = 'check_violation';
    end if;
  end if;

  update events
     set slots_taken = greatest(slots_taken + v_delta, 0)
   where id = coalesce(new.event_id, old.event_id);

  return coalesce(new, old);
end $$;

drop trigger if exists event_registrations_sync_slots on event_registrations;
create trigger event_registrations_sync_slots
  after update or delete on event_registrations
  for each row execute function sync_event_slots();

-- One-time reconciliation. slots_taken is derived data — no admin surface writes
-- it (the event form exposes slots_total only), so recomputing it from the
-- registrations that actually hold a seat cannot discard anybody's input. This
-- clears drift accumulated before the trigger existed, including registrations
-- rejected under the old behaviour that are still holding their seats.
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
   and e.deleted_at is null
   and e.slots_taken is distinct from coalesce(r.n, 0);
