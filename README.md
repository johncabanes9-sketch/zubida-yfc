# Zubida YFC

> **One Province. One Mission. One Christ.**

The official website of **Zubida Youth for Christ** — the Youth for Christ
community of Zamboanga del Sur. A modern, warm, and fully responsive public
site built with Next.js 15.

## Phase 1 — Public Showcase

This is the first build phase: a polished, deployable public website driven by
typed mock data (no backend yet). See
[`docs/superpowers/specs`](./docs/superpowers/specs) for the full design spec and
the roadmap of deferred phases (auth, real event registration, member portal,
admin dashboard, etc.).

### Pages
Home · About · Leaders · Chapters · Events · Gallery · News · Contact

### Highlights
- Warm "dawn / light of Christ" visual identity with full **dark mode**
- Animated hero slideshow, scroll reveals, animated counters, loading screen
- Signature **sunburst** brand motif throughout
- Leaders directory with live search + filter
- Events board with detail modal + a full (demo) registration flow that
  generates a sample QR code and registration ID
- Masonry photo gallery with lightbox (downloads disabled)
- Stylized interactive chapters map
- Floating daily Bible-verse widget
- Accessible: keyboard nav, focus states, `prefers-reduced-motion` respected
- SEO: metadata, sitemap, robots

## Tech Stack
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Framer Motion ·
lucide-react. Deploys to Vercel with zero config.

## Getting Started

```bash
npm install
npm run dev     # http://localhost:3000
```

```bash
npm run build   # production build
npm start       # serve the production build
```

## Verification

Each `prove:*` script is a standalone assertion suite that prints `N passed,
M failed` and exits non-zero on any failure.

```bash
npm run prove:content      # 89 assertions — the only suite that needs no database
npm run prove:rbac         # 24 — role policies
npm run prove:pages        #  22 — page CMS data layer
npm run prove:uploads      # 14 — image validation + storage ownership
npm run prove:behaviors    # 12 — registration/slot behaviour
npm run prove:concurrency  #      slot race conditions
npm run prove:editor       # 39 — the /admin/pages editing loop, in a real browser
```

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
  app/            App Router routes + layout, sitemap, robots
  components/
    layout/       navbar, footer, theme toggle, loading screen
    home/         home page sections
    shared/       reusable cards, sunburst, reveal, counters, forms
    about|leaders|events|chapters|gallery|news|contact/  page-specific
  data/           typed mock data (swap for Supabase in a later phase)
  lib/            utils + constants
```

## Notes
- Placeholder images come from `picsum.photos` and `i.pravatar.cc`.
- All forms (event registration, contact) are **preview-only** — they generate
  sample output but persist nothing. Real submission arrives with the backend
  phase.
