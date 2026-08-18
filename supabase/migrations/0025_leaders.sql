-- Leadership directory. Replaces src/data/leaders.ts, whose twelve entries were
-- invented for the Phase-1 showcase — including a named clergy member with a
-- fabricated title and an attributed pastoral message. This table ships EMPTY:
-- real leaders are entered through /admin/leaders by an authorized administrator.
create table if not exists leaders (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  -- Free text by design. The fixture's five-value LeaderCategory taxonomy
  -- (Provincial Coordinator, Area Heads, ...) is itself unverified: no project
  -- source traces those names to Zubida YFC. An enum would put invented
  -- organizational structure into the schema, where undoing it costs a
  -- migration and a backfill instead of an admin edit.
  position      text not null,
  -- Scope. Both null = provincial-level, writable by the PYH only.
  -- cluster_id is derived from chapter_id by trigger; see 0026.
  chapter_id    uuid references chapters(id) on delete restrict,
  cluster_id    uuid references clusters(id) on delete restrict,
  -- Personal content about a named individual. Requires consent; see below.
  message       text,
  photo_path    text,
  consent_at    timestamptz,
  consent_by    uuid references auth.users(id),
  -- Nullable, https-only at this boundary. The fixture gave every profile a
  -- social link of "#", rendering clickable icons that went nowhere. Full URL
  -- parsing lives in src/lib/validation/leader.ts; this is the floor that holds
  -- even if a write bypasses the app.
  facebook_url  text,
  instagram_url text,
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  deleted_at    timestamptz,

  -- The load-bearing constraint of this slice. A face or a quote cannot EXIST
  -- in the row without a recorded basis for publishing it: who captured consent
  -- and when. Stronger than hiding, and it gives withdrawal the right shape --
  -- nulling consent_at fails unless photo_path and message go with it, so
  -- "withdraw consent" is forced to be one statement that also reaps the object.
  constraint leaders_personal_content_requires_consent check (
    (photo_path is null and message is null)
    or (consent_at is not null and consent_by is not null)
  ),
  constraint leaders_facebook_url_is_https check (
    facebook_url is null or facebook_url ~ '^https://'
  ),
  constraint leaders_instagram_url_is_https check (
    instagram_url is null or instagram_url ~ '^https://'
  )
);

create index if not exists leaders_cluster_idx on leaders (cluster_id);
create index if not exists leaders_chapter_idx on leaders (chapter_id);
create index if not exists leaders_published_idx on leaders (is_published, deleted_at);

alter table leaders enable row level security;
