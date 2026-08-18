# ZUBIDA Content Audit

**Date:** 2026-08-14
**Branch:** `phase3b-page-cms` @ `4976ad3`
**Method:** static source inspection + live render inspection (`next dev` on :3111, HTML captured and text-extracted for `/`, `/about`, `/events`, `/contact`)
**Scope:** every piece of user-facing information in the app.

> **Nothing in this document invents organizational facts.** Where a value cannot be traced to an authoritative source, it is marked `NEEDS ADMIN CONFIRMATION` rather than replaced.

---

## 0. Headline finding — read this first

**The overwhelming majority of organizational "facts" displayed by ZUBIDA today originate from Phase-1 demo fixtures, not from the organization.**

The project shipped a Phase-1 visual showcase (`src/data/*.ts`) populated with plausible-sounding invented content: leader names, chapter rosters, member counts, a 20-year founding history, testimonials, news articles, and events. Phase 2/3 added a real database, but only **events**, **site settings/navigation**, and **the About page** were ever wired to it. Everything else still renders the Phase-1 fixtures verbatim.

Five consequences, all verified live:

1. **`ADR-1` — Silent mock fallback.** `getEvents()`, `getSiteSettings()`, and `getPage()` each `catch` any failure and fall back to hardcoded Phase-1 data with no signal to the user or operator. During this audit the Supabase host was unreachable (`ENOTFOUND ... postgres.vtqtsbbzwrfamkftutpj not found`), and the public site served **six fabricated events with fabricated slot counts as if they were live** — including a working-looking "Register" button on an event that does not exist. See §7.
2. **`ADR-2` — Fabricated statistics.** The homepage stats band publishes four hard numbers (26 / 4,200+ / 58 / 340+) that are not derived from any data source and are internally contradicted by the app's own fixtures. See §5.
3. **`ADR-3` — The About page is DB-driven but not editable.** Migration `0016` moved About into `pages`/`page_sections`, and `src/app/admin/pages/actions.ts` exists (staged, uncommitted), but **`/admin/pages` has no `page.tsx`** — Task 7 of the page-CMS plan is unbuilt. So About content is in the database where no administrator can reach it, and is *also* duplicated in `src/lib/pages/fallback.ts`. See §4.
4. **`ADR-4` — The `events` table was seeded with the same fabrications.** *(added 2026-08-15, once the database became reachable)* `supabase/seed.sql` had written the four demo events into the live table, and `db-migrate.mjs` re-applied it on every run. Fixing `ADR-1` alone made this **worse**, not better: the rows outlived the fallback and became authentic records with a working Register button. Missed on the first pass because the database was unreachable, so only the fallback path was ever rendered. See §2.6 and §7.1.
5. **`ADR-5` — Rejecting a registration never releases its slot.** *(added 2026-08-15)* `slots_taken` is claimed on registration but released only on the duplicate path. Rejecting a registration leaves the seat consumed, so the published "N left" figure overstates how full an event is **and** genuine applicants are refused with `FULL` while seats are free. Not yet reachable — no event has open registrations — but live from the first real event onward. **Resolved by 0020/0021** after the organization confirmed that a rejection returns the seat. See §12.

---

## 1. Authoritative-source map (what is wired to what)

| Content domain | Storage | Admin-editable today | Public consumer |
|---|---|---|---|
| Org name, tagline, description, province, email, phone, office, socials, footer headings | `site_settings` (DB), seeded from `src/lib/constants.ts` | ✅ `/admin/settings` (PYH only) | navbar, footer, `/contact`, `<head>` metadata |
| Navigation links | `nav_items` (DB) | ✅ `/admin/settings` | navbar, footer |
| Events | `events` + `event_images` (DB) | ✅ `/admin/events` | `/events`, homepage preview |
| About page sections | `pages` + `page_sections` (DB) | ❌ **no UI exists** | `/about` |
| Registrations | `event_registrations` (DB) | ✅ `/admin` | `/registration-status` |
| Audit log | `audit_log` (DB) | ✅ `/admin/logs` (read) | — |
| **Statistics band** | `src/data/stats.ts` — hardcoded | ❌ | homepage |
| **Testimonials** | `src/data/stats.ts` — hardcoded | ❌ | homepage |
| **Bible verses** | `src/data/stats.ts` — hardcoded | ❌ | homepage, floating verse |
| **Leaders** | `src/data/leaders.ts` — hardcoded | ❌ | `/leaders` |
| **Chapters** | `src/data/chapters.ts` — hardcoded | ❌ | `/chapters` |
| **News** | `src/data/news.ts` — hardcoded | ❌ | `/news`, homepage |
| **Gallery** | `src/data/gallery.ts` — hardcoded | ❌ | `/gallery`, homepage |
| **FAQ** | `src/components/contact/faq.tsx` — hardcoded | ❌ | `/contact` |
| **Hero copy + slides** | `src/components/home/hero.tsx` — hardcoded | ❌ | homepage |
| **About teaser copy + images** | `src/components/home/about-teaser.tsx` — hardcoded | ❌ | homepage |
| **Page headers (all pages)** | each `page.tsx` — hardcoded | ❌ | every public page |
| **Canonical domain** | `src/app/layout.tsx:29` — hardcoded `https://zubidayfc.org` | ❌ | OG/canonical metadata |

---

## 2. Full inventory

Legend — **Accurate?**: `VERIFIED` = traceable to an authoritative project source · `UNVERIFIED` = plausible but unsourced · `FABRICATED` = demonstrably Phase-1 fixture content · `BUG` = mechanically wrong.

### 2.1 Global chrome (navbar / footer / metadata)

