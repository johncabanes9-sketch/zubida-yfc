-- 0036_testimonials.sql — managed testimonials.
--
-- Replaces the testimonials in src/data/stats.ts: four invented quotes
-- attributed to named people, with stock faces from pravatar.cc. This table
-- ships EMPTY: testimonials are entered through /admin/testimonials by the
-- provincial youth head, each with the person's recorded consent.
create table if not exists testimonials (
  id            uuid primary key default gen_random_uuid(),
  -- Personal content. Nullable only so that deleting can ERASE it (below).
  name          text,
  role          text,
  quote         text,
  photo_path    text,
  chapter_id    uuid references chapters(id) on delete set null,
  -- A quote under someone's name always needs a recorded basis: who took the
  -- consent, and when. Unlike leaders (where a name and position alone are
  -- public facts), a testimonial IS personal content, so this is never null.
  consent_at    timestamptz not null,
  consent_by    uuid not null references auth.users(id),
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  deleted_at    timestamptz,

  -- Live: a name and words. Deleted: nothing of the person left. Taking a
  -- testimonial down is a withdrawal, so a tombstone must not keep their
  -- name, words or face in the database.
  constraint testimonials_live_or_erased check (
    (deleted_at is null
      and name is not null and length(btrim(name)) > 0
      and quote is not null and length(btrim(quote)) > 0)
    or
    (deleted_at is not null
      and name is null and role is null and quote is null and photo_path is null)
  ),
  constraint testimonials_photo_is_object check (photo_path is null or photo_path like 'testimonials/%')
);

create index if not exists testimonials_public_idx on testimonials (is_published, deleted_at, sort_order);
create unique index if not exists testimonials_photo_unique on testimonials (photo_path) where photo_path is not null;

alter table testimonials enable row level security;

-- anon only. The homepage reads through the server, and the only signed-in
-- role with any business here is the PYH (below). Granting this to
-- `authenticated` too would hand every cluster head the consent columns,
-- which the column grant further down only withholds from anon.
drop policy if exists testimonials_public_read on testimonials;
create policy testimonials_public_read on testimonials for select to anon
  using (is_published = true and deleted_at is null);

drop policy if exists testimonials_pyh_all on testimonials;
create policy testimonials_pyh_all on testimonials for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- The public needs the words, not the bookkeeping: who recorded consent is an
-- admin's user id. Column grants for anon; admins keep full rows.
revoke select on testimonials from anon;
grant select (id, name, role, quote, photo_path, chapter_id, is_published, sort_order, deleted_at)
  on testimonials to anon;

drop trigger if exists testimonials_set_updated_at on testimonials;
create trigger testimonials_set_updated_at
  before update on testimonials
  for each row execute function set_updated_at();

-- ── Integrity against direct API calls ───────────────────────────────────
-- Same shape as gallery_photos_guard / news_posts_guard. The consent record
-- is the database's to write: whoever enters or changes a person's words or
-- photo is recorded as having taken their consent, now.
create or replace function testimonials_guard()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Erased is final: reviving the id would put new words under a consent
  -- stamped now, on a row whose person withdrew.
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    raise exception 'an erased testimonial cannot be changed' using errcode = '42501';
  end if;

  if new.photo_path is not null
     and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
     and not exists (
       select 1 from storage.objects o where o.bucket_id = 'media' and o.name = new.photo_path
     ) then
    raise exception 'testimonial photo file does not exist' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.consent_by := auth.uid();
    new.consent_at := now();
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    return new;
  end if;

  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.consent_by is distinct from old.consent_by
     or new.consent_at is distinct from old.consent_at then
    raise exception 'a testimonial''s consent record cannot be rewritten directly' using errcode = '42501';
  end if;

  -- New words, a new name for them, or a new photo: a new consent.
  if (new.quote is not null and new.quote is distinct from old.quote)
     or (new.name is not null and new.name is distinct from old.name)
     or (new.photo_path is not null and new.photo_path is distinct from old.photo_path) then
    new.consent_by := auth.uid();
    new.consent_at := now();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists testimonials_guard on testimonials;
create trigger testimonials_guard
  before insert or update on testimonials
  for each row execute function testimonials_guard();
