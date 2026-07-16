# Phase 3b (slice 2): Image uploads — Supabase Storage foundation

**Date:** 2026-07-16
**Status:** Draft (awaiting review)
**Branch:** `phase3b-image-uploads` (to be created)

## Context

This slice was named as the next step by the slice 1 spec
(`2026-07-16-phase3b-site-settings-design.md`), which deferred it explicitly:

> 1. **Image uploads / Supabase Storage foundation** — prerequisite for galleries and leader photos.

Slice 1 proved the content-management pattern (DB table → loader → admin form →
revalidation → RLS) on text-only settings. This slice builds the **image**
equivalent of that pattern, because every remaining content slice (leaders,
gallery, news) needs somewhere to put pictures. It is deliberately the smallest
piece that makes the pattern real.

### Audit findings that motivate this slice

Verified against the codebase on 2026-07-16, not assumed:

- **No image system exists at all.** No `public/` directory. Zero matches in `src/`
  for `storage.from(`, `.upload(`, `createSignedUrl`, `type="file"`, or
  `multipart/form-data`. No carousel component exists.
- **All imagery is third-party placeholder stock.** `next.config.mjs:4-10`
  whitelists exactly four remote hosts: `picsum.photos`, `fastly.picsum.photos`,
  `i.pravatar.cc`, `images.unsplash.com`. Leader photos are `i.pravatar.cc`
  avatars (`src/data/leaders.ts`); gallery photos are `picsum.photos` seeds
  (`src/data/gallery.ts`).
- **`events.cover` is a single `text` column** (`0001_events.sql:22`) holding a
  free-text URL, validated as a string by `eventSchema`. There is no data model
  for multiple images per event.

### Explicitly out of scope (later slices, each its own spec)

- **Collections** — leaders, chapters, news/announcements as DB tables. This slice
  gives them a storage layer to build on; it does not migrate them.
- **Page content** — homepage hero/verse/stats/testimonials, About vision/mission, FAQs.
- Any redesign of the gallery grid or leaders directory.

## Governing constraints

Carried forward from slice 1; these override convenience:

- Do **not** redesign the frontend. No changes to layout, styling, animations, or routing.
- Do **not** remove or regress working features.
- Reuse existing architecture and conventions. No opportunistic refactoring.
- Preserve the existing visual identity.

## Existing patterns this reuses

- `src/lib/data/events.ts` — `getEvents()`: service-role read, map DB rows to the
  shared view type, fall back to hardcoded data when the DB is unreachable/empty.
- `requirePYH()` / `requireClusterAccess()` in `src/lib/supabase/admin-auth.ts`
  — per-action authorization. (Note: these live in `admin-auth.ts`, **not**
  `src/lib/rbac.ts`, which is types-only.)
- `is_pyh(auth.uid())` + cluster-ownership RLS policy style from `0010_rls_rbac.sql`.
- `src/lib/validation/*` — Zod schema conventions.
- `scripts/prove-rbac.mjs` — RBAC assertions proven against the real database.

## Architecture

### 1. Storage bucket

A single Supabase Storage bucket, `media`, created in migration `0014_storage_media.sql`.

- **Public read.** These are public-website images; signed URLs would defeat CDN
  caching and Next/Image optimization for no security benefit.
- **Writes via service-role only.** Uploads go through a guarded server action, never
  from the browser directly. This keeps one authorization model (the existing guards)
  rather than introducing a second one in storage RLS.
- Object key convention: `events/{event_id}/{uuid}.{ext}`. Prefixing by owning entity
  keeps deletes simple and makes the bucket browsable.

### 2. Data model — `event_images`

`0015_event_images.sql`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `event_id` | uuid | FK → `events(id)` **on delete cascade** |
| `path` | text not null | object key within the `media` bucket, not a full URL |
| `alt` | text | accessibility text; nullable |
| `sort_order` | int not null default 0 | carousel ordering |
| `created_at` | timestamptz default now() | |
| `created_by` | uuid | FK → `auth.users(id)`, for audit |

Index on `(event_id, sort_order)`.

Storing the **path**, not a full URL, means the Supabase project URL is not baked
into rows — the public URL is derived at read time.

**RLS** mirrors `events` exactly (per `0010_rls_rbac.sql` style): PYH may write any
row; a cluster head may write rows only for events whose `cluster_id` matches their
own; deactivated/soft-deleted admins may write nothing. Public/anon gets `SELECT`
only. The policies must be expressed against the parent event's ownership via a
subquery, so ownership cannot drift between an event and its images.

**`events.cover` is retained**, not dropped. It stays the single-image fallback so
nothing regresses. Read precedence: first `event_images` row by `sort_order`, else
`cover`, else the existing placeholder behavior.

### 3. Upload path

A new `uploadEventImages` server action in `src/app/admin/events/actions.ts`
(alongside the existing guarded actions):

1. `requireClusterAccess(event.cluster_id)` — **first statement**, matching the
   convention every other event action follows.
2. Validate each file:
   - **Extension + MIME allowlist:** jpeg, png, webp only.
   - **Magic-byte sniff** of the leading bytes. MIME from a multipart upload is
     client-supplied and trivially forged; the sniff is what actually prevents
     storing an executable or SVG (SVG is excluded deliberately — it can carry script).
   - **Size cap** 5 MB per file, max 10 files per event per submission.
3. Upload to the `media` bucket via the service client.
4. Insert the `event_images` row(s).
5. `revalidatePath("/events")` and `revalidatePath("/")`.

