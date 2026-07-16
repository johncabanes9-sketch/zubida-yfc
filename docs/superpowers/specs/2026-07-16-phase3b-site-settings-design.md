# Phase 3b (slice 1): Dynamic site settings, footer, socials & navigation

**Date:** 2026-07-16
**Status:** Approved (design)
**Branch:** `phase3b-site-settings`

## Context

The Super Admin (Provincial Youth Head, "PYH") must be able to edit website content
without a developer touching source code. Today that content is hardcoded in
`src/lib/constants.ts` (`SITE`, `NAV_LINKS`) and `src/data/*.ts` (collections).

This spec covers **only the first slice**: site identity, contact details, social
links, footer text, and navigation labels/order/visibility. It exists to prove the
whole content-management pattern end-to-end — DB table → loader → admin form →
revalidation → RLS — on low-risk content, before richer pages depend on it.

### Explicitly out of scope (later slices)

Each gets its own spec → plan → implementation cycle:

1. **Image uploads / Supabase Storage foundation** — prerequisite for galleries and leader photos.
2. **Collections** — leaders, chapters, news/announcements.
3. **Page content** — homepage (hero, verse, stats, testimonials) and About (vision, mission, timeline).

Events are already dynamic and role-scoped (Phase 2 + Phase 3a) and are not revisited here.

## Governing constraints

From the enhancement request, these override convenience:

- Do **not** redesign the frontend. No changes to layout, styling, animations, or routing.
- Do **not** modify working features unless strictly necessary for this enhancement.
- Reuse existing architecture, components, and conventions. No opportunistic refactoring.

## Existing patterns this reuses

- `src/lib/data/events.ts` — `getEvents()`: service-role read, map to the shared
  view type, **fall back to hardcoded data** when the DB is unreachable or empty.
  `getSiteSettings()` mirrors this exactly.
- `src/lib/rbac.ts` + `requirePYH()` (Phase 3a) — per-action authorization.
- `is_pyh(auth.uid())` SQL helper + RLS policy style from `0010_rls_rbac.sql`.
- `AdminShell` + existing event-form screens — admin UI shell and server-action form pattern.
- `src/lib/validation/*` — Zod schema conventions.
- `scripts/prove-rbac.mjs` — RBAC assertions proven against the real database.

## Architecture

### 1. Data model

Migration `0013_site_settings.sql`.

**`site_settings`** — enforced singleton:

| Column | Type | Notes |
|---|---|---|
| `id` | `smallint primary key default 1` | `check (id = 1)` makes a second row impossible |
| `name` | `text not null` | e.g. "Zubida YFC" |
| `full_name` | `text not null` | e.g. "Zubida Youth for Christ" |
| `tagline` | `text not null` | |
| `description` | `text not null` | used in footer + page metadata |
| `province` | `text not null` | used in footer + hero |
| `email` | `text not null` | |
| `phone` | `text not null` | |
| `office` | `text not null` | |
| `facebook_url` | `text` | nullable — blank hides the icon |
| `instagram_url` | `text` | nullable — blank hides the icon |
| `footer_explore_heading` | `text not null` | default "Explore" |
| `footer_reach_heading` | `text not null` | default "Reach Us" |
| `footer_closing_line` | `text not null` | seeded literal: "Built for the youth of Zamboanga del Sur. Ad Majorem Dei Gloriam." |
| `updated_at` | `timestamptz not null default now()` | |
| `updated_by` | `uuid` | admin user id |

Seeded with the current `SITE` values, so behaviour is byte-identical on day one.

**`nav_items`** — fixed route set:

| Column | Type | Notes |
|---|---|---|
| `href` | `text primary key` | one of the 8 real routes |
| `label` | `text not null` | editable |
| `sort_order` | `int not null` | editable |
| `visible` | `boolean not null default true` | editable |

Seeded from `NAV_LINKS`. **The admin UI exposes no insert or delete.** `href` is never
user-supplied, which is what structurally prevents a nav link to a non-existent page.

`footer_closing_line` stores **literal text only** — there is no token/placeholder
language. The current component interpolates `{SITE.province}` at render; the seed
resolves that once ("Built for the youth of Zamboanga del Sur. …") and the admin edits
the finished sentence thereafter. Rationale: a templating syntax is a feature nobody
asked for, and it would leak `{province}` onto the live page the first time an admin
typed it wrong.

### 2. Loader

