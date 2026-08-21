# Leaders Managed Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invented `src/data/leaders.ts` fixture with a database-backed leadership directory, where personal content (a face, a quote) cannot exist in the row without a recorded consent basis.

**Architecture:** A `leaders` table scoped by `cluster_id` — the same RLS axis chapters uses — with `chapter_id` as a real foreign key and a `BEFORE` trigger deriving `cluster_id` from it so the two can never disagree. A `CHECK` constraint makes `photo_path` and `message` unstorable without `consent_at` and `consent_by`. The public `/leaders` page reads published rows through a `getLeaders()` shaped like `getChapters()`, falling back to `UnpublishedNotice`. Admin CRUD lives at `/admin/leaders` and reuses the image upload and reap machinery from the page CMS and the chapters slice.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Supabase (Postgres, Auth, Storage, RLS) · plain `.mjs` assertion suites following the seven existing `prove:*` scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-leaders-managed-domain-design.md`

## Global Constraints

- **Real people only.** No task may seed, default, or fabricate a leader. The migrations insert zero leader rows.
- **No placeholder imagery.** No `picsum.photos` or `i.pravatar.cc` URL may reach a leader record. A leader with no photo renders without one — no silhouette, no initials avatar.
- **`position` is free text.** Do not re-introduce `LeaderCategory` or any enum of role names. The five Phase-1 categories are unverified organizational structure.
- **Personal content requires consent, enforced in SQL.** `photo_path` and `message` are unstorable unless `consent_at` and `consent_by` are both set. Never work around the constraint by splitting a write into two statements.
- **Required fields are `name` and `position` only.** Every other field must save blank. A required field with no known value is what makes someone type something plausible.
- **RLS assertions run through an authenticated client, never the service-role client.** The service-role client bypasses RLS entirely, so a policy test written against it passes no matter what the policy says.
- **Every policy assertion gets RED-first verification** — break the policy, confirm the assertion fails, restore it.
- **`is_published` defaults to `false`.** Nothing reaches the public page by being saved.
- **Do not redefine `admin_cluster(uuid)` or `is_pyh(uuid)`.** Both exist in `0008b_admins_rbac.sql`. A second `create or replace` in a later migration silently wins on a fresh database; ten existing policy clauses depend on them.
- Suites are plain `.mjs` using the shared `check()` harness, print `N passed, M failed`, and exit non-zero on failure.
- Commit after every task. Conventional commit format (`feat:`, `fix:`, `test:`, `docs:`).

---

## File Structure

**Created:**
- `supabase/migrations/0025_leaders.sql` — table, CHECK constraints, RLS enabled
- `supabase/migrations/0026_leaders_rls.sql` — five policies and the `cluster_id` trigger
- `scripts/prove-leaders.mjs` — the assertion suite, grown across tasks
- `src/lib/data/leaders.ts` — `getLeaders()` public read with outage fallback
- `src/lib/leaders/paths.ts` — storage object key helper
- `src/lib/validation/leader.ts` — Zod schema for the social URLs
- `src/app/admin/leaders/page.tsx` — admin list
- `src/app/admin/leaders/actions.ts` — server actions
- `src/app/admin/leaders/_components/leader-form.tsx` — create/edit form

**Modified:**
- `package.json` — add `prove:leaders`
- `src/lib/supabase/database.types.ts` — add `LeaderRow` and the `leaders` table entry
- `src/app/leaders/page.tsx` — read the database instead of the fixture
- `src/components/leaders/leaders-directory.tsx` — re-type from `Leader` to `PublicLeader`, drop the category filter
- `src/components/shared/leader-card.tsx` — re-type, render no photo when absent
- `src/lib/content/fixtures.ts` — remove the `"leaders"` domain
- `src/app/admin/_components/*` — add the Leaders nav entry
- `scripts/prove-content.mjs` — assert the fixture is gone
- `README.md`, `ZUBIDA_CONTENT_AUDIT.md`, the spec — Task 7

**Deleted:**
- `src/data/leaders.ts` — twelve invented profiles
- `Leader` and `LeaderCategory` in `src/data/types.ts`

---

### Task 1: Migration and suite scaffold

**Files:**
- Create: `supabase/migrations/0025_leaders.sql`
- Create: `scripts/prove-leaders.mjs`
- Modify: `package.json` (scripts block)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `clusters` (`id uuid primary key`), `chapters` (`id uuid primary key`, from `0023_chapters.sql`)
- Produces: table `leaders`; type `LeaderRow`; npm script `prove:leaders`

- [ ] **Step 1: Write the failing test**

Create `scripts/prove-leaders.mjs`:

```javascript
// Proves the leadership directory: schema, the consent constraint, cluster-scoped
// RLS, public withholding, and that no fabricated person can enter the table.
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

const probe = await admin.from("leaders").select("id").limit(1);
check("the leaders table exists", !probe.error, probe.error?.message);

// The migration must seed nothing. This is the content rule made executable: a
// later seed intended to make the page look finished fails here.
const all = await admin.from("leaders").select("id");
check("the migration seeds zero leader rows", (all.data?.length ?? -1) === 0, all.data?.length);

const sql = readFileSync(join(root, "supabase/migrations/0025_leaders.sql"), "utf8");
check("the migration inserts no leader rows", !/insert\s+into\s+leaders/i.test(sql), null);
check("the migration carries no placeholder imagery",
  !/picsum\.photos|i\.pravatar\.cc/i.test(sql), null);

console.log("\n── Consent is a constraint, not a convention ──");

// A face with no recorded basis for publishing it must not be storable at all.
// Storing-then-hiding is the weaker design the spec rejects.
const photoNoConsent = await admin.from("leaders")
  .insert({ name: "Consent Probe A", slug: `probe-a-${crypto.randomUUID()}`,
            position: "Probe", photo_path: "leaders/probe/x.jpg" })
  .select("id").maybeSingle();
check("a photo without consent is rejected", !!photoNoConsent.error, photoNoConsent.data);

const messageNoConsent = await admin.from("leaders")
  .insert({ name: "Consent Probe B", slug: `probe-b-${crypto.randomUUID()}`,
            position: "Probe", message: "A quote attributed to a named person." })
  .select("id").maybeSingle();
check("a quote without consent is rejected", !!messageNoConsent.error, messageNoConsent.data);

// Name and position alone carry no personal content, so they need no consent.
const plain = await admin.from("leaders")
  .insert({ name: "Consent Probe C", slug: `probe-c-${crypto.randomUUID()}`, position: "Probe" })
  .select("id").maybeSingle();
check("a leader with no photo and no quote saves without consent",
  !plain.error && !!plain.data?.id, plain.error?.message);

console.log("\n── Cleanup ──");
if (plain.data?.id) await admin.from("leaders").delete().eq("id", plain.data.id);
const leftover = await admin.from("leaders").select("id");
check("the suite left no leaders behind",
  !leftover.error && (leftover.data?.length ?? -1) === 0, leftover.data);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

Add to `package.json` scripts, after `"prove:chapters"`:

```json
"prove:leaders": "node scripts/prove-leaders.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:leaders`
Expected: FAIL on "the leaders table exists" with `relation "public.leaders" does not exist`, then the script throws reading the missing migration file. Both are the expected RED.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0025_leaders.sql`:

```sql
-- Leadership directory. Replaces src/data/leaders.ts, whose twelve entries were
-- invented for the Phase-1 showcase — including a named clergy member with a
-- fabricated title and an attributed pastoral message. This table ships EMPTY:
-- real leaders are entered through /admin/leaders by an authorized administrator.
create table if not exists leaders (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  -- Free text by design. The fixture's five-value LeaderCategory taxonomy
  -- (Provincial Coordinator, Area Heads, ...) is itself unverified: no project
  -- source traces those names to Zubida YFC. An enum would put invented
  -- organizational structure into the schema, where undoing it costs a
  -- migration and a backfill instead of an admin edit.
  position      text not null,
  -- Scope. Both null = provincial-level, writable by the PYH only.
  -- cluster_id is derived from chapter_id by trigger; see 0026.
  chapter_id    uuid references chapters(id) on delete restrict,
  cluster_id    uuid references clusters(id) on delete restrict,
  -- Personal content about a named individual. Requires consent; see below.
  message       text,
  photo_path    text,
  consent_at    timestamptz,
  consent_by    uuid references auth.users(id),
  -- Nullable, https-only at this boundary. The fixture gave every profile a
  -- social link of "#", rendering clickable icons that went nowhere. Full URL
  -- parsing lives in src/lib/validation/leader.ts; this is the floor that holds
  -- even if a write bypasses the app.
  facebook_url  text,
  instagram_url text,
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  deleted_at    timestamptz,

  -- The load-bearing constraint of this slice. A face or a quote cannot EXIST
  -- in the row without a recorded basis for publishing it: who captured consent
  -- and when. Stronger than hiding, and it gives withdrawal the right shape --
  -- nulling consent_at fails unless photo_path and message go with it, so
  -- "withdraw consent" is forced to be one statement that also reaps the object.
  constraint leaders_personal_content_requires_consent check (
    (photo_path is null and message is null)
    or (consent_at is not null and consent_by is not null)
  ),
  constraint leaders_facebook_url_is_https check (
    facebook_url is null or facebook_url ~ '^https://'
  ),
  constraint leaders_instagram_url_is_https check (
    instagram_url is null or instagram_url ~ '^https://'
  )
);

create index if not exists leaders_cluster_idx on leaders (cluster_id);
create index if not exists leaders_chapter_idx on leaders (chapter_id);
create index if not exists leaders_published_idx on leaders (is_published, deleted_at);

alter table leaders enable row level security;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:migrate && npm run prove:leaders`
Expected: PASS on all eight assertions — `8 passed, 0 failed`.

If "a photo without consent is rejected" FAILS (the insert succeeded), the CHECK
constraint did not apply. Do not proceed: every later task assumes it holds.

- [ ] **Step 5: Add the row type**

In `src/lib/supabase/database.types.ts`, after `ChapterRow`:

```typescript
export interface LeaderRow {
  id: string;
  name: string;
  slug: string;
  position: string;
  chapter_id: string | null;
  cluster_id: string | null;
  message: string | null;
  photo_path: string | null;
  consent_at: string | null;
  consent_by: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
}
```

And in the `Tables` block, beside `chapters`:

```typescript
leaders: Table<LeaderRow, Partial<LeaderRow>, Partial<LeaderRow>>;
```

- [ ] **Step 6: Verify types and commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add supabase/migrations/0025_leaders.sql scripts/prove-leaders.mjs package.json src/lib/supabase/database.types.ts
git commit -m "feat: add the leaders table, empty by design"
```

---

### Task 2: Cluster-scoped RLS and the derived-cluster trigger

**Files:**
- Create: `supabase/migrations/0026_leaders_rls.sql`
- Modify: `scripts/prove-leaders.mjs`

**Interfaces:**
- Consumes: `admin_cluster(uuid)` and `is_pyh(uuid)` from `0008b_admins_rbac.sql`; table `leaders`
- Produces: five policies on `leaders`; trigger `leaders_derive_cluster`

**This is the task where the slice can go wrong silently.** Read the false-pass
note at the end before writing a single assertion.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/prove-leaders.mjs`, before the Cleanup block. This creates two
throwaway admin accounts (a cluster head and the PYH), then asserts the policies
through *authenticated* clients:

```javascript
console.log("\n── Cluster-scoped RLS ──");

const clusters = await admin.from("clusters").select("id, name").order("name");
const [clusterA, clusterB] = clusters.data ?? [];
if (!clusterA || !clusterB) { console.error("Need two clusters seeded."); process.exit(1); }

// Throwaway accounts. Deleted in Cleanup; never reuse a real admin here.
const headEmail = `leadertest_head_${crypto.randomUUID()}@example.com`;
const pyhEmail = `leadertest_pyh_${crypto.randomUUID()}@example.com`;
const headPw = crypto.randomUUID();
const pyhPw = crypto.randomUUID();

const headId = (await admin.auth.admin.createUser({
  email: headEmail, password: headPw, email_confirm: true })).data.user.id;
const pyhId = (await admin.auth.admin.createUser({
  email: pyhEmail, password: pyhPw, email_confirm: true })).data.user.id;

await admin.from("admins").insert([
  { user_id: headId, role: "cluster_head", cluster_id: clusterA.id, is_active: true,
    full_name: "Leader Suite Cluster Head" },
  { user_id: pyhId, role: "provincial_youth_head", cluster_id: null, is_active: true,
    full_name: "Leader Suite PYH" },
]);

const signedIn = async (email, password) => {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const r = await c.auth.signInWithPassword({ email, password });
  if (r.error) { console.error("sign-in failed:", r.error.message); process.exit(1); }
  return c;
};
const headClient = await signedIn(headEmail, headPw);
const pyhClient = await signedIn(pyhEmail, pyhPw);

// Seed one row in each cluster through the service client (bypasses RLS on purpose:
// this is fixture setup, not an assertion).
const mkLeader = async (cluster_id, name) => {
  const r = await admin.from("leaders").insert({
    name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
    position: "Suite Fixture", cluster_id, is_published: true }).select("id").maybeSingle();
  if (r.error) { console.error("fixture insert failed:", r.error.message); process.exit(1); }
  return r.data.id;
};
const rowA = await mkLeader(clusterA.id, "Suite Leader A");
const rowB = await mkLeader(clusterB.id, "Suite Leader B");

// Read is deliberately province-wide for any admin. Hiding the province from the
// people running parts of it buys no confidentiality.
const headReadsB = await headClient.from("leaders").select("id").eq("id", rowB);
check("a cluster head CAN read another cluster's leader",
  headReadsB.data?.length === 1, headReadsB.data);

const ownEdit = await headClient.from("leaders")
  .update({ position: "Edited By Own Head" }).eq("id", rowA).select("id");
check("a cluster head CAN edit their own cluster's leader",
  !ownEdit.error && ownEdit.data?.length === 1, ownEdit.error?.message ?? ownEdit.data);

// RLS denial returns 0 rows affected, not an error. Assert on the row count AND
// re-read the value: "no error" alone would pass against a missing policy.
const foreignEdit = await headClient.from("leaders")
  .update({ position: "Edited By Foreign Head" }).eq("id", rowB).select("id");
const bAfter = await admin.from("leaders").select("position").eq("id", rowB).maybeSingle();
check("a cluster head CANNOT edit another cluster's leader",
  (foreignEdit.data?.length ?? 0) === 0 && bAfter.data?.position === "Suite Fixture",
  { affected: foreignEdit.data?.length, position: bAfter.data?.position });

const moveOut = await headClient.from("leaders")
  .update({ cluster_id: clusterB.id }).eq("id", rowA).select("id");
const aAfterMove = await admin.from("leaders").select("cluster_id").eq("id", rowA).maybeSingle();
check("a cluster head CANNOT move a leader into another cluster",
  (moveOut.data?.length ?? 0) === 0 && aAfterMove.data?.cluster_id === clusterA.id,
  { affected: moveOut.data?.length, cluster_id: aAfterMove.data?.cluster_id });

const foreignInsert = await headClient.from("leaders").insert({
  name: "Foreign Insert", slug: `foreign-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", cluster_id: clusterB.id }).select("id");
check("a cluster head CANNOT create a leader in another cluster",
  !!foreignInsert.error, foreignInsert.data);

// Provincial-level rows have cluster_id null. `null = uuid` is null, not true,
// so the cluster-head policy never matches them.
const provincial = await admin.from("leaders").insert({
  name: "Suite Provincial", slug: `prov-${crypto.randomUUID().slice(0, 8)}`,
  position: "Provincial Fixture" }).select("id").maybeSingle();
const provEdit = await headClient.from("leaders")
  .update({ position: "Edited Provincial" }).eq("id", provincial.data.id).select("id");
check("a cluster head CANNOT edit a provincial-level leader",
  (provEdit.data?.length ?? 0) === 0, provEdit.data);

const pyhEdit = await pyhClient.from("leaders")
  .update({ position: "Edited By PYH" }).eq("id", provincial.data.id).select("id");
check("the PYH CAN edit a provincial-level leader",
  !pyhEdit.error && pyhEdit.data?.length === 1, pyhEdit.error?.message);

// The app soft-deletes. A hard delete would bypass the deleted_at trail, so no
// policy covers DELETE for a cluster head and Postgres denies it outright.
const hardDelete = await headClient.from("leaders").delete().eq("id", rowA).select("id");
const stillThere = await admin.from("leaders").select("id").eq("id", rowA);
check("a cluster head CANNOT hard-delete even their own cluster's leader",
  (hardDelete.data?.length ?? 0) === 0 && stillThere.data?.length === 1,
  { affected: hardDelete.data?.length });

console.log("\n── The trigger must not become an escalation path ──");

// THE assertion of this task. cluster_id is derived from chapter_id by a BEFORE
// trigger. If RLS WITH CHECK were evaluated BEFORE that trigger, a cluster head
// could point a row at another cluster's chapter and the trigger would walk the
// row out of their authority — a silent privilege escalation. This asserts the
// ordering the design depends on, rather than assuming it.
const chapterInB = await admin.from("chapters").insert({
  name: "Suite Chapter In B", slug: `suite-ch-${crypto.randomUUID().slice(0, 8)}`,
  municipality: "Suite", cluster_id: clusterB.id }).select("id").maybeSingle();
if (chapterInB.error) { console.error("chapter fixture failed:", chapterInB.error.message); process.exit(1); }

const escalate = await headClient.from("leaders").insert({
  name: "Escalation Probe", slug: `esc-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", chapter_id: chapterInB.data.id }).select("id");
check("a cluster head CANNOT escalate by pointing a leader at another cluster's chapter",
  !!escalate.error, escalate.data);

// The trigger still has to work for the legitimate case.
const chapterInA = await admin.from("chapters").insert({
  name: "Suite Chapter In A", slug: `suite-ch-${crypto.randomUUID().slice(0, 8)}`,
  municipality: "Suite", cluster_id: clusterA.id }).select("id").maybeSingle();
const derived = await headClient.from("leaders").insert({
  name: "Derive Probe", slug: `der-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", chapter_id: chapterInA.data.id }).select("id, cluster_id").maybeSingle();
check("the trigger derives cluster_id from chapter_id for an in-cluster chapter",
  !derived.error && derived.data?.cluster_id === clusterA.id,
  derived.error?.message ?? derived.data?.cluster_id);

// The spec lists this under Risks. `on delete restrict` is the difference
// between a blocked delete and a leader silently orphaned from their chapter,
// so assert it rather than assume it.
const restricted = await admin.from("chapters").delete().eq("id", chapterInA.data.id).select("id");
check("a chapter cannot be hard-deleted while a leader points at it",
  !!restricted.error, restricted.data);
```

Extend the Cleanup block to remove everything this task created. **Insert this at
the TOP of the Cleanup block**, before Task 1's single-row delete and before the
"left no leaders behind" assertion — Tasks 3, 5, and 6 add rows that rely on this
blanket delete, and the FK `consent_by -> auth.users(id)` means the leaders delete
must precede `deleteUser`:

```javascript
await admin.from("leaders").delete().not("id", "is", null);
await admin.from("chapters").delete().in("id",
  [chapterInA.data?.id, chapterInB.data?.id].filter(Boolean));
await admin.from("admins").delete().in("user_id", [headId, pyhId]);
await admin.auth.admin.deleteUser(headId);
await admin.auth.admin.deleteUser(pyhId);
const leftoverUsers = await admin.from("admins").select("id").in("user_id", [headId, pyhId]);
check("the throwaway admin accounts were removed",
  (leftoverUsers.data?.length ?? -1) === 0, leftoverUsers.data);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run prove:leaders`
Expected: the RLS assertions FAIL. With RLS enabled and **no policies at all**,
Postgres denies everything, so `CAN read` / `CAN edit` fail first. That is the
correct RED — it proves the assertions are reaching a real policy boundary.

- [ ] **Step 3: Write the policies and the trigger**

Create `supabase/migrations/0026_leaders_rls.sql`:

```sql
-- admin_cluster(uuid) and is_pyh(uuid) already exist, defined in
-- 0008b_admins_rbac.sql. This migration deliberately does NOT redefine them: a
-- second `create or replace` here would silently win over the original on a
-- fresh database, and ten existing policy clauses across events,
-- event_registrations, event_images, and chapters depend on them. See the same
-- note in 0024_chapters_rls.sql.

-- cluster_id is derived, never trusted from the client. Without this, a row
-- could name a chapter in one cluster and a cluster_id in another, and every
-- policy below would be reasoning about the wrong one.
create or replace function leaders_set_cluster() returns trigger
language plpgsql as $$
begin
  if new.chapter_id is not null then
    select cluster_id into new.cluster_id from chapters where id = new.chapter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leaders_derive_cluster on leaders;
create trigger leaders_derive_cluster
  before insert or update on leaders
  for each row execute function leaders_set_cluster();

-- Public: published, undeleted rows only.
drop policy if exists leaders_public_read on leaders;
create policy leaders_public_read on leaders for select to anon, authenticated
  using (is_published = true and deleted_at is null);

-- Any active cluster-scoped admin, plus the PYH, reads the whole province.
drop policy if exists leaders_admin_read on leaders;
create policy leaders_admin_read on leaders for select to authenticated
  using (is_pyh(auth.uid()) or admin_cluster(auth.uid()) is not null);

drop policy if exists leaders_pyh_write on leaders;
create policy leaders_pyh_write on leaders for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- Cluster heads get insert and update, not delete. `with check` as well as
-- `using` on the update policy: without it a cluster head could move a row into
-- another cluster, which `using` alone does not prevent.
--
-- Both clauses are evaluated against the row AFTER leaders_derive_cluster has
-- rewritten cluster_id, which is what stops the chapter_id escalation path.
-- prove:leaders asserts this ordering rather than trusting it.
drop policy if exists leaders_cluster_head_insert on leaders;
create policy leaders_cluster_head_insert on leaders for insert to authenticated
  with check (cluster_id = admin_cluster(auth.uid()));

drop policy if exists leaders_cluster_head_update on leaders;
create policy leaders_cluster_head_update on leaders for update to authenticated
  using (cluster_id = admin_cluster(auth.uid()))
  with check (cluster_id = admin_cluster(auth.uid()));
```

- [ ] **Step 4: Apply and run**

Run: `npm run db:migrate && npm run prove:leaders`
Expected: all assertions PASS.

**If "a cluster head CANNOT escalate..." FAILS**, the ordering assumption in the
spec is wrong. Stop and apply the documented fallback: drop the derivation from
the trigger and replace it with a `CHECK` that rejects a mismatch outright —

```sql
constraint leaders_cluster_matches_chapter check (
  chapter_id is null
  or cluster_id = (select cluster_id from chapters where id = chapter_id)
)
```

— which requires the app to send both columns. Record the change in the spec
before continuing.

- [ ] **Step 5: RED-first verification — prove the negatives are not vacuous**

A negative assertion passes when the policy is correct, when there is **no policy
at all**, and when it was accidentally written against the service-role client.
Passing does not prove working. For each of the four `CANNOT` assertions plus the
escalation probe, one at a time:

```sql
-- in psql or the Supabase SQL editor
drop policy leaders_cluster_head_update on leaders;
```

Run `npm run prove:leaders`. Confirm **the intended assertion changes state**.

**Dropping a policy is not enough for a negative assertion.** Removing the update
policy turns the *positive* red while all three update negatives stay green — a
denied write is still denied when no policy exists. To see a negative flip you
must WIDEN the policy, not remove it: replace it with `using (true)` /
`with check (true)`, or add a permissive DELETE policy for the hard-delete check.

**`npm run db:migrate` does NOT restore a dropped policy.** `scripts/db-migrate.mjs`
skips any file already recorded in `_migrations`, so a re-run is a no-op. To
restore, delete that migration's `_migrations` row first and re-run, or apply the
migration's SQL directly. Verify the restore against `pg_policy` and `pg_trigger`
before moving on — a mutation left in the database silently poisons every later
task.

Do this for `leaders_cluster_head_update`, `leaders_cluster_head_insert`, and
`leaders_pyh_write`. For the escalation probe, instead change the trigger body to
`return new;` (no derivation) and confirm the escalation assertion **fails** —
that is the proof it is testing the trigger and not something else.

Record the five results in the commit message. Do not proceed on a suite you have
not seen go red.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0026_leaders_rls.sql scripts/prove-leaders.mjs
git commit -m "feat: scope leader writes to a cluster head's own cluster"
```

---

### Task 3: Public data layer

**Files:**
- Create: `src/lib/data/leaders.ts`
- Modify: `scripts/prove-leaders.mjs`

**Interfaces:**
- Consumes: `LeaderRow`; `publicUrl()` from `src/lib/images/paths.ts`
- Produces: `getLeaders(): Promise<PublicLeader[]>` and the `PublicLeader` type

- [ ] **Step 1: Write the failing test**

Append to `scripts/prove-leaders.mjs`, before Cleanup:

```javascript
console.log("\n── Public read ──");

const { getLeaders } = await import("../src/lib/data/leaders.ts");

const pubA = await admin.from("leaders").insert({
  name: "Published Leader", slug: `pub-${crypto.randomUUID().slice(0, 8)}`,
  position: "Provincial Coordinator", is_published: true }).select("id").maybeSingle();
const draft = await admin.from("leaders").insert({
  name: "Draft Leader", slug: `draft-${crypto.randomUUID().slice(0, 8)}`,
  position: "Draft" }).select("id").maybeSingle();

const published = await getLeaders();
const ids = published.map((l) => l.id);
check("getLeaders returns published leaders", ids.includes(pubA.data.id), ids);
check("getLeaders omits drafts", !ids.includes(draft.data.id), ids);

const softDeleted = await admin.from("leaders")
  .update({ deleted_at: new Date().toISOString() }).eq("id", pubA.data.id).select("id");
check("the soft-delete update succeeded", softDeleted.data?.length === 1, softDeleted.error?.message);
const afterDelete = (await getLeaders()).map((l) => l.id);
check("a soft-deleted leader leaves the public list", !afterDelete.includes(pubA.data.id), afterDelete);

const noPhoto = published.find((l) => l.id === pubA.data.id);
check("a leader with no photo_path yields photo === null", noPhoto?.photo === null, noPhoto?.photo);
check("a leader with no message yields message === null", noPhoto?.message === null, noPhoto?.message);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:leaders`
Expected: the import throws — `Cannot find module '../src/lib/data/leaders.ts'`.

Note: `prove:leaders` must now run under the TypeScript-import flags, like
`prove:chapters` does. Update `package.json`:

```json
"prove:leaders": "node --conditions=react-server --experimental-strip-types scripts/prove-leaders.mjs"
```

- [ ] **Step 3: Write the data layer**

Create `src/lib/data/leaders.ts`:

```typescript
import "server-only";
import { createServiceClient } from "../supabase/server.ts";
import type { LeaderRow } from "@/lib/supabase/database.types";
import { publicUrl } from "../images/paths.ts";

export type PublicLeader = {
  id: string;
  name: string;
  slug: string;
  position: string;
  /** null when withheld — render nothing, never a stand-in. */
  message: string | null;
  photo: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  chapterName: string | null;
};

