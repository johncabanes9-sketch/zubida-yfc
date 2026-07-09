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
