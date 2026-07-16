# Phase 3b (slice 1): Dynamic Site Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Provincial Youth Head (PYH) edit site identity, contact details, social URLs, footer text, and navigation labels/order/visibility from the admin panel, with no code change and no redeploy.

**Architecture:** Two new tables (`site_settings` singleton, `nav_items`) are read by a new loader `src/lib/data/site.ts` that mirrors the existing `getEvents()` pattern — service-role read with fallback to the current `src/lib/constants.ts` values. Five existing files take the loader's output as props. A PYH-only `/admin/settings` screen writes via a Zod-validated server action that audits and calls `revalidatePath("/", "layout")`.

**Tech Stack:** Next.js 15 (App Router, SSG), React 19, TypeScript, Tailwind, Supabase (Postgres + RLS), Zod.

**Spec:** `docs/superpowers/specs/2026-07-16-phase3b-site-settings-design.md`

## Global Constraints

- **Do NOT redesign the frontend.** No changes to layout, styling, animations, or routing. Copied verbatim from spec: "Do not redesign the frontend. Do not change the existing user interface unless required for the Admin Panel."
- **Do NOT modify working features** unless strictly necessary for this enhancement. No opportunistic refactoring, file restructuring, or renaming.
- **`src/lib/constants.ts` is NOT modified.** It remains the seed source, the fallback, and the default prop value for client components.
- **All 8 public pages must remain statically generated** (`○` in `next build` output). No route may become `ƒ`.
- **The public site must render identically** when settings hold their seeded values.
- **RLS is the enforcement point**, never the UI. Every guard is duplicated in the database.
- **This repo has no unit-test runner.** Verification is by proof scripts (`scripts/*.mjs`), `npm run build`, and runtime checks. Do NOT add Jest/Vitest — that is out of scope.
- **Migrations are immutable once applied.** Never edit an applied migration; add a new numbered file.
- Commit message trailer for every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Migration — tables, seed, RLS

**Files:**
- Create: `supabase/migrations/0013_site_settings.sql`

**Interfaces:**
- Consumes: `is_pyh(uuid)` SQL helper (from `0010_rls_rbac.sql`).
- Produces: tables `site_settings` (singleton, `id = 1`) and `nav_items` (`href` PK), both readable by `anon`, writable only by PYH.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0013_site_settings.sql`:

```sql
-- Phase 3b slice 1: dynamic site settings, footer, socials, navigation.
-- Seeded from src/lib/constants.ts so behaviour is identical on day one.

create table if not exists site_settings (
  id smallint primary key default 1,
  name text not null,
  full_name text not null,
  tagline text not null,
  description text not null,
  province text not null,
  email text not null,
  phone text not null,
  office text not null,
  facebook_url text,
  instagram_url text,
  footer_explore_heading text not null default 'Explore',
  footer_reach_heading text not null default 'Reach Us',
  footer_closing_line text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint site_settings_singleton check (id = 1)
);

create table if not exists nav_items (
  href text primary key,
  label text not null,
  sort_order int not null,
  visible boolean not null default true
);

-- Seed: values copied verbatim from src/lib/constants.ts (SITE).
insert into site_settings (
  id, name, full_name, tagline, description, province, email, phone, office,
  facebook_url, instagram_url, footer_closing_line
) values (
  1,
  'Zubida YFC',
  'Zubida Youth for Christ',
  'One Province. One Mission. One Christ.',
  'The official Youth for Christ community of Zamboanga del Sur — building Christ-centered leaders and empowering young people across the province.',
  'Zamboanga del Sur',
  'hello@zubidayfc.org',
  '+63 962 000 0000',
  'YFC Provincial Office, Pagadian City, Zamboanga del Sur',
  'https://facebook.com/zubidayfc',
  'https://instagram.com/zubidayfc',
  'Built for the youth of Zamboanga del Sur. Ad Majorem Dei Gloriam.'
) on conflict (id) do nothing;

-- Seed: values copied verbatim from src/lib/constants.ts (NAV_LINKS), order preserved.
insert into nav_items (href, label, sort_order, visible) values
  ('/',         'Home',     1, true),
  ('/about',    'About',    2, true),
  ('/leaders',  'Leaders',  3, true),
  ('/chapters', 'Chapters', 4, true),
  ('/events',   'Events',   5, true),
  ('/gallery',  'Gallery',  6, true),
  ('/news',     'News',     7, true),
  ('/contact',  'Contact',  8, true)
on conflict (href) do nothing;

alter table site_settings enable row level security;
alter table nav_items enable row level security;