/**
 * Published, undeleted leaders in display order. Returns [] whenever the
 * database is unreachable — the page renders its withholding notice rather than
 * failing, matching getChapters(). There is deliberately no fixture fallback: an
 * outage must not resurrect the twelve invented profiles.
 */
export async function getLeaders(): Promise<PublicLeader[]> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("leaders")
      .select("*, chapters(name)")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return [];

    return (data as (LeaderRow & { chapters: { name: string } | null })[]).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      position: r.position,
      message: r.message,
      photo: r.photo_path ? publicUrl(r.photo_path) : null,
      facebookUrl: r.facebook_url,
      instagramUrl: r.instagram_url,
      chapterName: r.chapters?.name ?? null,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run prove:leaders && npx tsc --noEmit`
Expected: all PASS, tsc exit 0.

```bash
git add src/lib/data/leaders.ts scripts/prove-leaders.mjs package.json
git commit -m "feat: read published leaders from the database"
```

---

### Task 4: Public page, and retire the fixture

**Files:**
- Modify: `src/app/leaders/page.tsx`
- Modify: `src/components/leaders/leaders-directory.tsx`
- Modify: `src/components/shared/leader-card.tsx`
- Modify: `src/lib/content/fixtures.ts`
- Modify: `src/data/types.ts`
- Modify: `scripts/prove-content.mjs`
- Delete: `src/data/leaders.ts`

**Interfaces:**
- Consumes: `getLeaders()`, `PublicLeader`
- Produces: a `/leaders` page that renders the database or withholds

- [ ] **Step 1: Write the failing test**

Append to `scripts/prove-content.mjs`, in section 4 beside the chapters checks:

```javascript
check(
  "the leaders fixture is deleted",
  !existsSync(join(root, "src/data/leaders.ts")),
  null,
);
check(
  "the leaders page reads the database, not the fixture",
  code("src/app/leaders/page.tsx").includes("getLeaders") &&
    !code("src/app/leaders/page.tsx").includes("isVerified"),
  null,
);
check(
  "an empty leaders list renders the withholding notice",
  /leaders\.length\s*>\s*0\s*\?/.test(code("src/app/leaders/page.tsx")) &&
    code("src/app/leaders/page.tsx").includes("UnpublishedNotice"),
  null,
);
// The invented taxonomy must not come back with the table.
check(
  "the LeaderCategory taxonomy is gone",
  !code("src/data/types.ts").includes("LeaderCategory"),
  null,
);
```

Add `existsSync` to the `node:fs` import at the top of `prove-content.mjs` if it
is not already there.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run prove:content`
Expected: FAIL on all four — the fixture still exists and the page still gates on
`isVerified`.

