# Dynamic Page CMS (Slice 3.1 — engine + About) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the About page's content fully editable from the Admin Dashboard through a reusable section-registry engine, rendering byte-identical to today on day one.

**Architecture:** Pages are rows in `pages`; content is an ordered list of typed rows in `page_sections`. A registry maps each section `type` to (a) the React component that renders it and (b) a Zod schema + editor-field spec. Public pages load sections via `getPage(slug)` and render them with `<SectionRenderer>`; a hardcoded fallback keeps the site rendering if the DB is empty/unreachable. PYH-only server actions edit/reorder/hide/add/delete sections and edit SEO, calling `revalidatePath` for instant updates.

**Tech Stack:** Next.js 15.1.6 (App Router, RSC, server actions), React 19, TypeScript (strict), Zod, Supabase (Postgres + RLS + Storage `media` bucket), Tailwind, framer-motion. Node proof scripts (`scripts/prove-*.mjs`) are the test harness — there is no JSX unit-test framework, so React components are verified by `tsc` + `lint` + `build` + a byte-identical review diff.

## Global Constraints

- **No design change.** Public component markup, Tailwind classes, and framer-motion animations must be byte-identical to the pre-change render. Section components are mechanical extractions of the existing inline JSX; do not restyle.
- **Next 15.1.6 / React 19 / TypeScript strict.** No new runtime dependencies (Zod, Supabase, lucide-react, framer-motion already present).
- **Permissions: PYH only.** Every mutation is gated by `requirePYH()` (from `@/lib/supabase/admin-auth`) with `loadAdminContext()` semantics; RLS policies `*_pyh_write` are the backstop, mirroring migration `0013`.
- **DB write client:** page/section DB writes go through `createServerSupabase()` (RLS-enforced as the signed-in PYH). **Storage** object put/remove and **public reads/reaps/audit** go through `createServiceClient()` (service role), exactly as event actions do.
- **Images:** validate with `validateImage` (magic-byte sniff, `@/lib/images/validate`); derive object keys server-side from the sniffed mime (never client filename); store under `pages/<slug>/...` in the `media` bucket.
- **Instant updates:** every mutation calls `revalidatePath("/about")` (and `revalidatePath("/", "layout")` when SEO/nav-affecting). Public routes keep `export const revalidate = 60`.
- **Reap on delete/replace:** removing a section or replacing its image removes the owned storage object first, and a failed removal aborts before the row/JSON changes (mirrors `reapEventImages`). External seed URLs (picsum) have `objectPath: null` and are never reaped.
- **Audit:** every mutation best-effort inserts into `audit_log` (`actor_user_id`, `action`, `entity`, `entity_id`); logging failure never blocks the mutation.
- **`page_sections.type` is free text**, not a DB enum — new section types are code-only. Unknown types are rejected on write and skipped (never thrown) on read.

---

## File Structure

**Create:**
- `src/lib/pages/content-schemas.ts` — Zod schemas + inferred TS types for the 5 section types; `SECTION_TYPES` list; `parseSectionContent(type, content)`.
- `src/lib/pages/icons.ts` — allowlisted lucide icon map (`ICONS`) + `IconName` type + `IconBadge` is NOT here (icons rendered inside section components).
- `src/lib/pages/fallback.ts` — plain (non-`server-only`) module: `ABOUT_FALLBACK` sections + `PAGE_FALLBACK[slug]`, importable by both `getPage` and the proof script.
- `src/lib/pages/paths.ts` — `pageImageKey(slug, mime)`, `pagePublicUrl(path)` (re-uses `publicUrl` shape).
- `src/lib/pages/reap.ts` — `collectImagePaths(content)`, `reapPaths(svc, paths)`, `reapPage(svc, pageId)`.
- `src/lib/pages/registry.tsx` — `REGISTRY: Record<string, SectionDef>` mapping type → label, schema, defaultContent, Component, editorFields.
- `src/lib/data/pages.ts` — `getPage(slug)`, `getPageMeta(slug)` (server-only).
- `src/components/pages/section-renderer.tsx` — `<SectionRenderer sections=…/>`.
- `src/components/pages/sections/hero-section.tsx`
- `src/components/pages/sections/text-image-section.tsx`
- `src/components/pages/sections/feature-cards-section.tsx`
- `src/components/pages/sections/values-grid-section.tsx`
- `src/components/pages/sections/timeline-section.tsx`
- `src/app/admin/pages/page.tsx` — page list.
- `src/app/admin/pages/[slug]/edit/page.tsx` — editor server component.
- `src/app/admin/pages/_components/page-editor.tsx` — client editor (sections list + reorder/hide/delete/add).
- `src/app/admin/pages/_components/section-form.tsx` — client per-type form driven by `editorFields`.
- `src/app/admin/pages/_components/seo-form.tsx` — client SEO panel.
- `src/app/admin/pages/actions.ts` — server actions.
- `supabase/migrations/0016_page_cms.sql`
- `scripts/prove-pages.mjs`

**Modify:**
- `src/components/about/timeline.tsx` — accept optional `milestones` prop (default = current hardcoded array) so `timeline-section` can pass content.
- `src/app/about/page.tsx` — replace inline JSX with `getPage("about")` + `<SectionRenderer>` + `generateMetadata`.
- `src/lib/supabase/database.types.ts` — add `PageRow`, `PageSectionRow`.
- `src/app/admin/_components/admin-shell.tsx` — add `{ key: "pages", href: "/admin/pages", label: "Pages", pyhOnly: true }`.
- `package.json` — add `"prove:pages": "node --experimental-strip-types scripts/prove-pages.mjs"`.

---

### Task 1: Section content schemas + icon allowlist + proof-script skeleton

**Files:**
- Create: `src/lib/pages/content-schemas.ts`
- Create: `src/lib/pages/icons.ts`
- Create: `scripts/prove-pages.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `SECTION_TYPES: readonly string[]`; `parseSectionContent(type: string, content: unknown): { ok: true; data: unknown } | { ok: false; reason: string }`; per-type Zod schemas `heroSchema`, `textImageSchema`, `featureCardsSchema`, `valuesGridSchema`, `timelineSchema`; TS types `HeroContent`, `TextImageContent`, `FeatureCardsContent`, `ValuesGridContent`, `TimelineContent`. `ICONS: Record<IconName, LucideIcon>`, `ICON_NAMES: readonly IconName[]`, `IconName`.

- [ ] **Step 1: Write `src/lib/pages/icons.ts`**

```ts
import { Compass, Eye, Flame, HandHeart, Sparkles, Users, type LucideIcon } from "lucide-react";

/**
 * Icons an admin may choose for a section item. A fixed allowlist keyed by name:
 * the dashboard never supplies a component or arbitrary code, only one of these
 * names, which the renderer maps back to the real lucide icon.
 */
export const ICONS = { Compass, Eye, Flame, HandHeart, Sparkles, Users } as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
export const ICON_MAP: Record<IconName, LucideIcon> = ICONS;
```

- [ ] **Step 2: Write `src/lib/pages/content-schemas.ts`**

```ts
import { z } from "zod";
import { ICON_NAMES } from "./icons";

const iconName = z.enum(ICON_NAMES as [string, ...string[]]);
const text = z.string().min(1).max(400);
const longText = z.string().min(1).max(2000);

// Image inside a section. `src` is what next/image renders. `objectPath` is set
// only when we own the bytes in the media bucket (so reap can delete them);
// seed images point at external URLs and carry objectPath: null.
const sectionImage = z.object({
  src: z.string().url(),
  alt: z.string().max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  objectPath: z.string().max(300).nullable(),
});

export const heroSchema = z.object({
  eyebrow: text,
  title: text,
  subtitle: z.string().max(600).optional(),
});

export const textImageSchema = z.object({
  image: sectionImage,
  eyebrow: text,
  title: text,
  subtitle: z.string().max(600),
  body: longText,
});

export const featureCardsSchema = z.object({
  cards: z.array(z.object({ icon: iconName, title: text, body: longText })).min(1).max(4),
});

export const valuesGridSchema = z.object({
  eyebrow: text,
  title: text,
  align: z.enum(["left", "center"]).default("center"),
  items: z.array(z.object({ icon: iconName, title: text, text: longText })).min(1).max(12),
});

export const timelineSchema = z.object({
  eyebrow: text,
  title: text,
  subtitle: z.string().max(600).optional(),
  align: z.enum(["left", "center"]).default("center"),
  milestones: z.array(z.object({ year: z.string().max(12), title: text, text: longText })).min(1).max(24),
});

