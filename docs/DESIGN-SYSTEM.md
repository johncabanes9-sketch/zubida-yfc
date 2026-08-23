# Zubida YFC — Design System

How this site is put together, and the rules a change has to keep. Every number
here was measured against the real thing, not chosen by eye; where a value looks
arbitrary, the reason it is that value is given.

The identity is **"dawn / light of Christ"** — warm, bright, unmistakably a youth
community rather than a corporate dashboard. Blue carries authority, gold carries
warmth, and the sunburst is the one motif that repeats.

---

## 1. Colour

### The brand ramps

| Token | Value | Used for |
|---|---|---|
| `midnight` | `#12224E` | Ink, dark grounds, the public page header band |
| `royal` | `#1E40AF` | Primary action, links, active state, single-series charts |
| `gold` | `#F5B942` | Accent, focus ring in dark mode, the sunburst |
| `cream` | `#FBF8F1` | Page ground in light mode |

### The rung that does not exist

**Gold cannot be text on a light ground.** Measured against cream `#FBF8F1`:

| | Ratio | Verdict |
|---|---|---|
| `gold-500` `#F5B942` | **1.66:1** | fails badly |
| `gold-600` `#E09E1F` | **2.18:1** | fails |
| `gold-700` `#8A5A06` | **5.58:1** | passes AA |

`gold-700` exists solely so gold-coloured text has a legal rung on light
surfaces. It also clears AA on the gold-tinted icon chips (5.19:1) and on a
white card (5.92:1). Dark mode is unaffected — `gold-400` on midnight measures
12.30:1.

> If you are about to write `text-gold-500` or `text-gold-600` on anything
> light, you want `text-gold-700 dark:text-gold-400`.

### Semantic ramps

`success` / `warn` / `danger`, each with `50` (badge fill), `300` (dark-mode
text), `500` (solid), `700` (light-mode text). Every `-700` was measured at or
above 4.5:1 on **both** cream and white; every `-300` at or above 4.5:1 on
`midnight-950`.

`neutral` is a cool ramp hue-matched to `midnight`, so admin chrome sits in the
brand family instead of reading as a foreign grey.

### Surfaces

The public site uses translucent `.glass`. Admin chrome uses opaque `.surface`.
That is not a style preference: admin screens are dense and long-lived, and
translucency over a gradient makes measured text contrast unpredictable.

```
--surface  --surface-2  --surface-3   grounds
--rule  --rule-strong                 borders
--ring                                focus ring — royal on light, gold on dark
```

The focus ring follows `--ring` rather than being hard-coded to gold, which was
near-invisible on cream.

---

## 2. Typography

| Role | Family | Where |
|---|---|---|
| Display | **Fraunces** (`font-display`) | Headings, stat figures, card titles |
| Body | **Plus Jakarta Sans** (`font-sans`) | Everything else |

Two families, no more. Numbers that update in place — stat values, capacity
counts, percentages — carry `tabular-nums` so they do not jitter.

Labels above form fields and stat cards are `text-xs font-semibold uppercase
tracking-wide text-muted`. That combination is the site's "label" voice; it is
defined once in `Field` and should not be re-typed.

---

## 3. Components

Everything reusable lives in `src/components/ui/`. Before adding a component,
check whether one of these already does it.

| Component | Notes |
|---|---|
| `Field` / `Input` / `Select` / `Textarea` | Wraps the control in the `<label>`, so association needs no `id`. Hint and error text are announced with the field for free. |
| `DataTable` | One column definition, two renderings: a real `<table>` from `sm` up, stacked cards below. Sorting is *controlled* by the caller, which keeps it hook-free and usable from a server component. |
| `Card` / `CardHeader` / `CardBody` | Opaque admin surface. |
| `StatCard` | `value` is `number \| null` on purpose — see §8. |
| `Badge` + `toneForStatus` | Status pills. Never invent a colour at the call site. |
| `EmptyState` | Every list and table gets one. |
| `Breadcrumbs` | `tone="onDark"` for the public page header band. |
| `Button` | `primary`, `gold`, `outline`, `ghost`, `subtle`, `danger`. |