- [ ] **Step 3: Rewrite the page**

Replace `src/app/leaders/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { LeadersDirectory } from "@/components/leaders/leaders-directory";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { getLeaders } from "@/lib/data/leaders";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Leaders",
  description:
    "Meet the coordinators and leaders serving the Youth for Christ community of Zamboanga del Sur.",
};

export default async function LeadersPage() {
  const leaders = await getLeaders();
  return (
    <>
      <PageHeader
        eyebrow="Our Leaders"
        title="The servants behind the mission"
        subtitle="The people who pray, plan, and pour themselves out for the youth of Zamboanga del Sur."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {leaders.length > 0 ? (
          <LeadersDirectory leaders={leaders} />
        ) : (
          <UnpublishedNotice
            title="Our leadership directory isn't published yet"
            detail="We'd rather show nothing than show the wrong names. The provincial team is preparing this page — please check back soon."
          />
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Re-type the directory and drop the category filter**

In `src/components/leaders/leaders-directory.tsx`: take `leaders: PublicLeader[]`
as a prop instead of importing the fixture, delete the `categories` array and the
category `<select>`, and keep the text search and the chapter filter (built from
the distinct `chapterName` values present in the data, not a hardcoded list).

In `src/components/shared/leader-card.tsx`: take `leader: PublicLeader`, render
`<Image>` only when `leader.photo` is non-null — **no silhouette or initials
fallback** — and render each social icon only when its URL is non-null.

- [ ] **Step 5: Delete the fixture and its types**

```bash
git rm src/data/leaders.ts
```

In `src/data/types.ts`, delete the `LeaderCategory` union and the `Leader`
interface. In `src/lib/content/fixtures.ts`, remove `"leaders"` from the
`FixtureDomain` union and the `VERIFIED` record.

Then check for orphans: `grep -rn "@/data/leaders\|LeaderCategory\|isVerified(\"leaders\")" src/`
must return nothing.

- [ ] **Step 6: Run everything and commit**

Run: `npx tsc --noEmit && npm run lint && npm run prove:content && npm run prove:leaders`
Expected: all green.

```bash
git add -A
git commit -m "feat: render /leaders from the database and delete the invented fixture"
```

---

### Task 5: Admin CRUD

**Files:**
- Create: `src/lib/validation/leader.ts`
- Create: `src/app/admin/leaders/page.tsx`
- Create: `src/app/admin/leaders/actions.ts`
- Create: `src/app/admin/leaders/_components/leader-form.tsx`
- Modify: `src/app/admin/_components/` (nav)
- Modify: `scripts/prove-leaders.mjs`

**Interfaces:**
- Consumes: `requireClusterAccess`, `createServerSupabase`, `loadAdminContext` from `@/lib/supabase/admin-auth`
- Produces: `createLeader(formData)`, `updateLeader(id, formData)`, `deleteLeader(id)` — each `Promise<{ error?: string }>`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/prove-leaders.mjs`:

