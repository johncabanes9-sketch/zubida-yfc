# Phase 3b slice 3 — Dynamic Page CMS (section-registry) — Design

**Date:** 2026-07-18
**Branch (to be created):** `phase3b-page-cms`
**Base:** current `master` (after phase3b image-uploads merge)
**Precedent:** `site_settings`/`nav_items` (migration 0013), event image uploads (0014/0015, `reap.ts`, `validate.ts`), RBAC `is_pyh()` (0008b/0010).

## 1. Goal

Make every navbar page's content editable from the Admin Dashboard instead of hardcoded in JSX — titles, subtitles, hero banners, text, images, galleries, carousels, videos, buttons/links, and SEO metadata — with the ability to **add, remove, hide/show, and reorder** page sections, and to **create brand-new pages** from the dashboard. Deliver a **reusable page/section engine** so future pages and section types slot in without bespoke wiring.

**Hard constraint:** the existing frontend design, layout, responsiveness, and animations must not change. Only the *source* of content moves from hardcoded literals to the database. Day-one rendered output is byte-identical.

## 2. Decisions (locked in brainstorming)

| Area | Decision |
|---|---|
| Content model | **Section registry** — pages = ordered, typed sections; a registry maps `type` → component + Zod schema + editor spec. |
| Permissions | **PYH only** (mirrors `site_settings`/`nav_items`). Cluster heads keep event-only scope. |
| Publish model | **Direct publish** — save → `revalidatePath` → live. Staging via per-section `visible` flag + reorder. No draft/version workflow in v1. |
| Video | **Embed by URL** — allowlisted providers (YouTube/Vimeo), parsed + rendered via privacy-friendly lazy iframe. No video file uploads. |
| Long text | **Plain text + line breaks** — rendered by existing components/typography. No HTML/markdown injection surface. |
| SEO | **Per-page** `seo_title`, `seo_description`, `og_image` → `generateMetadata`. |
| Existing pages | **Retained** (Home, About, Leaders, Chapters, Events, Gallery, News, Contact). Ministries/Transparency are **additive** net-new pages (Slice 3.3), not replacements. |
| First proof page | **About** (rich static content, no live-data entanglement). |

## 3. Scope & decomposition

All navbar pages are in scope for the overall project. Delivered in three slices, each its own spec → plan → implementation cycle:

- **Slice 3.1 — Engine + About (THIS spec):** schema/migration, section registry, `getPage` + `<SectionRenderer>`, `/admin/pages` list + About editor, RLS + server actions + validation + reap + audit, `prove-pages.mjs`. About migrated and seeded byte-identical. Establishes every pattern the later slices reuse.
- **Slice 3.2 — Remaining pages:** Home (with live-data section framing), Leaders, Chapters, Events intro, Gallery, News, Contact — seed + any additional section types (carousel, cta, stats). Pure reuse of the 3.1 engine.
- **Slice 3.3 — New pages + nav:** catch-all dynamic route for DB-only slugs, create/delete custom pages from the dashboard, wire `nav_items` add/remove/reorder/hide, and add net-new Ministries/Transparency pages.

The rest of this document specifies **Slice 3.1**.

## 4. Data model

New migration `0016_page_cms.sql`, following the exact shape/conventions of `0013_site_settings.sql`.

### `pages`
| column | type | notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `slug` | text unique not null | `about`, `home`, … (no leading slash; nav `href` maps `/`+slug, with `home`→`/`) |
| `title` | text not null | admin-facing label |
| `seo_title` | text | nullable → falls back to hardcoded default |
| `seo_description` | text | nullable → fallback |
| `og_image_path` | text | nullable; storage object path in `media` bucket |
| `is_system` | boolean not null default true | true = a route file exists; false = dashboard-created (Slice 3.3) |
| `visible` | boolean not null default true | |
| `sort_order` | int not null default 0 | admin listing order |
| `updated_at` | timestamptz not null default now() | |
| `updated_by` | uuid | |

### `page_sections`
| column | type | notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `page_id` | uuid not null references pages(id) on delete cascade | |
| `type` | text not null | registry key; validated app-side, not a DB enum (new types must not need a migration) |
| `content` | jsonb not null default '{}' | validated per-type by Zod before write |
| `sort_order` | int not null | |
| `visible` | boolean not null default true | |
| `updated_at` | timestamptz not null default now() | |

