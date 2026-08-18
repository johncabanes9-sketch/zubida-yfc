-- Chapters directory. Replaces src/data/chapters.ts, whose twelve entries were
-- invented for the Phase-1 showcase. This table ships EMPTY: real chapters are
-- entered through /admin/chapters by an authorized administrator.
create table if not exists chapters (
  id            uuid primary key default gen_random_uuid(),
  cluster_id    uuid not null references clusters(id) on delete restrict,
  name          text not null,
  slug          text not null unique,
  municipality  text not null,
  -- Nullable by design: a chapter may be published with its coordinator or
  -- schedule genuinely withheld rather than invented.
  schedule      text,
  coordinator   text,
  cover_path    text,
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  deleted_at    timestamptz
);

create index if not exists chapters_cluster_idx on chapters (cluster_id);
create index if not exists chapters_public_idx on chapters (is_published, deleted_at);

-- Enabled here, policies land in 0024. With RLS on and no policies, every
-- non-service-role client is denied by default, which is the correct interim
-- state: a table that is readable before its policies exist is a leak.
alter table chapters enable row level security;
