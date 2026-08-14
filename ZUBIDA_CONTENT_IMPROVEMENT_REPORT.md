# ZUBIDA Content Improvement Report

**Date:** 2026-08-14
**Branch:** `phase3b-page-cms`
**Companion document:** [ZUBIDA_CONTENT_AUDIT.md](./ZUBIDA_CONTENT_AUDIT.md) — the full inventory and evidence.

---

## Summary

The audit found that most organizational "facts" on the public site came from Phase-1 demo fixtures, not from Zubida YFC: invented leaders with stock-photo faces, invented chapters and member counts, invented news stories, a fabricated 20-year founding history, and four homepage statistics contradicted by the app's own data. A database outage additionally caused six fabricated events to be served silently as real, complete with slot counts and a working Register button.

**No organizational facts were invented, and none were guessed.** Unverifiable content was withheld behind honest empty states, statistics were rewired to real data, and the About page was made editable by administrators. Everything that cannot be resolved from the repository is listed in §6 for confirmation.

---

## 1. Information audited

Live-rendered and text-extracted: `/`, `/about`, `/events`, `/contact`, `/leaders`, `/chapters`, `/news`, `/gallery`.
Source-inspected: `/admin` dashboard, `/admin/logs`, `/admin/events`, `/admin/settings`, `/registration-status`, global navbar/footer/metadata, all 8 fixture modules, all 17 migrations.

| Surface | Sections reviewed |
|---|---|
| Homepage | hero, statistics, about teaser, events preview, news, featured photos, testimonials, verse banner |
| About | hero, who-we-are, mission, vision, core values, history timeline, SEO metadata |
| Events | listing, filters, event cards, slot counts, empty state, registration entry point |
| Contact | office/email/phone, socials, map, FAQ, form |
| Leaders / Chapters / News / Gallery | full directory and board content, photos, captions |
| Admin dashboard | Total/Pending/Approved tiles, registrations table, shell labels |
| Global | navbar, footer, copyright, canonical metadata, navigation labels |

---

## 2. Incorrect information found

| # | Finding | Severity |
|---|---|---|
| 1 | `getEvents()` fell back to 6 fabricated events on **any** DB error *or* an empty table — verified live, serving "Zubida Provincial Youth Camp 2026 · 418/600 slots · 182 left" with an active Register button pointing at non-existent ids `e1`…`e6` | Critical |
| 2 | Admin dashboard "Total" was `rows.length` over a `.limit(200)` query — silently caps at 200 and undercounts Pending/Approved | Critical |
| 3 | Homepage statistics (26 / 4,200+ / 58 / 340+) unsourced and self-contradictory — the app lists 12 chapters and 2,138 members | High |
| 4 | About history timeline asserted six dated milestones (2003→2024) with no source | High |
| 5 | 12 leader profiles with `i.pravatar.cc` stock photographs of real, uninvolved people, published under named leadership titles including a named clergy member | High |
| 6 | 4 testimonials — invented quotes attributed to named individuals with stock faces | High |
| 7 | 12 chapters with invented coordinators, schedules, and member counts | High |
| 8 | 6 news articles with invented authors and narratives, including a fabricated flood-recovery story | High |
| 9 | 18 gallery photos: stock imagery captioned as real ZUBIDA events | High |
| 10 | "twenty-six chapters" claim in 4 places, contradicted by the 12 chapters listed | Medium |
| 11 | Homepage events preview had no empty state — rendered a bare grid when there were no events | Medium |
| 12 | Statistics rendered as `0` in server HTML (counter animated from 0 client-side) — no-JS visitors saw "0 Chapters" | Medium |
| 13 | Every leader social link was `"#"` — clickable icons that navigate nowhere | Medium |
| 14 | FAQ exposed a developer status note: "(Online registration is rolling out — some chapters still register in person.)" | Medium |
| 15 | Contact page rendered `<a href="">` when a social URL was unset — reloads the page | Low |
| 16 | Hero H1, hero paragraph, and navbar sub-label hardcoded the org name and province, bypassing `site_settings` | Low |
| 17 | About SEO description advertised a history section | Low |
| 18 | `EventsBoard` `useMemo` omitted `events` from its dependency array — filtered list could go stale | Low |
| 19 | Stock `picsum.photos` imagery across hero, about teaser, and the About page, captioned as ZUBIDA worship/households/missions | Medium |

