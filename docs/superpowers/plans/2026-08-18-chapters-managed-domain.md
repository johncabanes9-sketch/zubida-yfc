# Chapters Managed Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invented `src/data/chapters.ts` fixture with a database-backed chapters directory that a provincial youth head manages province-wide and a cluster head manages for their own cluster only.

**Architecture:** A `chapters` table with a foreign key to the existing `clusters` RBAC table, guarded by row-level security that scopes writes by cluster. The public `/chapters` page reads published rows through a data function shaped like the existing `getPage()`, falling back to the existing `UnpublishedNotice` when nothing is published. Admin CRUD lives at `/admin/chapters` and reuses the image upload and reap machinery already built for the page CMS.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Supabase (Postgres, Auth, Storage, RLS) · plain `.mjs` assertion suites following the six existing `prove:*` scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-chapters-managed-domain-design.md`

## Global Constraints

- **Real numbers only, real information only.** No task may seed, default, or fabricate chapter data. The migration inserts zero chapter rows.
- **No placeholder imagery.** No `picsum.photos` or `i.pravatar.cc` URL may reach a chapter record. A chapter with no photo renders without one.
- **Required fields are `name`, `municipality`, `cluster_id` only.** Every other field must save blank. A required field with no known value is what makes someone type something plausible.
- **RLS assertions run through an authenticated client, never the service-role client.** The service-role client bypasses RLS entirely, so a policy test written against it passes no matter what the policy says.
- **Every policy assertion gets RED-first verification** — break the policy, confirm the assertion fails, restore it.
- **`is_published` defaults to `false`.** Nothing reaches the public page by being saved.
- Suites are plain `.mjs` using the shared `check()` harness, print `N passed, M failed`, and exit non-zero on failure.
- Commit after every task. Conventional commit format (`feat:`, `fix:`, `test:`, `docs:`).

---

## File Structure

**Created:**
- `supabase/migrations/0023_chapters.sql` — table, indexes, RLS enabled
- `supabase/migrations/0024_chapters_rls.sql` — `admin_cluster()` helper and four policies
- `scripts/prove-chapters.mjs` — the assertion suite, grown across tasks
- `src/lib/data/chapters.ts` — `getChapters()` public read with outage fallback
- `src/lib/chapters/paths.ts` — storage object key helper
- `src/app/admin/chapters/page.tsx` — admin list
- `src/app/admin/chapters/actions.ts` — server actions
- `src/app/admin/chapters/_components/chapter-form.tsx` — create/edit form

**Modified:**
- `package.json` — add `prove:chapters`
- `src/lib/supabase/database.types.ts` — add `ChapterRow` and the `chapters` table entry
- `src/app/chapters/page.tsx` — read the database instead of the fixture
- `src/components/chapters/chapters-explorer.tsx` — re-type from `Chapter` to `ChapterRow`
- `src/lib/content/fixtures.ts` — remove the `"chapters"` domain
- `src/app/admin/_components/*` — add the Chapters nav entry
- `scripts/prove-content.mjs` — assert the fixture is gone

**Deleted:**
- `src/data/chapters.ts` — invented content

---

### Task 1: Migration and suite scaffold

**Files:**
- Create: `supabase/migrations/0023_chapters.sql`
- Create: `scripts/prove-chapters.mjs`
- Modify: `package.json` (scripts block)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: the existing `clusters` table (`id uuid primary key`)
- Produces: table `chapters`; type `ChapterRow`; npm script `prove:chapters`

- [ ] **Step 1: Write the failing test**

Create `scripts/prove-chapters.mjs`:

```javascript
// Proves the chapters directory: schema, cluster-scoped RLS, public withholding,
// soft delete, and that no fabricated content can enter the table.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("Missing Supabase env vars."); process.exit(1); }

const admin = createClient(url, service, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

console.log("\n── Schema ──");

// The table exists and is reachable.
const probe = await admin.from("chapters").select("id").limit(1);
check("the chapters table exists", !probe.error, probe.error?.message);

// The migration must seed nothing. This is the content rule made executable:
// a later seed intended to make the page look finished fails here.
const all = await admin.from("chapters").select("id");
check("the migration seeds zero chapter rows", (all.data?.length ?? 0) === 0, all.data?.length);

const sql = readFileSync(join(root, "supabase/migrations/0023_chapters.sql"), "utf8");
check("the migration inserts no chapter rows", !/insert\s+into\s+chapters/i.test(sql), null);
check("the migration carries no placeholder imagery",
  !/picsum\.photos|i\.pravatar\.cc/i.test(sql), null);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

Add to `package.json` scripts, after `"prove:editor"`:

```json
"prove:chapters": "node scripts/prove-chapters.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:chapters`
Expected: FAIL on "the chapters table exists" with a message like `relation "public.chapters" does not exist`, then the script throws reading the missing migration file. Both are the expected RED.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0023_chapters.sql`:

```sql
-- Chapters directory. Replaces src/data/chapters.ts, whose twelve entries were
-- invented for the Phase-1 showcase. This table ships EMPTY: real chapters are
-- entered through /admin/chapters by an authorized administrator.
create table if not exists chapters (
  id            uuid primary key default gen_random_uuid(),
  cluster_id    uuid not null references clusters(id) on delete restrict,
  name          text not null,
  slug          text not null unique,
  municipality  text not null,
  -- Nullable by design: a chapter may be published with its coordinator or
  -- schedule genuinely withheld rather than invented.
  schedule      text,
  coordinator   text,
  cover_path    text,
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  deleted_at    timestamptz
);

create index if not exists chapters_cluster_idx on chapters (cluster_id);
create index if not exists chapters_public_idx on chapters (is_published, deleted_at);

-- Enabled here, policies land in 0024. With RLS on and no policies, every
-- non-service-role client is denied by default, which is the correct interim
-- state: a table that is readable before its policies exist is a leak.
alter table chapters enable row level security;
```

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate`
Expected: exit 0, `0023_chapters.sql` reported as applied.

- [ ] **Step 5: Add the row type**

In `src/lib/supabase/database.types.ts`, add alongside `AdminRow`:

```typescript
export interface ChapterRow {
  id: string;
  cluster_id: string;
  name: string;
  slug: string;
  municipality: string;
  schedule: string | null;
  coordinator: string | null;
  cover_path: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
}
```

And in the `Tables` block, alongside `admins`:

```typescript
chapters: Table<ChapterRow, Partial<ChapterRow>, Partial<ChapterRow>>;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run prove:chapters`
Expected: `4 passed, 0 failed`

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0023_chapters.sql scripts/prove-chapters.mjs package.json src/lib/supabase/database.types.ts
git commit -m "feat: add the chapters table, empty by design"
```

---

### Task 2: Cluster-scoped row-level security

This is the sharp edge of the slice. A too-permissive policy looks identical to a correct one until someone edits another cluster's data.

**Files:**
- Create: `supabase/migrations/0024_chapters_rls.sql`
- Modify: `scripts/prove-chapters.mjs`

**Interfaces:**
- Consumes: `chapters` table (Task 1); existing `is_pyh(uuid)` from `0008b_admins_rbac.sql`
- Produces: SQL function `admin_cluster(uuid) returns uuid`; policies `chapters_public_read`, `chapters_admin_read`, `chapters_pyh_write`, `chapters_cluster_write`

- [ ] **Step 1: Write the failing tests**

Add to `scripts/prove-chapters.mjs`, before the summary lines:

```javascript
// ── Fixtures: two clusters, a PYH, a cluster head confined to cluster A ──
const stamp = Date.now();
const PW = "ProveChapters!2026";

async function mkUser(email) {
  const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (c.error) {
    if (!/already/i.test(c.error.message)) throw c.error;
    const l = await admin.auth.admin.listUsers();
    return l.data.users.find((u) => u.email === email).id;
  }
  return c.data.user.id;
}

// RLS is only meaningful through an authenticated client. The service-role
// client bypasses RLS entirely, so a policy assertion written against `admin`
// passes no matter what the policy says.
async function authedClient(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}

const anonClient = createClient(url, anon, { auth: { persistSession: false } });

const pyhEmail = `chapters_pyh_${stamp}@test.com`;
const chEmail = `chapters_ch_${stamp}@test.com`;
const pyhId = await mkUser(pyhEmail);
const chId = await mkUser(chEmail);

const { data: clusters } = await admin.from("clusters").select("id,name").order("name");
const clusterA = clusters[0].id, clusterB = clusters[1].id;

await admin.from("admins").upsert(
  { user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Chapters PYH" },
  { onConflict: "user_id" });
await admin.from("admins").upsert(
  { user_id: chId, role: "cluster_head", cluster_id: clusterA, is_active: true, full_name: "Chapters CH" },
  { onConflict: "user_id" });

const { data: rowA } = await admin.from("chapters").insert({
  cluster_id: clusterA, name: `A ${stamp}`, slug: `a-${stamp}`, municipality: "Test A", is_published: true,
}).select("id").single();
const { data: rowB } = await admin.from("chapters").insert({
  cluster_id: clusterB, name: `B ${stamp}`, slug: `b-${stamp}`, municipality: "Test B", is_published: true,
}).select("id").single();
const { data: rowDraft } = await admin.from("chapters").insert({
  cluster_id: clusterA, name: `Draft ${stamp}`, slug: `draft-${stamp}`, municipality: "Test D", is_published: false,
}).select("id").single();

const ch = await authedClient(chEmail);
const pyh = await authedClient(pyhEmail);

console.log("\n── Public read ──");

const pubPublished = await anonClient.from("chapters").select("id").eq("id", rowA.id);
check("anonymous readers see a published chapter", pubPublished.data?.length === 1, pubPublished.data);

const pubDraft = await anonClient.from("chapters").select("id").eq("id", rowDraft.id);
check("anonymous readers cannot see a draft chapter", (pubDraft.data?.length ?? 0) === 0, pubDraft.data);

console.log("\n── A cluster head is confined to their own cluster ──");

const chReadB = await ch.from("chapters").select("id").eq("id", rowB.id);
check("a cluster head CAN read another cluster's chapter", chReadB.data?.length === 1, chReadB.data);

const chWriteA = await ch.from("chapters").update({ municipality: "Edited by CH" }).eq("id", rowA.id).select("municipality");
check("a cluster head CAN edit their own cluster's chapter",
  chWriteA.data?.[0]?.municipality === "Edited by CH", chWriteA.error?.message ?? chWriteA.data);

// RLS denies by filtering: the update succeeds with zero rows affected.
const chWriteB = await ch.from("chapters").update({ municipality: "hacked" }).eq("id", rowB.id).select("municipality");
check("a cluster head CANNOT edit another cluster's chapter",
  (chWriteB.data?.length ?? 0) === 0, chWriteB.data);

const chMove = await ch.from("chapters").update({ cluster_id: clusterB }).eq("id", rowA.id).select("id");
check("a cluster head CANNOT move a chapter into another cluster",
  (chMove.data?.length ?? 0) === 0, chMove.data);

const chDeleteB = await ch.from("chapters").update({ deleted_at: new Date().toISOString() }).eq("id", rowB.id).select("id");
check("a cluster head CANNOT soft-delete another cluster's chapter",
  (chDeleteB.data?.length ?? 0) === 0, chDeleteB.data);

const chInsertB = await ch.from("chapters").insert({
  cluster_id: clusterB, name: `CH into B ${stamp}`, slug: `chb-${stamp}`, municipality: "Nope",
}).select("id");
check("a cluster head CANNOT create a chapter in another cluster",
  (chInsertB.data?.length ?? 0) === 0 || !!chInsertB.error, chInsertB.data);

console.log("\n── The PYH is not confined ──");

const pyhWriteB = await pyh.from("chapters").update({ municipality: "Edited by PYH" }).eq("id", rowB.id).select("municipality");
check("the PYH CAN edit any cluster's chapter",
  pyhWriteB.data?.[0]?.municipality === "Edited by PYH", pyhWriteB.error?.message ?? pyhWriteB.data);

console.log("\n── Cleanup ──");
await admin.from("chapters").delete().in("id", [rowA.id, rowB.id, rowDraft.id]);
await admin.from("admins").delete().in("user_id", [pyhId, chId]);
await admin.auth.admin.deleteUser(pyhId);
await admin.auth.admin.deleteUser(chId);
const leftover = await admin.from("chapters").select("id").like("slug", `%-${stamp}`);
check("the suite left no chapters behind", (leftover.data?.length ?? 0) === 0, leftover.data);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run prove:chapters`
Expected: the public-read and PYH/cluster-head write assertions FAIL. With RLS enabled and no policies (Task 1), every non-service-role client is denied, so reads return zero rows and writes affect zero rows. The "CANNOT" assertions will pass at this stage — that is expected and is exactly why Step 6 exists.

- [ ] **Step 3: Write the policies**

Create `supabase/migrations/0024_chapters_rls.sql`:

```sql
-- Returns the cluster an active admin is scoped to, or null for a PYH (whose
-- cluster_id is null) and for anyone who is not an active admin. Mirrors
-- is_pyh() in 0008b_admins_rbac.sql.
create or replace function admin_cluster(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cluster_id from admins
  where user_id = uid and deleted_at is null and is_active = true
$$;

-- Public: published, undeleted rows only.
drop policy if exists chapters_public_read on chapters;
create policy chapters_public_read on chapters for select to anon, authenticated
  using (is_published = true and deleted_at is null);

-- Any active admin reads the whole province. Read is deliberately NOT scoped:
-- hiding the province from the people running parts of it buys no
-- confidentiality, and the admin list is more useful whole.
drop policy if exists chapters_admin_read on chapters;
create policy chapters_admin_read on chapters for select to authenticated
  using (is_pyh(auth.uid()) or admin_cluster(auth.uid()) is not null);

drop policy if exists chapters_pyh_write on chapters;
create policy chapters_pyh_write on chapters for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- `with check` as well as `using`: without it a cluster head could move a row
-- into another cluster, which `using` alone does not prevent.
--
-- admin_cluster() returns null for a PYH, so `cluster_id = null` evaluates to
-- null, which is falsy — the PYH is covered solely by chapters_pyh_write. The
-- same holds for a malformed cluster head with a null cluster_id: the
-- comparison denies rather than permits. Do not "fix" this with coalesce.
drop policy if exists chapters_cluster_write on chapters;
create policy chapters_cluster_write on chapters for all to authenticated
  using (cluster_id = admin_cluster(auth.uid()))
  with check (cluster_id = admin_cluster(auth.uid()));
```

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate`
Expected: exit 0, `0024_chapters_rls.sql` applied.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run prove:chapters`
Expected: `15 passed, 0 failed`

- [ ] **Step 6: RED-first verification of the negative assertions**

The "CANNOT" assertions passed in Step 2 with no policies at all, which means passing does not by itself prove they work. Verify each one can fail.

Temporarily widen the cluster policy — in `0024_chapters_rls.sql`, replace both
`cluster_id = admin_cluster(auth.uid())` clauses with `true`, re-apply with
`npm run db:migrate`, and run `npm run prove:chapters`.

Expected: these four assertions now FAIL:
- a cluster head CANNOT edit another cluster's chapter
- a cluster head CANNOT move a chapter into another cluster
- a cluster head CANNOT soft-delete another cluster's chapter
- a cluster head CANNOT create a chapter in another cluster

Then restore both clauses, re-apply, and confirm `15 passed, 0 failed` again.
Do not proceed until you have seen those four fail and pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0024_chapters_rls.sql scripts/prove-chapters.mjs
git commit -m "feat: scope chapter writes to a cluster head's own cluster"
```

---

### Task 3: Public data layer

**Files:**
- Create: `src/lib/data/chapters.ts`
- Modify: `scripts/prove-chapters.mjs`

**Interfaces:**
- Consumes: `ChapterRow` (Task 1); `createServiceClient` from `@/lib/supabase/server`; `publicUrl` from `@/lib/images/paths`
- Produces: `getChapters(): Promise<PublicChapter[]>` and `export type PublicChapter = { id, name, slug, municipality, schedule, coordinator, cover, clusterName }`

- [ ] **Step 1: Write the failing test**

Add to `scripts/prove-chapters.mjs`, immediately before the Cleanup block:

```javascript
console.log("\n── Public data layer ──");

const { getChapters } = await import("../src/lib/data/chapters.ts");
const published = await getChapters();
const ids = published.map((c) => c.id);
check("getChapters returns published chapters", ids.includes(rowA.id), ids);
check("getChapters omits drafts", !ids.includes(rowDraft.id), ids);

await admin.from("chapters").update({ deleted_at: new Date().toISOString() }).eq("id", rowB.id);
const afterDelete = (await getChapters()).map((c) => c.id);
check("a soft-deleted chapter leaves the public list", !afterDelete.includes(rowB.id), afterDelete);

const withoutCover = published.find((c) => c.id === rowA.id);
check("a chapter with no cover_path yields cover === null", withoutCover?.cover === null, withoutCover?.cover);
```

Change the `prove:chapters` script in `package.json` to strip types, matching
`prove:pages` and `prove:content`, because the suite now imports a `.ts` module:

```json
"prove:chapters": "node --experimental-strip-types scripts/prove-chapters.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:chapters`
Expected: FAIL — the import throws `Cannot find module '../src/lib/data/chapters.ts'`.

- [ ] **Step 3: Write the data function**

Create `src/lib/data/chapters.ts`:

```typescript
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { ChapterRow } from "@/lib/supabase/database.types";
import { publicUrl } from "@/lib/images/paths";

export type PublicChapter = {
  id: string;
  name: string;
  slug: string;
  municipality: string;
  /** null when the organization has not confirmed it — render nothing, never a stand-in. */
  schedule: string | null;
  coordinator: string | null;
  cover: string | null;
  clusterName: string | null;
};