```javascript
console.log("\n── Partial saves and validation ──");

// Only name and position are required. A required field with no known value is
// what makes someone type something plausible.
const partial = await admin.from("leaders").insert({
  name: "Partial Leader", slug: `part-${crypto.randomUUID().slice(0, 8)}`,
  position: "Coordinator" }).select("*").maybeSingle();
check("a leader saves with chapter, message, and socials all blank",
  !partial.error && partial.data.message === null && partial.data.chapter_id === null,
  partial.error?.message);
check("a new leader is unpublished by default",
  partial.data?.is_published === false, partial.data?.is_published);

// The "#" bug the audit logged: every fixture profile had socials of "#".
const hashLink = await admin.from("leaders").insert({
  name: "Hash Link", slug: `hash-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", facebook_url: "#" }).select("id");
check("the database rejects \"#\" as a social link", !!hashLink.error, hashLink.data);

const httpLink = await admin.from("leaders").insert({
  name: "Http Link", slug: `http-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", instagram_url: "http://example.com" }).select("id");
check("the database rejects a non-https social link", !!httpLink.error, httpLink.data);

const dupSlug = await admin.from("leaders").insert({
  name: "Dup", slug: partial.data.slug, position: "Probe" }).select("id");
check("the database rejects a duplicate slug", !!dupSlug.error, dupSlug.data);

console.log("\n── Admin action guards (source-level) ──");

const actions = readFileSync(join(root, "src/app/admin/leaders/actions.ts"), "utf8");
check("every leader action goes through requireClusterAccess",
  (actions.match(/requireClusterAccess/g) ?? []).length >= 3, null);
check("deleteLeader soft-deletes rather than removing the row",
  /deleted_at/.test(actions) && !/\.delete\(\)/.test(actions), null);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run prove:leaders`
Expected: the validation assertions may already pass (the CHECKs are from Task 1),
but the two source-level assertions FAIL — `actions.ts` does not exist, so the
`readFileSync` throws. That throw is the RED for this task.

- [ ] **Step 3: Write the Zod schema**

Create `src/lib/validation/leader.ts`:

```typescript
import { z } from "zod";

/** Matches the shape src/lib/validation/site.ts uses for optional URLs. */
const optionalUrl = z.string().url().max(500).optional().or(z.literal(""));

export const leaderSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  position: z.string().trim().min(1, "Position is required.").max(200),
  chapter_id: z.string().uuid().optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  facebook_url: optionalUrl,
  instagram_url: optionalUrl,
});
```

- [ ] **Step 4: Write the actions**

Create `src/app/admin/leaders/actions.ts`. Copy the `slugify` / `slugFor` /
`optional` helpers and the best-effort `audit()` from
`src/app/admin/chapters/actions.ts` verbatim, changing `entity: "chapters"` to
`entity: "leaders"`. `createLeader` is the shape the other two follow:

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, loadAdminContext } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { leaderSchema } from "@/lib/validation/leader";

export async function createLeader(formData: FormData): Promise<{ error?: string }> {
  const ctx = await loadAdminContext();
  const parsed = leaderSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    position: String(formData.get("position") ?? ""),
    chapter_id: String(formData.get("chapter_id") ?? ""),
    message: String(formData.get("message") ?? ""),
    facebook_url: String(formData.get("facebook_url") ?? ""),
    instagram_url: String(formData.get("instagram_url") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const chapter_id = optional(parsed.data.chapter_id);
  const message = optional(parsed.data.message);

  // cluster_id is sent ONLY for provincial-level rows. When a chapter is chosen
  // the trigger derives it, and sending both invites the two to disagree.
  const cluster_id = chapter_id ? undefined : ctx.clusterId;
  if (!chapter_id && !cluster_id && !ctx.isPYH) {
    return { error: "Choose a chapter, or ask the provincial youth head to add a provincial-level leader." };
  }

  // The guard needs a real cluster to compare against. `cluster_id` is
  // deliberately undefined on the chapter path, and requireClusterAccess()
  // redirects a non-PYH on a null argument (admin-auth.ts:72) — passing
  // `cluster_id ?? null` would bounce a cluster head adding a leader to their
  // OWN chapter. Look the chapter's cluster up for the guard; the trigger still
  // owns what is actually stored.
  const db = createServiceClient();
  const guardCluster = chapter_id
    ? (await db.from("chapters").select("cluster_id").eq("id", chapter_id).maybeSingle()).data?.cluster_id ?? null
    : cluster_id ?? null;
  await requireClusterAccess(guardCluster);

  // message and consent move together: the CHECK rejects any statement that
  // sets a quote without a recorded basis for publishing it.
  const consent = message
    ? { consent_at: new Date().toISOString(), consent_by: ctx.userId }
    : {};

  const { data, error } = await db.from("leaders").insert({
    name: parsed.data.name,
    slug: slugFor(parsed.data.name),
    position: parsed.data.position,
    chapter_id,
    cluster_id,
    message,
    facebook_url: optional(parsed.data.facebook_url),
    instagram_url: optional(parsed.data.instagram_url),
    updated_by: ctx.userId,
    ...consent,
  }).select("id").maybeSingle();

  if (error) {
    if (error.code === "23505") return { error: "A leader with that name already exists." };
    return { error: "Could not save this leader." };
  }
  await audit(ctx.userId, "leader.create", data.id);
  revalidatePath("/admin/leaders");
  revalidatePath("/leaders");
  return {};
}
```

`updateLeader` and `deleteLeader` follow the same guard-parse-write-audit shape.
Three things differ from chapters:

1. **`cluster_id` is never sent from the form when a chapter is chosen** — the
   trigger derives it. Send `cluster_id` only for provincial-level rows, and only
   the PYH may leave both blank.
2. **`message` and `consent` move together.** `updateLeader` must write
   `message`, `consent_at`, and `consent_by` in one `update()`; the CHECK rejects
   any statement that sets a message without them.
3. **`deleteLeader` sets `deleted_at`** and never issues `.delete()`.

- [ ] **Step 5: Write the list page, form, and nav entry**

Create `src/app/admin/leaders/page.tsx` and
`src/app/admin/leaders/_components/leader-form.tsx` mirroring the chapters pair.
The form's consent control is a required checkbox whose label states what is being
recorded, shown whenever a photo or a message is present.

In `src/app/admin/_components/`, add `"leaders"` to the `Tab` union and
`{ key: "leaders", href: "/admin/leaders", label: "Leaders" }` to the tab list.

- [ ] **Step 6: Run everything and commit**

Run: `npx tsc --noEmit && npm run lint && npm run prove:leaders`
Expected: all green.

```bash
git add -A
git commit -m "feat: manage leaders from the admin surface"
```

---

### Task 6: Photos, consent capture, and withdrawal

**Files:**
- Create: `src/lib/leaders/paths.ts`
- Modify: `src/app/admin/leaders/actions.ts`
- Modify: `scripts/prove-leaders.mjs`

**Interfaces:**
- Consumes: `validateImage` from `@/lib/images/validate`; `reapPaths` from `@/lib/pages/reap`
- Produces: `uploadLeaderPhoto(id, formData)`, `removeLeaderPhoto(id)`, `withdrawConsent(id)` — each `Promise<{ error?: string }>`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/prove-leaders.mjs`:

```javascript
console.log("\n── Photos and consent withdrawal ──");

const consented = await admin.from("leaders").insert({
  name: "Photo Leader", slug: `photo-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", photo_path: "leaders/probe/a.jpg",
  consent_at: new Date().toISOString(), consent_by: pyhId })
  .select("id").maybeSingle();