| Page | Information | Current Source | Accurate? | Hardcoded? | Editable? | Recommended Source |
|---|---|---|---|---|---|---|
| All | Org short name "Zubida YFC" | `site_settings.name` | UNVERIFIED | fallback in `constants.ts:2` | ✅ | `site_settings` (already correct) |
| All | Org full name "Zubida Youth for Christ" | `site_settings.full_name` | UNVERIFIED | fallback `constants.ts:3` | ✅ | `site_settings` |
| Navbar | Sub-label "Zamboanga del Sur" | **hardcoded** `navbar.tsx:57` | UNVERIFIED | ✅ yes | ❌ | `site_settings.province` |
| Navbar | "Join Us" CTA → `/events` | hardcoded `navbar.tsx` | UNVERIFIED | ✅ | ❌ | acceptable; confirm target |
| Footer | Description | `site_settings.description` | UNVERIFIED | fallback | ✅ | `site_settings` |
| Footer | Tagline "One Province. One Mission. One Christ." | `site_settings.tagline` | UNVERIFIED | fallback | ✅ | `site_settings` |
| Footer | Office "YFC Provincial Office, Pagadian City, Zamboanga del Sur" | `site_settings.office` | **UNVERIFIED — no street address** | fallback | ✅ | `site_settings` |
| Footer | Email — was `hello@zubidayfc.org` | `site_settings.email` | **WITHHELD (0022)** — was UNVERIFIED, likely placeholder | fallback also blank | ✅ | `site_settings` |
| Footer | Phone — was `+63 962 000 0000` | `site_settings.phone` | **WITHHELD (0022)** — was FABRICATED, `000 0000` is a placeholder pattern | fallback also blank | ✅ | `site_settings` |
| Footer | Facebook `https://facebook.com/zubidayfc` | `site_settings.facebook_url` | **UNVERIFIED — never validated** | fallback | ✅ | `site_settings` |
| Footer | Instagram `https://instagram.com/zubidayfc` | `site_settings.instagram_url` | **UNVERIFIED — never validated** | fallback | ✅ | `site_settings` |
| Footer | Copyright `© {year} {fullName}` | computed | VERIFIED | — | n/a | fine |
| Footer | Closing line "Built for the youth of… Ad Majorem Dei Gloriam." | `site_settings.footer_closing_line` | UNVERIFIED | fallback | ✅ | `site_settings` |
| `<head>` | `metadataBase: https://zubidayfc.org` | **hardcoded** `layout.tsx:29` | UNVERIFIED | ✅ | ❌ | `site_settings` (new `site_url`) |
| `<head>` | keywords array | hardcoded `layout.tsx:33-40` | UNVERIFIED | ✅ | ❌ | acceptable |

### 2.2 Homepage

| Page | Information | Current Source | Accurate? | Hardcoded? | Editable? | Recommended Source |
|---|---|---|---|---|---|---|
| Home | Hero eyebrow "{province} · Youth for Christ" | `site_settings.province` prop | UNVERIFIED | partly | ✅ | ok |
| Home | Hero H1 "Welcome to **Zubida YFC**" | **hardcoded** `hero.tsx:84` | UNVERIFIED | ✅ | ❌ | `site_settings.name` |
| Home | Hero paragraph | **hardcoded** `hero.tsx:93-96` | UNVERIFIED | ✅ | ❌ | page CMS (`home` page) |
| Home | 3 hero slide images | **`picsum.photos` stock** `hero.tsx:12-14` | **FABRICATED** | ✅ | ❌ | uploaded org photos |
| Home | Stat "26 Chapters" | `src/data/stats.ts:4` | **FABRICATED** (see §5) | ✅ | ❌ | derived count or admin-set |
| Home | Stat "4,200+ Active Members" | `src/data/stats.ts:5` | **FABRICATED** (see §5) | ✅ | ❌ | admin-set, confirmed |
| Home | Stat "58 Provincial Events" | `src/data/stats.ts:6` | **FABRICATED** (see §5) | ✅ | ❌ | derived from `events` |
| Home | Stat "340+ Trained Leaders" | `src/data/stats.ts:7` | **FABRICATED** (see §5) | ✅ | ❌ | admin-set, confirmed |
| Home | Stats render as **`0`** in server HTML | `animated-counter.tsx` starts at 0, animates on client | **BUG** — no-JS / pre-hydration users see "0 Chapters" | — | — | SSR the final value |
| Home | About-teaser heading + subtitle | **hardcoded** `about-teaser.tsx:60-63` | UNVERIFIED | ✅ | ❌ | page CMS |
| Home | 3 pillars (Evangelization / Community / Service) | **hardcoded** `about-teaser.tsx:8-12` | UNVERIFIED | ✅ | ❌ | page CMS |
| Home | 3 about-teaser images | **`picsum.photos` stock** `about-teaser.tsx:22,30,37` | **FABRICATED** | ✅ | ❌ | uploaded org photos |
| Home | Upcoming events (3 cards) | `getEvents()` → DB, **falls back to mock** | **FABRICATED when DB down** (see §7) | fallback | ✅ | DB only, fail loudly |
| Home | Events section has **no empty state** | `events-preview.tsx:28-31` | **BUG** — renders a bare grid when 0 events | — | — | add empty state |
| Home | 3 news cards | `src/data/news.ts` | **FABRICATED** | ✅ | ❌ | new `news`/`posts` table |
| Home | 5 featured photos | `src/data/gallery.ts` (`picsum`) | **FABRICATED** | ✅ | ❌ | new `gallery` table + Storage |
| Home | 4 testimonials (names, roles, chapters, quotes) | `src/data/stats.ts:37-77` | **FABRICATED — attributed quotes from invented people** | ✅ | ❌ | admin-managed, consent-backed |
| Home | Testimonial avatars | **`i.pravatar.cc` stock faces** | **FABRICATED** | ✅ | ❌ | real photos or remove |
| Home | Verse banner (1 Tim 4:12) | `src/data/stats.ts:11-14` | VERIFIED (scripture) | ✅ | ❌ | optional: make editable |

### 2.3 About page (`/about`) — live-rendered and verified