`Button`'s `xs` size is **below the 44px touch target** and is for in-row table
actions only. It is safe there because `DataTable`'s stacked card layout gives
those same actions their own full-width row on small screens.

### The rule this system exists to enforce

The `field` and `label` class strings were once copy-pasted into **ten**
components and had already drifted into three paddings and two focus
treatments. That drift was the defect. If you find yourself writing a class
string that another component already has, import it instead.

Two forms (`chapter-form`, `leader-form`) and the page editor consume the
exported `fieldClass` / `labelClass` rather than the components, because
`prove:editor` asserts against their hand-written markup. That is deliberate:
the drift is gone either way.

---

## 4. Layout and responsiveness

- Breakpoints are Tailwind's defaults. `sm` (640px) is where tables become
  tables; `lg` (1024px) is where the admin sidebar appears.
- **No page may scroll horizontally.** Wide content scrolls inside its own
  container, or restructures. `prove:a11y` renders every public page at 390px.
- Admin navigation: sidebar at `lg` and up, drawer below.

The drawer mounts its links **only while open**, rather than sliding them
off-canvas. Off-canvas links stay focusable and stay in the accessibility tree,
so a keyboard user tabs into a menu they cannot see. It also keeps the link
count honest for `prove:editor`.

---

## 5. Data visualisation

No chart library. Three charts do not justify the dependency, and the marks are
HTML rather than SVG — at this size they stay responsive without viewBox
arithmetic and labels keep their true type size.

### The segment order is load-bearing

In the status breakdown, **amber sits between green and red**. Green beside red
is the worst possible adjacent pair for deuteranopia. Reordering the segments
"logically" (pending first) was measured to drop adjacent-pair separation from
ΔE **10.6** to **5.2**. `prove:metrics` asserts the order so a later tidy-up
cannot quietly undo it.

### Chart colours

Searched for, then validated against this app's real surfaces:

| Mode | Result |
|---|---|
| Light (on `#FFFFFF`) | CVD 10.6 protan / 15.9 tritan · normal-vision 19.8 · all ≥ 3:1 |
| Dark (on `#0C1636`) | CVD 8.6 deutan / 10.9 tritan · normal-vision 15.1 · all ≥ 3:1 |

Dark is **re-derived, not flipped**: its lightness band is mid-tone
(L 0.48–0.67), not the pastel a naive inversion produces.

`--chart-cancelled` deliberately reads grey — a cancelled registration should
recede — and therefore ships with a written label and a count, never colour
alone.

### Rules

- One series → no legend; the heading names it.
- Two or more → a legend is always present, and identity never travels on hue
  alone.
- Status colours are reserved. Never reuse them as "series 4".

---

## 6. Event pages

- **Countdown** (`components/events/countdown.tsx`) computes nothing during
  server render. A countdown derived from server time would not match what the
  browser computes a moment later, and React would report a hydration mismatch
  on every card. First paint is a stable placeholder. It ticks once a *minute* —
  this counts days to an event, and a seconds hand wakes the main thread sixty
  times more often than the number changes.
- **Capacity** is a fill bar with a written remainder ("3 left", "Full"). The
  tone change at 90% is the redundant channel, never the only one.
- Slot counts come from `LiveSlots`, which subscribes to the event row via
  Supabase Realtime.

---

## 7. Forms

Group long forms. Seventeen fields in one flat block is what made the
registration form feel endless; three named groups plus a progress indicator is
most of the fix.

- Required fields carry a visible marker **and** `(required)` for screen
  readers.
- Validation uses `:user-invalid`, **not** `:invalid`. An untouched empty
  required field is already `:invalid`, so styling that would paint the form red
  before anyone typed.
- Progress counts required controls off the live DOM rather than mirroring every
  field into state — seventeen controlled inputs to display one number is a
  re-render per keystroke.

