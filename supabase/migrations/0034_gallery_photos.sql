-- 0034_gallery_photos.sql — the managed photo gallery.
--
-- Replaces src/data/gallery.ts, whose eighteen picsum.photos images carried
-- captions asserting real events. This table ships EMPTY: photos are uploaded
-- through /admin/gallery by an authorized administrator.
create table if not exists gallery_photos (
  id                    uuid primary key default gen_random_uuid(),
  -- Object key inside the `media` bucket, never a full URL (same rule as
  -- event_images.path). Cleared when the photo is deleted, because the file
  -- is reaped in the same action.
  path                  text,
  -- Doubles as the image's alt text, so it is required and never blank.
  caption               text not null,
  -- Free text by design, like leaders.position: the fixture's seven-value
  -- category list was invented for the showcase, and an enum would put
  -- unverified structure into the schema. Public filters are derived from the
  -- categories real photos actually carry.
  category              text,
  -- Displayed pixel size (EXIF orientation applied), read from the uploaded
  -- bytes. The grid reserves each photo's box from these before it loads.
  width                 int not null,
  height                int not null,
  -- Scope. Null = provincial-level, writable by the PYH only.
  cluster_id            uuid references clusters(id) on delete restrict,
  -- Many YFC members are minors. A photo cannot exist without a record of who
  -- confirmed it may be published, and when.
  consent_confirmed_at  timestamptz not null,
  consent_confirmed_by  uuid not null references auth.users(id),
  is_published          boolean not null default false,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id),
  deleted_at            timestamptz,

  constraint gallery_photos_caption_present check (length(btrim(caption)) > 0),
  constraint gallery_photos_dimensions_positive check (width > 0 and height > 0),
  -- An uploaded object, not a link: an external URL is how stock imagery got in.
  constraint gallery_photos_path_is_object check (path is null or path like 'gallery/%'),
  -- A live row has a file; a deleted row has none. The app reaps the object
  -- and clears path in the delete itself, so a tombstone can never be the
  -- only thing still pointing at a public-read photo, and a deleted row
  -- cannot be revived without a new upload.
  constraint gallery_photos_file_iff_live check ((deleted_at is null) = (path is not null))
);

-- Re-applies the invariant on a database that ran an earlier draft of this
-- file (the TEST project), where the weaker one-way constraint was created.
alter table gallery_photos drop constraint if exists gallery_photos_live_row_has_file;
alter table gallery_photos drop constraint if exists gallery_photos_file_iff_live;
alter table gallery_photos add constraint gallery_photos_file_iff_live
  check ((deleted_at is null) = (path is not null));

-- One row per file: a second row reusing another photo's key would have that
-- photo's file reaped out from under it when either is deleted.
create unique index if not exists gallery_photos_path_unique
  on gallery_photos (path) where path is not null;

create index if not exists gallery_photos_public_idx
  on gallery_photos (is_published, deleted_at, sort_order, created_at desc);
create index if not exists gallery_photos_cluster_idx on gallery_photos (cluster_id);

alter table gallery_photos enable row level security;

-- Public: published, undeleted rows only.
drop policy if exists gallery_photos_public_read on gallery_photos;
create policy gallery_photos_public_read on gallery_photos for select to anon, authenticated
  using (is_published = true and deleted_at is null);

-- Every active admin reads the whole province, matching chapters_admin_read.
drop policy if exists gallery_photos_admin_read on gallery_photos;
create policy gallery_photos_admin_read on gallery_photos for select to authenticated
  using (is_pyh(auth.uid()) or admin_cluster(auth.uid()) is not null);

drop policy if exists gallery_photos_pyh_write on gallery_photos;
create policy gallery_photos_pyh_write on gallery_photos for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- Cluster heads insert and update within their own cluster; no delete policy,
-- so a hard delete affects 0 rows (the app only soft-deletes). `with check` on
-- update stops a row being moved into another cluster. A null cluster_id never
-- equals admin_cluster(), so provincial-level photos stay PYH-only — the same
-- reasoning as 0024_chapters_rls.sql; do not "fix" it with coalesce.
drop policy if exists gallery_photos_cluster_insert on gallery_photos;
create policy gallery_photos_cluster_insert on gallery_photos for insert to authenticated
  with check (cluster_id = admin_cluster(auth.uid()));

drop policy if exists gallery_photos_cluster_update on gallery_photos;
create policy gallery_photos_cluster_update on gallery_photos for update to authenticated
  using (cluster_id = admin_cluster(auth.uid()))
  with check (cluster_id = admin_cluster(auth.uid()));

drop trigger if exists gallery_photos_set_updated_at on gallery_photos;
create trigger gallery_photos_set_updated_at
  before update on gallery_photos
  for each row execute function set_updated_at();

-- ── Integrity against direct API calls ───────────────────────────────────
-- Every admin holds a JWT and can call PostgREST without going through the
-- server actions. The policies above pin cluster_id; these pin the rest.

-- Whoever inserts a photo is the one recorded as confirming permission to
-- publish it. RESTRICTIVE, so it narrows every permissive insert policy,
-- the PYH's included. The service role bypasses RLS and is unaffected.
drop policy if exists gallery_photos_confirmer_is_caller on gallery_photos;
create policy gallery_photos_confirmer_is_caller on gallery_photos
  as restrictive for insert to authenticated
  with check (consent_confirmed_by = auth.uid());

-- SECURITY DEFINER so it can read storage.objects. Skipped when auth.uid() is
-- null (service role / migrations), which RLS already does not constrain.
create or replace function gallery_photos_guard()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The row must name an object that was actually uploaded.
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'media' and o.name = new.path
    ) then
      raise exception 'gallery photo file does not exist' using errcode = '23514';
    end if;
    -- Who and when are the database's to record, not the caller's to supply.
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.consent_confirmed_at := now();
    return new;
  end if;

  new.updated_by := auth.uid();

  -- UPDATE: provenance is fixed at upload. A photo can be re-captioned,
  -- published or deleted, never re-attributed or pointed at another file.
  if new.consent_confirmed_by is distinct from old.consent_confirmed_by
     or new.consent_confirmed_at is distinct from old.consent_confirmed_at
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'gallery photo provenance cannot change' using errcode = '42501';
  end if;
  if new.path is distinct from old.path and new.path is not null then
    raise exception 'a gallery photo cannot be pointed at a different file' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists gallery_photos_guard on gallery_photos;
create trigger gallery_photos_guard
  before insert or update on gallery_photos
  for each row execute function gallery_photos_guard();