-- Public read: the public site must render for anonymous visitors.
drop policy if exists site_settings_public_read on site_settings;
create policy site_settings_public_read on site_settings
  for select to anon, authenticated using (true);

drop policy if exists nav_items_public_read on nav_items;
create policy nav_items_public_read on nav_items
  for select to anon, authenticated using (true);

-- Writes: PYH only. Cluster heads have no write path.
drop policy if exists site_settings_pyh_write on site_settings;
create policy site_settings_pyh_write on site_settings
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

drop policy if exists nav_items_pyh_write on nav_items;
create policy nav_items_pyh_write on nav_items
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected output contains: `apply 0013_site_settings.sql ... ok` and `Migrations: 1 applied.`

- [ ] **Step 3: Verify seed + singleton constraint against the real DB**

Create a throwaway script at the scratchpad path (NOT in the repo) — or run via `node -e`. Use this exact check:

```bash
node -e "
import('dotenv').then(async (d) => {
  d.default.config({ path: '.env.local' });
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const s = await c.query('select name, tagline, footer_closing_line from site_settings');
  console.log('rows:', s.rowCount, '| name:', s.rows[0].name);
  const n = await c.query('select count(*)::int as n from nav_items where visible');
  console.log('nav visible:', n.rows[0].n);
  try {
    await c.query(\"insert into site_settings (id, name, full_name, tagline, description, province, email, phone, office, footer_closing_line) values (2,'x','x','x','x','x','x','x','x','x')\");
    console.log('SINGLETON: FAIL (second row inserted)');
  } catch (e) {
    console.log('SINGLETON: PASS (rejected:', e.message.slice(0, 40) + ')');
  }
  await c.end();
});
"
```

Expected: `rows: 1 | name: Zubida YFC`, `nav visible: 8`, `SINGLETON: PASS`.

If SINGLETON prints FAIL, the check constraint is missing — fix the migration in a NEW file `0014_*.sql` (never edit an applied migration) before continuing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_site_settings.sql
git commit -m "feat: site_settings + nav_items tables, seed, PYH-only RLS"
```

---

## Task 2: DB types, view types, and Zod schema

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (append; do not reorder existing exports)
- Create: `src/lib/validation/site.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SiteSettingsRow`, `NavItemRow` (DB row shapes) from `@/lib/supabase/database.types`
  - `siteSettingsSchema`, `SiteSettingsInput`, `navItemSchema`, `NavItemInput` from `@/lib/validation/site`

- [ ] **Step 1: Append row types**

Append to `src/lib/supabase/database.types.ts`:

```ts
export interface SiteSettingsRow {
  id: number;
  name: string;
  full_name: string;
  tagline: string;
  description: string;
  province: string;
  email: string;
  phone: string;
  office: string;
  facebook_url: string | null;
  instagram_url: string | null;
  footer_explore_heading: string;
  footer_reach_heading: string;
  footer_closing_line: string;
  updated_at: string;
  updated_by: string | null;
}

export interface NavItemRow {
  href: string;
  label: string;
  sort_order: number;
  visible: boolean;
}
```

- [ ] **Step 2: Write the Zod schema**

Create `src/lib/validation/site.ts`, following the conventions in `src/lib/validation/event.ts`:

```ts
import { z } from "zod";

// Socials are optional: a blank URL hides the icon rather than linking to undefined.
const optionalUrl = z.string().url().max(500).optional().or(z.literal(""));

