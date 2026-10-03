-- 0035_news_posts.sql — managed news, as cards that link out.
--
-- Replaces src/data/news.ts, whose six articles were invented and attributed
-- to named authors. This table ships EMPTY: posts are written through
-- /admin/news by the provincial youth head. A post is a card — title, excerpt,
-- optional cover — that links out to where the full story lives (usually the
-- Facebook page); there are no on-site article bodies.
create table if not exists news_posts (
  id                          uuid primary key default gen_random_uuid(),
  title                       text not null,
  excerpt                     text not null,
  -- A post's format, not organizational information, so a fixed list is
  -- fine here (unlike gallery categories or leader positions).
  category                    text not null,
  -- Nullable: blank means withheld, never a stand-in byline.
  author                      text,
  external_url                text,
  -- The date shown on the card. Set by the admin; defaults to today.
  published_on                date not null default current_date,
  cover_path                  text,
  cover_consent_confirmed_at  timestamptz,
  cover_consent_confirmed_by  uuid references auth.users(id),
  is_published                boolean not null default false,
  created_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id),
  deleted_at                  timestamptz,

  constraint news_posts_title_present check (length(btrim(title)) > 0),
  constraint news_posts_excerpt_present check (length(btrim(excerpt)) > 0),
  constraint news_posts_category_known check (category in ('Announcement', 'Article', 'Blog', 'Video')),
  -- https only: the card renders this straight into an href, and
  -- `javascript:` / `data:` URLs are what an unrefined URL field lets through.
  constraint news_posts_external_url_is_https check (external_url is null or external_url ~ '^https://'),
  constraint news_posts_cover_is_object check (cover_path is null or cover_path like 'news/%'),
  -- A cover may show people, minors included: it cannot exist without a
  -- record of who confirmed permission to publish it, and when.
  constraint news_posts_cover_requires_consent check (
    cover_path is null
    or (cover_consent_confirmed_at is not null and cover_consent_confirmed_by is not null)
  ),
  -- The cover is reaped in the delete itself, so a tombstone never keeps
  -- pointing at a public-read file.
  constraint news_posts_deleted_has_no_cover check (deleted_at is null or cover_path is null)
);

create index if not exists news_posts_public_idx
  on news_posts (is_published, deleted_at, published_on desc);
create unique index if not exists news_posts_cover_unique
  on news_posts (cover_path) where cover_path is not null;

alter table news_posts enable row level security;

drop policy if exists news_posts_public_read on news_posts;
create policy news_posts_public_read on news_posts for select to anon, authenticated
  using (is_published = true and deleted_at is null);

-- Provincial communication: the PYH writes and sees drafts. Cluster heads get
-- no policy beyond the public one.
drop policy if exists news_posts_pyh_all on news_posts;
create policy news_posts_pyh_all on news_posts for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

drop trigger if exists news_posts_set_updated_at on news_posts;
create trigger news_posts_set_updated_at
  before update on news_posts
  for each row execute function set_updated_at();

-- ── Integrity against direct API calls ───────────────────────────────────
-- Same reasoning as gallery_photos_guard (0034). Skipped for the service role.
create or replace function news_posts_guard()
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
    new.created_by := auth.uid();
  elsif new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'news post provenance cannot change' using errcode = '42501';
  end if;
  -- Who edited is the database's to record, not the caller's to supply.
  new.updated_by := auth.uid();

  -- A newly set cover must be a real upload, confirmed by the caller.
  if new.cover_path is not null
     and (tg_op = 'INSERT' or new.cover_path is distinct from old.cover_path) then
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'media' and o.name = new.cover_path
    ) then
      raise exception 'news cover file does not exist' using errcode = '23514';
    end if;
    if new.cover_consent_confirmed_by is distinct from auth.uid() then
      raise exception 'the cover permission must be confirmed by the uploader' using errcode = '42501';
    end if;
    -- The permission is recorded as given now, for this file.
    new.cover_consent_confirmed_at := now();
  elsif tg_op = 'UPDATE'
     and new.cover_path is not distinct from old.cover_path
     and new.cover_path is not null
     and (new.cover_consent_confirmed_by is distinct from old.cover_consent_confirmed_by
          or new.cover_consent_confirmed_at is distinct from old.cover_consent_confirmed_at) then
    raise exception 'a cover''s permission record cannot be rewritten' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists news_posts_guard on news_posts;
create trigger news_posts_guard
  before insert or update on news_posts
  for each row execute function news_posts_guard();
