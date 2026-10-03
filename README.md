# Zubida YFC

> **One Province. One Mission. One Christ.**

The official website of **Zubida Youth for Christ** — the Youth for Christ
community of Zamboanga del Sur. A modern, warm, and fully responsive site built
with Next.js 15 and backed by Supabase.

## What is built

The public site began as a showcase driven by typed fixtures; it is now backed by
a real database, an authenticated admin surface, and a page CMS.

**Public** — Home · About · Leaders · Chapters · Events · Gallery · News · Contact

- Warm "dawn / light of Christ" visual identity with full **dark mode**
- Animated hero slideshow, scroll reveals, animated counters, loading screen
- Signature **sunburst** brand motif throughout
- Event board with a real registration flow: capacity-checked slots, a
  registration ID, a QR code, and a self-service status lookup
- Masonry photo gallery with lightbox, daily verse widget
- Accessible: keyboard nav, focus states, `prefers-reduced-motion` respected
- SEO: metadata, sitemap, robots — all driven by stored settings

**Admin** (`/admin`, sign-in required)

- Role-based access: a provincial youth head sees everything; a cluster head is
  scoped to their own cluster. Enforced by RLS policies in the database, not only
  in the UI.
- Page CMS — edit a page's SEO and its sections: reorder, hide/show, upload and
  replace images. Replaced images are reaped from storage rather than orphaned.
- Chapters directory — cluster heads manage their own cluster's chapters, the
  provincial youth head manages all. Entered as drafts and published per row.
- Leadership directory — cluster heads manage their own cluster's leaders, the
  provincial youth head manages all. A photo or a personal quote cannot be stored
  without a recorded consent basis. Photo upload and consent withdrawal exist as
  server actions but are not yet wired into the admin form; that is the next
  slice.
- Photo gallery — cluster heads upload and manage their own cluster's photos,
  the provincial youth head manages all. A photo cannot be stored without a
  record of who confirmed permission to publish it; its real dimensions
  (phone rotation applied) are read from the file. Drafts until published;
  public filters come from the categories real photos carry.
- Messages inbox — what the public contact form sends, readable by the provincial
  youth head only. Messages are triaged (new / read / archived), never edited or
  deleted.
- Venue check-in — per event, scan each QR pass with the phone camera (or a
  handheld scanner, or type the code). A pass is admitted once, only at its own
  event; live attendance count and undo. Scoped like the event itself.
- Registrant export — one CSV per event (Excel-ready, UTF-8), scoped like the
  event. Spreadsheet formulas typed into the form are neutralised, the pass
  token is never included, and every export is audited.
- Site settings, user administration, event management, and an audit log.

## The content rule

**Never invent organizational information.** Anything unverified is withheld and
made editable rather than filled in with a plausible-looking placeholder — a blank
phone number renders as no phone row at all, not as a stand-in.

Phase-1 fixtures still live in `src/data/` for the domains that have not been
migrated yet, and every one of them sits behind a publication gate: it does not
reach a public page until it is marked verified. Chapters, leaders and the
gallery no longer sit there — they are managed database domains, and their
pages render the empty-state notice until an administrator publishes real
content.

`npm run prove:content` enforces this: 140 assertions covering identity
consistency, fallback/seed drift, placeholder media, and the publication gate.

## Design

The visual system, the rules a change has to keep, and the measured reasons
behind them: **[docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md)**. Read it before
adding a component or introducing a colour.

