-- Withhold unverified organizational claims on the About page.
--
-- The About seed in 0016 was extracted verbatim from the Phase-1 showcase JSX,
-- which carried invented facts (ZUBIDA_CONTENT_AUDIT.md §2.3):
--   * a six-milestone founding history (2003 → 2024) with no source
--   * "twenty-six chapters", contradicted by the app's own 12-chapter fixture
--
-- Nothing is deleted. The timeline section is hidden, so a PYH admin can correct
-- the milestones in /admin/pages and make it visible again. The chapter count is
-- dropped from the prose because publishing an unverified figure is worse than
-- publishing no figure; the surrounding sentence is otherwise unchanged.
--
-- Both statements are guarded so they only touch still-seeded content and never
-- overwrite an administrator's edits.

-- 1. Remove the unverified chapter count from the "Who We Are" body.
update page_sections ps
set content = jsonb_set(
      ps.content,
      '{body}',
      to_jsonb($txt$In Zamboanga del Sur, we call ourselves Zubida YFC — a family of chapters across the province, bound by one covenant of prayer, formation, and mission. We gather in households, worship in conferences, serve in barangays, and walk with one another through the ordinary and extraordinary moments of growing up in faith.$txt$::text)
    ),
    updated_at = now()
from pages p
where ps.page_id = p.id
  and p.slug = 'about'
  and ps.type = 'text-image'
  and ps.content->>'body' like '%twenty-six chapters%';

-- 2. Drop the picsum.photos stand-in captioned "Zubida YFC community gathered in
--    worship". It is stock imagery presented as a photograph of the community.
--    The section renders text-only until a real photo is uploaded in /admin/pages.
update page_sections ps
set content = ps.content - 'image',
    updated_at = now()
from pages p
where ps.page_id = p.id
  and p.slug = 'about'
  and ps.type = 'text-image'
  and ps.content->'image'->>'src' like '%picsum.photos%';

-- 3. The SEO description advertised a history section that is no longer shown.
update pages
set seo_description = 'Who we are, our mission and vision, and the core values of Youth for Christ in Zamboanga del Sur.',
    updated_at = now()
where slug = 'about'
  and seo_description like '%the history of Youth for Christ%';

-- 4. Hide the unverified history timeline (content preserved, not deleted).
update page_sections ps
set visible = false,
    updated_at = now()
from pages p
where ps.page_id = p.id
  and p.slug = 'about'
  and ps.type = 'timeline'
  and ps.content::text like '%The First Spark%';