/**
 * Published, undeleted chapters in display order. Returns [] whenever the
 * database is unreachable — the page renders its withholding notice rather than
 * failing, which is the same degradation getPage() uses. There is deliberately
 * no fixture fallback: an outage must not resurrect invented chapters.
 */
export async function getChapters(): Promise<PublicChapter[]> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("chapters")
      .select("*, clusters(name)")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return [];

    return (data as (ChapterRow & { clusters: { name: string } | null })[]).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      municipality: r.municipality,
      schedule: r.schedule,
      coordinator: r.coordinator,
      cover: r.cover_path ? publicUrl(r.cover_path) : null,
      clusterName: r.clusters?.name ?? null,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run prove:chapters`
Expected: `20 passed, 0 failed`

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/chapters.ts scripts/prove-chapters.mjs package.json
git commit -m "feat: read published chapters from the database"
```

---

### Task 4: Public page, and retire the fixture

**Files:**
- Modify: `src/app/chapters/page.tsx`
- Modify: `src/components/chapters/chapters-explorer.tsx`
- Modify: `src/lib/content/fixtures.ts`
- Modify: `scripts/prove-content.mjs`
- Delete: `src/data/chapters.ts`

**Interfaces:**
- Consumes: `getChapters()` and `PublicChapter` (Task 3)
- Produces: a `/chapters` page with no fixture dependency

