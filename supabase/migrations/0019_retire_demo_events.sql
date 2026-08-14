-- Retire the fabricated Phase-1 demo events and the load-test row.
--
-- ZUBIDA_CONTENT_AUDIT.md checked /events with the database DOWN, so it saw the
-- honest "schedule can't be loaded" state and recorded events as clean. With the
-- database UP, these four rows — inserted by the old supabase/seed.sql — are what
-- /events actually serves. Removing the code fallback did not remove them; it
-- promoted them from visible placeholders to authentic records carrying a working
-- Register button. Their venues, dates, slot counts and picsum.photos covers have
-- no source, and the Youth Camp description repeats the retired "26 chapters".
--
-- 'CONCURRENCY TEST' is load-test data from scripts/prove-concurrency.mjs that was
-- never cleaned up. It has real registrations attached, so it is soft-deleted
-- rather than removed: the rows stay for audit, the event leaves the public board.
--
-- Nothing is hard-deleted. Every statement is guarded so it can only touch a row
-- that still carries the seed signature — an event an administrator has since
-- renamed, re-covered, or taken real registrations for is left alone, and
-- re-running the migration cannot re-hide something deliberately restored.

-- 1. The four seeded demo events. Guarded on the picsum cover so a row that has
--    been given a real cover image is treated as adopted, not as fixture data.
update events
set deleted_at = now()
where deleted_at is null
  and cover like '%picsum.photos%'
  and name in (
    'Zubida Provincial Youth Camp 2026',
    'ICON: Ignite Conference',
    'Christian Life Seminar — Labangan',
    'Household Leaders'' Formation'
  )
  and not exists (
    select 1 from event_registrations r where r.event_id = events.id
  );

-- 2. The load-test event. Guarded on the null cover/venue that identifies a row
--    created by the concurrency prover rather than through /admin/events.
update events
set deleted_at = now()
where deleted_at is null
  and name = 'CONCURRENCY TEST'
  and cover is null
  and venue is null;