export const siteSettingsSchema = z.object({
  name: z.string().min(1).max(80),
  full_name: z.string().min(1).max(160),
  tagline: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  province: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().min(1).max(60),
  office: z.string().min(1).max(300),
  facebook_url: optionalUrl,
  instagram_url: optionalUrl,
  footer_explore_heading: z.string().min(1).max(60),
  footer_reach_heading: z.string().min(1).max(60),
  footer_closing_line: z.string().min(1).max(300),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

// href is NOT accepted from the client for insert/delete — it identifies an
// existing seeded row only. Labels/order/visibility are the editable fields.
export const navItemSchema = z.object({
  href: z.string().min(1).max(120),
  label: z.string().min(1).max(60),
  sort_order: z.coerce.number().int().min(0).max(999),
  visible: z.coerce.boolean(),
});

export type NavItemInput = z.infer<typeof navItemSchema>;
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (Nothing consumes these yet; this only proves they compile.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/validation/site.ts
git commit -m "feat: site settings row types + Zod schema"
```

---

## Task 3: Loader with constants fallback

**Files:**
- Create: `src/lib/data/site.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server`; `SITE`, `NAV_LINKS` from `@/lib/constants`; `SiteSettingsRow`, `NavItemRow` from `@/lib/supabase/database.types`.
- Produces: `getSiteSettings(): Promise<SiteData>` and types `SiteData`, `SiteSettings`, `NavItem` from `@/lib/data/site`. **Tasks 4 and 5 depend on these exact names.**

- [ ] **Step 1: Write the loader**

Create `src/lib/data/site.ts`, mirroring `src/lib/data/events.ts`:

```ts
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { SITE, NAV_LINKS } from "@/lib/constants";
import type { SiteSettingsRow, NavItemRow } from "@/lib/supabase/database.types";

export type SiteSettings = {
  name: string;
  fullName: string;
  tagline: string;
  description: string;
  province: string;
  email: string;
  phone: string;
  office: string;
  socials: { facebook: string; instagram: string };
  footerExploreHeading: string;
  footerReachHeading: string;
  footerClosingLine: string;
};

export type NavItem = { href: string; label: string };

export type SiteData = { site: SiteSettings; navLinks: NavItem[] };

/** Fallback used whenever the DB is unreachable, empty, or errors. */
const FALLBACK: SiteData = {
  site: {
    name: SITE.name,
    fullName: SITE.fullName,
    tagline: SITE.tagline,
    description: SITE.description,
    province: SITE.province,
    email: SITE.email,
    phone: SITE.phone,
    office: SITE.office,
    socials: { facebook: SITE.socials.facebook, instagram: SITE.socials.instagram },
    footerExploreHeading: "Explore",
    footerReachHeading: "Reach Us",
    footerClosingLine: `Built for the youth of ${SITE.province}. Ad Majorem Dei Gloriam.`,
  },
  navLinks: NAV_LINKS.map((l) => ({ href: l.href, label: l.label })),
};

/**
 * Loads editable site settings + navigation from Supabase. Falls back to the
 * hardcoded constants if the database is unreachable or unseeded, so the public
 * site always renders. Mirrors getEvents().
 */
export async function getSiteSettings(): Promise<SiteData> {
  try {
    const db = createServiceClient();
    const [settingsRes, navRes] = await Promise.all([
      db.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("nav_items").select("*").eq("visible", true).order("sort_order", { ascending: true }),
    ]);

    const row = settingsRes.data as SiteSettingsRow | null;
    const navRows = (navRes.data as NavItemRow[] | null) ?? [];

    const site: SiteSettings = row
      ? {
          name: row.name,
          fullName: row.full_name,
          tagline: row.tagline,
          description: row.description,
          province: row.province,
          email: row.email,
          phone: row.phone,
          office: row.office,
          socials: { facebook: row.facebook_url ?? "", instagram: row.instagram_url ?? "" },
          footerExploreHeading: row.footer_explore_heading,
          footerReachHeading: row.footer_reach_heading,
          footerClosingLine: row.footer_closing_line,
        }
      : FALLBACK.site;

    // An empty nav table must not produce a site with no navigation.
    const navLinks = navRows.length > 0
      ? navRows.map((n) => ({ href: n.href, label: n.label }))
      : FALLBACK.navLinks;

    return { site, navLinks };
  } catch {
    return FALLBACK;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/site.ts
git commit -m "feat: getSiteSettings loader with constants fallback"
```

---

## Task 4: Wire the public site to the loader

**Files:**
- Modify: `src/app/layout.tsx` (static `metadata` export → `generateMetadata()`; pass props)
- Modify: `src/components/layout/navbar.tsx:1-30` (add optional props)
- Modify: `src/components/layout/footer.tsx` (props)
- Modify: `src/components/home/hero.tsx` (add `province` prop)
- Modify: `src/app/page.tsx` (pass `province` to `Hero`)
- Modify: `src/app/contact/page.tsx` (await loader)

**Interfaces:**
- Consumes: `getSiteSettings`, `SiteSettings`, `NavItem` from `@/lib/data/site` (Task 3).
- Produces: no new exports. `Navbar`, `Footer`, `Hero` gain optional props that default to today's constants.

**CRITICAL:** No JSX structure, `className`, or animation may change in this task. Only the *source* of the strings changes. If a diff shows a class name change, it is wrong.

- [ ] **Step 1: Navbar — accept props, default to constants**

In `src/components/layout/navbar.tsx`, keep the `NAV_LINKS, SITE` import (it is now the default value), and change only the component signature. Replace:

```tsx
export function Navbar() {
  const pathname = usePathname();
```

with:

```tsx
export function Navbar({
  site = SITE,
  navLinks = NAV_LINKS,
}: {
  site?: { name: string };
  navLinks?: { href: string; label: string }[];
} = {}) {
  const pathname = usePathname();
```

Then, inside the component body only, replace every `NAV_LINKS` usage with `navLinks` and every `SITE.` usage with `site.`. Do not touch any JSX attributes.

- [ ] **Step 2: Footer — accept props, default to constants**

In `src/components/layout/footer.tsx`, replace the signature:

```tsx
export function Footer() {
```

with:

```tsx
import type { SiteSettings, NavItem } from "@/lib/data/site";

const FOOTER_FALLBACK = {
  exploreHeading: "Explore",
  reachHeading: "Reach Us",
  closingLine: `Built for the youth of ${SITE.province}. Ad Majorem Dei Gloriam.`,
};

export function Footer({
  site,
  navLinks = NAV_LINKS,
}: {
  site?: SiteSettings;
  navLinks?: NavItem[];
} = {}) {
  const s = site;
  const name = s?.name ?? SITE.name;
  const fullName = s?.fullName ?? SITE.fullName;
  const description = s?.description ?? SITE.description;
  const tagline = s?.tagline ?? SITE.tagline;
  const province = s?.province ?? SITE.province;
  const office = s?.office ?? SITE.office;
  const email = s?.email ?? SITE.email;
  const phone = s?.phone ?? SITE.phone;
  const facebook = s?.socials.facebook ?? SITE.socials.facebook;
  const instagram = s?.socials.instagram ?? SITE.socials.instagram;
  const exploreHeading = s?.footerExploreHeading ?? FOOTER_FALLBACK.exploreHeading;
  const reachHeading = s?.footerReachHeading ?? FOOTER_FALLBACK.reachHeading;
  const closingLine = s?.footerClosingLine ?? FOOTER_FALLBACK.closingLine;
```

Then substitute in the existing JSX (structure unchanged):
- `{SITE.name}` → `{name}`
- `{SITE.description}` → `{description}`
- `“{SITE.tagline}”` → `“{tagline}”`
- `href={SITE.socials.facebook}` → `href={facebook}`
- `href={SITE.socials.instagram}` → `href={instagram}`
- `{SITE.office}` → `{office}`, `{SITE.email}` → `{email}` (both in the `mailto:` and the text), `{SITE.phone}` → `{phone}` (both in `tel:` and text)
- `Explore` heading text → `{exploreHeading}`
- `Reach Us` heading text → `{reachHeading}`
- `{NAV_LINKS.map(...)}` → `{navLinks.map(...)}`
- `<p>© {new Date().getFullYear()} {SITE.fullName}. All rights reserved.</p>` → `<p>© {new Date().getFullYear()} {fullName}. All rights reserved.</p>`
- `<p>Built for the youth of {SITE.province}. Ad Majorem Dei Gloriam.</p>` → `<p>{closingLine}</p>`

Wrap each social anchor so a blank URL hides the icon. Replace the `<div className="mt-6 flex gap-3">` block's two anchors with the same anchors guarded:

```tsx
{facebook && (
  <a href={facebook} aria-label="Facebook" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 transition-colors hover:bg-white/10">
    <Facebook className="h-5 w-5" />
  </a>
)}
{instagram && (
  <a href={instagram} aria-label="Instagram" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 transition-colors hover:bg-white/10">
    <Instagram className="h-5 w-5" />
  </a>
)}
```

`province` is referenced by `FOOTER_FALLBACK` only; if TypeScript reports it unused after substitution, delete the `const province` line.

- [ ] **Step 3: Layout — generateMetadata + pass props**

In `src/app/layout.tsx`, add the import:

```tsx
import { getSiteSettings } from "@/lib/data/site";
```

Replace the whole `export const metadata: Metadata = { ... };` block with:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getSiteSettings();
  return {
    metadataBase: new URL("https://zubidayfc.org"),
    title: {
      default: `${site.name} — ${site.tagline}`,
      template: `%s — ${site.name}`,
    },
    description: site.description,
    keywords: [
      "Youth for Christ",
      "YFC",
      "Zamboanga del Sur",
      "Zubida",
      "Catholic youth",
      "Philippines",
    ],
    openGraph: {
      title: `${site.name} — ${site.tagline}`,
      description: site.description,
      type: "website",
      locale: "en_PH",
    },
  };
}
```

Keep `export const viewport` exactly as it is. Then make the default export async and pass props. Change the component signature to `export default async function RootLayout({ children }: { children: React.ReactNode })`, add as its first line:

```tsx
const { site, navLinks } = await getSiteSettings();
```

and change the existing `<Navbar />` to `<Navbar site={site} navLinks={navLinks} />` and `<Footer />` to `<Footer site={site} navLinks={navLinks} />`. Leave every other element, wrapper, and class untouched.

- [ ] **Step 4: Hero + home page**

In `src/components/home/hero.tsx`, add a prop with a constants default. Change the signature to:

```tsx
export function Hero({ province = SITE.province }: { province?: string } = {}) {
```

and change `{SITE.province} · Youth for Christ` to `{province} · Youth for Christ`. Keep the `SITE` import (now the default).

In `src/app/page.tsx`, make the page async, add `import { getSiteSettings } from "@/lib/data/site";`, add `const { site } = await getSiteSettings();` as the first line of the component, and change `<Hero />` to `<Hero province={site.province} />`. Change nothing else.

- [ ] **Step 5: Contact page**

In `src/app/contact/page.tsx`, the module-scope array at lines 17-19 uses `SITE` at import time and must move inside the component. Add `import { getSiteSettings } from "@/lib/data/site";`, make the default export async, and as its first lines add:

```tsx
const { site } = await getSiteSettings();
const details = [
  { icon: MapPin, label: "Province Office", value: site.office },
  { icon: Mail, label: "Email", value: site.email, href: `mailto:${site.email}` },
  { icon: Phone, label: "Phone", value: site.phone, href: `tel:${site.phone}` },
];
```

Delete the old module-scope `details` array (lines 17-19 and its surrounding `const details = [...]`). Replace `href={SITE.socials.facebook}` → `href={site.socials.facebook}` and `href={SITE.socials.instagram}` → `href={site.socials.instagram}`. If `SITE` becomes unused, remove the import; otherwise keep it.

- [ ] **Step 6: Build and prove all public pages are still static**

Run: `npm run build`
Expected: `✓ Compiled successfully`, and in the route table these 8 rows are `○` (Static), NOT `ƒ`:
`/`, `/about`, `/chapters`, `/contact`, `/gallery`, `/leaders`, `/news`, `/registration-status`

If any turned `ƒ`, STOP — a dynamic API leaked in. Do not proceed; report it.

- [ ] **Step 7: Prove the site renders identical content from the DB**

Run `npm run dev`, then:

```bash
curl -s http://localhost:3000/ | grep -c "One Province. One Mission. One Christ."
curl -s http://localhost:3000/ | grep -c "Ad Majorem Dei Gloriam"
curl -s http://localhost:3000/contact | grep -c "hello@zubidayfc.org"
```

Expected: each prints a count of 1 or more (values now come from the DB but are identical to the constants).

- [ ] **Step 8: Prove the constants fallback works**

In `.env.local`, temporarily change `NEXT_PUBLIC_SUPABASE_URL` to `https://unreachable.invalid`. Restart `npm run dev` and run:

```bash
curl -s http://localhost:3000/ | grep -c "One Province. One Mission. One Christ."
```

Expected: still 1 or more — the loader fell back to the constants instead of rendering a blank footer.

**Then restore `.env.local` to the real URL and restart dev.** Verify: `git diff .env.local` shows nothing (the file is gitignored; confirm the value is back by re-running the Step 7 curls).

- [ ] **Step 9: Commit**

```bash
git add src/app/layout.tsx src/components/layout/navbar.tsx src/components/layout/footer.tsx src/components/home/hero.tsx src/app/page.tsx src/app/contact/page.tsx
git commit -m "feat: render site identity, footer, nav from DB with constants fallback"
```

---

## Task 5: PYH-only admin settings screen

**Files:**
- Create: `src/app/admin/settings/page.tsx`
- Create: `src/app/admin/settings/actions.ts`
- Create: `src/app/admin/settings/_components/settings-form.tsx`
- Modify: `src/app/admin/_components/admin-shell.tsx:6-13` (add the `settings` tab)

**Interfaces:**
- Consumes: `requirePYH`, `createServerSupabase` from `@/lib/supabase/admin-auth`; `createServiceClient` from `@/lib/supabase/server`; `siteSettingsSchema` from `@/lib/validation/site`; `AdminShell`; `SiteSettingsRow`, `NavItemRow`.
- Produces: server actions `updateSiteSettings(formData)` and `updateNavItems(formData)`.

- [ ] **Step 1: Add the Settings tab**

In `src/app/admin/_components/admin-shell.tsx`, change the `Tab` type and `baseTabs`:

```tsx
type Tab = "registrations" | "events" | "users" | "logs" | "settings";

const baseTabs: { key: Tab; href: string; label: string; pyhOnly?: boolean }[] = [
  { key: "registrations", href: "/admin", label: "Registrations" },
  { key: "events", href: "/admin/events", label: "Events" },
  { key: "users", href: "/admin/users", label: "Users", pyhOnly: true },
  { key: "logs", href: "/admin/logs", label: "Logs", pyhOnly: true },
  { key: "settings", href: "/admin/settings", label: "Settings", pyhOnly: true },
];
```

Change nothing else — the existing `pyhOnly` filter already hides it from cluster heads.

- [ ] **Step 2: Write the server actions**

Create `src/app/admin/settings/actions.ts`, following `src/app/admin/events/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, requirePYH } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { siteSettingsSchema } from "@/lib/validation/site";

async function audit(userId: string, action: string) {
  try {
    await createServiceClient()
      .from("audit_log")
      .insert({ actor_user_id: userId, action, entity: "site_settings", entity_id: "1" });
  } catch {
    // audit is best-effort; never block the save on logging failure
  }
}

export async function updateSiteSettings(formData: FormData) {
  const ctx = await requirePYH();
  const raw = Object.fromEntries(formData.entries());
  const parsed = siteSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid settings");
  const input = parsed.data;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("site_settings")
    .update({
      name: input.name,
      full_name: input.full_name,
      tagline: input.tagline,
      description: input.description,
      province: input.province,
      email: input.email,
      phone: input.phone,
      office: input.office,
      facebook_url: input.facebook_url || null,
      instagram_url: input.instagram_url || null,
      footer_explore_heading: input.footer_explore_heading,
      footer_reach_heading: input.footer_reach_heading,
      footer_closing_line: input.footer_closing_line,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", 1)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");

  await audit(ctx.userId, "settings.update");
  // Footer + navbar render on every page, so the whole layout must regenerate.
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}

export async function updateNavItems(formData: FormData) {
  const ctx = await requirePYH();
  // hrefs come from the rendered form, which is seeded from the DB — never
  // from free text. Insert/delete are not exposed.
  const hrefs = formData.getAll("href").map(String);
  const supabase = await createServerSupabase();

  for (const href of hrefs) {
    const label = String(formData.get(`label:${href}`) ?? "").trim();
    if (label.length === 0 || label.length > 60) throw new Error(`Invalid label for ${href}`);
    // Order comes from the number the admin typed — it is what they see on screen.
    const order = Number(formData.get(`order:${href}`));
    if (!Number.isInteger(order) || order < 1 || order > 999) throw new Error(`Invalid order for ${href}`);
    const visible = formData.get(`visible:${href}`) === "on";
    const { error } = await supabase
      .from("nav_items")
      .update({ label, visible, sort_order: order })
      .eq("href", href);
    if (error) throw new Error(error.message);
  }

  await audit(ctx.userId, "nav.update");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}
```

- [ ] **Step 3: Write the form component**

Create `src/app/admin/settings/_components/settings-form.tsx`, reusing the exact field/label classes from `src/app/admin/events/_components/event-form.tsx`:

```tsx
"use client";
import { Button } from "@/components/ui/button";
import type { SiteSettingsRow, NavItemRow } from "@/lib/supabase/database.types";

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";
const heading = "font-display text-xl font-semibold";

export function SettingsForm({
  settings,
  navItems,
  saveSettings,
  saveNav,
}: {
  settings: SiteSettingsRow;
  navItems: NavItemRow[];
  saveSettings: (formData: FormData) => void;
  saveNav: (formData: FormData) => void;
}) {
  return (
    <div className="grid gap-8">
      <form action={saveSettings} className="glass grid max-w-2xl gap-4 rounded-2xl p-6">
        <h2 className={heading}>Identity</h2>
        <label className="block"><span className={label}>Site name</span>
          <input name="name" required defaultValue={settings.name} className={field} /></label>
        <label className="block"><span className={label}>Full name</span>
          <input name="full_name" required defaultValue={settings.full_name} className={field} /></label>
        <label className="block"><span className={label}>Tagline</span>
          <input name="tagline" required defaultValue={settings.tagline} className={field} /></label>
        <label className="block"><span className={label}>Description</span>
          <textarea name="description" rows={3} required defaultValue={settings.description} className={field} /></label>
        <label className="block"><span className={label}>Province</span>
          <input name="province" required defaultValue={settings.province} className={field} /></label>

        <h2 className={heading}>Contact</h2>
        <label className="block"><span className={label}>Email</span>
          <input type="email" name="email" required defaultValue={settings.email} className={field} /></label>
        <label className="block"><span className={label}>Phone</span>
          <input name="phone" required defaultValue={settings.phone} className={field} /></label>
        <label className="block"><span className={label}>Office address</span>
          <input name="office" required defaultValue={settings.office} className={field} /></label>

        <h2 className={heading}>Socials</h2>
        <p className="text-xs text-muted">Leave blank to hide the icon.</p>
        <label className="block"><span className={label}>Facebook URL</span>
          <input name="facebook_url" defaultValue={settings.facebook_url ?? ""} className={field} /></label>
        <label className="block"><span className={label}>Instagram URL</span>
          <input name="instagram_url" defaultValue={settings.instagram_url ?? ""} className={field} /></label>

        <h2 className={heading}>Footer</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block"><span className={label}>Explore heading</span>
            <input name="footer_explore_heading" required defaultValue={settings.footer_explore_heading} className={field} /></label>
          <label className="block"><span className={label}>Reach Us heading</span>
            <input name="footer_reach_heading" required defaultValue={settings.footer_reach_heading} className={field} /></label>
        </div>
        <label className="block"><span className={label}>Closing line</span>
          <input name="footer_closing_line" required defaultValue={settings.footer_closing_line} className={field} /></label>

        <div><Button type="submit">Save settings</Button></div>
      </form>

      <form action={saveNav} className="glass grid max-w-2xl gap-4 rounded-2xl p-6">
        <h2 className={heading}>Navigation</h2>
        <p className="text-xs text-muted">
          Rename, reorder (lower number appears first), or hide menu items. Links are fixed to existing pages.
        </p>
        {navItems.map((n) => (
          <div key={n.href} className="grid grid-cols-[1fr_5rem_4rem] items-end gap-3">
            <input type="hidden" name="href" value={n.href} />
            <label className="block">
              <span className={label}>{n.href}</span>
              <input name={`label:${n.href}`} required defaultValue={n.label} className={field} />
            </label>
            <label className="block">
              <span className={label}>Order</span>
              <input type="number" name={`order:${n.href}`} min={1} defaultValue={n.sort_order} className={field} />
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" name={`visible:${n.href}`} defaultChecked={n.visible} />
              <span className={label}>Show</span>
            </label>
          </div>
        ))}
        <div><Button type="submit">Save navigation</Button></div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/admin/settings/page.tsx`:

```tsx
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { SettingsForm } from "./_components/settings-form";
import { updateSiteSettings, updateNavItems } from "./actions";
import type { SiteSettingsRow, NavItemRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Site Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const [{ data: settings }, { data: nav }] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("nav_items").select("*").order("sort_order", { ascending: true }),
  ]);

  if (!settings) {
    return (
      <AdminShell ctx={ctx} active="settings" title="Site Settings">
        <p className="glass rounded-2xl p-10 text-center text-muted">
          Settings row missing — run <code>npm run db:migrate</code>.
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell ctx={ctx} active="settings" title="Site Settings">
      <SettingsForm
        settings={settings as SiteSettingsRow}
        navItems={(nav as NavItemRow[] | null) ?? []}
        saveSettings={updateSiteSettings}
        saveNav={updateNavItems}
      />
    </AdminShell>
  );
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`; `/admin/settings` appears in the route table as `ƒ`; the 8 public pages are still `○`.

- [ ] **Step 6: Runtime check as PYH**

With `npm run dev`, sign in as a PYH admin, open `/admin/settings`, change the tagline to `TEST TAGLINE 123`, save. Then:

```bash
curl -s http://localhost:3000/ | grep -c "TEST TAGLINE 123"
```

Expected: 1 or more — the public page picked up the change with no rebuild. **Change the tagline back to `One Province. One Mission. One Christ.` afterwards.**

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/settings src/app/admin/_components/admin-shell.tsx
git commit -m "feat: PYH-only site settings admin screen with revalidation"
```

---

## Task 6: Prove cluster heads cannot write settings (8 → 10 assertions)

**Files:**
- Modify: `scripts/prove-rbac.mjs:86-99` (add assertions before the cleanup block; extend cleanup)

**Interfaces:**
- Consumes: the existing `ch` authed client, `admin` service client, and `check()` helper already defined in the script.
- Produces: 10 passing assertions.

- [ ] **Step 1: Add the two assertions**

In `scripts/prove-rbac.mjs`, insert immediately **after** assertion 8 (the `audit_log` check) and **before** the `// cleanup` comment:

```js
  // 9. CH CANNOT write site_settings (PYH-only global content). The row exists
  // (seeded by migration 0013), so only RLS can make this update affect 0 rows.
  const updSettings = await ch.from("site_settings").update({ tagline: "hacked by CH" }).eq("id", 1).select("id");
  check("CH CANNOT write site_settings", (updSettings.data?.length ?? 0) === 0, updSettings.error?.message ?? updSettings.data);

  // 10. CH CANNOT write nav_items.
  const updNav = await ch.from("nav_items").update({ label: "hacked" }).eq("href", "/about").select("href");
  check("CH CANNOT write nav_items", (updNav.data?.length ?? 0) === 0, updNav.error?.message ?? updNav.data);
```

- [ ] **Step 2: Add a guard that the writes really did not land**

Immediately after the two assertions above, add a service-role read-back. This is what stops a false pass if RLS silently allowed the write but returned no rows:

```js
  const { data: settingsAfter } = await admin.from("site_settings").select("tagline").eq("id", 1).single();
  check("site_settings tagline unchanged after CH attempt", settingsAfter.tagline !== "hacked by CH", settingsAfter.tagline);
  const { data: navAfter } = await admin.from("nav_items").select("label").eq("href", "/about").single();
  check("nav_items label unchanged after CH attempt", navAfter.label !== "hacked", navAfter.label);
```

This makes the total 12 assertions, not 10 — the spec's "10" counted only the two denials. 12 is correct and strictly stronger; do not remove the read-backs to hit the number.

- [ ] **Step 3: Run the proof**

Run: `npm run prove:rbac`
Expected: `12 passed, 0 failed`. All 8 original assertions must still pass.

If either read-back FAILS, RLS is broken and a cluster head really can edit global site content. STOP and report — do not "fix" the test.

- [ ] **Step 4: Regression gate**

Run: `npm run prove:behaviors`
Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/prove-rbac.mjs
git commit -m "test: prove cluster heads cannot write site_settings or nav_items"
```

---

## Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. Confirm in the route table:
- `/`, `/about`, `/chapters`, `/contact`, `/gallery`, `/leaders`, `/news`, `/registration-status` are `○` (Static)
- `/admin/settings` is present and `ƒ`

- [ ] **Step 2: All proofs**

Run: `npm run prove:rbac` → `12 passed, 0 failed`
Run: `npm run prove:behaviors` → `6 passed, 0 failed`

- [ ] **Step 3: Public site unchanged**

With settings at seeded values, run `npm run dev` and load `/`, `/contact`, `/events`. Confirm visually: footer, navbar, hero, and contact details are identical to before this slice. No layout shift, no missing icons.

- [ ] **Step 4: Cluster-head lockout**

Sign in as a cluster head. Confirm: no "Settings" tab appears, and navigating directly to `/admin/settings` redirects to `/admin?error=forbidden`.

- [ ] **Step 5: Report**

Report honestly which checks ran and which did not. If any runtime check was skipped for lack of credentials, say so — do not claim it passed.

---

## Self-Review Notes (coverage against spec)

- Tables, singleton constraint, seed → Task 1. Column list matches spec §1 exactly.
- Public read + PYH-only write RLS → Task 1; proven in Task 6.
- `nav_items` fixed href set, no insert/delete exposed → Tasks 1, 5.
- `footer_closing_line` literal text, no `{province}` token → Task 1 seed (province resolved once).
- Loader mirroring `getEvents()` with constants fallback → Task 3; fallback proven in Task 4 Step 8.
- Empty-nav fallback (spec §2 "empty nav set") → Task 3 (`navRows.length > 0` guard).
- `constants.ts` unmodified → enforced by Global Constraints; it is not in any task's Files list.
- Five component edits (§3) → Task 4. `sitemap.ts` deliberately untouched — it is in no task's file list, per spec §3.
- Pages stay static → Task 4 Step 6, Task 7 Step 1.
- Admin UI reusing `AdminShell` + event-form patterns → Task 5.
- `requirePYH()` on page and in action → Task 5.
- Audit writes (`settings.update`, `nav.update`) best-effort → Task 5.
- `revalidatePath("/", "layout")` → Task 5.
- Blank social URL hides icon → Task 4 Step 2 (render guard) + Task 2 (schema allows empty).
- Validation failure writes nothing → Task 5 (parse before update).
- Verification §1–§5 → Tasks 4, 6, 7.
- **Deviation from spec:** spec §Verification says `prove:rbac` goes 8 → 10; the plan lands on **12** because each denial gets a service-role read-back to prevent a false pass. Strictly stronger; noted in Task 6 Step 2.