- [ ] **Step 1: Write the failing test**

Add to `scripts/prove-content.mjs`, in the section that asserts fixture gating:

```javascript
check("the chapters fixture is deleted", tryRead("src/data/chapters.ts") === "", null);
check("chapters is no longer a fixture domain",
  !/"chapters"/.test(read("src/lib/content/fixtures.ts")), null);
check("the chapters page reads the database, not the fixture",
  code("src/app/chapters/page.tsx").includes("getChapters")
  && !code("src/app/chapters/page.tsx").includes("isVerified"), null);
// An empty directory must withhold, not render an empty grid. Asserted at the
// source because the alternative is a browser, and prove:editor already owns
// that cost for the one page that needs it.
check("an empty chapters list renders the withholding notice",
  /chapters\.length\s*>\s*0\s*\?/.test(code("src/app/chapters/page.tsx"))
  && code("src/app/chapters/page.tsx").includes("UnpublishedNotice"), null);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:content`
Expected: FAIL on all three — the fixture still exists, `"chapters"` is still in `FixtureDomain`, and the page still calls `isVerified`.

- [ ] **Step 3: Rewrite the page**

Replace `src/app/chapters/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ChaptersExplorer } from "@/components/chapters/chapters-explorer";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { getChapters } from "@/lib/data/chapters";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Chapters",
  description:
    "Explore the Youth for Christ chapters across the municipalities of Zamboanga del Sur.",
};

export default async function ChaptersPage() {
  const chapters = await getChapters();
  return (
    <>
      {/* Title carried the unverified "twenty-six" figure; the count is not
          published anywhere until the real chapter roster is confirmed. */}
      <PageHeader
        eyebrow="Our Chapters"
        title="One province, many homes"
        subtitle="From the bay of Pagadian to the hills of the north, find the Zubida YFC chapter nearest you and see what God is doing there."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {chapters.length > 0 ? (
          <ChaptersExplorer chapters={chapters} />
        ) : (
          <UnpublishedNotice
            title="Our chapter directory isn't published yet"
            detail="Chapter locations, meeting schedules, and coordinators are being confirmed with the provincial team. To find the chapter nearest you in the meantime, please get in touch through our Contact page."
          />
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Re-type the explorer**

In `src/components/chapters/chapters-explorer.tsx`: remove the
`import { chapters } from "@/data/chapters"` module-level import, accept
`{ chapters }: { chapters: PublicChapter[] }` as props, and import the type from
`@/lib/data/chapters`.

Two fields no longer exist and their UI must go: `memberCount` and `upcoming`.
Wherever the card renders them, delete the element rather than substituting a
placeholder. Where `cluster` was a string, use `clusterName`, which may be null.
Where `cover` may be null, render the card without an image rather than a
fallback graphic.

- [ ] **Step 5: Delete the fixture and its domain**

```bash
git rm src/data/chapters.ts
```

In `src/lib/content/fixtures.ts`, remove `| "chapters"` from `FixtureDomain` and
delete the `chapters: false,` entry with its comment.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run prove:content`
Expected: `92 passed, 0 failed` (89 existing plus the 3 new)