**Compression is explicitly deferred.** The prompt asked for it, but doing it
properly server-side needs `sharp`, which is a heavyweight native dependency, and
the 5 MB cap plus Next/Image's on-the-fly optimization already bound the real cost.
Adding `sharp` is a separate decision, not a hidden rider on this slice. Client-side
canvas downscaling before upload is a reasonable future addition.

Delete and reorder actions follow the same guard-first shape, and remove the storage
object as well as the row so the bucket does not leak orphans.

### 4. Admin UI

Extends the **existing** `event-form.tsx` — no new screens, no redesign:

- A file input (`accept="image/jpeg,image/png,image/webp"`, `multiple`).
- Client-side preview via object URLs before submit.
- A list of current images with delete buttons and up/down reorder controls.
- Drag-and-drop is **out of scope** (the prompt marked it optional; it adds real
  complexity and an a11y burden for marginal benefit).

Existing `cover` URL field stays, so current events keep working untouched.

### 5. Public carousel

A new `src/components/shared/event-carousel.tsx`, used inside the existing
`event-modal.tsx`. It renders `event_images` when present and falls back to the
single `cover` otherwise — so events with no uploads look exactly as they do today.

Requirements: keyboard-navigable (arrow keys, visible focus ring), `alt` text from
the DB, respects `prefers-reduced-motion`, and does not autoplay. It must reuse the
existing motion/styling idiom rather than introducing a carousel library.

`next.config.mjs` gains the Supabase project hostname in `images.remotePatterns`.
The four placeholder hosts stay until the collections slice retires them.

## Bugs fixed in this slice

Two real defects found during the audit. Both are in scope because they directly
affect whether uploaded images appear:

1. **The homepage serves stale/mock events.** `src/app/events/page.tsx:12` sets
   `export const dynamic = "force-dynamic"`, but `src/app/page.tsx` sets nothing
   while rendering `<EventsPreview />`, which calls `getEvents()`. The build output
   confirms the split: `○ /` (static) vs `ƒ /events` (dynamic). So a newly created
   event appears on `/events` but not the homepage until redeploy — and if the
   events table was empty at build time, the homepage serves the hardcoded Phase 1
   mock events from `src/data/events.ts` forever. Fix: add
   `export const revalidate = 60` to `src/app/page.tsx` (ISR, preserving static
   performance) and rely on the existing `revalidatePath("/")` for immediacy.
   This must be fixed here or uploaded images silently won't show on the homepage.

2. **`npm run lint` has never run.** There is no ESLint config in the repo, so the
   script drops into an interactive setup prompt. Fix: add `eslint`,
   `eslint-config-next`, and a checked-in `.eslintrc.json` extending
   `next/core-web-vitals`, then resolve what it reports. Scope guard: config +
   genuine violations only. If it flags pre-existing style across untouched files,
   those are recorded, not bulk-fixed, to honor the no-opportunistic-refactor rule.

## Deliberately NOT changed

The audit checked these against the request and found no work needed. Recorded so
the next reader doesn't re-investigate:

- **Authorization has no holes.** Every mutating server action calls a guard as its
  first statement. The three unguarded actions (`signIn`, `lookupRegistration`,
  `POST /api/register`) are intentionally public and have compensating controls
  (Turnstile + `check_rate_limit` RPC on registration).
- **CRUD, archive, participant limits, soft-delete, audit logging** all exist.
- **No TODOs or placeholder copy** exist in `src/`.
- **Build and typecheck are clean** (21 routes).

Two defense-in-depth gaps were found but are **deferred, not fixed here**, as they
are unrelated to images and would be scope creep:

- `setStatus` (`src/app/admin/actions.ts:9`) uses `loadAdminContext()` and delegates
  cluster scoping entirely to RLS, unlike the event actions which double-check with
  `requireClusterAccess`. Not exploitable today; it just has no application-layer
  backstop if an RLS policy ever regresses.
- Several guarded actions take literal/boolean params without Zod validation
  (`setEventStatus`, `setActive`, `deleteEvent`, `updateNavItems`).

## Testing

Following the project's established "prove it against the real DB" convention
(`scripts/prove-rbac.mjs`, currently 13 assertions):

1. **Extend `prove:rbac`** with `event_images` assertions: a cluster head cannot
   insert/update/delete an image row for another cluster's event; a deactivated
   admin cannot write at all; anon can read but not write. These run against the
   real database, matching how every prior RBAC rule in this project was proven.
2. **New `scripts/prove-uploads.mjs`**: a file with a forged image MIME but non-image
   magic bytes is rejected; an oversized file is rejected; a valid upload produces a
   row plus a retrievable object; deleting removes both row and object (no orphan).
3. **Manual verification**: create an event with 3 images, confirm the carousel
   renders and is keyboard-navigable on `/events`, confirm the homepage reflects it,
   confirm an event with no uploads still renders its `cover` exactly as before.

## Success criteria

- A PYH or owning cluster head can upload multiple images to an event, preview,
  reorder, and delete them.
- Those images render in a keyboard-accessible carousel on the public site.
- An event with no uploaded images renders identically to today.
- A cluster head cannot touch another cluster's event images (proven, not asserted).
- Forged/oversized files are rejected (proven).
- The homepage no longer serves stale or mock events.
- `npm run lint` runs and passes.
- Build and typecheck stay clean; no visual change to any existing page.
