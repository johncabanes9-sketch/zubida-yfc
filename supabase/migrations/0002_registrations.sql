-- 0002_registrations.sql
do $$ begin
  create type registration_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_id text not null unique,
  event_id uuid not null references events(id),
  full_name text not null,
  nickname text,
  birthdate date,
  age int check (age between 10 and 40),
  gender text,
  email text not null,
  phone text,
  chapter text not null,
  cluster text,
  parish text,
  school text,
  emergency_contact text,
  emergency_number text,
  medical_concerns text,
  food_restrictions text,
  shirt_size text,
  transport_needed boolean not null default false,
  consent boolean not null default false,
  status registration_status not null default 'pending',
  qr_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists event_registrations_unique_email_per_event
  on event_registrations (event_id, lower(email))
  where deleted_at is null;

create index if not exists event_registrations_event_idx on event_registrations (event_id) where deleted_at is null;
create index if not exists event_registrations_status_idx on event_registrations (status) where deleted_at is null;
create index if not exists event_registrations_reg_id_idx on event_registrations (registration_id);

drop trigger if exists event_registrations_set_updated_at on event_registrations;
create trigger event_registrations_set_updated_at
  before update on event_registrations
  for each row execute function set_updated_at();
