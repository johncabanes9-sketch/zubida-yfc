-- seed.sql — idempotent import of Phase 1 mock events
insert into events (name, cover, date, time, venue, organizer, description, registration_deadline, slots_total, slots_taken, status, scope)
select * from (values
  ('Zubida Provincial Youth Camp 2026','https://picsum.photos/seed/yfccamp/1000/700','2026-08-14'::date,'8:00 AM','Camp Abelardo, Pagadian City','Zubida YFC Provincial Team','Three days of worship, teaching, and encounter for youth across all 26 chapters.','2026-08-01'::timestamptz,600,418,'Open'::event_status,'Provincial'::event_scope),
  ('ICON: Ignite Conference','https://picsum.photos/seed/yfcicon/1000/700','2026-09-06'::date,'1:00 PM','Pagadian City Convention Center','Provincial Youth Coordinator','The flagship one-day conference gathering young leaders.','2026-08-28'::timestamptz,900,611,'Open'::event_status,'Provincial'::event_scope),
  ('Christian Life Seminar — Labangan','https://picsum.photos/seed/yfccls/1000/700','2026-07-26'::date,'9:00 AM','St. Isidore Parish, Labangan','Labangan Chapter','A weekend introduction to the heart of the Gospel.','2026-07-20'::timestamptz,120,120,'Closed'::event_status,'Chapter'::event_scope),
  ('Household Leaders'' Formation','https://picsum.photos/seed/yfchousehold/1000/700','2026-07-19'::date,'2:00 PM','Molave Parish Hall','North Cluster','Practical formation for core group leaders.','2026-07-15'::timestamptz,80,54,'Open'::event_status,'Chapter'::event_scope)
) as v(name, cover, date, time, venue, organizer, description, registration_deadline, slots_total, slots_taken, status, scope)
where not exists (select 1 from events e where e.name = v.name and e.deleted_at is null);
