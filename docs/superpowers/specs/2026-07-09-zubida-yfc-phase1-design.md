# Zubida YFC — Phase 1 Design Spec (Public Showcase Site)

**Date:** 2026-07-09
**Status:** Approved
**Tagline:** "One Province. One Mission. One Christ."

## Context & Scope Decision

The original request describes a full production SaaS platform (~15 independent
subsystems: marketing site, concurrent event-registration engine, member portal,
admin dashboard, QR attendance, real-time layer, payments/merch/donations, AI
chatbot, gamification, etc.). That is far too large for a single spec/plan/build
cycle, so it is being decomposed into phases. **Each later subsystem gets its own
spec → plan → build cycle.**

**Phase 1 (this spec)** = an impressive, deployable **public showcase website**
with realistic mock data. No backend, auth, or real registration yet. This is the
fastest path to something shareable and it establishes the design system and
component architecture the later phases plug into.

### Decisions locked during brainstorming
- **Outcome:** Impressive public site first (frontend showcase, mock data).
- **Page scope:** Full public site — 8 pages.
- **Visual tone:** Warm & radiant (royal blue + white + gold/yellow, warm
  gradients, glow, uplifting) with full dark mode.

## Tech Stack (Phase 1)
- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion (animation)
- shadcn/ui primitives + lucide-react icons
- Deploy target: Vercel (SSG where possible)

## Architecture Principle
100% frontend this phase. All content comes from **typed mock-data modules** in
`src/data/`. Components consume typed data, not a live source, so swapping in
Supabase later is a data-source replacement — components are untouched.

```
src/
  app/            → routes: / about /leaders /chapters /events /gallery /news /contact
  components/
    layout/       → Navbar, Footer, ThemeToggle, MobileMenu, LoadingScreen
    ui/           → shadcn primitives (button, card, badge, input, accordion…)
    home/         → Hero, StatsCounter, EventsPreview, Testimonials, VerseBanner…
    shared/       → SectionHeading, AnimatedCounter, LeaderCard, EventCard…
  data/           → leaders, events, chapters, news, gallery, testimonials, stats, verses
  lib/            → utils, constants, theme
```

## Design System (Warm & Radiant)
- **Palette:** primary royal blue `#1E40AF`; accent gold `#F5B942`; warm yellow
  glow; white base. Full **dark mode** = deep blue-black base + glowing gold.
- Blue→gold gradients on hero and CTAs.
- Glassmorphism cards, `rounded-2xl`, soft shadows.
- Elegant serif display headings + clean sans body.
- **Motion:** loading screen, scroll-reveal, animated stat counters, page
  transitions, floating Bible-verse element, hover lifts. Must respect
  `prefers-reduced-motion`.
- Accessible: semantic HTML, keyboard nav, focus states, sufficient contrast,
  alt text.

## Pages
1. **Home** — full-screen hero (image slideshow — bg video deferred, needs real
   assets), CTAs (Join Us / Upcoming Events / Learn More), About teaser, Latest
   News, Upcoming Events, Featured Photos, Testimonials, animated Stats
   (chapters / members / provincial events / leaders), Bible-verse banner, footer.
2. **About** — Who We Are, Mission, Vision, Core Values, animated history timeline.
3. **Leaders** — card grid; client-side **search + filter by chapter/category**.
   Categories: Provincial Coordinator, Provincial Couple Coordinators, Area Heads,
   Chapter Heads, Core Group Leaders. Card: photo, name, position, chapter, short
   message, optional socials.
4. **Chapters** — municipality grid of Zamboanga del Sur; each shows chapter name,
   coordinator, meeting schedule, member count, upcoming activities. **Stylized
   illustrated map** (live Google Map deferred — needs API key + geo data).
5. **Events** — filterable cards (Upcoming / Past; Provincial / Chapter) with
   status badges (Open / Closed / Finished); detail modal; "Register" opens a
   **fully designed form** that returns a friendly "demo — registration opens
   soon" confirmation on submit (no persistence this phase). Share button.
6. **Gallery** — masonry grid + lightbox; category filter (Youth Camp, Provincial
   Conference, ICON, Household, CLS, Sports Fest, Mission Activities);
   right-click/download disabled.
7. **News** — article/announcement cards; search; category filter.
8. **Contact** — validated form (demo submit), FAQ accordion, socials, province
   office info, static map image placeholder.

## Explicitly Deferred to Later Phases
Supabase + PostgreSQL schema, auth/RBAC, real event registration (transactions,
row-locking, no-double-booking, 1,000+ concurrent), QR generation, Resend email,
member portal, digital IDs, certificates, admin dashboard + analytics, QR
attendance scanner, payments/donations/merch, AI chatbot, push notifications,
prayer wall persistence, gamification (points/badges/leaderboards), Saint of the
Day, live Google Map, PWA. Phase 1 UI is built so these slot in cleanly.

## Success Criteria (Phase 1)
- `next build` passes with no type errors.
- Dev server runs; all 8 routes render.
- Fully responsive (mobile-first) and keyboard-accessible.
- Dark/light mode works site-wide.
- Animations respect `prefers-reduced-motion`.
- Deployable to Vercel with zero extra config.
