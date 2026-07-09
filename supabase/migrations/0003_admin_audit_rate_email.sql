-- 0003_admin_audit_rate_email.sql
do $$ begin
  create type admin_role as enum ('super_admin', 'provincial_admin', 'event_organizer');
exception when duplicate_object then null; end $$;

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role admin_role not null default 'event_organizer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limits_lookup_idx on rate_limits (ip, endpoint, created_at desc);

create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  registration_id text,
  to_email text not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now()
);

create or replace function is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = uid and deleted_at is null);
$$;
