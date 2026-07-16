-- Phase 3b slice 1: dynamic site settings, footer, socials, navigation.
-- Seeded from src/lib/constants.ts so behaviour is identical on day one.

create table if not exists site_settings (
  id smallint primary key default 1,
  name text not null,
  full_name text not null,
  tagline text not null,
  description text not null,
  province text not null,
  email text not null,
  phone text not null,
  office text not null,
  facebook_url text,
  instagram_url text,
  footer_explore_heading text not null default 'Explore',
  footer_reach_heading text not null default 'Reach Us',
  footer_closing_line text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint site_settings_singleton check (id = 1)
);

create table if not exists nav_items (
  href text primary key,
  label text not null,
  sort_order int not null,
  visible boolean not null default true
);

-- Seed: values copied verbatim from src/lib/constants.ts (SITE).
insert into site_settings (
  id, name, full_name, tagline, description, province, email, phone, office,
  facebook_url, instagram_url, footer_closing_line
) values (
  1,
  'Zubida YFC',
  'Zubida Youth for Christ',
  'One Province. One Mission. One Christ.',
  'The official Youth for Christ community of Zamboanga del Sur — building Christ-centered leaders and empowering young people across the province.',
  'Zamboanga del Sur',
  'hello@zubidayfc.org',
  '+63 962 000 0000',
  'YFC Provincial Office, Pagadian City, Zamboanga del Sur',
  'https://facebook.com/zubidayfc',
  'https://instagram.com/zubidayfc',
  'Built for the youth of Zamboanga del Sur. Ad Majorem Dei Gloriam.'
) on conflict (id) do nothing;

-- Seed: values copied verbatim from src/lib/constants.ts (NAV_LINKS), order preserved.
insert into nav_items (href, label, sort_order, visible) values
  ('/',         'Home',     1, true),
  ('/about',    'About',    2, true),
  ('/leaders',  'Leaders',  3, true),
  ('/chapters', 'Chapters', 4, true),
  ('/events',   'Events',   5, true),
  ('/gallery',  'Gallery',  6, true),
  ('/news',     'News',     7, true),
  ('/contact',  'Contact',  8, true)
on conflict (href) do nothing;

alter table site_settings enable row level security;
alter table nav_items enable row level security;

-- Public read: the public site must render for anonymous visitors.
drop policy if exists site_settings_public_read on site_settings;
create policy site_settings_public_read on site_settings
  for select to anon, authenticated using (true);

drop policy if exists nav_items_public_read on nav_items;
create policy nav_items_public_read on nav_items
  for select to anon, authenticated using (true);

-- Writes: PYH only. Cluster heads have no write path.
drop policy if exists site_settings_pyh_write on site_settings;
create policy site_settings_pyh_write on site_settings
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

drop policy if exists nav_items_pyh_write on nav_items;
create policy nav_items_pyh_write on nav_items
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));
