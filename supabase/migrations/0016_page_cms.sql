-- Phase 3b slice 3: dynamic page CMS. Pages = ordered typed sections.
-- RLS mirrors 0013 site_settings: public read, PYH-only write. About is seeded
-- from the current hardcoded JSX so the rendered page is byte-identical.

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  seo_title text,
  seo_description text,
  og_image_path text,
  is_system boolean not null default true,
  visible boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  type text not null,
  content jsonb not null default '{}',
  sort_order int not null,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists page_sections_page_order on page_sections (page_id, sort_order);

alter table pages enable row level security;
alter table page_sections enable row level security;

drop policy if exists pages_public_read on pages;
create policy pages_public_read on pages for select to anon, authenticated using (true);
drop policy if exists page_sections_public_read on page_sections;
create policy page_sections_public_read on page_sections for select to anon, authenticated using (true);

drop policy if exists pages_pyh_write on pages;
create policy pages_pyh_write on pages for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));
drop policy if exists page_sections_pyh_write on page_sections;
create policy page_sections_pyh_write on page_sections for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- ── Seed: About (verbatim from src/app/about/page.tsx + timeline.tsx) ──
insert into pages (slug, title, seo_title, seo_description, is_system, sort_order)
values ('about', 'About', 'About',
  'Who we are, our mission and vision, core values, and the history of Youth for Christ in Zamboanga del Sur.',
  true, 2)
on conflict (slug) do nothing;

insert into page_sections (page_id, type, content, sort_order)
select p.id, s.type, s.content::jsonb, s.sort_order
from pages p, (values
  ('hero', 0, $json$
    {"eyebrow":"About Zubida YFC","title":"One Province. One Mission. One Christ.","subtitle":"We are the official Youth for Christ community of Zamboanga del Sur — a family of young people set ablaze by the love of God and sent to set the province on fire."}
  $json$),
  ('text-image', 1, $json$
    {"image":{"src":"https://picsum.photos/seed/whoweare/900/700","alt":"Zubida YFC community gathered in worship","width":900,"height":700,"objectPath":null},"eyebrow":"Who We Are","title":"A movement of young missionaries","subtitle":"Youth for Christ is a covenant community and evangelistic movement within Couples for Christ, forming young people ages 12 to 21 into Christ-centered leaders.","body":"In Zamboanga del Sur, we call ourselves Zubida YFC — twenty-six chapters across the province, bound by one covenant of prayer, formation, and mission. We gather in households, worship in conferences, serve in barangays, and walk with one another through the ordinary and extraordinary moments of growing up in faith."}
  $json$),
  ('feature-cards', 2, $json$
    {"cards":[{"icon":"Compass","title":"Our Mission","body":"To bring the youth of Zamboanga del Sur to a personal relationship with Jesus Christ, to form them into mature Christian leaders, and to send them out as joyful missionaries in their families, schools, and communities."},{"icon":"Eye","title":"Our Vision","body":"A province where every young person knows they are loved by God, every chapter is a home of holiness and joy, and a new generation of leaders rises to renew the Church and transform Zamboanga del Sur for Christ."}]}
  $json$),
  ('values-grid', 3, $json$
    {"eyebrow":"Core Values","title":"What holds us together","align":"center","items":[{"icon":"Flame","title":"Christ-Centeredness","text":"Everything begins and ends with Jesus. He is our reason, our method, and our goal."},{"icon":"Users","title":"Family & Household","text":"We grow in small households where faith becomes personal and no one is left behind."},{"icon":"HandHeart","title":"Servant Leadership","text":"To lead is to serve. Our leaders wash feet before they take the stage."},{"icon":"Sparkles","title":"Joyful Evangelization","text":"We share the Gospel with the contagious joy that only Christ can give."},{"icon":"Compass","title":"Integrity","text":"We strive to be the same person on stage, at home, and in the barangay."},{"icon":"Eye","title":"Missionary Heart","text":"We are sent — to our schools, our families, and the farthest chapel of the province."}]}
  $json$),
  ('timeline', 4, $json$
    {"eyebrow":"Our History","title":"Two decades of grace in Zamboanga del Sur","subtitle":"From a small prayer group in Pagadian to a province-wide movement — this is how far God has carried us.","align":"center","milestones":[{"year":"2003","title":"The First Spark","text":"A handful of students in Pagadian City begin gathering to pray and share the Gospel — the seed of Youth for Christ in Zamboanga del Sur."},{"year":"2008","title":"Chapters Multiply","text":"The movement spreads north to Molave and Mahayag. The first provincial youth camp draws over 200 delegates."},{"year":"2013","title":"Clusters Formed","text":"Chapters organize into Bay, North, and South clusters, giving every municipality a spiritual home and closer formation."},{"year":"2017","title":"ICON is Born","text":"The Ignite Conference launches as the province's flagship annual gathering, commissioning a new wave of young leaders."},{"year":"2020","title":"Faith Online","text":"When the world stops, the households don't. Zubida YFC moves to virtual gatherings, keeping the youth connected through the pandemic."},{"year":"2024","title":"One Province, One Mission","text":"With 26 chapters and thousands of members, Zubida YFC adopts its unifying vision: One Province. One Mission. One Christ."}]}
  $json$)
) as s(type, sort_order, content)
where p.slug = 'about'
  and not exists (select 1 from page_sections ps where ps.page_id = p.id);