Run: `npx tsc --noEmit` — exit 0. This is the step that surfaces every remaining
reference to the deleted fixture; fix each by removing the usage, never by
reintroducing sample data.

Run: `npm run lint` — clean.

- [ ] **Step 7: Verify the page renders both states**

Run `npm run dev`, then visit `http://localhost:3000/chapters`.
Expected with an empty table: the page header plus the "isn't published yet"
notice — visually identical to today.

To check the populated state before the admin UI exists (Task 5), insert one row
from a scratch script, look at the page, then remove both:

```bash
cat > scripts/tmp-one-chapter.mjs <<'JS'
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { data: c } = await db.from("clusters").select("id").order("name").limit(1).single();
const { data, error } = await db.from("chapters").insert({
  cluster_id: c.id, name: "Layout Check", slug: "layout-check",
  municipality: "Layout Check", is_published: true,
}).select("id").single();
console.log(error ?? data.id);
JS
node scripts/tmp-one-chapter.mjs
```

Confirm the card renders with no member count and no upcoming event, then clean
up — the row is a layout probe, not content:

```bash
node -e "import('@supabase/supabase-js').then(async ({createClient})=>{const d=(await import('dotenv')).default;d.config({path:'.env.local'});const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);await db.from('chapters').delete().eq('slug','layout-check');console.log('removed')})"
rm scripts/tmp-one-chapter.mjs
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: render /chapters from the database and delete the invented fixture"
```