Rendered from `page_sections` (DB) with `src/lib/pages/fallback.ts` mirroring it verbatim.

| Section | Information | Accurate? | Notes |
|---|---|---|---|
| hero | "One Province. One Mission. One Christ." | UNVERIFIED | duplicates `site_settings.tagline` — two sources of truth |
| hero | "We are the official Youth for Christ community of Zamboanga del Sur…" | UNVERIFIED | |
| text-image | "…a covenant community and evangelistic movement within Couples for Christ, forming young people ages **12 to 21**" | UNVERIFIED | age range matches FAQ; both unsourced |
| text-image | "**twenty-six chapters** across the province" | **FABRICATED / CONTRADICTED** | app lists 12 chapters (§5) |
| text-image | image | **`picsum.photos` stock** | `objectPath: null` — never uploaded |
| feature-cards | **Our Mission** (full statement) | **UNVERIFIED — this is an official organizational statement and must be confirmed verbatim** | |
| feature-cards | **Our Vision** (full statement) | **UNVERIFIED — same** | |
| values-grid | 6 core values (Christ-Centeredness, Family & Household, Servant Leadership, Joyful Evangelization, Integrity, Missionary Heart) | **UNVERIFIED — official statements, must be confirmed** | |
| timeline | Heading "Two decades of grace" | **FABRICATED** | depends on 2003 founding |
| timeline | **2003 — The First Spark** ("a handful of students in Pagadian City…") | **FABRICATED** | founding year unsourced |
| timeline | **2008 — Chapters Multiply** ("first provincial youth camp draws over 200 delegates") | **FABRICATED** | |
| timeline | **2013 — Clusters Formed** (Bay/North/South) | **PARTIALLY CORROBORATED** | cluster names match `0007_clusters.sql`; the *year* is unsourced |
| timeline | **2017 — ICON is Born** | **FABRICATED** | |
| timeline | **2020 — Faith Online** | **FABRICATED** | |
| timeline | **2024 — One Province, One Mission** ("With 26 chapters and thousands of members") | **FABRICATED** | |

> These six milestones are the single highest-risk content on the site: they are specific, dated, historical claims about a real organization, presented as institutional record.

### 2.4 Leaders (`/leaders`)

| Information | Source | Accurate? | Notes |
|---|---|---|---|
| 12 leader profiles — names, positions, chapters, personal messages | `src/data/leaders.ts` | **FABRICATED** | includes a named clergy member, "Rev. Fr. Emmanuel Sarabia, Provincial Spiritual Director" |
| Leader photos | `i.pravatar.cc` stock faces | **FABRICATED** | real-looking faces of uninvolved people |
| Leader social links | `"#"` on every entry | **BUG — dead placeholder links** | renders clickable icons that go nowhere |
| Page header copy | hardcoded `leaders/page.tsx` | UNVERIFIED | |

### 2.5 Chapters (`/chapters`)

| Information | Source | Accurate? | Notes |
|---|---|---|---|
| 12 chapters — names, municipalities, coordinators, schedules, member counts, "up next" | `src/data/chapters.ts` | **FABRICATED** | |
| Chapter cover images | `picsum.photos` | **FABRICATED** | |
| Page header "One province, **twenty-six homes**" | hardcoded `chapters/page.tsx:15` | **CONTRADICTS the 12 chapters actually listed** | |
| Map pin positions | hardcoded, explicitly "non-geographic" | acceptable (labelled stylized) | but reads as a real province map |
| 5 coordinators (Reina Lopez, Elijah Ponce, Hannah Grace Dizon, Joshua Emmanuel Rana, Clarisse Mae Tibon) | `chapters.ts` | **INCONSISTENT** | named as chapter coordinators but absent from `/leaders` |

**RESOLVED — the chapters managed domain** *(2026-08-18)*. Every row above is gone
rather than corrected. `src/data/chapters.ts` was deleted and the stylized map
stripped out of `chapters-explorer.tsx`. `chapters` is now a database table with
cluster-scoped RLS (migrations 0023 and 0024) that ships **empty**, and
`/chapters` renders a withholding notice until an administrator publishes a real
chapter. The invented `memberCount` and "up next" fields were not carried over —
they do not exist in the new schema, and the header no longer claims a count.
Verified by `npm run prove:chapters` (33 assertions), two of which assert that the
migrations insert no rows.

### 2.6 Events (`/events`)

| Information | Source | Accurate? | Notes |
|---|---|---|---|
| Event name, description, date, time, venue, organizer, deadline, capacity, status, scope | `events` table via `getEvents()` | VERIFIED **when DB reachable** | |
| Same, **when DB unreachable or empty** | `src/data/events.ts` (6 mock events) | **FABRICATED, served silently** | see §7 |
| Slot counts ("418 / 600 slots · 182 left") | mock in fallback path | **FABRICATED** | live counts are real when DB is up |
| Event cover images | `picsum.photos` in mocks | **FABRICATED** | real events use Storage uploads |
| Empty state | `events-board.tsx:75` "No events here yet" | ✅ correct | |
| **The `events` table itself** | `supabase/seed.sql` | **FABRICATED — found later, see below** | RESOLVED by 0019 |