export type HeroContent = z.infer<typeof heroSchema>;
export type TextImageContent = z.infer<typeof textImageSchema>;
export type FeatureCardsContent = z.infer<typeof featureCardsSchema>;
export type ValuesGridContent = z.infer<typeof valuesGridSchema>;
export type TimelineContent = z.infer<typeof timelineSchema>;

const SCHEMAS = {
  hero: heroSchema,
  "text-image": textImageSchema,
  "feature-cards": featureCardsSchema,
  "values-grid": valuesGridSchema,
  timeline: timelineSchema,
} as const;

export const SECTION_TYPES = Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[];

/** Validates a section's content against its type. Unknown type => rejected. */
export function parseSectionContent(
  type: string, content: unknown,
): { ok: true; data: unknown } | { ok: false; reason: string } {
  const schema = (SCHEMAS as Record<string, z.ZodTypeAny>)[type];
  if (!schema) return { ok: false, reason: `Unknown section type: ${type}` };
  const r = schema.safeParse(content);
  if (!r.success) return { ok: false, reason: r.error.issues[0]?.message ?? "Invalid section content" };
  return { ok: true, data: r.data };
}
```

- [ ] **Step 3: Write `scripts/prove-pages.mjs` (schema section only — grows in later tasks)**

```js
// Proves the page CMS: section-content validation, RLS (PYH-only writes),
// fallback rendering, and image reaping. Cleans up after itself.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { parseSectionContent, SECTION_TYPES } = await import("../src/lib/pages/content-schemas.ts");

let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// ── 1. Section content validation ──────────────────────────────────────────
check("registry exposes the 5 v1 section types",
  SECTION_TYPES.length === 5 && SECTION_TYPES.includes("hero") && SECTION_TYPES.includes("timeline"), SECTION_TYPES);

check("rejects an unknown section type",
  parseSectionContent("marquee", {}).ok === false, parseSectionContent("marquee", {}));

check("hero rejects missing title",
  parseSectionContent("hero", { eyebrow: "x" }).ok === false, parseSectionContent("hero", { eyebrow: "x" }));

check("hero accepts valid content",
  parseSectionContent("hero", { eyebrow: "About", title: "Hi", subtitle: "Yo" }).ok === true, null);

check("values-grid rejects an icon outside the allowlist",
  parseSectionContent("values-grid", { eyebrow: "e", title: "t", items: [{ icon: "Skull", title: "a", text: "b" }] }).ok === false, null);

check("values-grid accepts an allowlisted icon",
  parseSectionContent("values-grid", { eyebrow: "e", title: "t", items: [{ icon: "Flame", title: "a", text: "b" }] }).ok === true, null);

check("text-image rejects a non-URL image src",
  parseSectionContent("text-image", { image: { src: "not-a-url", alt: "", width: 1, height: 1, objectPath: null }, eyebrow: "e", title: "t", subtitle: "s", body: "b" }).ok === false, null);

// (RLS, fallback, and reap assertions are appended in later tasks.)

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 4: Add the npm script to `package.json`**

In the `"scripts"` block, after the `prove:uploads` line, add:

```json
    "prove:pages": "node --experimental-strip-types scripts/prove-pages.mjs"
```

- [ ] **Step 5: Run it to verify the schema assertions pass**

Run: `npm run prove:pages`
Expected: `8 passed, 0 failed`.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/pages/content-schemas.ts src/lib/pages/icons.ts scripts/prove-pages.mjs package.json
git commit -m "feat: page-section content schemas + icon allowlist + prove:pages skeleton"
```

---

### Task 2: Migration — pages + page_sections + RLS + About seed, and DB types

**Files:**
- Create: `supabase/migrations/0016_page_cms.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `scripts/prove-pages.mjs` (append RLS + seed assertions)

**Interfaces:**
- Produces: tables `pages`, `page_sections` (columns per spec §4); RLS policies `pages_public_read`, `page_sections_public_read`, `pages_pyh_write`, `page_sections_pyh_write`; a seeded `about` page row + 5 section rows. TS: `PageRow`, `PageSectionRow`.

- [ ] **Step 1: Write `supabase/migrations/0016_page_cms.sql`**

```sql
-- Phase 3b slice 3: dynamic page CMS. Pages = ordered typed sections.
-- RLS mirrors 0013 site_settings: public read, PYH-only write. About is seeded
-- from the current hardcoded JSX so the rendered page is byte-identical.

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  seo_title text,
  seo_description text,
  og_image_path text,
  is_system boolean not null default true,
  visible boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  type text not null,
  content jsonb not null default '{}',
  sort_order int not null,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists page_sections_page_order on page_sections (page_id, sort_order);

alter table pages enable row level security;
alter table page_sections enable row level security;

drop policy if exists pages_public_read on pages;
create policy pages_public_read on pages for select to anon, authenticated using (true);
drop policy if exists page_sections_public_read on page_sections;
create policy page_sections_public_read on page_sections for select to anon, authenticated using (true);

drop policy if exists pages_pyh_write on pages;
create policy pages_pyh_write on pages for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));
drop policy if exists page_sections_pyh_write on page_sections;
create policy page_sections_pyh_write on page_sections for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- ── Seed: About (verbatim from src/app/about/page.tsx + timeline.tsx) ──
insert into pages (slug, title, seo_title, seo_description, is_system, sort_order)
values ('about', 'About', 'About',
  'Who we are, our mission and vision, core values, and the history of Youth for Christ in Zamboanga del Sur.',
  true, 2)
on conflict (slug) do nothing;

insert into page_sections (page_id, type, content, sort_order)
select p.id, s.type, s.content::jsonb, s.sort_order
from pages p, (values
  ('hero', 0, $json$
    {"eyebrow":"About Zubida YFC","title":"One Province. One Mission. One Christ.","subtitle":"We are the official Youth for Christ community of Zamboanga del Sur — a family of young people set ablaze by the love of God and sent to set the province on fire."}
  $json$),
  ('text-image', 1, $json$
    {"image":{"src":"https://picsum.photos/seed/whoweare/900/700","alt":"Zubida YFC community gathered in worship","width":900,"height":700,"objectPath":null},"eyebrow":"Who We Are","title":"A movement of young missionaries","subtitle":"Youth for Christ is a covenant community and evangelistic movement within Couples for Christ, forming young people ages 12 to 21 into Christ-centered leaders.","body":"In Zamboanga del Sur, we call ourselves Zubida YFC — twenty-six chapters across the province, bound by one covenant of prayer, formation, and mission. We gather in households, worship in conferences, serve in barangays, and walk with one another through the ordinary and extraordinary moments of growing up in faith."}
  $json$),
  ('feature-cards', 2, $json$
    {"cards":[{"icon":"Compass","title":"Our Mission","body":"To bring the youth of Zamboanga del Sur to a personal relationship with Jesus Christ, to form them into mature Christian leaders, and to send them out as joyful missionaries in their families, schools, and communities."},{"icon":"Eye","title":"Our Vision","body":"A province where every young person knows they are loved by God, every chapter is a home of holiness and joy, and a new generation of leaders rises to renew the Church and transform Zamboanga del Sur for Christ."}]}
  $json$),
  ('values-grid', 3, $json$
    {"eyebrow":"Core Values","title":"What holds us together","align":"center","items":[{"icon":"Flame","title":"Christ-Centeredness","text":"Everything begins and ends with Jesus. He is our reason, our method, and our goal."},{"icon":"Users","title":"Family & Household","text":"We grow in small households where faith becomes personal and no one is left behind."},{"icon":"HandHeart","title":"Servant Leadership","text":"To lead is to serve. Our leaders wash feet before they take the stage."},{"icon":"Sparkles","title":"Joyful Evangelization","text":"We share the Gospel with the contagious joy that only Christ can give."},{"icon":"Compass","title":"Integrity","text":"We strive to be the same person on stage, at home, and in the barangay."},{"icon":"Eye","title":"Missionary Heart","text":"We are sent — to our schools, our families, and the farthest chapel of the province."}]}
  $json$),
  ('timeline', 4, $json$
    {"eyebrow":"Our History","title":"Two decades of grace in Zamboanga del Sur","subtitle":"From a small prayer group in Pagadian to a province-wide movement — this is how far God has carried us.","align":"center","milestones":[{"year":"2003","title":"The First Spark","text":"A handful of students in Pagadian City begin gathering to pray and share the Gospel — the seed of Youth for Christ in Zamboanga del Sur."},{"year":"2008","title":"Chapters Multiply","text":"The movement spreads north to Molave and Mahayag. The first provincial youth camp draws over 200 delegates."},{"year":"2013","title":"Clusters Formed","text":"Chapters organize into Bay, North, and South clusters, giving every municipality a spiritual home and closer formation."},{"year":"2017","title":"ICON is Born","text":"The Ignite Conference launches as the province's flagship annual gathering, commissioning a new wave of young leaders."},{"year":"2020","title":"Faith Online","text":"When the world stops, the households don't. Zubida YFC moves to virtual gatherings, keeping the youth connected through the pandemic."},{"year":"2024","title":"One Province, One Mission","text":"With 26 chapters and thousands of members, Zubida YFC adopts its unifying vision: One Province. One Mission. One Christ."}]}
  $json$)
) as s(type, sort_order, content)
where p.slug = 'about'
  and not exists (select 1 from page_sections ps where ps.page_id = p.id);
```