---

### Task 5: Admin CRUD

**Files:**
- Create: `src/app/admin/chapters/page.tsx`
- Create: `src/app/admin/chapters/actions.ts`
- Create: `src/app/admin/chapters/_components/chapter-form.tsx`
- Modify: the admin nav component under `src/app/admin/_components/`
- Modify: `scripts/prove-chapters.mjs`

**Interfaces:**
- Consumes: `requireClusterAccess(clusterId: string | null)` and `createServerSupabase` from `@/lib/supabase/admin-auth`; `createServiceClient` from `@/lib/supabase/server`
- Produces: `createChapter(formData: FormData): Promise<{ error?: string }>`, `updateChapter(id: string, formData: FormData): Promise<{ error?: string }>`, `deleteChapter(id: string): Promise<{ error?: string }>`

- [ ] **Step 1: Write the failing test**

Add to `scripts/prove-chapters.mjs`, before Cleanup:

```javascript
console.log("\n── Partial saves ──");

// Only name, municipality and cluster are required. A required field with no
// known value is what makes someone type something plausible.
const partial = await admin.from("chapters").insert({
  cluster_id: clusterA, name: `Partial ${stamp}`, slug: `partial-${stamp}`, municipality: "Test P",
}).select("id, coordinator, schedule, is_published").single();
check("a chapter saves with coordinator and schedule blank",
  !partial.error && partial.data.coordinator === null && partial.data.schedule === null,
  partial.error?.message ?? partial.data);
check("a new chapter is unpublished by default", partial.data?.is_published === false, partial.data);

const dupe = await admin.from("chapters").insert({
  cluster_id: clusterA, name: "Dupe", slug: `partial-${stamp}`, municipality: "Test",
}).select("id");
check("the database rejects a duplicate slug", !!dupe.error, dupe.error?.message ?? dupe.data);

await admin.from("chapters").delete().eq("id", partial.data.id);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:chapters`
Expected: these three FAIL only if the schema is wrong. If they pass immediately,
that is correct — Task 1's schema already guarantees them, and these assertions
exist to keep a later "make coordinator required" change from breaking the
content rule silently. Record that they passed and continue.