check("a photo WITH consent recorded saves", !consented.error, consented.error?.message);

// Withdrawal must be one statement. Clearing consent while the photo remains is
// exactly the half-done state the constraint exists to forbid.
const halfWithdraw = await admin.from("leaders")
  .update({ consent_at: null, consent_by: null }).eq("id", consented.data.id).select("id");
check("clearing consent while a photo remains is rejected", !!halfWithdraw.error, halfWithdraw.data);

const fullWithdraw = await admin.from("leaders")
  .update({ consent_at: null, consent_by: null, photo_path: null, message: null })
  .eq("id", consented.data.id).select("id");
check("clearing consent together with the photo and quote succeeds",
  !fullWithdraw.error && fullWithdraw.data?.length === 1, fullWithdraw.error?.message);

console.log("\n── Photo action statement order (source-level) ──");

// Order matters: reap after the row is updated, or a crash between the two
// leaves the page pointing at an object that no longer exists.
const src = readFileSync(join(root, "src/app/admin/leaders/actions.ts"), "utf8");
const body = (fn) => src.slice(src.indexOf(`export async function ${fn}`));
// `-1 < -1` is false, but `indexOf` returning -1 for the FIRST operand and a
// real index for the second still compares "correctly" — a vacuous pass. This
// is the exact defect 1b8301e had to close in the chapters slice. Both indices
// must be real before the ordering means anything.
const orderedBefore = (hay, first, second) => {
  const a = hay.indexOf(first), b = hay.indexOf(second);
  return a >= 0 && b >= 0 && a < b;
};