### The bug this section exists to prevent

A checkbox with no `name` is omitted from `FormData` entirely. `fd.get(...)`
then returns `null`, the payload silently carries a wrong value, and **nothing
fails loudly** — the read succeeded, it just returned nothing.

That is exactly how the consent checkbox shipped: unnamed, so every registration
sent `consent: false`, which the schema rejects. The public registration form
could not be submitted at all.

`prove:content` now asserts that every key the payload reads via `fd.get()` has
a matching named control.

---

## 8. Never show a wrong number

The dashboard counts rows with head-only queries that can fail independently of
the page. A failed count must read **"Unavailable"**, never silently as `0`.
`StatCard`'s `value` is typed `number | null` specifically so a caller cannot
default that away.

The same rule applies to charts: `TrendBars` takes `data | null`, because a
failed read and a genuinely quiet month are not the same fact and must not
render the same words.

And `bucketByDay` keys on **local** time, not `toISOString()`. In Zamboanga
(UTC+8) a small-hours registration is the previous day in UTC and would land in
the wrong bar — or off the chart entirely.

This is the same instinct as the repo's content rule: **withhold rather than
invent.**

---

## 9. Motion

Framer Motion for entrance and layout transitions; CSS for hover and state.

- Animate `transform` and `opacity`. Avoid animating layout properties.
- `prefers-reduced-motion` is honoured globally in `globals.css` — every
  animation and transition collapses to ~0ms. Do not defeat it with inline
  styles.
- Motion should clarify (a section arriving, a bar filling), never decorate for
  its own sake.

---

## 10. Accessibility floor

Enforced by `npm run prove:a11y` — 64 assertions across the eight public pages,
in a real browser, at a 390px viewport.

- Exactly one `<main>` and one `<h1>` per page. The root layout already provides
  `<main>`; never add a second.
- No heading level is skipped. Card components sit at `h3` because a
  `SectionHeading` supplies the `h2` above them — listing pages that reuse those
  cards without one add a visually-hidden `h2` rather than forking the card.
- Every image has an `alt`; every link and button has an accessible name.
- Every target clears **24×24 CSS px** (WCAG 2.2 SC 2.5.8).
- The first Tab stop shows a visible focus ring.

Colour contrast is not automated. Measure it when you introduce a colour.

---

## 11. Maintainability

**Verification is the deliverable, not a chore.** Each `prove:*` script is a
standalone assertion suite that prints `N passed, M failed`.

| Suite | Needs a database? | In CI? |
|---|---|---|
| `prove:content` | no | yes |
| `prove:metrics` | no | yes |
| `prove:a11y` | no (browser + dev server) | no |
| `prove:editor` | yes (browser, mutates data) | no |
| `prove:rbac` `pages` `uploads` `behaviors` `chapters` `leaders` | yes | no |

Three habits worth keeping:

1. **Mutation-test a new assertion.** Break the thing on purpose and confirm the
   suite fails. An assertion that has never failed has never been shown to work.
2. **A missing match is not evidence.** A regex that finds nothing must fail
   loudly, not satisfy a negative check. Renaming `<input>` to `<Input>` once
   made two settings assertions pass against an empty string.
3. **Static checks do not reach runtime.** `tsc`, `lint` and `next build` were
   all clean while every admin route threw *"Functions cannot be passed directly
   to Client Components"* — a React component is a function, and it cannot cross
   the server/client boundary as a prop. Only a browser on an authenticated
   route found it.

### The content rule still governs

**Never invent organizational information.** Mission, vision, history and
achievements have CMS section types (`values-grid`, `timeline`, `feature-cards`,
`text-image`) that render nothing until an administrator fills them in. A blank
phone number renders as no phone row at all, not as a stand-in.

---

## What this system does not cover

There is no member directory, attendance tracking, household assignment, or
member-growth analytics — no tables back them. Any dashboard widget claiming to
show those would be showing invented data.
