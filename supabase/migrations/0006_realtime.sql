-- 0006_realtime.sql
-- Add events + registrations to the realtime publication (idempotent).
do $$ begin
  alter publication supabase_realtime add table events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table event_registrations;
exception when duplicate_object then null; end $$;
