-- 0015_event_images.sql — multiple ordered images per event.
-- `path` is the object key inside the `media` bucket, NOT a full URL, so the
-- Supabase project URL is never baked into rows.
create table if not exists event_images (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  path       text not null,
  alt        text,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists event_images_event_sort_idx
  on event_images (event_id, sort_order);

alter table event_images enable row level security;

-- Public read, but only for events that are not soft-deleted
-- (mirrors events_public_read in 0005_rls.sql).
drop policy if exists event_images_public_read on event_images;
create policy event_images_public_read on event_images
  for select using (
    exists (
      select 1 from events e
      where e.id = event_images.event_id and e.deleted_at is null
    )
  );

-- Writes: PYH anywhere; an ACTIVE cluster head only within its own cluster.
drop policy if exists event_images_write on event_images;
create policy event_images_write on event_images
  for all to authenticated
  using (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_images.event_id
        and is_admin(auth.uid())
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
    )
  )
  with check (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_images.event_id
        and is_admin(auth.uid())
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
    )
  );