const upload = body("uploadLeaderPhoto");
check("uploadLeaderPhoto updates photo_path before reaping the replaced photo",
  orderedBefore(upload, "photo_path", "reapPaths"), null);
const remove = body("removeLeaderPhoto");
check("removeLeaderPhoto reaps the photo before clearing photo_path",
  orderedBefore(remove, "reapPaths", "photo_path"), null);

// Order-independent on purpose: the three fields must land in ONE update() call,
// but which order the implementer writes them in is not a correctness property.
const withdraw = body("withdrawConsent");
const withdrawUpdate = withdraw.match(/update\(\{[\s\S]*?\}\)/)?.[0] ?? "";
check("withdrawConsent clears photo_path, message, and consent in ONE update",
  ["photo_path", "message", "consent_at", "consent_by"].every((f) => withdrawUpdate.includes(f)),
  withdrawUpdate.slice(0, 120));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run prove:leaders`
Expected: the three source-level assertions FAIL — the functions do not exist yet.

- [ ] **Step 3: Write the path helper**

Create `src/lib/leaders/paths.ts`:

```typescript
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a leader photo inside the `media` bucket, prefixed by slug. */
export function leaderImageKey(slug: string, mime: string): string {
  return `leaders/${slug}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
```

- [ ] **Step 4: Write the three actions**

Add to `src/app/admin/leaders/actions.ts`, following
`uploadChapterCover` / `removeChapterCover` for the upload and reap sequence.
`uploadLeaderPhoto` writes `photo_path`, `consent_at`, and `consent_by` in one
`update()` — the CHECK rejects any statement that separates them, so there is no
"upload now, record consent later" path by construction.

`withdrawConsent(id)` clears `photo_path`, `message`, `consent_at`, and
`consent_by` in a single `update()`, then reaps the object.

- [ ] **Step 5: Run everything and commit**

Run: `npx tsc --noEmit && npm run lint && npm run prove:leaders`
Expected: all green.

```bash
git add -A
git commit -m "feat: upload leader photos with consent recorded on the row"
```

---

### Task 7: Documentation and close-out

**Files:**
- Modify: `README.md`
- Modify: `ZUBIDA_CONTENT_AUDIT.md`
- Modify: `docs/superpowers/specs/2026-08-18-leaders-managed-domain-design.md`

- [ ] **Step 1: Add the suite to the README**

In the Verification block, after `prove:chapters`:

```bash
npm run prove:leaders     # N — the leadership directory, RLS and consent
```

Replace `N` with the actual final count from `npm run prove:leaders`. **Re-run
every other suite and correct its number too** — the chapters slice found the
README claiming 89 when `prove:content` ran 91, and 23 migrations when there were
25. Numbers in documentation rot silently.

- [ ] **Step 2: Note the entry path**

Add one line under the admin bullet list in "What is built":

```markdown
- Leadership directory — cluster heads manage their own cluster's leaders, the
  provincial youth head manages all. A photo or a personal quote cannot be stored
  without a recorded consent basis.
```

- [ ] **Step 3: Record the resolution in the audit**

In `ZUBIDA_CONTENT_AUDIT.md` §2.4, add a **RESOLVED** note in the convention §2.5
already uses: every fabricated row is gone rather than corrected, the invented
clergy attribution with it, the `"#"` links are unrepresentable, and consent is
enforced in SQL.

- [ ] **Step 4: Mark the spec implemented**

Change the spec's `**Status:**` line to `Implemented <date>` and add the final
assertion count. If Task 2's escalation probe forced the fallback, make sure the
spec records which design shipped.

- [ ] **Step 5: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run prove:content
npm run prove:leaders
npm run prove:chapters
npm run prove:rbac
```

`prove:chapters` and `prove:rbac` are included because this slice adds a trigger
and policies to a database whose assertions they also exercise, and because
`leaders.chapter_id` is a foreign key into `chapters`.

- [ ] **Step 6: Commit and open a PR**

```bash
git add -A
git commit -m "docs: record the leadership directory and its suite"
git push -u origin leaders-managed-domain
```

Open a PR against `master` describing the consent constraint and why it is
stronger than hiding, the trigger-ordering proof, and the retirement of the
invented taxonomy.

---

## Notes for the executor

**The consent CHECK is not negotiable.** If a write fails with
`leaders_personal_content_requires_consent`, the fix is to include the consent
columns in that same statement — never to split the write, relax the constraint,
or set the columns to a sentinel. The constraint failing is the design working.

**The RLS false-pass will bite you.** A negative assertion passes when the policy
is correct, when there is *no policy at all*, and when you wrote it against the
service-role client. Task 2 Step 5 exists precisely because passing does not prove
working. Do not trust a green suite you have not seen go red.

**Do not add sample data.** If the page looks empty, that is the design. The table
ships empty and the site withholds until an administrator enters real people. If
you find yourself writing an insert to "check the layout", write it in a scratch
script under `scripts/`, delete the rows, and delete the script.

**`category`, `readTime`, and stock faces are intentionally absent.** If a
component references them, delete the element — do not reintroduce the field.

**No placeholder for a missing face.** A silhouette or an initials avatar is the
same class of invention as a stand-in phone number. A leader with no photo renders
without one.
