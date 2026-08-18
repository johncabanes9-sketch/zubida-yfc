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
  without a recorded consent basis.
- Site settings, user administration, event management, and an audit log.

## The content rule

**Never invent organizational information.** Anything unverified is withheld and
made editable rather than filled in with a plausible-looking placeholder — a blank
phone number renders as no phone row at all, not as a stand-in.

Phase-1 fixtures still live in `src/data/` for the domains that have not been
migrated yet, and every one of them sits behind a publication gate: it does not
reach a public page until it is marked verified. Chapters no longer sit there —
they are a managed database domain, and `/chapters` renders the empty-state
notice until an administrator publishes a real one.

`npm run prove:content` enforces this: 95 assertions covering identity
consistency, fallback/seed drift, placeholder media, and the publication gate.

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
npm run prove:content      # 95 assertions — the only suite that needs no database
npm run prove:rbac         # 24 — role policies
npm run prove:pages        # 22 — page CMS data layer
npm run prove:uploads      # 14 — image validation + storage ownership
npm run prove:behaviors    # 12 — registration/slot behaviour
npm run prove:concurrency  #      slot race conditions
npm run prove:editor       # 39 — the /admin/pages editing loop, in a real browser
npm run prove:chapters     # 33 — the chapters directory, RLS and withholding
npm run prove:leaders      # 50 — the leadership directory, RLS and consent
```

CI runs `tsc --noEmit`, `next lint`, and `prove:content` on every pull request.
The database-backed suites are a local pre-merge step: they need service-role
credentials and they mutate shared data, so point them at a throwaway project,
never at production.

`prove:editor` is the only suite that drives a browser, and the only one that
edits published content — it snapshots `/about`, edits it, restores it, and then
asserts the restore succeeded. Two things it needs that the others don't:

```bash
npx playwright install chromium   # the binary lives in the Playwright cache,
                                  # not node_modules — `npm ci` is not enough
```

and a **dev server**. It starts its own `next dev` when nothing is answering on
port 3000, or reuses one via `BASE_URL`. Do not point it at `npm start`: `/about`
sets `revalidate = 60`, so a production server can serve cached HTML and the
public-page assertions would read stale markup after a successful edit.

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
supabase/migrations/   27 ordered .sql migrations
scripts/               db:migrate and the prove:* suites
```