- Index `page_sections(page_id, sort_order)`.
- Image object paths live inside `content` (e.g. `{ "image": "pages/about/who-we-are/<uuid>.webp" }`). Deleting a section or page reaps every storage object referenced in its content via the existing `reap.ts` pattern.
- `type` is a plain text column (not a Postgres enum) so adding a section type is code-only — no migration.

### RLS (verbatim pattern from 0013)
```
enable row level security on both tables.
pages_public_read / page_sections_public_read  → for select to anon, authenticated using (true)
pages_pyh_write / page_sections_pyh_write       → for all to authenticated using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()))
```
Public read on all rows is acceptable: like `events_public_read`, there is no status/draft leak because the render path filters `visible` server-side and unseeded pages fall back to hardcoded defaults. (No secret content exists on a public marketing site.)

## 5. Section registry

`src/lib/pages/registry.ts` (or `src/lib/pages/registry.tsx` if it imports components). One entry per section type:

```ts
type SectionDef<T> = {
  type: string;                 // registry key, matches page_sections.type
  label: string;                // admin catalog label
  schema: ZodType<T>;           // validates content on read AND write
  defaultContent: T;            // used by "add section"
  Component: (props: T) => JSX.Element;  // existing public component (thin wrapper)
  editorFields: EditorFieldSpec[];       // drives the admin form (text | textarea | image | video | list)
};
```

- **Rendering** and **editing** both derive from this one object, so they cannot drift.
- Each existing component gets a **thin adapter** that maps `content` → its current props. The underlying component's markup/classes/animations are untouched.
- Unknown/legacy `type` at render time → the section is **skipped** (never throws), logged server-side. Unknown `type` on write → rejected by the action.

### v1 catalog (enough to fully cover About)
`hero` (PageHeader: eyebrow, title, subtitle) · `text` (heading + plain multiline body + optional image + layout flag) · `values-grid` (repeatable {icon, title, text} items) · `timeline` (repeatable milestone items) · `image` (single image + alt).
Later slices add: `gallery`, `carousel`, `video`, `cta`, `stats`, and live-data wrappers (`events-preview`, `news-preview`, `featured-photos`) whose content supplies only heading/teaser copy.

Icons in `values-grid` are chosen from a **fixed allowlist** (the lucide icons already used on the page) keyed by name — no arbitrary component/code from the dashboard.

## 6. Render path

- `src/lib/data/pages.ts` (server-only, `createServiceClient`) exposes:
  - `getPage(slug)` → `{ page, sections }` with sections filtered `visible=true`, ordered by `sort_order`. On DB error/empty → a **hardcoded `FALLBACK[slug]`** so the public site always renders (mirrors `getSiteSettings`).
  - `getPageMeta(slug)` → SEO fields (or hardcoded default) for `generateMetadata`.
- `src/components/pages/section-renderer.tsx` — `<SectionRenderer sections={…}/>` looks each `type` up in the registry and renders `Component`; unknown types skipped.
- Existing route file (`src/app/about/page.tsx`) shrinks to:
  ```tsx
  export const revalidate = 60;
  export async function generateMetadata() { /* from getPageMeta('about') */ }
  export default async function AboutPage() {
    const { sections } = await getPage('about');
    return <SectionRenderer sections={sections} />;
  }
  ```
- **Byte-identical proof:** the About seed reproduces today's exact copy/images/order, and a review diffs rendered output (or the section list) against the pre-migration page.

## 7. Instant updates

Every write action calls `revalidatePath('/'+slug === '/home' ? '/' : '/'+slug)` and, when SEO/nav-affecting, the layout. Combined with `revalidate = 60`, this matches the event/settings instant-update behavior already in production.

## 8. Admin UX — `/admin/pages`

Built from existing admin design tokens only (same approach as `event-images-manager.tsx`; no new visual language).