- [ ] **Step 2: Apply the migration to the hosted DB**

Run: `npm run db:migrate`
Expected: `0016_page_cms.sql` reported applied, no error.

- [ ] **Step 3: Add TS row types to `src/lib/supabase/database.types.ts`**

Append after `NavItemRow`:

```ts
export interface PageRow {
  id: string;
  slug: string;
  title: string;
  seo_title: string | null;
  seo_description: string | null;
  og_image_path: string | null;
  is_system: boolean;
  visible: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface PageSectionRow {
  id: string;
  page_id: string;
  type: string;
  content: unknown;
  sort_order: number;
  visible: boolean;
  updated_at: string;
}
```

- [ ] **Step 4: Append RLS + seed assertions to `scripts/prove-pages.mjs`**

Insert BEFORE the final `console.log("─".repeat(48));` block:

```js
// ── 2. RLS + seed (against the hosted DB) ───────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !service) { console.error("Missing Supabase env vars."); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });

const mkUser = async (email) => {
  const c = await admin.auth.admin.createUser({ email, password: "ProvePages!2026", email_confirm: true });
  if (c.error) { if (/already/i.test(c.error.message)) { const l = await admin.auth.admin.listUsers(); return l.data.users.find((u) => u.email === email).id; } throw c.error; }
  return c.data.user.id;
};
const authed = async (email) => { const c = createClient(url, anonKey, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: "ProvePages!2026" }); if (error) throw error; return c; };

const stamp = Date.now();
const pyhEmail = `pages_pyh_${stamp}@test.com`, chEmail = `pages_ch_${stamp}@test.com`;
const pyhId = await mkUser(pyhEmail), chId = await mkUser(chEmail);
const { data: clusters } = await admin.from("clusters").select("id").order("name");
await admin.from("admins").upsert({ user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Pages PYH" }, { onConflict: "user_id" });
await admin.from("admins").upsert({ user_id: chId, role: "cluster_head", cluster_id: clusters[0].id, is_active: true, full_name: "Pages CH" }, { onConflict: "user_id" });

const { data: about } = await admin.from("pages").select("id").eq("slug", "about").single();
const { data: secs } = await admin.from("pages").select("id, page_sections(type)").eq("slug", "about").single();
try {
  check("About page is seeded with 5 sections", (secs?.page_sections?.length ?? 0) === 5, secs?.page_sections?.length);

  const anonC = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonRead = await anonC.from("page_sections").select("id").eq("page_id", about.id);
  check("anon CAN read page_sections", !anonRead.error && anonRead.data.length === 5, anonRead.error?.message);

  const anonWrite = await anonC.from("page_sections").update({ visible: false }).eq("page_id", about.id).select("id");
  check("anon CANNOT write page_sections", (anonWrite.data?.length ?? 0) === 0, anonWrite.data);

  const ch = await authed(chEmail);
  const chWrite = await ch.from("pages").update({ seo_title: "hacked" }).eq("id", about.id).select("id");
  check("cluster head CANNOT write pages", (chWrite.data?.length ?? 0) === 0, chWrite.data);

  const pyh = await authed(pyhEmail);
  const pyhWrite = await pyh.from("pages").update({ seo_title: "About" }).eq("id", about.id).select("id");
  check("PYH CAN write pages (positive control)", !pyhWrite.error && pyhWrite.data?.length === 1, pyhWrite.error?.message);
} finally {
  await admin.auth.admin.deleteUser(pyhId);
  await admin.auth.admin.deleteUser(chId);
  await admin.from("admins").delete().in("user_id", [pyhId, chId]);
}
```

- [ ] **Step 5: Run the proof suite**

Run: `npm run prove:pages`
Expected: `13 passed, 0 failed` (8 schema + 5 RLS/seed).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0016_page_cms.sql src/lib/supabase/database.types.ts scripts/prove-pages.mjs
git commit -m "feat: pages + page_sections schema, RLS, About seed, prove:pages RLS"
```

---

### Task 3: Section components + registry + renderer (byte-identical extraction)

**Files:**
- Modify: `src/components/about/timeline.tsx`
- Create: `src/components/pages/sections/hero-section.tsx`, `text-image-section.tsx`, `feature-cards-section.tsx`, `values-grid-section.tsx`, `timeline-section.tsx`
- Create: `src/components/pages/section-renderer.tsx`
- Create: `src/lib/pages/registry.tsx`

**Interfaces:**
- Consumes: content types + `ICON_MAP` from Tasks 1.
- Produces: `REGISTRY: Record<string, { label: string; schema: ZodTypeAny; defaultContent: unknown; Component: (props: { content: any }) => JSX.Element; editorFields: EditorField[] }>`; `<SectionRenderer sections={{ type: string; content: unknown }[]} />`. `EditorField` type (used by Task 7).

- [ ] **Step 1: Parametrize `src/components/about/timeline.tsx`**

Change the component to accept milestones as a prop, defaulting to the current array (so any other current caller is unaffected):

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

export type Milestone = { year: string; title: string; text: string };

const DEFAULT_MILESTONES: Milestone[] = [
  { year: "2003", title: "The First Spark", text: "A handful of students in Pagadian City begin gathering to pray and share the Gospel — the seed of Youth for Christ in Zamboanga del Sur." },
  { year: "2008", title: "Chapters Multiply", text: "The movement spreads north to Molave and Mahayag. The first provincial youth camp draws over 200 delegates." },
  { year: "2013", title: "Clusters Formed", text: "Chapters organize into Bay, North, and South clusters, giving every municipality a spiritual home and closer formation." },
  { year: "2017", title: "ICON is Born", text: "The Ignite Conference launches as the province's flagship annual gathering, commissioning a new wave of young leaders." },
  { year: "2020", title: "Faith Online", text: "When the world stops, the households don't. Zubida YFC moves to virtual gatherings, keeping the youth connected through the pandemic." },
  { year: "2024", title: "One Province, One Mission", text: "With 26 chapters and thousands of members, Zubida YFC adopts its unifying vision: One Province. One Mission. One Christ." },
];

export function Timeline({ milestones = DEFAULT_MILESTONES }: { milestones?: Milestone[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute left-4 top-0 h-full w-px bg-gradient-to-b from-gold-400 via-royal-500 to-transparent sm:left-1/2" />
      <div className="space-y-12">
        {milestones.map((m, i) => (
          <motion.div
            key={m.year}
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`relative pl-12 sm:w-1/2 sm:pl-0 ${
              i % 2 === 0 ? "sm:pr-12 sm:text-right" : "sm:ml-auto sm:pl-12"
            }`}
          >
            <span
              className={`absolute left-[9px] top-1.5 h-4 w-4 rounded-full bg-gold-500 ring-4 ring-cream dark:ring-midnight-950 sm:left-auto ${
                i % 2 === 0 ? "sm:-right-2" : "sm:-left-2"
              }`}
            />
            <div className="glass rounded-2xl p-6 shadow-card">
              <span className="font-display text-2xl font-semibold text-royal-700 dark:text-gold-300">{m.year}</span>
              <h3 className="mt-1 text-lg font-semibold">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/pages/sections/hero-section.tsx`**

```tsx
import { PageHeader } from "@/components/shared/page-header";
import type { HeroContent } from "@/lib/pages/content-schemas";

export function HeroSection({ content }: { content: HeroContent }) {
  return <PageHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />;
}
```