> **Correction (2026-08-15).** The rows above were audited with the database
> **unreachable**, so `/events` showed the fallback and this section concluded that
> real event data was VERIFIED whenever the DB was up. That inference was wrong.
> With the database reachable, the `events` table contained nothing *but* the four
> demo events, put there by `supabase/seed.sql` — the same invented records as the
> `src/data/events.ts` mocks, including the picsum covers and the "all 26 chapters"
> line in the Youth Camp description, plus a leftover `CONCURRENCY TEST` row from
> `scripts/prove-concurrency.mjs`.
>
> Removing the code fallback therefore did not stop them being served; it made them
> **worse**. As mocks they were visibly placeholders on an outage path. As table rows
> they are authentic records with a working Register button, and nothing on the page
> distinguishes them from a real event.
>
> `db-migrate.mjs` also applied the seed on *every* run — `applySeed()` sat outside
> the `if (!seedOnly)` block — so any cleanup would have been undone by the next
> migration in any environment. Fixed in `e87dc17` (seed emptied, seeding now opt-in),
> `07ade80` (migration 0019 soft-deletes the rows, guarded on the seed signature),
> and `4b61842` (11 `prove:content` assertions). Verified after applying: 0 events
> published, 5 rows retired, 6 registrations preserved, `/events` renders its empty
> state with the database **up**.
>
> The general lesson is recorded in §7: an audit that only exercises the fallback
> path has not audited the primary path. Both states must be rendered.

### 2.7 Contact (`/contact`)

| Information | Source | Accurate? | Notes |
|---|---|---|---|
| Office / Email / Phone | `site_settings` | UNVERIFIED (see §2.1) | ✅ centralized — no conflict with footer |
| Facebook / Instagram | `site_settings` | UNVERIFIED | ✅ centralized |
| Map | stylized SVG placeholder, pin labelled "Pagadian City" | **placeholder presented as a map** | no real coordinates |
| 5 FAQ answers — age eligibility, fees, registration flow, Catholic requirement, leadership path | **hardcoded** `faq.tsx:7-31` | **UNVERIFIED — these are policy statements** | "no fees", "ages 12 to 21", "everyone is welcome" are commitments the org must own |
| FAQ: "(Online registration is rolling out — some chapters still register in person.)" | hardcoded | **STALE developer hedge exposed to users** | |
| Page header + section copy | hardcoded | UNVERIFIED | |

### 2.8 News (`/news`) and Gallery (`/gallery`)

| Information | Source | Accurate? | Notes |
|---|---|---|---|
| 6 news items — titles, excerpts, authors, dates, read times | `src/data/news.ts` | **FABRICATED** | e.g. "How Our Tukuran Chapter Rebuilt After the Floods" — an invented disaster narrative attributed to a named author |
| News covers | `picsum.photos` | **FABRICATED** | |
| 18 gallery photos + captions | `src/data/gallery.ts` | **FABRICATED** | captions describe events that may not have occurred |
| Gallery: **no empty state** | `gallery-grid.tsx` | minor BUG | |
| News empty state | `news-board.tsx:74` ✅ | correct | |

### 2.9 Admin dashboard (`/admin`) — **verified by source inspection**

| Information | Source | Accurate? | Notes |
|---|---|---|---|
| Stat "Total" | `rows.length` where `rows` came from a query with **`.limit(200)`** (`admin/page.tsx:19`) | **BUG — caps at 200** | with 250 registrations the dashboard reports **200**. This is exactly the "displays a number that isn't the real number" failure. |
| Stat "Pending" | `rows.filter(...)` over the same capped 200 | **BUG — undercounts** | |
| Stat "Approved" | same | **BUG — undercounts** | |
| Stat labels "Total / Pending / Approved" | hardcoded | **AMBIGUOUS** — total *what*? | should read "Total registrations" |
| Registrations table (200 most recent) | DB, RLS-scoped to viewer's cluster | VERIFIED | |
| Header "Admin · Provincial" / "Admin · Cluster Head" | `ctx.isPYH` | VERIFIED | |
| No welcome message, no org name, no announcements, no activity feed on the dashboard | — | not misleading, but the dashboard is registrations-only despite the nav calling it the dashboard | |
| `/admin/logs` empty state "No activity yet." | ✅ | correct | |
| `/admin/logs` also `.limit(200)` with no "showing most recent 200" note | | minor: implies completeness | |

---

## 3. Organization naming consistency

Checked every user-visible occurrence. **Result: consistent, with two exceptions.**

- `"Zubida YFC"` — short name, used in navbar, footer, hero, page copy. Single source: `site_settings.name`. ✅
- `"Zubida Youth for Christ"` — full legal-style name, used only in the footer copyright. Single source: `site_settings.full_name`. ✅
- **Exception 1:** the hero H1 hardcodes the literal string `Zubida YFC` (`hero.tsx:84`) instead of reading `site_settings.name`. Renaming the org in admin settings would leave the homepage headline stale.
- **Exception 2:** the navbar hardcodes `Zamboanga del Sur` (`navbar.tsx:57`) instead of `site_settings.province`.
- No occurrences of `"ZUBIDA YFC"` (all-caps), `"Zamboanga del Sur YFC"`, or `"ZUBIDA Youth"` were found. The naming convention is already settled.

**`NEEDS ADMIN CONFIRMATION`:** whether "Zubida" is the organization's own accepted short form, and whether "Zubida Youth for Christ" is the correct expanded name (as opposed to e.g. "Youth for Christ — Zamboanga del Sur").

---

## 4. The About page is in the database but nobody can edit it

- `0016_page_cms.sql` created `pages` / `page_sections` with public-read + PYH-write RLS, and seeded About.
- `src/lib/data/pages.ts` reads it; `/about` renders it. ✅
- `src/app/admin/pages/actions.ts` implements every mutation (SEO, add/update/delete/reorder/hide section, image upload with orphan reaping). **Staged but uncommitted.**
- **`src/app/admin/pages/page.tsx` does not exist.** Neither does `/admin/pages/[slug]/edit`. `AdminShell`'s tab list has no "Pages" entry.
- Net effect: About content lives in a table with no reachable UI — Task 7 of `docs/superpowers/plans/2026-07-18-phase3b-slice3-page-cms.md` is unbuilt.

**Secondary issue — duplicated content.** The full About content exists in **two** places that must be kept byte-identical by hand:
- `supabase/migrations/0016_page_cms.sql` (seed)
- `src/lib/pages/fallback.ts` (render fallback)