New `src/lib/data/site.ts`:

```ts
export type SiteSettings = { /* mirrors SITE shape */ };
export type NavItem = { href: string; label: string };

export async function getSiteSettings(): Promise<{ site: SiteSettings; navLinks: NavItem[] }>;
```

Behaviour, mirroring `getEvents()`:

- Reads both tables with the service-role client.
- On **any** error, missing row, or empty nav set → returns the `SITE` / `NAV_LINKS`
  constants unchanged.
- Filters `nav_items` to `visible = true`, ordered by `sort_order`.

`src/lib/constants.ts` is **not modified**. It remains the seed source, the fallback,
and the default prop value for client components.

### 3. Component wiring (the only edits to existing files)

These are necessary, not optional — a static `metadata` export cannot read a database,
and a client component cannot query one. Every edit is additive; no JSX structure,
class name, or animation changes.

| File | Change | Why |
|---|---|---|
| `src/app/layout.tsx` | `export const metadata` → `export async function generateMetadata()`; await `getSiteSettings()`; pass props to `Navbar`/`Footer` | metadata must reflect DB values |
| `src/components/layout/navbar.tsx` | accept optional `site` / `navLinks` props **defaulting to the current constants** | it is `"use client"` and cannot fetch |
| `src/components/layout/footer.tsx` | read `site` / `navLinks` from props | server component |
| `src/app/contact/page.tsx` | await loader for office/email/phone/socials | server component |
| `src/components/home/hero.tsx` | accept `province` prop (its only `SITE` use) | it is `"use client"` |

`src/app/sitemap.ts` **deliberately keeps using the static `NAV_LINKS` constant**:
hiding a tab from the menu must not delist the page from search engines. Nav visibility
is a presentation concern, not a publication state.

**Rendering is unchanged.** The layout's DB read executes at build time; all 8 public
pages remain statically generated. No `force-dynamic`, no per-visitor DB round-trip.

### 4. Admin UI

New route `src/app/admin/settings/page.tsx` (+ `actions.ts`), reusing `AdminShell` and
the existing event-form patterns. Sections: **Identity**, **Contact**, **Socials**,
**Footer**, **Navigation** (rename / reorder / show-hide).

Adds a PYH-only "Settings" tab to the existing admin nav.

### 5. Permissions

- `requirePYH()` guards the page **and** re-checks inside the server action. The UI is
  never the enforcement point.
- RLS on both tables:
  - `select` → public/anon (the public site must render for anonymous visitors).
  - `insert`/`update`/`delete` → `is_pyh(auth.uid())` only.
- Cluster heads have **no write path** to either table, enforced in the database.
- Writes are recorded to `audit_log` (`settings.update`, `nav.update`) via the
  service-role client, best-effort, following the Phase 3a `audit()` convention.

### 6. Revalidation

On successful save the action calls `revalidatePath("/", "layout")`. The footer and
navbar render on every page, so all pages regenerate. Edits are live within seconds
without a redeploy.

### 7. Error handling

- **DB unreachable at build or request:** loader returns constants; site renders current content.
- **Validation failure:** Zod errors return to the form; nothing is written.
- **Audit write failure:** swallowed; never blocks the content save (Phase 3a precedent).
- **Blank social URL:** icon is hidden rather than linking to `undefined`.
- **Unauthorized write attempt:** rejected by `requirePYH()` and independently by RLS.

## Verification

1. `npm run build` — green; all 8 public pages still listed **static** (`○`); no route
   silently becomes dynamic (`ƒ`).
2. `npm run prove:rbac` — extended from 8 to **10** assertions, adding: a cluster head
   cannot write `site_settings`, and cannot write `nav_items`. Existing 8 must still pass.
3. `npm run prove:behaviors` — remains 6/6 (regression gate).
4. **Fallback proof:** point the loader at an unreachable DB (or empty tables) and
   confirm the footer/nav still render the constant values.
5. **Runtime:** as PYH, edit the tagline and a nav label → the change appears on the
   public site without a rebuild. As a cluster head, `/admin/settings` is not reachable.

## Success criteria

- The PYH can change site identity, contact info, social URLs, footer text, and nav
  labels/order/visibility from the admin panel, with no code change and no redeploy.
- Cluster heads cannot reach or write any of it.
- The public site is visually identical to before the change when settings hold their
  seeded values.
- All public pages remain statically generated.