- [ ] **Step 3: Write the server actions**

Create `src/app/admin/chapters/actions.ts`:

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { ChapterRow } from "@/lib/supabase/database.types";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Trimmed, or null when blank — blank means withheld, never an empty string. */
const optional = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log")
      .insert({ actor_user_id: userId, action, entity: "chapters", entity_id: id });
  } catch {
    // best-effort; never block the mutation on logging failure
  }
}

export async function createChapter(formData: FormData): Promise<{ error?: string }> {
  const cluster_id = String(formData.get("cluster_id") ?? "");
  if (!cluster_id) return { error: "Choose a cluster." };
  // Authorize against the cluster the row is going into.
  const ctx = await requireClusterAccess(cluster_id);

  const name = String(formData.get("name") ?? "").trim();
  const municipality = String(formData.get("municipality") ?? "").trim();
  if (!name || !municipality) return { error: "Name and municipality are required." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters").insert({
    cluster_id, name, municipality,
    slug: slugify(name),
    schedule: optional(formData.get("schedule")),
    coordinator: optional(formData.get("coordinator")),
    updated_by: ctx.userId,
  }).select("id");
  if (error) {
    if (/duplicate key/i.test(error.message)) return { error: "A chapter with that name already exists." };
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.create", data[0].id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}

export async function updateChapter(id: string, formData: FormData): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  // Authorize against the row's CURRENT cluster before allowing any change.
  const ctx = await requireClusterAccess((row as Pick<ChapterRow, "cluster_id">).cluster_id);

  const name = String(formData.get("name") ?? "").trim();
  const municipality = String(formData.get("municipality") ?? "").trim();
  if (!name || !municipality) return { error: "Name and municipality are required." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters").update({
    name, municipality,
    schedule: optional(formData.get("schedule")),
    coordinator: optional(formData.get("coordinator")),
    is_published: formData.get("is_published") === "on",
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.update", id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}

export async function deleteChapter(id: string): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const ctx = await requireClusterAccess((row as Pick<ChapterRow, "cluster_id">).cluster_id);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.delete", id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}
```

- [ ] **Step 4: Write the list page**

Create `src/app/admin/chapters/page.tsx` following `src/app/admin/pages/page.tsx`:
call `loadAdminContext()` (not `requirePYH` — cluster heads reach this screen),
read every chapter with `createServiceClient()` ordered by cluster then name, and
render rows. Show edit and delete controls only when
`ctx.isPYH || ctx.clusterId === chapter.cluster_id`. Show a "Draft" badge when
`is_published` is false, mirroring the "Hidden" badge in the page editor.

- [ ] **Step 5: Write the form**

Create `src/app/admin/chapters/_components/chapter-form.tsx`, a client component
following `page-editor.tsx` conventions: labelled inputs for name, municipality,
a cluster `<select>`, optional `schedule` and `coordinator`, and an
`is_published` checkbox. Mark the optional fields explicitly, e.g.
`<span className="text-xs opacity-70">Leave blank to withhold</span>`, matching
the wording `/admin/settings` uses for contact fields. Surface action errors
through a `<p role="status">` notice, the same element `prove:editor` asserts on.

- [ ] **Step 6: Add the nav entry**

In the admin nav component, add a Chapters link visible to any active admin (not
PYH-gated, unlike Pages).

- [ ] **Step 7: Verify**

Run: `npm run prove:chapters` — all assertions pass.
Run: `npx tsc --noEmit` — exit 0.
Run: `npm run lint` — clean.

Manually: sign in as a PYH, create a chapter with only name, municipality and
cluster, confirm it saves as a draft and `/chapters` still shows the notice.
Publish it and confirm it appears. Sign in as a cluster head for another cluster
and confirm the edit control is absent.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: manage chapters from the admin surface"
```

---

### Task 6: Cover images

**Files:**
- Create: `src/lib/chapters/paths.ts`
- Modify: `src/app/admin/chapters/actions.ts`
- Modify: `src/app/admin/chapters/_components/chapter-form.tsx`
- Modify: `scripts/prove-chapters.mjs`

**Interfaces:**
- Consumes: `validateImage` from `@/lib/images/validate`; `reapPaths` from `@/lib/pages/reap`
- Produces: `chapterImageKey(slug: string, mime: string): string`; `uploadChapterCover(id: string, formData: FormData): Promise<{ error?: string }>`; `removeChapterCover(id: string): Promise<{ error?: string }>`

- [ ] **Step 1: Write the failing test**

Add to `scripts/prove-chapters.mjs`, before Cleanup:

```javascript
console.log("\n── Cover images ──");

const WEBP = Buffer.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
const coverRow = (await admin.from("chapters").insert({
  cluster_id: clusterA, name: `Cover ${stamp}`, slug: `cover-${stamp}`, municipality: "Test C",
}).select("id").single()).data;

const key1 = `chapters/cover-${stamp}/${crypto.randomUUID()}.webp`;
await admin.storage.from("media").upload(key1, WEBP, { contentType: "image/webp" });
await admin.from("chapters").update({ cover_path: key1 }).eq("id", coverRow.id);

const { reapPaths } = await import("../src/lib/pages/reap.ts");
await reapPaths(admin, [key1]);
const listAfter = await admin.storage.from("media").list(`chapters/cover-${stamp}`, { limit: 10 });
const remaining = (listAfter.data ?? []).filter((o) => o.id !== null);
check("reaping a cover removes the object from storage", remaining.length === 0, remaining.map((o) => o.name));

await admin.from("chapters").delete().eq("id", coverRow.id);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:chapters`
Expected: FAIL — `crypto.randomUUID` is available, but the storage prefix does not
exist until an object is uploaded, and the assertion fails if `reapPaths` does not
remove it. If it passes at this stage the reap machinery already works; record
that and continue to Step 3, which adds the actions that use it.

- [ ] **Step 3: Write the path helper**

Create `src/lib/chapters/paths.ts`:

```typescript
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a chapter cover inside the `media` bucket, prefixed by slug. */
export function chapterImageKey(slug: string, mime: string): string {
  return `chapters/${slug}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
```

- [ ] **Step 4: Add the upload and remove actions**

Append to `src/app/admin/chapters/actions.ts`, following `uploadSectionImage` in
`src/app/admin/pages/actions.ts`:

```typescript
export async function uploadChapterCover(id: string, formData: FormData): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id, slug, cover_path").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const chapter = row as Pick<ChapterRow, "id" | "cluster_id" | "slug" | "cover_path">;
  const ctx = await requireClusterAccess(chapter.cluster_id);

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const key = chapterImageKey(chapter.slug, v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters")
    .update({ cover_path: key, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    await svc.storage.from("media").remove([key]);
    return { error: error?.message ?? "Not permitted." };
  }

  // Reap the replaced cover last: the new one is already saved, so a failure
  // here leaks bytes rather than losing the image the chapter now points at.
  if (chapter.cover_path && chapter.cover_path !== key) {
    await reapPaths(svc, [chapter.cover_path]);
  }
  await audit(ctx.userId, "chapter.cover", id);
  revalidatePath("/chapters");
  return {};
}

export async function removeChapterCover(id: string): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id, cover_path").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const chapter = row as Pick<ChapterRow, "id" | "cluster_id" | "cover_path">;
  const ctx = await requireClusterAccess(chapter.cluster_id);
  if (!chapter.cover_path) return {};

  // Object first, then the reference — a failure leaves the row pointing at a
  // file that still exists rather than orphaning bytes nobody references.
  const reap = await reapPaths(svc, [chapter.cover_path]);
  if (reap.error) return { error: reap.error };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters")
    .update({ cover_path: null, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.cover.remove", id);
  revalidatePath("/chapters");
  return {};
}
```

Add the imports at the top of the file:

```typescript
import { validateImage } from "@/lib/images/validate";
import { chapterImageKey } from "@/lib/chapters/paths";
import { reapPaths } from "@/lib/pages/reap";
```

Also extend `deleteChapter` to reap the cover before soft-deleting:

```typescript
  if ((row as Pick<ChapterRow, "cover_path">).cover_path) {
    const reap = await reapPaths(svc, [(row as Pick<ChapterRow, "cover_path">).cover_path!]);
    if (reap.error) return { error: reap.error };
  }
```

- [ ] **Step 5: Add the form control**

In `chapter-form.tsx`, add a file input wired to `uploadChapterCover` and a
"Remove image" button wired to `removeChapterCover`, following the image field in
`page-editor.tsx`. There is no placeholder graphic: a chapter with no cover
renders without one.

- [ ] **Step 6: Verify**

Run: `npm run prove:chapters` — all pass.
Run: `npx tsc --noEmit` — exit 0.
Run: `npm run lint` — clean.

Manually: upload a cover, replace it, and confirm in Supabase Storage that only
one object remains under `chapters/<slug>/`. Remove it and confirm the prefix is
empty.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: upload, replace, and reap chapter cover images"
```

---

### Task 7: Documentation and close-out

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-18-chapters-managed-domain-design.md`

- [ ] **Step 1: Add the suite to the README**

In the Verification block, after `prove:editor`:

```bash
npm run prove:chapters    # N — the chapters directory, RLS and withholding
```

Replace `N` with the actual final count from `npm run prove:chapters`.

- [ ] **Step 2: Note the entry path**

Add one line under the admin bullet list in "What is built":

```markdown
- Chapters directory — cluster heads manage their own cluster's chapters, the
  provincial youth head manages all. Entered as drafts and published per row.
```

- [ ] **Step 3: Mark the spec implemented**

Change the spec's `**Status:**` line to `Implemented <date>` and add a line
recording the final assertion count.

- [ ] **Step 4: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run prove:content
npm run prove:chapters
npm run prove:rbac
```

All must pass. `prove:rbac` is included because this slice adds a SQL function
and policies to a database its assertions also exercise.

- [ ] **Step 5: Commit and open a PR**

```bash
git add -A
git commit -m "docs: record the chapters directory and its suite"
git push -u origin chapters-managed-domain
```

Open a PR against `master` describing the two-subsystem scope decision, the
cluster-scoped RLS and its RED-first verification, and the empty-table content
rule.

---

## Notes for the executor

**The RLS false-pass is the one that will bite you.** A negative assertion
("cannot edit another cluster") passes when the policy is correct *and* when
there is no policy at all *and* when you accidentally wrote the assertion against
the service-role client. Task 2 Step 6 exists precisely because passing does not
prove working. Do not skip it, and do not trust a green suite you have not seen
go red.

**Do not add sample data.** If a page looks empty, that is the design. The table
ships empty and the site withholds until an administrator enters real chapters.
If you find yourself writing an insert to "check the layout", write it in a
scratch script under `scripts/`, delete the rows, and delete the script.

**`memberCount` and `upcoming` are intentionally absent.** If a component
references them, delete the element — do not reintroduce the field.