- **Page list:** system + custom pages, each with visible-toggle and an Edit link; "New page" is present but disabled/hidden until Slice 3.3.
- **Page editor (`/admin/pages/[slug]/edit`):**
  - **SEO panel:** seo_title, seo_description, og_image (uses the existing image-upload component).
  - **Sections list:** ordered rows, each with reorder up/down (like event images), hide/show, delete (with confirm), and an expandable **registry-driven form**.
  - **Add section:** picks a `type` from the catalog → inserts a row seeded from `defaultContent`.
  - Field widgets by `editorFields` kind: `text`/`textarea` → inputs; `image` → existing upload component; `video` → URL input with provider validation; `list` → add/remove/reorder repeatable items (values-grid, timeline).

## 9. Server actions & security

`src/app/admin/pages/actions.ts`, following the hardened conventions from Task 5/5b:

- **`loadAdminContext()` is the literal first statement** in every action (closes the pre-auth enumeration oracle), then an `is_pyh` gate. Non-PYH → redirect, identical for real vs bogus ids.
- **Zod validation per section type** (the registry schema) before any write. Unknown `type` rejected.
- **Images:** run through existing `validate.ts` (magic-byte sniff, not client MIME); object keys derived **server-side** from the sniffed type (never client filename); uploaded to the `media` bucket under `pages/<slug>/...`.
- **Video URLs:** parsed against a provider allowlist (youtube/vimeo), stored as `{provider, id}` (never raw HTML).
- **Reaping:** deleting a section or page reaps every storage object referenced in its `content` (+ `og_image_path`) via a shared helper extending `reap.ts`; reap failure surfaces (throws) rather than silently orphaning — matching `deleteEventImage`/`deleteEvent` (786b7bd/59e2e04).
- **Audit:** every mutation writes to `admin_audit`.
- Actions: `updatePageSeo`, `addSection`, `updateSection`, `deleteSection`, `reorderSections`, `toggleSectionVisible`, `togglePageVisible`.

## 10. Testing — `scripts/prove-pages.mjs`

New proof suite (Node, same harness as `prove-rbac`/`prove-uploads`, with try/finally cleanup like `prove-uploads`):

- **RLS:** anon CANNOT write `pages`/`page_sections`; a cluster head CANNOT write (positive-control: PYH CAN); anon/CH CAN read; unseeded → fallback still renders.
- **Validation:** each catalog `type` rejects malformed content and accepts valid content; unknown `type` rejected; video URL allowlist enforced; image accepted via magic-byte sniff regardless of client filename.
- **Reap (real prod code):** `deleteSection`/`deletePage` remove referenced storage objects; positive control confirms the object existed before; reap failure throws.
- **Render fallback:** `getPage` on an empty table returns the hardcoded fallback (no crash, no mock leakage).

Existing suites must stay green: `prove:rbac` (19), `prove:uploads` (14), `prove:behaviors` (6), `prove:concurrency`.

## 11. Non-goals (v1 / this slice)

- Draft/version/preview workflow (direct publish only).
- Video file hosting (embeds only).
- WYSIWYG / HTML / markdown rich text (plain text + line breaks only).
- Dashboard-authored *new section types* (new visual components still require a dev to build + register).
- New-page creation, catch-all routing, and nav wiring (Slice 3.3).
- Migrating pages other than About (Slice 3.2).

## 12. Risks & mitigations

- **Design drift** → seed byte-identical + review-diff rendered output against pre-migration; thin adapters never touch component markup.
- **Broken/malformed section content serving fallback silently** (the Task 6 embed-error class) → render path distinguishes "DB error" vs "empty" vs "row present"; malformed section skipped + logged, not whole-page fallback.
- **Storage orphans** → reap on delete, error-checked (Task 5/9 lesson).
- **Enumeration oracle** → `loadAdminContext()` first (Task 5b lesson).
- **`type` as free text** → app-side allowlist via registry; unknown rejected on write, skipped on read.

## 13. Acceptance criteria (Slice 3.1)

1. About page renders byte-identical to pre-migration, sourced entirely from the DB.
2. A PYH admin can, from `/admin/pages`, edit About's hero/text/values/timeline/image content, reorder sections, hide/show a section, edit SEO, and upload/replace an image — with changes live on `/about` near-instantly.
3. Non-PYH (anon, cluster head) cannot write; verified by `prove-pages`.
4. Deleting a section reaps its storage objects; failure surfaces.
5. All existing proof suites + tsc + lint + build stay green.
6. No change to public component markup/classes/animations (verified by diff).