## Tech Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Framer Motion ·
lucide-react · Supabase (Postgres, Auth, Storage, RLS). Deploys to Vercel.

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL, anon key, service role key
npm run db:migrate           # apply migrations; add --seed / npm run db:seed for sample rows
npm run dev                  # http://localhost:3000
```

```bash
npm run build   # production build
npm start       # serve the production build
```

## Verification

Each `prove:*` script is a standalone assertion suite that prints `N passed,
M failed` and exits non-zero on any failure.

```bash
npm run prove:content      # 140 assertions — needs no database
npm run prove:metrics      # 14 — dashboard chart arithmetic; needs no database
npm run prove:keepalive    # 13 — the Supabase keepalive cron; needs no database
npm run prove:export       # 35 — registrant CSV: injection, secrets, format; no database
npm run prove:env          # 29 — the deploy-time configuration check; no database
npm run prove:rbac         # 24 — role policies
npm run prove:pages        # 22 — page CMS data layer
npm run prove:uploads      # 14 — image validation + storage ownership
npm run prove:behaviors    # 12 — registration/slot behaviour
npm run prove:concurrency  #      slot race conditions
npm run prove:editor       # 41 — the /admin/pages editing loop, in a real browser
npm run prove:a11y         # 64 — the public accessibility floor, in a real browser
npm run prove:registration # 26 — a member registering, in a real browser
npm run prove:chapters     # 33 — the chapters directory, RLS and withholding
npm run prove:leaders      # 83 — the leadership directory, RLS and consent
npm run prove:contact      # 40 — the contact form, its gates, and the PYH-only inbox
npm run prove:checkin      # 31 — venue check-in: pass parsing, admit-once, scope
npm run prove:gallery      # 80 — the photo gallery: dimensions, RLS, consent, guards
```

CI runs `tsc --noEmit`, `next lint`, `prove:content`, `prove:metrics`, `prove:keepalive`, `prove:export` and `prove:env` on every pull request.
The database-backed suites are a local pre-merge step: they need service-role
credentials and they mutate shared data, so point them at a throwaway project,
never at production.

`prove:registration` walks the one path no other suite covers: a member filling
in the public form and getting a slot. `prove:behaviors` and `prove:concurrency`
call `register_for_event()` directly, so they never build a `FormData`, and
`prove:content` only greps the markup — which is how the consent checkbox
shipped without a `name`, making the form unsubmittable while every suite, and
`tsc`, `lint` and `build`, stayed green. It creates its own event, registers
through the real modal, and hard-deletes the event in a `finally`; a crashed run
is swept on the next start, or by `npm run prove:registration -- --cleanup-only`.
It also carries the event modal's accessibility assertions, which `prove:a11y`
cannot reach: that suite runs without a database, so no event exists to open.

Note it exercises the captcha's **degraded** branch, because `TURNSTILE_SECRET_KEY`
is unset locally. Set that variable only together with
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` — the secret alone rejects every registration,
since no widget renders and no token is ever submitted. The route logs loudly if
you do it anyway.

`prove:editor`, `prove:a11y` and `prove:registration` are the suites that drive a browser.
`prove:a11y` needs no database — it audits the public pages at a 390px viewport
for landmarks, heading order, image alts, accessible names, the WCAG 2.5.8
24px target floor, and a visible focus ring. `prove:editor` is the only suite
that edits published content — it snapshots `/about`, edits it, restores it, and
then asserts the restore succeeded. Both need two things the others don't:

```bash
npx playwright install chromium   # the binary lives in the Playwright cache,
                                  # not node_modules — `npm ci` is not enough
```

and a **dev server**. It starts its own `next dev` when nothing is answering on
port 3000, or reuses one via `BASE_URL`. Do not point it at `npm start`: `/about`
sets `revalidate = 60`, so a production server can serve cached HTML and the
public-page assertions would read stale markup after a successful edit.

## Deploy configuration

A Vercel **production** build fails if the site's required configuration is
missing: `NEXT_PUBLIC_SUPABASE_URL` (a full `https://` URL),
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`,
or only one of the two Turnstile keys. The build log names each problem, never
a value, and Vercel keeps serving the previous deployment.

This exists because production once ran for weeks with every Supabase variable
set but empty: the public pages fell back to built-in content, so it looked
fine, while admin, registration and the contact form were all dead. Preview
builds only warn, and local builds are not checked (`src/lib/env/check.mjs`).

## Keeping Supabase awake

A free-tier Supabase project is paused after a week without activity, and a
paused project takes every database-backed page and registration down with it.
Public pages are ISR-cached, so visitors alone do not keep it awake.

`vercel.json` schedules a daily Vercel Cron call (20:00 UTC, 04:00 in Manila)
to `/api/cron/keepalive`, which runs one real query. It requires
**`CRON_SECRET`** in the Vercel project's environment variables — Vercel sends
it as a bearer token, and the route rejects every call without it. Unset, the
route fails closed and the project can pause again, so set it before relying on
this. A failed ping returns 503, which shows as a failed run under the
project's **Cron Jobs** tab.

Upgrading to Supabase Pro removes the pause entirely; the cron is then harmless.

## Project Structure

```
src/
  app/              App Router routes + layout, sitemap, robots
    admin/          admin surface: page CMS, settings, users, events, logs
    api/            route handlers
    registration-status/   self-service registration lookup
  components/
    layout/         navbar, footer, theme toggle, loading screen
    home/           home page sections
    pages/          CMS section registry + renderer
    admin/ shared/ ui/     admin widgets, reusable cards, primitives
    about|leaders|events|chapters|gallery|news|contact/   page-specific
  data/             Phase-1 fixtures, gated behind the publication check
  lib/
    supabase/       server + browser clients, admin auth guards
    pages/          section schemas, registry, image reaping
    images/         upload validation + object paths
    content/        fixtures gate + contact withholding
    data/           database reads with outage fallbacks
    rbac.ts validation/ email/ qr.ts constants.ts utils.ts
  middleware.ts     session refresh, 30-min idle timeout, admin route protection
supabase/migrations/   ordered .sql migrations
scripts/               db:migrate and the prove:* suites
```