---

## 3. Corrections made

### Accuracy
- **`src/lib/data/events.ts`** — removed the mock fallback. `getEvents()` now returns a discriminated `{ status: "ok" | "unavailable" }`, so an empty schedule and an unreachable database are no longer conflated. **(#1)**
- **`src/components/events/events-board.tsx`, `src/components/home/events-preview.tsx`** — distinct states: real events, "No events here yet", or "The event schedule can't be loaded right now". The homepage preview gained an empty state it never had. **(#1, #11)**
- **`src/app/admin/page.tsx`** — Total/Pending/Approved now use `count: "exact", head: true` over the whole table instead of the length of a 200-row page. Labels disambiguated ("Total registrations", "Pending approval"). A count that cannot be read renders "Unavailable" rather than a wrong number, and the table notes when it is showing a subset. **(#2)**
- **`src/lib/data/stats.ts`** (new) — statistics derived from the `events` table. Returns an empty list when nothing can be counted. **(#3)**
- **`src/components/home/stats-band.tsx`** — now a server component; renders nothing when there is no verifiable figure. **(#3)**
- **`src/components/shared/animated-counter.tsx`** — the real value is present in server HTML; the count-up runs once on scroll instead of starting from `0`. **(#12)**

### Withheld rather than invented
Per your decision, unverifiable content is hidden behind honest empty states and **kept in the repository** so nothing is lost.

- **`src/lib/content/fixtures.ts`** (new) — a publication gate naming each Phase-1 domain and why it is withheld.
- **`src/components/shared/unpublished-notice.tsx`** (new) — states plainly that content is not published; never substitutes sample material.
- **`/leaders`, `/chapters`, `/news`, `/gallery`** — render the notice instead of fixture content. **(#5, #6, #7, #8, #9)**
- **Homepage** — News, Featured Photos, and Testimonials sections are omitted entirely rather than filled with invented stories. **(#6, #8, #9)**
- **`supabase/migrations/0017_about_unverified_content.sql`** (new) — hides the About history timeline (`visible = false`, content preserved for correction), removes the picsum image, drops the "twenty-six chapters" clause from the prose, and fixes the SEO description. Every statement is guarded so it only touches still-seeded content and never overwrites an administrator's edit. **(#4, #10, #17, #19)**
- **`src/lib/pages/fallback.ts`** — mirrors 0017 exactly, so a DB outage cannot resurrect the hidden history. The timeline copy is retained as `UNVERIFIED_ABOUT_HISTORY` for an administrator to correct. **(#4)**
- **Hero and about teaser** — stock photography withheld; the hero keeps its branded gradient treatment and the teaser runs single-column. **(#19)**
- **`src/lib/pages/content-schemas.ts`, `text-image-section.tsx`, `registry.tsx`** — a `text-image` section's image is now optional and new sections start text-only, so no stand-in photo is ever seeded. **(#19)**

### Consistency and quality
- Hero title, hero paragraph, and navbar sub-label now read from `site_settings`. **(#16)**
- Leader social links: `"#"` and empty hrefs no longer render a clickable icon. **(#13)**
- Contact page social icons render only when a URL is set. **(#15)**
- FAQ developer hedge removed. **(#14)**
- `EventsBoard` dependency array corrected. **(#18)**
- `/chapters` header changed from "One province, twenty-six homes" to "One province, many homes". **(#10)**
- **`supabase/migrations/0018_site_url.sql`** (new) — the canonical site URL moves out of `layout.tsx` into `site_settings`. It drives `metadataBase`, so it governs canonical links and the Open Graph URLs used in every shared link preview; it was the last piece of organization identity that could not be corrected without a deploy. The seeded value is the one already in source, so behaviour is unchanged — and it remains unverified (§6). `layout.tsx` falls back to the constant if a stored value is unparseable, so a bad row cannot break site-wide metadata. **(#5 in §6)**
- **`src/lib/validation/site.ts`** — added phone-shape validation (digits and normal punctuation only, minimum 7 digits) and absolute-URL validation for the site URL. Email and social URLs were already validated.
- **`src/components/shared/fake-qr.tsx`** — deleted. Superseded in phase 2 and left orphaned: defined but imported nowhere, while `registration-form.tsx:99` renders the real server-generated QR. It drew a meaningless decorative pattern under `aria-label="Registration QR code"`, so an accidental import would have handed a visitor an unscannable "event pass".

**No official statement was reworded.** Mission, Vision, and Core Values are untouched pending confirmation (§6).

---

## 4. Centralized information

| Information | Authoritative source | Consumers |
|---|---|---|
| Org name, full name, tagline, description, province | `site_settings` | navbar, footer, hero (title + paragraph), `<head>` metadata |
| Canonical site URL | `site_settings.site_url` | `metadataBase` — canonical links, OG/share previews |
| Email, phone, office address | `site_settings` | footer, contact page |
| Facebook, Instagram | `site_settings` | footer, contact page |
| Footer headings, closing line | `site_settings` | footer |
| Navigation labels and order | `nav_items` | navbar, footer |
| About page content | `pages` + `page_sections` | `/about` |
| Events | `events` + `event_images` | `/events`, homepage |
| Statistics | derived from `events` | homepage |

Contact details were already single-sourced and showed **no conflicts** between footer, contact page, and settings. The remaining duplication closed in this pass was the hero and navbar restating identity in hardcoded strings.

---

## 5. Admin-editable content

**New: `/admin/pages`** (PYH only) — completes Task 7 of the page-CMS plan. The server actions existed but had no UI, so About content was stranded in a table no administrator could reach.

- `/admin/pages` — lists pages with section counts, hidden-section counts, and last-updated dates
- `/admin/pages/[slug]/edit` — full section editor:
  - edit every field of all 5 section types (text, textarea, select, icon allowlist, repeatable lists with per-item reordering)
  - add, delete, reorder, show/hide sections
  - upload and remove section images, with alt-text editing and storage reaping on replace and removal
  - edit SEO title and description
  - server-side validation errors surfaced in the UI instead of failing silently
- **`removeSectionImage`** action added — clears an image field *and* deletes the owned storage object, matching the ordering `deleteSection` uses so no orphaned bytes are left behind.
- "Pages" tab added to the admin shell, PYH-gated.

Changes publish immediately via `revalidatePath` and are recorded in the audit log.

Already editable before this pass, unchanged: site settings, navigation, events, event images, users, registrations.

---

## 6. Information requiring administrator confirmation

None of the following can be resolved from the repository. **Nothing here was guessed.**

**Currently placeholder-shaped — should be treated as wrong until confirmed**
1. Phone `+63 962 000 0000` — a placeholder pattern
2. Email `hello@zubidayfc.org` — never verified
3. Office "YFC Provincial Office, Pagadian City, Zamboanga del Sur" — a description, not an address
4. Facebook `facebook.com/zubidayfc` and Instagram `instagram.com/zubidayfc` — never verified to be the organization's accounts
5. Canonical domain `zubidayfc.org` — now editable in `/admin/settings` rather than hardcoded, but the value itself was never verified. It governs canonical links and every shared link preview, so a wrong domain is publicly visible.

> Note on 1–5: validation now rejects a *malformed* phone, email, or URL, but it cannot tell a well-formed placeholder from a real one. `+63 962 000 0000` passes validation and is still wrong — `prove:content` asserts this explicitly so the limitation is not mistaken for coverage.

**Official statements — displayed today, unverified**
6. Mission statement (verbatim)
7. Vision statement (verbatim)
8. The six Core Values — names and descriptions
9. Tagline "One Province. One Mission. One Christ."
10. Organization name, short and expanded forms
11. Member age range "12 to 21" (About + FAQ)
12. Fee policy "no membership fee" (FAQ)

**Facts now withheld — supply to republish**
13. Chapter roster: count, names, municipalities, coordinators, schedules, member counts
14. Leadership roster: names, positions, photos, and consent to publish
15. Founding year and real historical milestones
16. Whether ICON / the Ignite Conference exists, and when it began
17. Membership and trained-leader figures (no table can derive these)
18. Whether the 4 testimonials describe real people who consented
19. Real photographs for hero, About, chapters, gallery, and leaders

---

## 7. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | no warnings or errors (the pre-existing `events-board` warning was fixed, not suppressed) |
| `npm run build` | exit 0, 15/15 pages; `/admin/pages` and `/admin/pages/[slug]/edit` present |
| `npm run prove:content` (new) | **54 passed, 0 failed** |
| `npm run prove:pages` | 10/10 offline assertions pass; DB-backed assertions could not run (see below) |

**`prove:content`** (`scripts/prove-content.mjs`) is the automated consistency test asked for: it asserts the `site_settings` seed matches `constants.ts` field by field, that navbar, hero and layout never restate identity that lives in settings, that the DB-outage fallback contains no hidden timeline / chapter count / placeholder imagery, that migration 0017 withholds the same things, that all four fixture pages are gated, that statistics are derived rather than asserted, that `getEvents` no longer falls back to mocks, that the dashboard counts exactly, and — exercising the schema directly rather than by grep — that settings validation rejects malformed URLs, emails and phone numbers. It was mutation-tested: flipping a fixture gate to `true` correctly fails the suite.

### Final content inspection (live render, text-extracted)

Scanned `/`, `/about`, `/leaders`, `/chapters`, `/news`, `/gallery` for `picsum.photos`, `pravatar.cc`, `2003`, `twenty-six`, `26 chapters`, `4,200`, `Rev. Fr.`, `Camp Abelardo` — **zero occurrences on every page.**

- Homepage — identity from settings, no fabricated stats, no invented news/photos/testimonials, honest events state
- About — hero, who-we-are, mission, vision, core values; history section absent; no chapter count; no stock image
- Leaders / Chapters / News / Gallery — honest unpublished notices
- Events — "The event schedule can't be loaded right now" instead of six fabricated events
- Footer / navigation — single-sourced, consistent across every page
- Contact information — one value each, no conflicts between footer, contact page, and settings
- Statistics — derived; band omitted when nothing is countable

### Limitations — stated plainly

1. **The Supabase database was unreachable for the entire session** (`ENOTFOUND vtqtsbbzwrfamkftutpj.supabase.co`). Consequences:
   - Migration **0017 has not been applied**. Run `npm run db:migrate` when the database is reachable. Until then the DB still holds the fabricated timeline and chapter count; the *rendered* site is correct only because the fallback path is active.
   - `prove:pages`, `prove:rbac`, `prove:uploads`, `prove:behaviors` could not complete their DB-backed assertions.
   - The `/admin/pages` editor was verified by typecheck, lint, and build, and its routes are present — but it has **not been exercised against a live database**. The end-to-end admin edit loop (Task 8 §3 of the plan) remains to be run.
2. Social URLs were not reachability-tested; confirming an account belongs to the organization is not something I can determine.
3. Chapters, leaders, news, gallery, testimonials, and the FAQ remain hardcoded fixtures behind the publication gate. Bringing them under management is genuinely new scope and should be planned as its own slice, consistent with the existing `pages`/`page_sections` architecture rather than a second CMS.

---

## 8. Recommended next steps

1. Run `npm run db:migrate` to apply **0017 and 0018**, then re-run `prove:pages`, `prove:rbac`, `prove:uploads`, `prove:behaviors`.
2. Exercise the `/admin/pages` edit loop against the live database, and confirm a cluster head is redirected away from it.
3. Confirm or correct the items in §6 — the contact details and official statements first, since they are displayed today.
4. ~~Move `metadataBase` into `site_settings` as a `site_url` field.~~ **Done** — migration 0018.
5. ~~Add validation to the settings form for email format, phone shape, and URL validity.~~ **Done** — phone shape and absolute-URL checks added; email and social URLs were already validated.
6. Plan the remaining content domains (chapters, leaders, news, gallery) as a managed slice.
7. Investigate the Supabase project itself. The failure is `tenant/user postgres.vtqtsbbzwrfamkftutpj not found` from the pooler and `ENOTFOUND vtqtsbbzwrfamkftutpj.supabase.co` for the REST host — that reads as a deleted or paused project rather than a transient network fault, and it did not recover across the session.
