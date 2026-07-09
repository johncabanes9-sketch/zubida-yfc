-- 0001_events.sql
create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  create type event_status as enum ('Open', 'Closed', 'Finished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_scope as enum ('Provincial', 'Chapter');
exception when duplicate_object then null; end $$;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cover text,
  date date not null,
  time text,
  venue text,
  organizer text,
  description text,
  registration_deadline timestamptz not null,
  slots_total int not null check (slots_total >= 0),
  slots_taken int not null default 0 check (slots_taken >= 0),
  status event_status not null default 'Open',
  scope event_scope not null default 'Provincial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint slots_not_overbooked check (slots_taken <= slots_total)
);

create index if not exists events_status_idx on events (status) where deleted_at is null;
create index if not exists events_date_idx on events (date) where deleted_at is null;

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();