- [ ] **Step 3: Write `src/components/pages/sections/text-image-section.tsx`** (verbatim markup from `about/page.tsx:34-64`)

```tsx
import Image from "next/image";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import type { TextImageContent } from "@/lib/pages/content-schemas";

export function TextImageSection({ content }: { content: TextImageContent }) {
  const { image } = content;
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <Reveal>
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-radiant blur-2xl" />
            <Image
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              className="w-full rounded-3xl object-cover shadow-card"
            />
          </div>
        </Reveal>
        <div>
          <SectionHeading eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
          <p className="mt-6 leading-relaxed text-muted">{content.body}</p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `src/components/pages/sections/feature-cards-section.tsx`** (verbatim from `about/page.tsx:66-98`; badge style + Reveal delay alternate by index)

```tsx
import { Reveal } from "@/components/shared/reveal";
import { ICON_MAP } from "@/lib/pages/icons";
import type { FeatureCardsContent } from "@/lib/pages/content-schemas";

// The two seeded cards use different badge treatments; preserve that by index.
const BADGE = [
  "bg-dawn-soft text-gold-300",
  "bg-gold-500 text-midnight-900",
];

export function FeatureCardsSection({ content }: { content: FeatureCardsContent }) {
  return (
    <section className="bg-cream-100 py-24 dark:bg-midnight-900/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
        {content.cards.map((card, i) => {
          const Icon = ICON_MAP[card.icon as keyof typeof ICON_MAP];
          return (
            <Reveal key={card.title} delay={i * 0.12}>
              <div className="glass h-full rounded-3xl p-8 shadow-card sm:p-10">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${BADGE[i % BADGE.length]}`}>
                  <Icon className="h-7 w-7" />
                </span>
                <h3 className="mt-6 font-display text-2xl font-semibold">{card.title}</h3>
                <p className="mt-4 leading-relaxed text-muted">{card.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write `src/components/pages/sections/values-grid-section.tsx`** (verbatim from `about/page.tsx:100-120`)

```tsx
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { ICON_MAP } from "@/lib/pages/icons";
import type { ValuesGridContent } from "@/lib/pages/content-schemas";

export function ValuesGridSection({ content }: { content: ValuesGridContent }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeading eyebrow={content.eyebrow} title={content.title} align={content.align} />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((v, i) => {
          const Icon = ICON_MAP[v.icon as keyof typeof ICON_MAP];
          return (
            <Reveal key={v.title} delay={(i % 3) * 0.1}>
              <div className="glass h-full rounded-3xl p-7 shadow-card transition-transform duration-300 hover:-translate-y-1.5">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold-500/15 text-gold-600 dark:text-gold-400">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{v.text}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Write `src/components/pages/sections/timeline-section.tsx`** (verbatim from `about/page.tsx:122-138`)

```tsx
import { SectionHeading } from "@/components/shared/section-heading";
import { Sunburst } from "@/components/shared/sunburst";
import { Timeline } from "@/components/about/timeline";
import type { TimelineContent } from "@/lib/pages/content-schemas";

export function TimelineSection({ content }: { content: TimelineContent }) {
  return (
    <section className="relative overflow-hidden bg-cream-100 py-24 dark:bg-midnight-900/40">
      <div className="pointer-events-none absolute -left-24 top-1/3 text-gold-400/5">
        <Sunburst className="h-96 w-96" rays={24} />
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} align={content.align} />
        <div className="mt-16">
          <Timeline milestones={content.milestones} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Write `src/lib/pages/registry.tsx`**

```tsx
import type { ZodTypeAny } from "zod";
import {
  heroSchema, textImageSchema, featureCardsSchema, valuesGridSchema, timelineSchema,
} from "./content-schemas";
import { ICON_NAMES } from "./icons";
import { HeroSection } from "@/components/pages/sections/hero-section";
import { TextImageSection } from "@/components/pages/sections/text-image-section";
import { FeatureCardsSection } from "@/components/pages/sections/feature-cards-section";
import { ValuesGridSection } from "@/components/pages/sections/values-grid-section";
import { TimelineSection } from "@/components/pages/sections/timeline-section";

// Field kinds the admin editor knows how to render (Task 7 consumes this).
export type EditorField =
  | { key: string; kind: "text" | "textarea"; label: string; optional?: boolean }
  | { key: string; kind: "image"; label: string }
  | { key: string; kind: "icon"; label: string }
  | { key: string; kind: "select"; label: string; options: string[] }
  | { key: string; kind: "list"; label: string; itemFields: EditorField[] };

export type SectionDef = {
  label: string;
  schema: ZodTypeAny;
  defaultContent: unknown;
  Component: (props: { content: any }) => JSX.Element;
  editorFields: EditorField[];
};

const ICON_FIELD = (key: string, label: string): EditorField => ({ key, kind: "icon", label });

export const REGISTRY: Record<string, SectionDef> = {
  hero: {
    label: "Hero banner",
    schema: heroSchema,
    defaultContent: { eyebrow: "Eyebrow", title: "Title", subtitle: "" },
    Component: HeroSection,
    editorFields: [
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "subtitle", kind: "textarea", label: "Subtitle", optional: true },
    ],
  },
  "text-image": {
    label: "Text + image",
    schema: textImageSchema,
    defaultContent: {
      image: { src: "https://picsum.photos/seed/new/900/700", alt: "", width: 900, height: 700, objectPath: null },
      eyebrow: "Eyebrow", title: "Title", subtitle: "Subtitle", body: "Body text.",
    },
    Component: TextImageSection,
    editorFields: [
      { key: "image", kind: "image", label: "Image" },
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "subtitle", kind: "textarea", label: "Subtitle" },
      { key: "body", kind: "textarea", label: "Body" },
    ],
  },
  "feature-cards": {
    label: "Feature cards",
    schema: featureCardsSchema,
    defaultContent: { cards: [{ icon: ICON_NAMES[0], title: "Card", body: "Body." }] },
    Component: FeatureCardsSection,
    editorFields: [
      { key: "cards", kind: "list", label: "Cards", itemFields: [
        ICON_FIELD("icon", "Icon"),
        { key: "title", kind: "text", label: "Title" },
        { key: "body", kind: "textarea", label: "Body" },
      ] },
    ],
  },
  "values-grid": {
    label: "Values grid",
    schema: valuesGridSchema,
    defaultContent: { eyebrow: "Eyebrow", title: "Title", align: "center", items: [{ icon: ICON_NAMES[0], title: "Value", text: "Text." }] },
    Component: ValuesGridSection,
    editorFields: [
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "align", kind: "select", label: "Align", options: ["left", "center"] },
      { key: "items", kind: "list", label: "Items", itemFields: [
        ICON_FIELD("icon", "Icon"),
        { key: "title", kind: "text", label: "Title" },
        { key: "text", kind: "textarea", label: "Text" },
      ] },
    ],
  },
  timeline: {
    label: "Timeline",
    schema: timelineSchema,
    defaultContent: { eyebrow: "Eyebrow", title: "Title", subtitle: "", align: "center", milestones: [{ year: "2024", title: "Milestone", text: "Text." }] },
    Component: TimelineSection,
    editorFields: [
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "subtitle", kind: "textarea", label: "Subtitle", optional: true },
      { key: "align", kind: "select", label: "Align", options: ["left", "center"] },
      { key: "milestones", kind: "list", label: "Milestones", itemFields: [
        { key: "year", kind: "text", label: "Year" },
        { key: "title", kind: "text", label: "Title" },
        { key: "text", kind: "textarea", label: "Text" },
      ] },
    ],
  },
};
```

- [ ] **Step 8: Write `src/components/pages/section-renderer.tsx`**

```tsx
import { REGISTRY } from "@/lib/pages/registry";

export type RenderableSection = { type: string; content: unknown };

/**
 * Renders each section via the registry. An unknown/legacy type is skipped
 * (never thrown), so a stray row can't take the whole public page down.
 */
export function SectionRenderer({ sections }: { sections: RenderableSection[] }) {
  return (
    <>
      {sections.map((s, i) => {
        const def = REGISTRY[s.type];
        if (!def) return null;
        const parsed = def.schema.safeParse(s.content);
        if (!parsed.success) return null;
        const Component = def.Component;
        return <Component key={i} content={parsed.data} />;
      })}
    </>
  );
}
```

- [ ] **Step 9: Typecheck, lint, commit**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new errors.

```bash
git add src/components/about/timeline.tsx src/components/pages src/lib/pages/registry.tsx
git commit -m "feat: section components (byte-identical extraction) + registry + renderer"
```

---

### Task 4: Data loader + About page rewrite (byte-identical)

**Files:**
- Create: `src/lib/pages/fallback.ts`
- Create: `src/lib/data/pages.ts`
- Modify: `src/app/about/page.tsx`
- Modify: `scripts/prove-pages.mjs` (append fallback assertion)

**Interfaces:**
- Consumes: `PageRow`, `PageSectionRow`, `REGISTRY`, `RenderableSection`.
- Produces: `getPage(slug: string): Promise<{ page: PageMeta; sections: RenderableSection[] }>`; `getPageMeta(slug: string): Promise<PageMeta>`; `PageMeta = { title: string; seoTitle: string; seoDescription: string; ogImage: string | null }`. `PAGE_FALLBACK: Record<string, { meta: PageMeta; sections: RenderableSection[] }>`.

- [ ] **Step 1: Write `src/lib/pages/fallback.ts`** (plain module — importable by the proof script; no `server-only`)

```ts
import type { RenderableSection } from "@/components/pages/section-renderer";

export type PageMeta = { title: string; seoTitle: string; seoDescription: string; ogImage: string | null };

// Mirrors the About seed in migration 0016. Guarantees the public page renders
// even if the DB is unreachable or unseeded, exactly like getSiteSettings.
const ABOUT: { meta: PageMeta; sections: RenderableSection[] } = {
  meta: {
    title: "About",
    seoTitle: "About",
    seoDescription:
      "Who we are, our mission and vision, core values, and the history of Youth for Christ in Zamboanga del Sur.",
    ogImage: null,
  },
  sections: [
    { type: "hero", content: { eyebrow: "About Zubida YFC", title: "One Province. One Mission. One Christ.", subtitle: "We are the official Youth for Christ community of Zamboanga del Sur — a family of young people set ablaze by the love of God and sent to set the province on fire." } },
    { type: "text-image", content: { image: { src: "https://picsum.photos/seed/whoweare/900/700", alt: "Zubida YFC community gathered in worship", width: 900, height: 700, objectPath: null }, eyebrow: "Who We Are", title: "A movement of young missionaries", subtitle: "Youth for Christ is a covenant community and evangelistic movement within Couples for Christ, forming young people ages 12 to 21 into Christ-centered leaders.", body: "In Zamboanga del Sur, we call ourselves Zubida YFC — twenty-six chapters across the province, bound by one covenant of prayer, formation, and mission. We gather in households, worship in conferences, serve in barangays, and walk with one another through the ordinary and extraordinary moments of growing up in faith." } },
    { type: "feature-cards", content: { cards: [{ icon: "Compass", title: "Our Mission", body: "To bring the youth of Zamboanga del Sur to a personal relationship with Jesus Christ, to form them into mature Christian leaders, and to send them out as joyful missionaries in their families, schools, and communities." }, { icon: "Eye", title: "Our Vision", body: "A province where every young person knows they are loved by God, every chapter is a home of holiness and joy, and a new generation of leaders rises to renew the Church and transform Zamboanga del Sur for Christ." }] } },
    { type: "values-grid", content: { eyebrow: "Core Values", title: "What holds us together", align: "center", items: [{ icon: "Flame", title: "Christ-Centeredness", text: "Everything begins and ends with Jesus. He is our reason, our method, and our goal." }, { icon: "Users", title: "Family & Household", text: "We grow in small households where faith becomes personal and no one is left behind." }, { icon: "HandHeart", title: "Servant Leadership", text: "To lead is to serve. Our leaders wash feet before they take the stage." }, { icon: "Sparkles", title: "Joyful Evangelization", text: "We share the Gospel with the contagious joy that only Christ can give." }, { icon: "Compass", title: "Integrity", text: "We strive to be the same person on stage, at home, and in the barangay." }, { icon: "Eye", title: "Missionary Heart", text: "We are sent — to our schools, our families, and the farthest chapel of the province." }] } },
    { type: "timeline", content: { eyebrow: "Our History", title: "Two decades of grace in Zamboanga del Sur", subtitle: "From a small prayer group in Pagadian to a province-wide movement — this is how far God has carried us.", align: "center", milestones: [{ year: "2003", title: "The First Spark", text: "A handful of students in Pagadian City begin gathering to pray and share the Gospel — the seed of Youth for Christ in Zamboanga del Sur." }, { year: "2008", title: "Chapters Multiply", text: "The movement spreads north to Molave and Mahayag. The first provincial youth camp draws over 200 delegates." }, { year: "2013", title: "Clusters Formed", text: "Chapters organize into Bay, North, and South clusters, giving every municipality a spiritual home and closer formation." }, { year: "2017", title: "ICON is Born", text: "The Ignite Conference launches as the province's flagship annual gathering, commissioning a new wave of young leaders." }, { year: "2020", title: "Faith Online", text: "When the world stops, the households don't. Zubida YFC moves to virtual gatherings, keeping the youth connected through the pandemic." }, { year: "2024", title: "One Province, One Mission", text: "With 26 chapters and thousands of members, Zubida YFC adopts its unifying vision: One Province. One Mission. One Christ." }] } },
  ],
};

export const PAGE_FALLBACK: Record<string, { meta: PageMeta; sections: RenderableSection[] }> = { about: ABOUT };
```

- [ ] **Step 2: Write `src/lib/data/pages.ts`**

```ts
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { PageRow, PageSectionRow } from "@/lib/supabase/database.types";
import type { RenderableSection } from "@/components/pages/section-renderer";
import { PAGE_FALLBACK, type PageMeta } from "@/lib/pages/fallback";
import { publicUrl } from "@/lib/images/paths";

export type { PageMeta };

function metaFromRow(row: PageRow): PageMeta {
  return {
    title: row.title,
    seoTitle: row.seo_title ?? row.title,
    seoDescription: row.seo_description ?? "",
    ogImage: row.og_image_path ? publicUrl(row.og_image_path) : null,
  };
}

/**
 * Loads a page and its visible sections, ordered. Falls back to the hardcoded
 * PAGE_FALLBACK[slug] whenever the DB errors, the page row is missing, or it has
 * no sections — so the public site always renders. Mirrors getSiteSettings.
 */
export async function getPage(
  slug: string,
): Promise<{ page: PageMeta; sections: RenderableSection[] }> {
  const fallback = PAGE_FALLBACK[slug] ?? { meta: { title: slug, seoTitle: slug, seoDescription: "", ogImage: null }, sections: [] };
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("pages")
      .select("*, page_sections(type, content, sort_order, visible)")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return { page: fallback.meta, sections: fallback.sections };

    const row = data as PageRow & { page_sections: Pick<PageSectionRow, "type" | "content" | "sort_order" | "visible">[] };
    const sections = (row.page_sections ?? [])
      .filter((s) => s.visible)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ type: s.type, content: s.content }));

    if (sections.length === 0) return { page: metaFromRow(row), sections: fallback.sections };
    return { page: metaFromRow(row), sections };
  } catch {
    return { page: fallback.meta, sections: fallback.sections };
  }
}

export async function getPageMeta(slug: string): Promise<PageMeta> {
  return (await getPage(slug)).page;
}
```

- [ ] **Step 3: Rewrite `src/app/about/page.tsx`**

```tsx
import type { Metadata } from "next";
import { getPage, getPageMeta } from "@/lib/data/pages";
import { SectionRenderer } from "@/components/pages/section-renderer";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const meta = await getPageMeta("about");
  return { title: meta.seoTitle, description: meta.seoDescription };
}

export default async function AboutPage() {
  const { sections } = await getPage("about");
  return <SectionRenderer sections={sections} />;
}
```

- [ ] **Step 4: Append the fallback assertion to `scripts/prove-pages.mjs`**

Add to the top import group:

```js
const { PAGE_FALLBACK } = await import("../src/lib/pages/fallback.ts");
```

Add in the `// ── 1.` block:

```js
check("About fallback has 5 sections matching the seed",
  PAGE_FALLBACK.about?.sections?.length === 5, PAGE_FALLBACK.about?.sections?.length);
check("every fallback section validates against its schema",
  PAGE_FALLBACK.about.sections.every((s) => parseSectionContent(s.type, s.content).ok), null);
```

- [ ] **Step 5: Run proof + build; verify byte-identical**

Run: `npm run prove:pages` → `15 passed, 0 failed`.
Run: `npx tsc --noEmit` → clean.
Kill any stray `next dev` first, then `npm run build` → exit 0.
**Byte-identical check:** `git stash` is NOT usable (DB-backed). Instead compare the rendered `/about` HTML before/after: with the dev server running, `curl -s localhost:3000/about > after.html` and diff against a capture taken from `git show HEAD~4:src/app/about/page.tsx` rendered output. Practically: visually load `/about`, confirm hero, who-we-are, mission/vision, values grid, and timeline all render identically. (Automated DOM diff is covered in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/pages/fallback.ts src/lib/data/pages.ts src/app/about/page.tsx scripts/prove-pages.mjs
git commit -m "feat: DB-driven About via getPage + SectionRenderer, with hardcoded fallback"
```

---

### Task 5: Section image paths + reap

**Files:**
- Create: `src/lib/pages/paths.ts`
- Create: `src/lib/pages/reap.ts`
- Modify: `scripts/prove-pages.mjs` (append reap assertions)

**Interfaces:**
- Produces: `pageImageKey(slug: string, mime: string): string`; `collectImagePaths(content: unknown): string[]` (returns owned `objectPath`s found in a section's content); `reapPaths(svc, paths: string[]): Promise<{ error?: string }>`; `reapPage(svc, pageId: string): Promise<{ error?: string }>`.

- [ ] **Step 1: Write `src/lib/pages/paths.ts`**

```ts
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a page image inside the `media` bucket, prefixed by slug. */
export function pageImageKey(slug: string, mime: string): string {
  return `pages/${slug}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
```

- [ ] **Step 2: Write `src/lib/pages/reap.ts`**

```ts
type MinimalClient = {
  from: (t: string) => any;
  storage: { from: (b: string) => { remove: (paths: string[]) => Promise<{ error: unknown }> } };
};

/**
 * Collects the storage object paths a section owns (objectPath !== null). Only
 * the `image` field carries one today; written defensively so future image-bearing
 * fields are covered. Seed/external images have objectPath: null and are ignored.
 */
export function collectImagePaths(content: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    if (typeof o.objectPath === "string" && o.objectPath.length > 0) out.push(o.objectPath);
    Object.values(o).forEach(visit);
  };
  visit(content);
  return out;
}

/**
 * Removes owned storage objects. Object removal must succeed before the caller
 * proceeds to drop the referencing row/JSON; a failed removal returns an error
 * so the caller aborts rather than orphaning bytes. Mirrors reapEventImages.
 */
export async function reapPaths(svc: MinimalClient, paths: string[]): Promise<{ error?: string }> {
  if (paths.length === 0) return {};
  const rm = await svc.storage.from("media").remove(paths);
  if (rm.error) return { error: "Could not delete the page's image files. Please try again." };
  return {};
}

/** Reaps every owned image across all of a page's sections (used on page delete). */
export async function reapPage(svc: MinimalClient, pageId: string): Promise<{ error?: string }> {
  const { data } = await svc.from("page_sections").select("content").eq("page_id", pageId);
  if (!data || data.length === 0) return {};
  const paths = data.flatMap((r: { content: unknown }) => collectImagePaths(r.content));
  return reapPaths(svc, paths);
}
```

- [ ] **Step 3: Append reap assertions to `scripts/prove-pages.mjs`**

Add to the top import group:

```js
const { collectImagePaths, reapPaths } = await import("../src/lib/pages/reap.ts");
```

Add a new block before the final summary (inside the async scope, after the RLS `finally`):

```js
// ── 3. Reap (real prod code path, mirrors prove-uploads) ────────────────────
check("collectImagePaths ignores external (objectPath:null) images",
  collectImagePaths({ image: { src: "https://x/y.jpg", objectPath: null } }).length === 0, null);
check("collectImagePaths finds owned object paths (incl. nested lists)",
  collectImagePaths({ items: [{ image: { objectPath: "pages/about/a.webp" } }] }).join() === "pages/about/a.webp", null);

// Upload a real object, reap it via the shared helper, assert it's gone.
const RIFF = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
const key = `pages/_prove/${stamp}.webp`;
const up = await admin.storage.from("media").upload(key, RIFF, { contentType: "image/webp", upsert: true });
check("test object uploaded (positive control)", !up.error, up.error?.message);
const reap = await reapPaths(admin, [key]);
check("reapPaths returns no error", !reap.error, reap.error);
const dl = await admin.storage.from("media").download(key);
check("object is gone after reap", !!dl.error, "still downloadable");
```

- [ ] **Step 4: Run proof**

Run: `npm run prove:pages`
Expected: `20 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages/paths.ts src/lib/pages/reap.ts scripts/prove-pages.mjs
git commit -m "feat: page section image paths + reap helpers, prove:pages reap"
```

---

### Task 6: Server actions (PYH-only) — SEO, add/update/delete/reorder/hide sections

**Files:**
- Create: `src/app/admin/pages/actions.ts`

**Interfaces:**
- Consumes: `requirePYH`, `createServerSupabase`, `createServiceClient`, `parseSectionContent`, `REGISTRY`, `validateImage`, `pageImageKey`, `collectImagePaths`, `reapPaths`.
- Produces (all return `Promise<{ error?: string }>` unless noted):
  `updatePageSeo(pageId, formData)`, `addSection(pageId, type)`, `updateSectionContent(sectionId, content: unknown)`, `uploadSectionImage(sectionId, fieldKey, formData)`, `deleteSection(sectionId)`, `reorderSection(sectionId, "up"|"down")`, `toggleSectionVisible(sectionId)`.

- [ ] **Step 1: Write `src/app/admin/pages/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requirePYH } from "@/lib/supabase/admin-auth";
import { createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSectionContent } from "@/lib/pages/content-schemas";
import { REGISTRY } from "@/lib/pages/registry";
import { validateImage } from "@/lib/images/validate";
import { pageImageKey } from "@/lib/pages/paths";
import { collectImagePaths, reapPaths } from "@/lib/pages/reap";
import { publicUrl } from "@/lib/images/paths";
import type { PageRow, PageSectionRow } from "@/lib/supabase/database.types";

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log").insert({ actor_user_id: userId, action, entity: "pages", entity_id: id });
  } catch {
    // best-effort; never block the mutation on logging failure
  }
}

async function slugFor(pageId: string): Promise<string> {
  const { data } = await createServiceClient().from("pages").select("slug").eq("id", pageId).single();
  return (data as Pick<PageRow, "slug"> | null)?.slug ?? "";
}

function revalidateFor(slug: string) {
  revalidatePath(slug === "home" ? "/" : `/${slug}`);
  revalidatePath(`/admin/pages/${slug}/edit`);
}

export async function updatePageSeo(pageId: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const seo_title = String(formData.get("seo_title") ?? "").trim().slice(0, 200) || null;
  const seo_description = String(formData.get("seo_description") ?? "").trim().slice(0, 400) || null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("pages")
    .update({ seo_title, seo_description, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", pageId).select("slug");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted or not found." };
  await audit(ctx.userId, "page.seo.update", pageId);
  revalidateFor((data[0] as Pick<PageRow, "slug">).slug);
  return {};
}

export async function addSection(pageId: string, type: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const def = REGISTRY[type];
  if (!def) return { error: "Unknown section type." };
  const supabase = await createServerSupabase();
  const { data: last } = await supabase.from("page_sections")
    .select("sort_order").eq("page_id", pageId).order("sort_order", { ascending: false }).limit(1);
  const next = ((last as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await supabase.from("page_sections")
    .insert({ page_id: pageId, type, content: def.defaultContent, sort_order: next, visible: true }).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, `page.section.add.${type}`, pageId);
  revalidateFor(await slugFor(pageId));
  return {};
}

export async function updateSectionContent(sectionId: string, content: unknown): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, type").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "type">;
  const parsed = parseSectionContent(row.type, content);
  if (!parsed.ok) return { error: parsed.reason };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections")
    .update({ content: parsed.data, updated_at: new Date().toISOString() }).eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.update", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function uploadSectionImage(sectionId: string, fieldKey: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };

  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, type, content").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "type" | "content">;
  const slug = await slugFor(row.page_id);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const key = pageImageKey(slug, v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  // Merge the new image into content[fieldKey], preserving other fields.
  const current = (row.content ?? {}) as Record<string, any>;
  const prevField = (current[fieldKey] ?? {}) as Record<string, any>;
  const nextContent = { ...current, [fieldKey]: { ...prevField, src: publicUrl(key), objectPath: key,
    width: prevField.width ?? 900, height: prevField.height ?? 700, alt: prevField.alt ?? "" } };

  const parsed = parseSectionContent(row.type, nextContent);
  if (!parsed.ok) { await svc.storage.from("media").remove([key]); return { error: parsed.reason }; }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections")
    .update({ content: parsed.data, updated_at: new Date().toISOString() }).eq("id", sectionId).select("id");
  if (error || !data || data.length === 0) { await svc.storage.from("media").remove([key]); return { error: error?.message ?? "Not permitted." }; }

  // Reap the previously-owned image, if any (best-effort — new image already saved).
  const old = collectImagePaths(row.content).filter((p) => p !== key);
  if (old.length > 0) await reapPaths(svc, old);

  await audit(ctx.userId, "page.section.image", sectionId);
  revalidateFor(slug);
  return {};
}

export async function deleteSection(sectionId: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, content").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "content">;

  // Remove owned objects BEFORE the row; abort on failure (no untraceable orphan).
  const reap = await reapPaths(svc, collectImagePaths(row.content));
  if (reap.error) return { error: reap.error };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections").delete().eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.delete", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function reorderSection(sectionId: string, direction: "up" | "down"): Promise<{ error?: string }> {
  await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, sort_order").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "sort_order">;
  const { data: neighbour } = await svc.from("page_sections")
    .select("id, sort_order").eq("page_id", row.page_id)
    .order("sort_order", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("sort_order", row.sort_order).limit(1).maybeSingle();
  if (!neighbour) return {};
  const supabase = await createServerSupabase();
  await supabase.from("page_sections").update({ sort_order: (neighbour as any).sort_order }).eq("id", row.id);
  await supabase.from("page_sections").update({ sort_order: row.sort_order }).eq("id", (neighbour as any).id);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function toggleSectionVisible(sectionId: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, visible").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "visible">;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections").update({ visible: !row.visible }).eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.visible", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Actions are request-scoped; correctness of the RLS they rely on and the reap path is already proven by `prove:pages`. Guard order — `requirePYH()` first — is verified by reading the file: it is the first statement in every action.)

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/pages/actions.ts
git commit -m "feat: PYH-only page CMS server actions (seo, add/update/delete/reorder/hide, image upload)"
```

---

### Task 7: Admin UI — /admin/pages list + editor

**Files:**
- Create: `src/app/admin/pages/page.tsx`
- Create: `src/app/admin/pages/[slug]/edit/page.tsx`
- Create: `src/app/admin/pages/_components/page-editor.tsx`
- Create: `src/app/admin/pages/_components/section-form.tsx`
- Create: `src/app/admin/pages/_components/seo-form.tsx`
- Modify: `src/app/admin/_components/admin-shell.tsx`

**Interfaces:**
- Consumes: `REGISTRY`, `EditorField`, actions from Task 6, `ICON_NAMES`.
- Produces: admin screens. No new exported library API.

- [ ] **Step 1: Add the nav entry in `src/app/admin/_components/admin-shell.tsx`**

After the `events` entry in the nav array, add:

```ts
  { key: "pages", href: "/admin/pages", label: "Pages", pyhOnly: true },
```

- [ ] **Step 2: Write `src/app/admin/pages/page.tsx`** (server component — PYH-gated list)

```tsx
import Link from "next/link";
import { requirePYH } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { PageRow } from "@/lib/supabase/database.types";

export default async function AdminPagesList() {
  await requirePYH();
  const { data } = await createServiceClient().from("pages").select("*").order("sort_order");
  const pages = (data as PageRow[] | null) ?? [];
  return (
    <div className="mt-6 grid max-w-2xl gap-3">
      <h1 className="text-xs font-semibold uppercase tracking-wide text-muted">Pages</h1>
      {pages.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border border-black/5 p-3 dark:border-white/10">
          <div>
            <span className="font-semibold">{p.title}</span>
            <span className="ml-2 text-sm text-muted">/{p.slug === "home" ? "" : p.slug}</span>
          </div>
          <Link href={`/admin/pages/${p.slug}/edit`} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 dark:text-royal-300">Edit</Link>
        </div>
      ))}
      {pages.length === 0 && <p className="text-sm text-muted">No pages yet.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/app/admin/pages/[slug]/edit/page.tsx`** (server component — loads sections, renders client editor)

```tsx
import { notFound } from "next/navigation";
import { requirePYH } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { PageRow, PageSectionRow } from "@/lib/supabase/database.types";
import { PageEditor } from "../../_components/page-editor";

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePYH();
  const { slug } = await params;
  const svc = createServiceClient();
  const { data } = await svc.from("pages").select("*, page_sections(*)").eq("slug", slug).maybeSingle();
  if (!data) notFound();
  const page = data as PageRow & { page_sections: PageSectionRow[] };
  const sections = [...page.page_sections].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <PageEditor
      pageId={page.id}
      slug={page.slug}
      seoTitle={page.seo_title ?? ""}
      seoDescription={page.seo_description ?? ""}
      sections={sections.map((s) => ({ id: s.id, type: s.type, content: s.content, visible: s.visible }))}
    />
  );
}
```

- [ ] **Step 4: Write `src/app/admin/pages/_components/seo-form.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { updatePageSeo } from "../actions";

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export function SeoForm({ pageId, seoTitle, seoDescription }: { pageId: string; seoTitle: string; seoDescription: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const res = await updatePageSeo(pageId, fd);
      setMsg(res.error ?? "Saved.");
    });
  }
  return (
    <form onSubmit={onSubmit} className="glass grid gap-3 rounded-2xl p-6">
      <h2 className={label}>SEO</h2>
      <label className="block"><span className={label}>Title</span>
        <input name="seo_title" defaultValue={seoTitle} className={field} /></label>
      <label className="block"><span className={label}>Description</span>
        <textarea name="seo_description" defaultValue={seoDescription} rows={2} className={field} /></label>
      {msg && <p className="text-xs font-semibold text-muted">{msg}</p>}
      <div><button type="submit" disabled={pending} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300">Save SEO</button></div>
    </form>
  );
}
```

- [ ] **Step 5: Write `src/app/admin/pages/_components/section-form.tsx`** (renders `editorFields`; edits a local content draft, saves via `updateSectionContent`; image via `uploadSectionImage`)

```tsx
"use client";
import { useState, useTransition } from "react";
import { REGISTRY, type EditorField } from "@/lib/pages/registry";
import { ICON_NAMES } from "@/lib/pages/icons";
import { updateSectionContent, uploadSectionImage } from "../actions";

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

function getAt(obj: any, key: string) { return obj?.[key]; }
function setAt(obj: any, key: string, value: any) { return { ...obj, [key]: value }; }

function FieldInput({ f, value, onChange }: { f: EditorField; value: any; onChange: (v: any) => void }) {
  if (f.kind === "text") return <label className="block"><span className={label}>{f.label}</span><input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={field} /></label>;
  if (f.kind === "textarea") return <label className="block"><span className={label}>{f.label}</span><textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} className={field} /></label>;
  if (f.kind === "icon") return <label className="block"><span className={label}>{f.label}</span><select value={value ?? ICON_NAMES[0]} onChange={(e) => onChange(e.target.value)} className={field}>{ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>;
  if (f.kind === "select") return <label className="block"><span className={label}>{f.label}</span><select value={value ?? f.options[0]} onChange={(e) => onChange(e.target.value)} className={field}>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
  if (f.kind === "list") {
    const items: any[] = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2"><span className={label}>{f.label}</span>
        {items.map((item, idx) => (
          <div key={idx} className="grid gap-2 rounded-xl border border-black/5 p-3 dark:border-white/10">
            {f.itemFields.map((itf) => <FieldInput key={itf.key} f={itf} value={getAt(item, itf.key)} onChange={(v) => { const next = [...items]; next[idx] = setAt(item, itf.key, v); onChange(next); }} />)}
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))} className="justify-self-start rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600">Remove item</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, {}])} className="justify-self-start rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 dark:text-royal-300">Add item</button>
      </div>
    );
  }
  // image
  return <span className={label}>{f.label}: use the image upload below.</span>;
}

export function SectionForm({ sectionId, type, content }: { sectionId: string; type: string; content: any }) {
  const def = REGISTRY[type];
  const [draft, setDraft] = useState<any>(content ?? {});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!def) return <p className="text-xs text-rose-600">Unknown section type: {type}</p>;

  const hasImage = def.editorFields.some((f) => f.kind === "image");
  function save() { setMsg(null); start(async () => { const r = await updateSectionContent(sectionId, draft); setMsg(r.error ?? "Saved."); }); }
  function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const imgField = def.editorFields.find((f) => f.kind === "image");
    if (!imgField) return;
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => { const r = await uploadSectionImage(sectionId, imgField.key, fd); setMsg(r.error ?? "Image updated. Reload to see it."); });
  }

  return (
    <div className="grid gap-3">
      {def.editorFields.filter((f) => f.kind !== "image").map((f) => (
        <FieldInput key={f.key} f={f} value={getAt(draft, f.key)} onChange={(v) => setDraft(setAt(draft, f.key, v))} />
      ))}
      <div><button type="button" onClick={save} disabled={pending} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300">Save section</button></div>
      {hasImage && (
        <form onSubmit={upload} className="grid gap-2 border-t border-black/5 pt-3 dark:border-white/10">
          <span className={label}>Replace image</span>
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className={field} />
          <div><button type="submit" disabled={pending} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300">Upload image</button></div>
        </form>
      )}
      {msg && <p className="text-xs font-semibold text-muted">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Write `src/app/admin/pages/_components/page-editor.tsx`** (sections list: reorder/hide/delete/add + embeds `SectionForm`, `SeoForm`)

```tsx
"use client";
import { useState, useTransition } from "react";
import { REGISTRY } from "@/lib/pages/registry";
import { SectionForm } from "./section-form";
import { SeoForm } from "./seo-form";
import { addSection, deleteSection, reorderSection, toggleSectionVisible } from "../actions";

const label = "text-xs font-semibold uppercase tracking-wide text-muted";
const pill = "rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300";

type S = { id: string; type: string; content: unknown; visible: boolean };

export function PageEditor({ pageId, slug, seoTitle, seoDescription, sections }: {
  pageId: string; slug: string; seoTitle: string; seoDescription: string; sections: S[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newType, setNewType] = useState<string>(Object.keys(REGISTRY)[0]);
  const run = (fn: () => Promise<{ error?: string }>) => { setError(null); start(async () => { const r = await fn(); if (r.error) setError(r.error); }); };

  return (
    <div className="mt-6 grid max-w-2xl gap-6">
      <div>
        <h1 className="text-lg font-semibold">Edit page: {slug}</h1>
        <p className="text-sm text-muted">Changes publish immediately. Reorder, hide, add, or remove sections.</p>
      </div>

      <SeoForm pageId={pageId} seoTitle={seoTitle} seoDescription={seoDescription} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 p-3 dark:border-white/10">
        <span className={label}>Add section</span>
        <select value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded-xl border border-black/10 bg-white/60 px-3 py-1 text-sm dark:border-white/10 dark:bg-white/5">
          {Object.entries(REGISTRY).map(([t, d]) => <option key={t} value={t}>{d.label}</option>)}
        </select>
        <button type="button" disabled={pending} className={pill} onClick={() => run(() => addSection(pageId, newType))}>Add</button>
      </div>

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <div className="grid gap-3">
        {sections.map((s, i) => (
          <div key={s.id} className="rounded-2xl border border-black/5 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{REGISTRY[s.type]?.label ?? s.type}</span>
              {!s.visible && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-muted dark:bg-white/10">hidden</span>}
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" aria-label="Move up" disabled={pending || i === 0} className={pill} onClick={() => run(() => reorderSection(s.id, "up"))}>&#9650;</button>
                <button type="button" aria-label="Move down" disabled={pending || i === sections.length - 1} className={pill} onClick={() => run(() => reorderSection(s.id, "down"))}>&#9660;</button>
                <button type="button" disabled={pending} className={pill} onClick={() => run(() => toggleSectionVisible(s.id))}>{s.visible ? "Hide" : "Show"}</button>
                <button type="button" className={pill} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Close" : "Edit"}</button>
                <button type="button" disabled={pending} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40" onClick={() => { if (confirm("Delete this section?")) run(() => deleteSection(s.id)); }}>Delete</button>
              </div>
            </div>
            {open === s.id && <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10"><SectionForm sectionId={s.id} type={s.type} content={s.content} /></div>}
          </div>
        ))}
        {sections.length === 0 && <p className="text-sm text-muted">No sections yet. Add one above.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new errors. Kill stray dev servers, then `npm run build` → exit 0, `/admin/pages` and `/admin/pages/[slug]/edit` routes present.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/pages src/app/admin/_components/admin-shell.tsx
git commit -m "feat: /admin/pages list + section editor (reorder/hide/add/delete/SEO/image)"
```

---

### Task 8: End-to-end verification

**Files:** none (verification + progress ledger).

- [ ] **Step 1: Full automated suite** — kill stray dev servers first.

Run each and record output:
- `npx tsc --noEmit` → clean
- `npm run lint` → only the known pre-existing `events-board.tsx:26` warning
- `npm run build` → exit 0
- `npm run prove:pages` → `20 passed, 0 failed`
- `npm run prove:rbac` → `19 passed, 0 failed`
- `npm run prove:uploads` → `14 passed, 0 failed`
- `npm run prove:behaviors` → `6 passed, 0 failed`

- [ ] **Step 2: Byte-identical `/about` diff.** Start `npm run dev`. Capture `curl -s http://localhost:3000/about > /tmp/about-new.html`. Check out the pre-slice About (`git show HEAD~7:src/app/about/page.tsx`) is not needed — instead confirm structurally: the page renders hero, who-we-are (text+image), mission/vision cards, values grid (6 items), and timeline (6 milestones) in that order, with identical copy. Confirm no console errors and animations play.

- [ ] **Step 3: Live admin edit loop** (real UI). Sign in as a PYH admin. Go to `/admin/pages` → About → Edit. Verify: (a) editing the hero title + Save section reflects on `/about` after reload; (b) reorder moves a section; (c) Hide removes it from `/about`, Show restores it; (d) uploading a new image for the text-image section replaces it and the old owned object is reaped (only if it was an uploaded, non-seed image); (e) editing SEO changes the `<title>`. Revert any test edits.

- [ ] **Step 4: Negative check.** Sign in as a cluster head; confirm `/admin/pages` is not shown in nav and navigating directly to `/admin/pages` redirects (requirePYH → `/admin?error=forbidden`).

- [ ] **Step 5: Update the progress ledger** `.superpowers/sdd/progress.md` with a Slice 3.1 section summarizing tasks, decisions, and any deferred minors. Commit.

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: page CMS slice 3.1 progress ledger"
```

---

## Self-Review

**Spec coverage:**
- Section-registry model → Tasks 1,3 (schemas + registry). ✓
- `pages`/`page_sections` + RLS + reap + audit → Tasks 2,5,6. ✓
- PYH-only, direct publish, revalidate → Task 6 (`requirePYH` first statement; `revalidateFor`). ✓
- Embed video / plain text / SEO → SEO in Tasks 2,4,6,7; video is explicitly a later slice (§11 non-goals) so no video task here. ✓
- Byte-identical About → Tasks 3 (verbatim extraction), 4 (fallback mirrors seed), 8 (diff). ✓
- Admin add/remove/reorder/hide + editor → Task 7. ✓
- New pages / catch-all / nav wiring → correctly deferred to Slice 3.3 (not in this plan). ✓
- prove-pages test suite (RLS, validation, reap, fallback) → grows across Tasks 1,2,4,5; final run Task 8. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". All code shown in full. ✓

**Type consistency:** `getPage`/`getPageMeta`/`PageMeta` consistent across Tasks 4,6,7. `RenderableSection` from `section-renderer` reused by `fallback.ts` and `pages.ts`. `EditorField`/`REGISTRY`/`SectionDef` defined in Task 3, consumed in Task 7. Action names (`updatePageSeo`, `addSection`, `updateSectionContent`, `uploadSectionImage`, `deleteSection`, `reorderSection`, `toggleSectionVisible`) match between Task 6 definitions and Task 7 imports. `collectImagePaths`/`reapPaths`/`pageImageKey` defined in Task 5, used in Task 6. ✓

**Note for the implementer:** `getPage` is `server-only` and cannot be imported by the node proof script; that is why fallback data lives in the plain `src/lib/pages/fallback.ts`, which both `getPage` and `prove-pages.mjs` import. Do not move fallback data into `pages.ts`.