Editing About in the admin UI (once it exists) will update the DB but **not** the fallback, so a DB outage will silently revert `/about` to the pre-edit text. This is the same silent-fallback problem as §7.

---

## 5. Statistics: fabricated and self-contradictory

`src/data/stats.ts` publishes four numbers. None is computed; none is editable; each is contradicted by the app's own data.

| Displayed | Claimed | What the app actually contains | Verdict |
|---|---|---|---|
| Chapters | **26** | `src/data/chapters.ts` listed **12** (file since deleted — see §2.5) | contradicted |
| Active Members | **4,200+** | chapter member counts sum to **2,138** | contradicted (~2× overstatement) |
| Provincial Events | **58** | `src/data/events.ts` has 6 (4 Provincial); `events` table unknown | unsourced |
| Trained Leaders | **340+** | `src/data/leaders.ts` lists **12** | unsourced |

The "26 chapters" figure additionally propagates into three narrative locations, so correcting it requires four edits:
- `/about` text-image: "twenty-six chapters across the province"
- `/about` timeline 2024: "With 26 chapters and thousands of members"
- `/chapters` header: "One province, twenty-six homes"
- `/news` item n1 excerpt: "filling fast across all 26 chapters"

**Partially resolved** *(2026-08-18)*. The stats band no longer reads from
`src/data/stats.ts` — `getSiteStats()` in `src/lib/data/stats.ts` replaced the
four hardcoded numbers, and the `/chapters` header no longer claims a count. The
`stats` export in `src/data/stats.ts` is now imported by nothing; it survives only
as the shape reference the fixtures gate documents.

**RESOLVED — the last unrendered copy of the figure** *(2026-08-18)*. An earlier
draft of this note claimed the figure was reachable on a database outage. That was
wrong, and the correction belongs in the record: `PAGE_FALLBACK.about` does **not**
contain it. The fabricated timeline lives in `UNVERIFIED_ABOUT_HISTORY`
(`src/lib/pages/fallback.ts:17`), which is exported and referenced by nothing —
deliberately retained so an administrator can correct the copy rather than rewrite
it from nothing. `prove:content` §2 has covered the outage path all along: "About
fallback renders no unverified history timeline" and "About fallback states no
unverified chapter count".

The real exposure was narrower, and had no assertion.
`src/components/about/timeline.tsx` carried the same six milestones as a **default
parameter** (`milestones = DEFAULT_MILESTONES`). It was unreachable through the only
caller — `TimelineSection` always passes `content.milestones`, and `timelineSchema`
requires `.min(1)` — but any future caller that omitted the prop would have published
six invented milestones, the "26 chapters" figure among them, without an edit to the
database or the fallback. Silent, and invisible to every existing check.

`milestones` is now a **required** prop and the default is deleted; `tsc` passing
confirms no caller depended on it. Two assertions were added RED-first: "the timeline
component supplies no default milestones" and "the timeline component asserts no
chapter count of its own".

