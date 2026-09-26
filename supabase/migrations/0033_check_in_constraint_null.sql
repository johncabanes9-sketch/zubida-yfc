-- 0033_check_in_constraint_null.sql — close a NULL hole in 0032's check.
--
-- 0032 wrote `checked_in_at is not null and check_in_method in ('qr', 'manual')`.
-- With a NULL method, `in (...)` yields NULL, the whole expression yields NULL,
-- and Postgres accepts a CHECK that evaluates to NULL — so a time with no
-- method passed. prove:checkin caught it. Spell the NOT NULL out.
alter table event_registrations drop constraint if exists event_registrations_check_in_consistent;
alter table event_registrations add constraint event_registrations_check_in_consistent check (
  (checked_in_at is null and check_in_method is null)
  or (checked_in_at is not null and check_in_method is not null and check_in_method in ('qr', 'manual'))
);