**Still withheld, not resolved:** the `/news` n1 excerpt ("filling fast across all 26
chapters") still carries the figure in `src/data/news.ts`. It reaches no page — the
`news: false` fixture gate withholds it — and it is corrected when the news domain
moves to a managed table, not before.

---

## 6. Images and media

| Asset class | Current | Count | Issue |
|---|---|---|---|
| Hero slides | `picsum.photos` | 3 | stock; unrelated to the org |
| About-teaser images | `picsum.photos` | 3 | stock |
| About page image | `picsum.photos`, `objectPath: null` | 1 | stock; never uploaded |
| Chapter covers | `picsum.photos` | 12 | stock |
| News covers | `picsum.photos` | 6 | stock |
| Gallery | `picsum.photos` | 18 | stock; captions assert real events |
| Leader photos | `i.pravatar.cc` | 12 | **stock photographs of real, uninvolved people presented as named ZUBIDA leaders** |
| Testimonial avatars | `i.pravatar.cc` | 4 | same |
| Event covers | `picsum.photos` (mock path) / Supabase Storage (real path) | 6 / n | mock path is stock |
| Logo | inline `<Sunburst>` SVG | 1 | ✅ real, code-owned, no file needed |

**Alt text:** present and descriptive on all `next/image` usages checked. ✅
**Broken images:** none — all placeholders resolve. That is the problem: they resolve convincingly.
**Highest risk:** the 16 `i.pravatar.cc` faces. These are photographs of identifiable people published under invented ZUBIDA leadership titles and testimonial quotes.

---

## 7. The silent-fallback problem (`ADR-1`)

Three loaders share one pattern:

```ts
try { /* query Supabase */ if (error || !data || data.length === 0) return mockEvents; }
catch { return mockEvents; }
```

- `src/lib/data/events.ts:26` — falls back to 6 fabricated events **also when the table is merely empty**
- `src/lib/data/site.ts` — falls back to `constants.ts`
- `src/lib/data/pages.ts` — falls back to `PAGE_FALLBACK`

The intent (documented in-code as "so the public site always renders") is sound for *chrome*. It is **not** sound for *records*. Observed live during this audit:

- Supabase unreachable → `/events` and the homepage served **"Zubida Provincial Youth Camp 2026 · Camp Abelardo, Pagadian City · 418/600 slots · 182 left"** with an active **Register** button.
- The mock events carry ids `e1`…`e6`, which are not UUIDs and cannot exist in `event_registrations`, so any registration attempt against them fails after the user has filled in the form.
- Every render also blocked ~3s on the failing DB connection (visible in the dev log as uniform `GET /about 200 in 300xms`), with no operator-visible error.

An empty `events` table is a legitimate state ("no events scheduled yet"). Treating it as "database is broken, show demo data" converts a correct empty state into fabricated content.

### 7.1 Removing a fallback does not remove the content it was hiding

The fix for the above was to delete the mock fallback so an outage renders an honest
error. That was necessary and it is done. It was not sufficient, and the way it fell
short is the most transferable lesson in this audit.

**The same fabricated events existed in two places.** `src/data/events.ts` fed the
fallback; `supabase/seed.sql` had already written them into the `events` table. The
audit exercised only the DB-down path, saw the fallback replaced by an honest error,
and recorded events as clean. With the DB up, the seeded rows were what `/events`
served all along — and deleting the fallback *promoted* them, because a stand-in
labelled by an outage is at least distinguishable from a record, while a row is not.

Three rules follow:

1. **Audit both states of every fallback.** Rendering one path proves nothing about
   the other. Where a loader has a fallback, the primary path is the one carrying
   real consequence, and it is the easier of the two to leave untested — an
   unreachable database is a *convenient* state to audit in, which is exactly why it
   is a trap.
2. **Fixture data has more than one door into production.** Grepping `src/` finds the
   TypeScript fixtures. It does not find `seed.sql`, and it does not find rows already
   committed to a live table by a seed that ran months ago.
3. **A seed that runs unconditionally is a standing re-injection mechanism.**
   `db-migrate.mjs` applied `seed.sql` on every invocation, so retiring the rows
   without emptying the seed would have restored them on the next migration — in
   every environment, silently, with the cleanup appearing to have worked.

### 7.2 A well-formed placeholder outlives every check that looks at shape

`hello@zubidayfc.org` and `+63 962 000 0000` were the last fabricated values still
being *published*. Everything else unverified in this audit was withheld — the
history timeline hidden, the chapter count dropped, the stock photograph removed,
the demo events retired. These two survived all of it, and the reason is worth
stating plainly: **they are the only fabricated content in the codebase that is
well-formed.**

Each layer that could have caught them was, by construction, looking at the wrong
thing:

- **Validation** parses shape. `+63 962 000 0000` is a valid phone; `hello@` is not.
  `prove:content` has always asserted this limitation out loud — "shape validation
  alone does not catch a placeholder number" is a passing assertion, deliberately
  written so the coverage is never mistaken for protection.
- **The fabricated-string scan** looks for known invented text. Contact details were
  on the confirmation list, not the scan list, so eight clean page scans said nothing
  about them.
- **The audit's own table** classified them correctly on day one — row 69 said
  *FABRICATED*. Being recorded is not being fixed, and a finding parked in a
  confirmation list is a finding that ships.

The fix is not a better detector. A heuristic strong enough to reject
`+63 962 000 0000` would also reject real numbers an administrator had just typed,
and would fail closed against the very people it is meant to serve. The fix is
**withholding**: blank the value, and render nothing where it used to be.

Two rules follow:

4. **Withholding must be expressible before it can be chosen.** `email` and `phone`
   were `required` in both the Zod schema and the HTML form. The only way to stop
   publishing a placeholder was to invent a replacement for it — the tooling made
   fabrication the path of least resistance. A field that cannot be cleared is a
   field that will hold a lie.
5. **"Recorded in the audit" and "not published" are different states.** This
   document listed the phone number as fabricated for the entire life of the audit
   while the site served it to every visitor. Findings need a publication gate, not
   just a row in a table.

---

## 8. Content quality / typography

Copy quality is high — no spelling or grammar errors found, capitalization is consistent, no Lorem Ipsum, no broken sentences. Issues are limited to:

1. `faq.tsx:15` — "(Online registration is rolling out — some chapters still register in person.)" — a development-status hedge exposed to end users.
2. ~~`src/components/shared/fake-qr.tsx` — component named `fake-qr`, documented as "Purely visual placeholder for the Phase 1 preview". Needs a check that no user-facing surface still renders it now that `src/lib/qr.ts` exists.~~ **RESOLVED:** `FakeQR` was superseded in phase 2 and left orphaned — defined but imported nowhere, while `registration-form.tsx:99` renders the real server-generated QR. It rendered a meaningless decorative pattern under `aria-label="Registration QR code"`, so an accidental import would have handed users an unscannable "event pass". Component deleted.
3. Leader social links are all `"#"` — clickable icons that navigate nowhere.
4. Admin stat label "Total" is ambiguous.

No official organizational statement (Mission, Vision, Core Values) should be reworded for style — flagged for confirmation only, not edited.

---

## 9. Everything requiring administrator confirmation

Nothing below can be resolved from the repository. **None of it may be guessed.**

**Identity**
1. Official organization name — short and expanded forms.
2. Whether the tagline "One Province. One Mission. One Christ." is official.

**Contact — now withheld rather than published** *(0022, 2026-08-15)*
3. Real email address. The unverified `hello@zubidayfc.org` is **no longer published** — `site_settings.email` is blank and the site renders no email at all. Still needed; enter it in `/admin/settings` once confirmed.
4. Real phone number. The placeholder `+63 962 000 0000` is **no longer published** — same treatment. Still needed.
5. Real office address (currently a description, not an address).
6. Real Facebook URL; real Instagram URL (or confirmation that no Instagram account exists).
7. Real public website domain (`zubidayfc.org` is hardcoded in metadata).

**Official statements**
8. Mission statement — verbatim.
9. Vision statement — verbatim.
10. Core values — the list, names, and descriptions.
11. Member age range (currently "12 to 21").
12. Fee policy (currently "no membership fee").

**Facts and figures**
13. Actual number of chapters, and the chapter roster (names, municipalities, coordinators, schedules, member counts).
14. Actual membership figure, or confirmation to remove the stat.
15. Actual leader roster — names, positions, photos, consent to publish.
16. Founding year and the real historical milestones — or confirmation to remove the timeline.
17. Whether ICON / the Ignite Conference exists and when it began.

**Media**
18. Real photographs for hero, About, chapters, gallery, leaders, testimonials.
19. Whether the 4 testimonials describe real people who consented.

**Policy** *(added 2026-08-15)*
20. ~~**Does rejecting a registration return the seat to the pool?**~~ **Answered: yes** — implemented in 0020/0021, see §12. Still open, and separable: `registration_status` includes a `cancelled` value that nothing in the application ever assigns. Confirm whether attendees are meant to be able to cancel; the counter already handles it correctly if that flow is built.

---

## 10. Prioritized remediation plan

Ordered by the stated priority: **accuracy → consistency → source of truth → admin control → validation → UX → polish.**

### P0 — Stop publishing things that are wrong (no organizational facts required)
1. **Fix the dashboard count bug.** Replace `.limit(200)` + `rows.length` with real `count: "exact", head: true` queries for total/pending/approved. Label them unambiguously.
2. **Stop serving mock events as real.** Remove the `mockEvents` fallback from `getEvents()`; render the existing "No events here yet" empty state when the table is empty, and surface a real error state when the query fails.
   - **2a. Retire the seeded rows and close the seed.** *(added 2026-08-15 — see §7.1.)* Step 2 alone is not enough and, on its own, makes the problem worse. The same four events were already in the `events` table via `supabase/seed.sql`, which `db-migrate.mjs` re-applied on every run. Empty the seed, make seeding opt-in behind `--seed`, and soft-delete the existing rows with guards that match the seed signature so an adopted event is never touched.
3. **Add an empty state to the homepage events preview.**
4. **Remove or neutralize the fabricated stats band** until real figures are confirmed (§9.13–14).
5. **Remove the `i.pravatar.cc` faces** from leaders and testimonials — real photographs of uninvolved people published as named ZUBIDA leaders.
6. **Fix the dead `"#"` social links** on leader cards.
7. **Remove the "rolling out" developer hedge** from the FAQ.
   - **7a. Withhold the placeholder contact details.** *(added 2026-08-15 — see §7.2.)* `hello@zubidayfc.org` and `+63 962 000 0000` were the last fabricated values still being published. Blank them in `site_settings` (guarded, 0022) and in the constants backing the outage fallback; make blank a legal value in the schema and the settings form so withholding is expressible; and drop the element entirely on every surface rather than rendering an empty label or a dead `mailto:`. Requires no organizational facts — that is the point: the number is not needed to stop publishing the wrong one.

### P1 — Make the About page actually manageable
8. **Build `/admin/pages` + `/admin/pages/[slug]/edit`** (Task 7 of the existing plan) and add the "Pages" tab to `AdminShell`. The server actions are already written.
9. **Resolve the fallback duplication** so an admin edit cannot be silently reverted by a DB outage.
10. **Flag unconfirmed About content in the admin UI** so a PYH editor sees which sections still need verification, rather than deleting the content outright.

### P2 — Close the consistency gaps
11. Wire the hero H1 to `site_settings.name`, and the navbar sub-label to `site_settings.province`.
12. Move `metadataBase` to a `site_url` setting.
13. Add a **content-consistency test** (`prove:content`) asserting that the org name, province, email, phone, and social URLs each resolve to exactly one value across navbar, footer, contact, About, and metadata.
14. Add validation to the settings form for email format, phone shape, and URL validity (`zod` is already a dependency; `src/lib/validation/site.ts` exists).

### P3 — Bring the remaining fixtures under management
15. Chapters, leaders, news, gallery, testimonials, and FAQ are the six domains still hardcoded. Each needs either a managed table or explicit sign-off that the current content is official. This is genuinely new scope and should be planned as its own slice, consistent with the existing `pages`/`page_sections` architecture rather than a new CMS.

---

## 11. Verification record

| Checked | How |
|---|---|
| About Us | live render of `/about` on `:3111`, full text extracted and compared line-by-line against `0016_page_cms.sql` seed and `src/lib/pages/fallback.ts` |
| Dashboard | source inspection of `src/app/admin/page.tsx` (auth-gated; count bug confirmed by reading the query) |
| Homepage | live render, full text extracted |
| Events | live render of `/events` — **twice**. First with the DB unreachable (fallback path). Re-verified 2026-08-15 with the DB **reachable**, which is what exposed the seeded rows in §2.6; now renders the empty state from a genuinely empty table. |
| Contact | live render + source |
| Footer / Navigation | live render on every fetched page |
| Contact information | traced to `site_settings` in all three display locations — no conflicts. **Re-verified 2026-08-15 after 0022:** the live row reads `email=""`, `phone=""` (office preserved); all 8 public pages re-fetched and scanned — no placeholder value, and no empty `mailto:""` / `tel:""` link. `/contact` renders a single "Province Office" card and the footer's "Reach Us" block renders the office line alone, so the channels are omitted rather than blanked in place. |
| Social links | traced to `site_settings`; **not** reachability-tested (would require confirming the accounts are the organization's) |
| Images | full inventory by `grep` across `src/` |
| Statistics | traced to `src/data/stats.ts` and cross-checked against `chapters.ts`, `leaders.ts`, `events.ts` |
| Database state | **Verified 2026-08-15.** The earlier `ENOTFOUND` proved to be DNS, not a deleted project — the host resolved again and the REST endpoint answered 401 (reachable, unauthenticated). Migrations 0017–0022 applied; table contents read directly and compared against what renders. |

**Limitations of this audit.**

The original pass could not reach the live database, so displayed values could not be
compared against real table contents; findings about DB-backed content rested on the
code paths and the observed fallback behavior. **That limitation produced a wrong
finding** — see the correction in §2.6. Auditing only the DB-down state made the
`events` table look clean when it held nothing but fabricated rows.

As of 2026-08-15 the database has been read directly and all five proof suites run
against it (**156 assertions**: `content` 89, `pages` 22, `rbac` 19, `uploads` 14,
`behaviors` 12), plus `prove:concurrency`. Content was modified from this point on —
migrations 0017 through 0022 — where the original pass modified nothing.

Every assertion added for §7.2 was mutation-tested: each production change was
reverted one at a time and the suite re-run, confirming the intended assertion
fails. Eight mutations, eight caught — republishing the constants, rendering the
footer row unconditionally, linking the raw settings value, disabling the blank
filter, restoring `required` on the schema (email and phone separately) and on the
form input, and dropping 0022's guard.

~~Two items remain unverified because they need credentials rather than access.~~
**Both were closed on 2026-08-15**, driven through a real browser against the live
database.

- **The `/admin/pages` editor — 31 assertions, all passing.** Signed in as a
  provincial youth head: an unauthenticated visit redirects to the login page; the
  Pages tab appears; the editor loads; an SEO edit reaches the public `<title>`; a
  hero-title edit persists to the database *and* appears on `/about`; hiding a
  section removes it from `/about` and showing it brings it back; a reorder swaps
  two rows; an upload records the object and stores it; a **second upload reaps the
  first object** and points the section at the new one; removing the image clears
  the content and deletes the object, leaving storage exactly as it started.
- **The cluster-head redirect — 5 assertions, all passing.** A signed-in cluster
  head never sees the Pages tab, is redirected from `/admin/pages` *and* from
  `/admin/pages/[slug]/edit` to `/admin?error=forbidden`, and never receives the
  editor form. This is the first *negative* RBAC test on this surface; everything
  before it was static confirmation that `requirePYH` is called.

Two notes on how that was done, because both bear on trusting the result:

1. **No existing account was modified.** The default password in
   `scripts/setup-admin.mjs` no longer opens `admin@zubidayfc.org`, and resetting
   the only real admin's password to run a test is not an acceptable trade. Two
   throwaway accounts were created instead (one per role), used, then deleted —
   deletion required clearing their `audit_log` rows first, which is why the first
   attempt reported an empty error. The `admins` table and the auth user list were
   both re-read afterwards: one row, one user, exactly as before.
2. **The About page was snapshotted and restored.** The walkthrough writes to live
   public content, so `pages`, `page_sections` and the storage listing were captured
   first and compared field by field afterwards — reported IDENTICAL. All five proof
   suites were re-run after the restore and remain at 156.

The first run of the storage assertions is worth recording: `storage.list("pages")`
returns the *folder* entry `about`, not the objects inside it, so three "the object
was reaped" assertions were passing against a list that never contained the object.
Two sibling assertions failed and exposed it. Same vacuous-pass family as §7.1 —
an absence assertion is only as good as the collection it searches.

---

## 12. `ADR-5` — Rejecting a registration never releases its slot

*Found 2026-08-15, following up the `slots_taken = 1` / zero-registrations drift on
the retired Youth Camp row.*

**The counter is claimed but only ever released on one path.** `register_for_event`
(`0004_functions.sql:31`) increments `slots_taken` atomically before inserting, which
is the correct way to claim capacity under concurrency, and the suite proves it holds
under load (`prove:concurrency`, `prove:behaviors`). The only decrement in the entire
schema is at `0004_functions.sql:73`, inside `exception when unique_violation` — the
duplicate-registration path.

Meanwhile `updateRegistrationStatus` (`src/app/admin/actions.ts:13`) sets a
registration to `approved` or `rejected` and touches nothing else. There is no
trigger on `event_registrations`. The `cancelled` enum value
(`0002_registrations.sql:3`) is never assigned anywhere in the application.

So a rejected registration holds its slot forever. Two consequences, both of them
squarely the subject of this audit:

1. **The published figure overstates demand.** `/events` shows
   `{slotsTaken}/{slotsTotal} slots` and "N left" (`event-card.tsx:69`), and
   `LiveSlots` keeps it updated in real time. After an admin rejects registrations,
   that number is wrong in the direction that makes the event look fuller than it is.
2. **Real registrations are refused.** `register_for_event` gates on
   `slots_taken < slots_total`. An event whose rejections have consumed the remaining
   capacity returns `FULL` to genuine applicants while seats are actually free. This
   is worse than a wrong figure — it silently turns people away.

Neither is reachable today, because no event has open registrations. It becomes
reachable the moment the first real event is published and an administrator rejects
anyone.

**RESOLVED — migrations 0020 and 0021.** The policy question (does a rejection return
the seat?) was put to the organization rather than guessed, and confirmed: **yes, the
seat goes back into the pool.**

A registration holds a seat when `deleted_at is null and status in ('pending',
'approved')`, and releases it otherwise. `sync_event_slots()` fires after every
UPDATE or DELETE on `event_registrations` and moves the counter accordingly.

Three decisions worth recording:

- **A trigger, not a fix to the one admin action.** The bug existed because a single
  code path forgot the counter. Patching that path would leave the next one free to
  forget it again. The trigger owns every transition, so a future cancellation flow,
  bulk tool, or manual SQL correction stays consistent without knowing the rule.
- **INSERT is deliberately *not* handled by the trigger.** `register_for_event`
  claims the seat inside its conditional `UPDATE`, and that single atomic statement
  **is** the capacity gate under concurrency. Moving the claim into an insert trigger
  would evaluate capacity after the row exists and reintroduce the overbooking race.
  Re-verified after the change: 200 concurrent attempts against 50 seats still yield
  exactly 50 claimed, 0 overbooked, 0 duplicates.
- **Re-claiming a seat fails loudly.** Un-rejecting a registration into a full event
  raises a readable error rather than tripping the bare `slots_not_overbooked`
  constraint.

0020 rebuilt the counter from live registrations; 0021 extended that to soft-deleted
events, which 0020 had skipped. A retired event can be restored — 0019 retired four
precisely so they could be reviewed — and it would have carried a stale counter back
into public view. The invariant is now asserted for **every** row in `prove:behaviors`
(12 assertions), not spot-checked.

Confirmation item 20 is answered. The unused `cancelled` status remains open: nothing
in the application assigns it, so whether attendees may cancel is still unconfirmed —
though the trigger already handles it correctly if that flow is ever built.
