# Phase 3a: RBAC, User Management & Event Ownership — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat "any admin can do anything" model into a two-tier RBAC system (Provincial Youth Head + Cluster Head) with PYH-only user management, cluster-scoped event ownership/CRUD, and hardened auth — without touching the public site.

**Architecture:** Additive SQL migrations add a `clusters` table, RBAC columns on `admins`/`events`, and SECURITY DEFINER helper functions (`is_pyh`, `admin_cluster`) that back new RLS policies (the real authorization backstop). The Next.js app layer adds middleware (coarse gate + session refresh + idle timeout), per-action authz helpers, and new admin screens (Events CRUD, Users, Logs) styled with existing components. Correctness is proven by a `prove-rbac.mjs` script run against the real hosted Supabase DB, mirroring Phase 2's proof approach.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Supabase (Auth + Postgres + RLS, untyped JS clients), `@supabase/ssr`, Zod, `pg` (migration runner + proof scripts), Tailwind.

## Global Constraints

- **Public site is pixel-perfect and untouched.** No edits to `src/app/{page,about,chapters,contact,events,gallery,leaders,news}` , `src/components/{home,layout,about,events,gallery,leaders,news,shared,ui}`, or `src/app/globals.css`. New admin UI reuses existing components (`Button`, `glass` classes, gold/royal palette) but adds new files only.
- **All mutations are Next.js Server Actions** (no new mutating API routes) — relies on Next 15 same-origin CSRF protection.
- **RLS is the authorization backstop.** UI hiding and action guards are defense-in-depth, never the only check.
- **Migrations are additive**, numbered continuing from `0006`, applied via `npm run db:migrate` (`scripts/db-migrate.mjs`), NOT the supabase CLI (no Docker on this machine).
- **Supabase clients are untyped** — extend `src/lib/supabase/database.types.ts` by hand and cast results.
- **Secrets** live in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
- `next build` must stay green after every task that touches app code.
- Idle timeout default: **30 minutes** (`IDLE_TIMEOUT_MS = 30 * 60 * 1000`).
- Roles enum values: PYH = `provincial_youth_head`, Cluster Head = `cluster_head`. Legacy values (`super_admin`, `provincial_admin`, `event_organizer`) stay in the enum, unused. The bootstrap `super_admin` admin is promoted to `provincial_youth_head`.

---

## File Structure

**SQL migrations (create):**
- `supabase/migrations/0007_clusters.sql` — clusters table + seed.
- `supabase/migrations/0008_admins_rbac.sql` — admins columns, `cluster_head` enum value, promote bootstrap, `is_pyh`/`admin_cluster` functions.
- `supabase/migrations/0009_events_ownership.sql` — events `created_by` + `cluster_id`.
- `supabase/migrations/0010_rls_rbac.sql` — RBAC RLS policies.

**App layer (create):**
- `src/middleware.ts` — coarse gate + session refresh + idle timeout.
- `src/lib/rbac.ts` — role/cluster types + `AdminContext` loader shared by screens/actions.
- `src/lib/validation/event.ts` — Zod schema for event create/edit.
- `src/lib/validation/user.ts` — Zod schema for cluster-head create/edit.
- `src/app/admin/_components/admin-shell.tsx` — nav shell (role-aware).
- `src/app/admin/events/page.tsx`, `actions.ts`, `new/page.tsx`, `[id]/edit/page.tsx`, `_components/event-form.tsx`, `_components/events-table.tsx`.
- `src/app/admin/users/page.tsx`, `actions.ts`, `_components/user-form.tsx`, `_components/users-table.tsx`.
- `src/app/admin/logs/page.tsx`.

**App layer (modify):**
- `src/lib/supabase/admin-auth.ts` — add `requirePYH`, `requireClusterAccess`, `loadAdminContext`; harden `requireAdmin` (active + not deleted).
- `src/lib/supabase/database.types.ts` — add clusters, extend admins/events, add functions.
- `src/app/admin/login/actions.ts` — login/logout audit + `last_activity` cookie.
- `src/app/admin/page.tsx` — wrap in admin shell, scope registrations by cluster.
- `src/app/admin/actions.ts` — scope `setStatus` via `requireClusterAccess`.
- `src/components/admin/registrations-table.tsx` — accept `canModerate` flag (cluster heads still moderate their own; no behavior change for PYH).

**Proof (create):**
- `scripts/prove-rbac.mjs` — RBAC assertions against the real DB.

**Proof (modify):**
- `package.json` — add `"prove:rbac": "node scripts/prove-rbac.mjs"`.

---

## Task 1: Clusters table + seed migration

**Files:**
- Create: `supabase/migrations/0007_clusters.sql`

**Interfaces:**
- Produces: table `clusters(id uuid, name text unique, slug text unique, created_at)` seeded with the distinct cluster names used in `src/data/chapters.ts` (`Bay Cluster`, `North Cluster`, `Central Cluster`, `Coastal Cluster` — plus any others present).

- [ ] **Step 1: Confirm the distinct cluster names in the mock data**

Run: `grep -o 'cluster: "[^"]*"' src/data/chapters.ts | sort -u`
Expected: a short list of cluster names. Use exactly these names in the seed below (adjust the `values` rows to match the actual output).

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0007_clusters.sql`:

```sql
-- 0007_clusters.sql — canonical clusters
create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Seed from the cluster names used across chapters (idempotent).
insert into clusters (name, slug) values
  ('Bay Cluster', 'bay'),
  ('North Cluster', 'north'),
  ('Central Cluster', 'central'),
  ('Coastal Cluster', 'coastal')
on conflict (name) do nothing;
```

(Replace the `values` rows with the exact list from Step 1 if it differs. Slug = lowercased first word.)

- [ ] **Step 3: Apply the migration**

Run: `npm run db:migrate`
Expected: `apply 0007_clusters.sql ... ok` then `Done.`

- [ ] **Step 4: Verify the table + seed**

Run: `node -e "import('pg').then(async({default:pg})=>{const d=await import('dotenv');d.config({path:'.env.local'});const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query('select name,slug from clusters order by name');console.log(r.rows);await c.end();})"`
Expected: prints the seeded cluster rows (4+ rows with name + slug).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_clusters.sql
git commit -m "feat(db): clusters table + seed"
```

---

## Task 2: Admins RBAC columns + helper functions

**Files:**
- Create: `supabase/migrations/0008_admins_rbac.sql`

**Interfaces:**
- Consumes: `clusters` (Task 1), existing `admins` table + `admin_role` enum + `is_admin(uid)`.
- Produces:
  - `admins` gains `full_name text`, `username text unique`, `cluster_id uuid references clusters(id)`, `is_active boolean not null default true`.
  - enum `admin_role` gains value `cluster_head`.
  - functions `is_pyh(uid uuid) returns boolean`, `admin_cluster(uid uuid) returns uuid`.
  - `is_admin(uid)` updated to also require `is_active = true`.
  - the existing `super_admin` bootstrap row is set to role `provincial_youth_head` and `is_active = true`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_admins_rbac.sql`:

```sql
-- 0008_admins_rbac.sql — two-tier RBAC on admins
alter type admin_role add value if not exists 'provincial_youth_head';
alter type admin_role add value if not exists 'cluster_head';

alter table admins add column if not exists full_name text;
alter table admins add column if not exists username text;
alter table admins add column if not exists cluster_id uuid references clusters(id);
alter table admins add column if not exists is_active boolean not null default true;

create unique index if not exists admins_username_key
  on admins (lower(username)) where username is not null and deleted_at is null;

-- Promote the existing bootstrap admin(s) to PYH.
update admins set role = 'provincial_youth_head'
  where role in ('super_admin', 'provincial_admin');

-- is_admin: active, non-deleted admin only.
create or replace function is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins
    where user_id = uid and deleted_at is null and is_active = true
  );
$$;

create or replace function is_pyh(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins
    where user_id = uid and deleted_at is null and is_active = true
      and role = 'provincial_youth_head'
  );
$$;

create or replace function admin_cluster(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cluster_id from admins
  where user_id = uid and deleted_at is null and is_active = true
  limit 1;
$$;
```

> Note: `alter type ... add value` cannot run inside a transaction block in older Postgres. The migration runner wraps each file in `begin/commit`. Postgres 12+ (Supabase is 15) allows `add value` in a transaction as long as the new value isn't used in the same transaction — this migration only adds values and updates existing rows to `provincial_youth_head` (which already exists after the add). If `npm run db:migrate` reports a "unsafe use of new value" error, split the two `add value` lines into their own file `0008a_enum.sql` applied first. Verify in Step 2.

- [ ] **Step 2: Apply and verify functions**

Run: `npm run db:migrate`
Expected: `apply 0008_admins_rbac.sql ... ok`. If it FAILS with an enum-transaction error, move the two `alter type` lines to a new `supabase/migrations/0008a_enum.sql` (applied before `0008b`), rename the rest to `0008b_admins_rbac.sql`, and re-run.

- [ ] **Step 3: Verify the bootstrap admin is now PYH and helpers work**

Run: `node -e "import('pg').then(async({default:pg})=>{const d=await import('dotenv');d.config({path:'.env.local'});const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();const a=await c.query('select user_id, role, is_active from admins');console.log('admins:',a.rows);for(const row of a.rows){const p=await c.query('select is_pyh(\$1) as pyh, admin_cluster(\$1) as cl',[row.user_id]);console.log(row.user_id, p.rows[0]);}await c.end();})"`
Expected: the bootstrap admin row has `role: 'provincial_youth_head'`, `is_active: true`, `is_pyh: true`, `admin_cluster: null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_admins_rbac.sql
git commit -m "feat(db): admins RBAC columns + is_pyh/admin_cluster helpers"
```

---

## Task 3: Events ownership columns

**Files:**
- Create: `supabase/migrations/0009_events_ownership.sql`

**Interfaces:**
- Consumes: `clusters` (Task 1), existing `events` table.
- Produces: `events` gains `created_by uuid references auth.users(id)` and `cluster_id uuid references clusters(id)` (both nullable; NULL cluster = provincial-wide).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_events_ownership.sql`:

```sql
-- 0009_events_ownership.sql — event ownership + cluster scoping
alter table events add column if not exists created_by uuid references auth.users(id);
alter table events add column if not exists cluster_id uuid references clusters(id);

create index if not exists events_cluster_idx on events (cluster_id) where deleted_at is null;
create index if not exists events_created_by_idx on events (created_by) where deleted_at is null;
```

- [ ] **Step 2: Apply**

Run: `npm run db:migrate`
Expected: `apply 0009_events_ownership.sql ... ok`.

- [ ] **Step 3: Verify columns exist**

Run: `node -e "import('pg').then(async({default:pg})=>{const d=await import('dotenv');d.config({path:'.env.local'});const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='events' and column_name in ('created_by','cluster_id') order by column_name\");console.log(r.rows);await c.end();})"`
Expected: two rows — `cluster_id`, `created_by`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_events_ownership.sql
git commit -m "feat(db): event ownership (created_by, cluster_id)"
```

---

## Task 4: RBAC RLS policies

**Files:**
- Create: `supabase/migrations/0010_rls_rbac.sql`

**Interfaces:**
- Consumes: `is_admin`, `is_pyh`, `admin_cluster` (Task 2); `events.cluster_id`/`created_by` (Task 3); `clusters` (Task 1).
- Produces: RLS policies enforcing PYH-all / cluster-head-scoped access on `events`, `event_registrations`, `admins`, `clusters`, `audit_log`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_rls_rbac.sql`:

```sql
-- 0010_rls_rbac.sql — two-tier RBAC policies
alter table clusters enable row level security;

-- EVENTS ---------------------------------------------------------------
drop policy if exists events_admin_write on events;

drop policy if exists events_insert on events;
create policy events_insert on events
  for insert to authenticated
  with check (
    is_pyh(auth.uid())
    or (is_admin(auth.uid()) and cluster_id is not distinct from admin_cluster(auth.uid()))
  );

drop policy if exists events_update on events;
create policy events_update on events
  for update to authenticated
  using (
    is_pyh(auth.uid())
    or (is_admin(auth.uid()) and cluster_id is not distinct from admin_cluster(auth.uid()))
  )
  with check (
    is_pyh(auth.uid())
    or (is_admin(auth.uid()) and cluster_id is not distinct from admin_cluster(auth.uid()))
  );

drop policy if exists events_delete on events;
create policy events_delete on events
  for delete to authenticated
  using (
    is_pyh(auth.uid())
    or (created_by = auth.uid() and cluster_id is not distinct from admin_cluster(auth.uid()))
  );

-- EVENT_REGISTRATIONS --------------------------------------------------
drop policy if exists registrations_admin_read on event_registrations;
create policy registrations_admin_read on event_registrations
  for select to authenticated
  using (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_registrations.event_id
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
        and is_admin(auth.uid())
    )
  );

drop policy if exists registrations_admin_update on event_registrations;
create policy registrations_admin_update on event_registrations
  for update to authenticated
  using (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_registrations.event_id
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
        and is_admin(auth.uid())
    )
  )
  with check (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_registrations.event_id
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
        and is_admin(auth.uid())
    )
  );

-- ADMINS ---------------------------------------------------------------
-- self/all read stays (needed for role checks); writes are PYH-only.
drop policy if exists admins_pyh_write on admins;
create policy admins_pyh_write on admins
  for all to authenticated
  using (is_pyh(auth.uid()))
  with check (is_pyh(auth.uid()));

-- CLUSTERS -------------------------------------------------------------
drop policy if exists clusters_admin_read on clusters;
create policy clusters_admin_read on clusters
  for select to authenticated using (is_admin(auth.uid()));

drop policy if exists clusters_pyh_write on clusters;
create policy clusters_pyh_write on clusters
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));

-- AUDIT_LOG ------------------------------------------------------------
drop policy if exists audit_admin_read on audit_log;
create policy audit_pyh_read on audit_log
  for select to authenticated using (is_pyh(auth.uid()));
```

> `is not distinct from` makes NULL cluster comparisons work (a PYH-created provincial event has `cluster_id = NULL`; a cluster head whose `admin_cluster` is a real UUID will NOT match it — correct, only PYH manages provincial events). The `admins_pyh_write` policy replaces nothing that granted cluster heads write; the existing `admins_self_read` SELECT policy from `0005_rls.sql` remains for role lookups.

- [ ] **Step 2: Apply**

Run: `npm run db:migrate`
Expected: `apply 0010_rls_rbac.sql ... ok`.

- [ ] **Step 3: Smoke-check policies exist**

Run: `node -e "import('pg').then(async({default:pg})=>{const d=await import('dotenv');d.config({path:'.env.local'});const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query(\"select tablename, policyname from pg_policies where schemaname='public' and tablename in ('events','event_registrations','admins','clusters','audit_log') order by tablename, policyname\");console.log(r.rows);await c.end();})"`
Expected: lists `events_insert/update/delete`, `registrations_admin_read/update`, `admins_pyh_write`, `clusters_admin_read/pyh_write`, `audit_pyh_read` (plus existing read policies).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_rls_rbac.sql
git commit -m "feat(db): two-tier RBAC RLS policies"
```

---

## Task 5: RBAC proof script (the real gate)

**Files:**
- Create: `scripts/prove-rbac.mjs`
- Modify: `package.json` (add `prove:rbac` script)

**Interfaces:**
- Consumes: everything from Tasks 1–4; env vars from `.env.local`.
- Produces: an executable proof that a cluster head is confined to their cluster and cannot touch users. This is the correctness gate for the DB layer — later app tasks depend on these policies being proven.

- [ ] **Step 1: Write the proof script**

Create `scripts/prove-rbac.mjs`:

```js
// Proves two-tier RBAC against the hosted DB. Creates a PYH, a cluster-head in
// cluster A, events in clusters A and B, then asserts the cluster head is
// confined to cluster A and cannot manage users. Cleans up after itself.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("Missing Supabase env vars."); process.exit(1); }

const admin = createClient(url, service, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

async function mkUser(email) {
  const created = await admin.auth.admin.createUser({ email, password: "ProveRbac!2026", email_confirm: true });
  if (created.error) {
    if (/already/i.test(created.error.message)) {
      const list = await admin.auth.admin.listUsers();
      return list.data.users.find((u) => u.email === email).id;
    }
    throw created.error;
  }
  return created.data.user.id;
}
async function authedClient(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "ProveRbac!2026" });
  if (error) throw error;
  return c;
}

(async () => {
  const stamp = Date.now();
  const pyhEmail = `prove_pyh_${stamp}@test.com`;
  const chEmail = `prove_ch_${stamp}@test.com`;
  const pyhId = await mkUser(pyhEmail);
  const chId = await mkUser(chEmail);

  const { data: clusters } = await admin.from("clusters").select("id,name").order("name");
  const clusterA = clusters[0].id, clusterB = clusters[1].id;

  await admin.from("admins").upsert({ user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Prove PYH" }, { onConflict: "user_id" });
  await admin.from("admins").upsert({ user_id: chId, role: "cluster_head", cluster_id: clusterA, is_active: true, full_name: "Prove CH" }, { onConflict: "user_id" });

  const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
  const { data: evA } = await admin.from("events").insert({ name: "RBAC A", date: "2026-12-01", registration_deadline: deadline, slots_total: 10, cluster_id: clusterA, created_by: pyhId }).select("id").single();
  const { data: evB } = await admin.from("events").insert({ name: "RBAC B", date: "2026-12-01", registration_deadline: deadline, slots_total: 10, cluster_id: clusterB, created_by: pyhId }).select("id").single();

  const ch = await authedClient(chEmail);

  // 1. CH can read its own cluster's event
  const readA = await ch.from("events").select("id").eq("id", evA.id);
  check("CH CAN read cluster-A event", !readA.error && readA.data.length === 1, readA.data);

  // 2. CH can update its own cluster's event
  const updA = await ch.from("events").update({ venue: "Edited by CH" }).eq("id", evA.id).select("venue");
  check("CH CAN update cluster-A event", !updA.error && updA.data?.[0]?.venue === "Edited by CH", updA.error?.message ?? updA.data);

  // 3. CH CANNOT update cluster-B event (RLS: 0 rows affected)
  const updB = await ch.from("events").update({ venue: "hacked" }).eq("id", evB.id).select("venue");
  check("CH CANNOT update cluster-B event", (updB.data?.length ?? 0) === 0, updB.data);

  // 4. CH CANNOT delete cluster-B event
  const delB = await ch.from("events").delete().eq("id", evB.id).select("id");
  check("CH CANNOT delete cluster-B event", (delB.data?.length ?? 0) === 0, delB.data);

  // 5. CH CAN insert an event into its own cluster
  const insA = await ch.from("events").insert({ name: "CH new", date: "2026-12-02", registration_deadline: deadline, slots_total: 5, cluster_id: clusterA, created_by: chId }).select("id");
  check("CH CAN insert event in cluster A", !insA.error && insA.data?.length === 1, insA.error?.message ?? insA.data);

  // 6. CH CANNOT insert an event into cluster B
  const insB = await ch.from("events").insert({ name: "CH bad", date: "2026-12-02", registration_deadline: deadline, slots_total: 5, cluster_id: clusterB, created_by: chId }).select("id");
  check("CH CANNOT insert event in cluster B", !!insB.error || (insB.data?.length ?? 0) === 0, insB.error?.message ?? insB.data);

  // 7. CH CANNOT write to admins (create a user)
  const insAdmin = await ch.from("admins").insert({ user_id: pyhId, role: "cluster_head" }).select("id");
  check("CH CANNOT write admins", !!insAdmin.error || (insAdmin.data?.length ?? 0) === 0, insAdmin.error?.message ?? insAdmin.data);

  // 8. CH CANNOT read audit_log (PYH-only)
  const auditRead = await ch.from("audit_log").select("id").limit(1);
  check("CH CANNOT read audit_log", (auditRead.data?.length ?? 0) === 0, auditRead.data);

  // cleanup
  await admin.from("events").delete().in("cluster_id", [clusterA, clusterB]).like("name", "RBAC %");
  await admin.from("events").delete().eq("name", "CH new");
  await admin.from("admins").delete().in("user_id", [pyhId, chId]);
  await admin.auth.admin.deleteUser(pyhId);
  await admin.auth.admin.deleteUser(chId);

  console.log("─".repeat(48));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` after `"prove:behaviors"`:

```json
    "prove:rbac": "node scripts/prove-rbac.mjs"
```

- [ ] **Step 3: Run the proof**

Run: `npm run prove:rbac`
Expected: `8 passed, 0 failed`. If any FAIL, the RLS policies from Task 4 are wrong — fix the migration, re-run `npm run db:migrate`, re-run the proof. Do not proceed until green.

- [ ] **Step 4: Commit**

```bash
git add scripts/prove-rbac.mjs package.json
git commit -m "test(db): prove two-tier RBAC isolation against real DB"
```

---

## Task 6: DB types + RBAC context helpers

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/supabase/admin-auth.ts`
- Create: `src/lib/rbac.ts`

**Interfaces:**
- Produces:
  - `src/lib/rbac.ts` exports `type AdminRole = "provincial_youth_head" | "cluster_head"`, `type AdminContext = { userId: string; role: AdminRole; isPYH: boolean; clusterId: string | null; fullName: string | null }`.
  - `admin-auth.ts` exports `loadAdminContext(): Promise<AdminContext>`, `requirePYH(): Promise<AdminContext>`, `requireClusterAccess(clusterId: string | null): Promise<AdminContext>` (PYH always allowed; else requires `clusterId === ctx.clusterId`).
  - `database.types.ts` gains `clusters` table, extended `admins`/`events` rows, and `is_pyh`/`admin_cluster` functions.

- [ ] **Step 1: Extend database.types.ts**

In `src/lib/supabase/database.types.ts`, update the `EventRow` interface to add (after `deleted_at`):

```ts
  created_by: string | null;
  cluster_id: string | null;
```

Add a `ClusterRow` interface after `RegistrationRow`:

```ts
export interface ClusterRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface AdminRow {
  id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  cluster_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

Replace the inline `admins` table entry in `Tables` with `admins: Table<AdminRow, Partial<AdminRow>, Partial<AdminRow>>;` and add `clusters: Table<ClusterRow, Partial<ClusterRow>, Partial<ClusterRow>>;`. In `Functions`, add:

```ts
      is_pyh: { Args: { uid: string }; Returns: boolean };
      admin_cluster: { Args: { uid: string }; Returns: string | null };
```

- [ ] **Step 2: Create rbac.ts**

Create `src/lib/rbac.ts`:

```ts
export type AdminRole = "provincial_youth_head" | "cluster_head";

export interface AdminContext {
  userId: string;
  role: AdminRole;
  isPYH: boolean;
  clusterId: string | null;
  fullName: string | null;
}
```

- [ ] **Step 3: Add context + role guards to admin-auth.ts**

In `src/lib/supabase/admin-auth.ts`, add imports at top:

```ts
import type { AdminContext, AdminRole } from "@/lib/rbac";
import type { AdminRow } from "./database.types";
```

Append these functions:

```ts
export async function loadAdminContext(): Promise<AdminContext> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data } = await supabase
    .from("admins")
    .select("role, cluster_id, is_active, full_name, deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as Pick<AdminRow, "role" | "cluster_id" | "is_active" | "full_name" | "deleted_at"> | null;
  if (!row || row.deleted_at || !row.is_active) redirect("/admin/login?error=not-admin");
  return {
    userId: user.id,
    role: row.role as AdminRole,
    isPYH: row.role === "provincial_youth_head",
    clusterId: row.cluster_id,
    fullName: row.full_name,
  };
}

export async function requirePYH(): Promise<AdminContext> {
  const ctx = await loadAdminContext();
  if (!ctx.isPYH) redirect("/admin?error=forbidden");
  return ctx;
}

export async function requireClusterAccess(clusterId: string | null): Promise<AdminContext> {
  const ctx = await loadAdminContext();
  if (ctx.isPYH) return ctx;
  if (clusterId === null || clusterId !== ctx.clusterId) redirect("/admin?error=forbidden");
  return ctx;
}
```

- [ ] **Step 4: Verify it type-checks / builds**

Run: `npm run build`
Expected: build succeeds (no type errors). If `redirect` in a non-`redirect` context complains, ensure these functions stay in the `"server-only"` module (they do).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/supabase/admin-auth.ts src/lib/rbac.ts
git commit -m "feat: RBAC context loader + role guards (requirePYH, requireClusterAccess)"
```

---

## Task 7: Middleware — gate, session refresh, idle timeout

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `@supabase/ssr` `createServerClient`, cookies.
- Produces: middleware protecting `/admin/:path*`. Sets/reads a `last_activity` cookie; on idle > 30 min signs out and redirects to `/admin/login?error=timeout`. Refreshes the Supabase session on every request.

- [ ] **Step 1: Write the middleware**

Create `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const isLogin = request.nextUrl.pathname === "/admin/login";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isLogin) return response;
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // Idle timeout
  const last = request.cookies.get("last_activity")?.value;
  const now = Date.now();
  if (last && now - Number(last) > IDLE_TIMEOUT_MS) {
    await supabase.auth.signOut();
    const res = NextResponse.redirect(new URL("/admin/login?error=timeout", request.url));
    res.cookies.set("last_activity", "", { maxAge: 0, path: "/" });
    return res;
  }
  response.cookies.set("last_activity", String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (isLogin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds; middleware compiled (Next reports a `ƒ Middleware` line).

- [ ] **Step 3: Manual runtime check**

Run: `npm run dev` (in a background terminal), then:
- Visit `http://localhost:3000/admin` while signed out → redirected to `/admin/login`.
- Sign in → lands on `/admin`.
- Confirm a `last_activity` cookie is set (browser devtools → Application → Cookies).

Expected: redirect-when-signed-out works; cookie present. (Idle timeout is verified in Task 12's HTTP proof; a full 30-min wait is not required here.)

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: admin middleware — gate, session refresh, idle timeout"
```

---

## Task 8: Login/logout audit + activity cookie

**Files:**
- Modify: `src/app/admin/login/actions.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `createServiceClient`.
- Produces: `signIn` writes `auth.login` (success) or `auth.login_failed` to `audit_log` and sets `last_activity`; `signOut` writes `auth.logout`.

- [ ] **Step 1: Rewrite the login actions**

Replace `src/app/admin/login/actions.ts` with:

```ts
"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

async function logAuth(action: string, userId: string | null, email: string) {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await createServiceClient().from("audit_log").insert({
      actor_user_id: userId,
      action,
      entity: "auth",
      entity_id: email,
      meta: { ip },
    });
  } catch {
    // audit is best-effort; never block login on logging failure
  }
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get("password")),
  });
  if (error || !data.user) {
    await logAuth("auth.login_failed", null, email);
    redirect("/admin/login?error=invalid");
  }
  await logAuth("auth.login", data.user.id, email);
  (await cookies()).set("last_activity", String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await logAuth("auth.logout", user.id, user.email ?? "");
  await supabase.auth.signOut();
  (await cookies()).set("last_activity", "", { maxAge: 0, path: "/" });
  redirect("/admin/login");
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Runtime check**

With `npm run dev` running, sign in and out, then query the log:
Run: `node -e "import('pg').then(async({default:pg})=>{const d=await import('dotenv');d.config({path:'.env.local'});const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query(\"select action, entity_id, created_at from audit_log where entity='auth' order by created_at desc limit 5\");console.log(r.rows);await c.end();})"`
Expected: recent `auth.login` and `auth.logout` rows for your admin email.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login/actions.ts
git commit -m "feat: login/logout audit logging + activity cookie"
```

---

## Task 9: Admin shell + role-aware nav

**Files:**
- Create: `src/app/admin/_components/admin-shell.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `AdminContext` (Task 6).
- Produces: `<AdminShell ctx={...} active="registrations|events|users|logs">{children}</AdminShell>` — renders the existing header pattern (Admin eyebrow, title, Sign out) plus a nav row; Users + Logs links render only when `ctx.isPYH`.

- [ ] **Step 1: Create the shell**

Create `src/app/admin/_components/admin-shell.tsx`:

```tsx
import Link from "next/link";
import type { AdminContext } from "@/lib/rbac";
import { signOut } from "../login/actions";
import { Button } from "@/components/ui/button";

type Tab = "registrations" | "events" | "users" | "logs";

const baseTabs: { key: Tab; href: string; label: string; pyhOnly?: boolean }[] = [
  { key: "registrations", href: "/admin", label: "Registrations" },
  { key: "events", href: "/admin/events", label: "Events" },
  { key: "users", href: "/admin/users", label: "Users", pyhOnly: true },
  { key: "logs", href: "/admin/logs", label: "Logs", pyhOnly: true },
];

export function AdminShell({
  ctx,
  active,
  title,
  children,
}: {
  ctx: AdminContext;
  active: Tab;
  title: string;
  children: React.ReactNode;
}) {
  const tabs = baseTabs.filter((t) => !t.pyhOnly || ctx.isPYH);
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400">
            Admin{ctx.isPYH ? " · Provincial" : " · Cluster Head"}
          </p>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
        </div>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">Sign out</Button>
        </form>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              t.key === active
                ? "bg-royal-700 text-white dark:bg-gold-400 dark:text-royal-950"
                : "glass text-muted hover:text-royal-700 dark:hover:text-gold-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Rewire the registrations page to use the shell + cluster scope**

Replace `src/app/admin/page.tsx` with:

```tsx
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "./_components/admin-shell";
import { RegistrationsTable, type Row } from "@/components/admin/registrations-table";

export const metadata = { title: "Admin Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  // RLS already scopes rows to the viewer's cluster; no extra filter needed.
  const { data } = await supabase
    .from("event_registrations")
    .select("registration_id, full_name, email, chapter, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data as Row[] | null) ?? [];
  const total = rows.length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;

  return (
    <AdminShell ctx={ctx} active="registrations" title="Registrations">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total" value={total} />
        <Stat label="Pending" value={pending} />
        <Stat label="Approved" value={approved} />
      </div>
      <div className="mt-10">
        <RegistrationsTable initial={rows} />
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold text-royal-700 dark:text-gold-300">
        {value}
      </p>
    </div>
  );
}
```

> The registrations RLS from Task 4 already filters to the cluster head's cluster, so a cluster head automatically sees only their events' registrations. PYH sees all. No client change needed.

- [ ] **Step 3: Scope the setStatus action**

In `src/app/admin/actions.ts`, replace `const user = await requireAdmin();` with a scoped check. Full new file:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, loadAdminContext } from "@/lib/supabase/admin-auth";

export async function setStatus(
  registrationId: string,
  status: "approved" | "rejected",
) {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  // RLS restricts UPDATE to registrations in the admin's cluster (or all for PYH).
  const { data, error } = await supabase
    .from("event_registrations")
    .update({ status })
    .eq("registration_id", registrationId)
    .select("registration_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await supabase.from("audit_log").insert({
    actor_user_id: ctx.userId,
    action: `registration.${status}`,
    entity: "event_registrations",
    entity_id: registrationId,
  });
  revalidatePath("/admin");
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/_components/admin-shell.tsx src/app/admin/page.tsx src/app/admin/actions.ts
git commit -m "feat: admin shell with role-aware nav; scope registrations by cluster"
```

---

## Task 10: Event CRUD — validation, actions, and screens

**Files:**
- Create: `src/lib/validation/event.ts`
- Create: `src/app/admin/events/actions.ts`
- Create: `src/app/admin/events/page.tsx`
- Create: `src/app/admin/events/_components/events-table.tsx`
- Create: `src/app/admin/events/_components/event-form.tsx`
- Create: `src/app/admin/events/new/page.tsx`
- Create: `src/app/admin/events/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `loadAdminContext`, `requireClusterAccess` (Task 6); `AdminShell` (Task 9); `EventRow`, `ClusterRow` (Task 6); existing `Button`.
- Produces: server actions `createEvent(formData)`, `updateEvent(id, formData)`, `setEventStatus(id, status)`, `deleteEvent(id)`; event list + create/edit screens.

- [ ] **Step 1: Event validation schema**

Create `src/lib/validation/event.ts`:

```ts
import { z } from "zod";

const optionalText = z.string().max(2000).optional().or(z.literal(""));

export const eventSchema = z.object({
  name: z.string().min(3).max(160),
  date: z.string().min(1), // yyyy-mm-dd
  time: z.string().max(60).optional().or(z.literal("")),
  venue: optionalText,
  organizer: optionalText,
  description: optionalText,
  cover: z.string().url().max(500).optional().or(z.literal("")),
  registration_deadline: z.string().min(1), // ISO datetime-local
  slots_total: z.coerce.number().int().min(0).max(100000),
  status: z.enum(["Open", "Closed", "Finished"]),
  scope: z.enum(["Provincial", "Chapter"]),
  cluster_id: z.string().uuid().optional().or(z.literal("")),
});

export type EventInput = z.infer<typeof eventSchema>;
```

- [ ] **Step 2: Event actions**

Create `src/app/admin/events/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase, loadAdminContext, requireClusterAccess } from "@/lib/supabase/admin-auth";
import { eventSchema } from "@/lib/validation/event";
import type { EventRow } from "@/lib/supabase/database.types";

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const result = eventSchema.safeParse(raw);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid event");
  return result.data;
}

async function audit(userId: string, action: string, id: string) {
  const supabase = await createServerSupabase();
  await supabase.from("audit_log").insert({ actor_user_id: userId, action, entity: "events", entity_id: id });
}

export async function createEvent(formData: FormData) {
  const ctx = await loadAdminContext();
  const input = parse(formData);
  // Cluster heads are forced into their own cluster; PYH may choose (or null).
  const clusterId = ctx.isPYH ? (input.cluster_id || null) : ctx.clusterId;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("events")
    .insert({
      name: input.name,
      date: input.date,
      time: input.time || null,
      venue: input.venue || null,
      organizer: input.organizer || null,
      description: input.description || null,
      cover: input.cover || null,
      registration_deadline: new Date(input.registration_deadline).toISOString(),
      slots_total: input.slots_total,
      status: input.status,
      scope: input.scope,
      cluster_id: clusterId,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(ctx.userId, "event.create", (data as { id: string }).id);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function updateEvent(id: string, formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("events").select("cluster_id").eq("id", id).single();
  const ctx = await requireClusterAccess((existing as Pick<EventRow, "cluster_id"> | null)?.cluster_id ?? null);
  const input = parse(formData);
  const patch: Partial<EventRow> = {
    name: input.name,
    date: input.date,
    time: input.time || null,
    venue: input.venue || null,
    organizer: input.organizer || null,
    description: input.description || null,
    cover: input.cover || null,
    registration_deadline: new Date(input.registration_deadline).toISOString(),
    slots_total: input.slots_total,
    status: input.status,
    scope: input.scope,
  };
  if (ctx.isPYH) patch.cluster_id = input.cluster_id || null;
  const { data, error } = await supabase.from("events").update(patch).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await audit(ctx.userId, "event.update", id);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function setEventStatus(id: string, status: "Open" | "Closed" | "Finished") {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("events").select("cluster_id").eq("id", id).single();
  const ctx = await requireClusterAccess((existing as Pick<EventRow, "cluster_id"> | null)?.cluster_id ?? null);
  const { data, error } = await supabase.from("events").update({ status }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await audit(ctx.userId, `event.status.${status}`, id);
  revalidatePath("/admin/events");
}

export async function deleteEvent(id: string) {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("events").select("cluster_id").eq("id", id).single();
  const ctx = await requireClusterAccess((existing as Pick<EventRow, "cluster_id"> | null)?.cluster_id ?? null);
  // Soft delete. RLS delete policy also enforces created_by for cluster heads on hard delete;
  // here we UPDATE deleted_at (an update), so ownership is enforced by the update policy + this guard.
  const { data, error } = await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await audit(ctx.userId, "event.delete", id);
  revalidatePath("/admin/events");
}
```

> Soft-delete is an UPDATE, gated by the events UPDATE policy (cluster match) plus the `requireClusterAccess` guard. The stricter "only creator deletes" rule from the spec applies to hard deletes; for soft-delete we accept cluster-level delete by any cluster head in that cluster, which is consistent with them being able to edit those events. This is the accepted simplification from the spec.

- [ ] **Step 3: Events table component**

Create `src/app/admin/events/_components/events-table.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useTransition } from "react";
import { setEventStatus, deleteEvent } from "../actions";
import { Button } from "@/components/ui/button";

export type EventListRow = {
  id: string;
  name: string;
  date: string;
  status: string;
  slots_taken: number;
  slots_total: number;
  cluster_name: string | null;
};

const badge: Record<string, string> = {
  Open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Closed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Finished: "bg-slate-500/15 text-slate-500",
};

export function EventsTable({ rows }: { rows: EventListRow[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-black/5 dark:border-white/10">
            <th className="p-3 font-medium">Event</th>
            <th className="p-3 font-medium">Date</th>
            <th className="p-3 font-medium">Cluster</th>
            <th className="p-3 font-medium">Slots</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-black/5 dark:border-white/10">
              <td className="p-3 font-medium">{e.name}</td>
              <td className="p-3">{e.date}</td>
              <td className="p-3">{e.cluster_name ?? "Provincial"}</td>
              <td className="p-3">{e.slots_taken}/{e.slots_total}</td>
              <td className="p-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge[e.status] ?? ""}`}>{e.status}</span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/events/${e.id}/edit`} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 dark:text-royal-300">Edit</Link>
                  {e.status !== "Open" ? (
                    <button disabled={pending} onClick={() => start(() => setEventStatus(e.id, "Open"))} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 disabled:opacity-40">Publish</button>
                  ) : (
                    <button disabled={pending} onClick={() => start(() => setEventStatus(e.id, "Finished"))} className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-500 disabled:opacity-40">Archive</button>
                  )}
                  <button disabled={pending} onClick={() => { if (confirm("Delete this event?")) start(() => deleteEvent(e.id)); }} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40">Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-10 text-center text-muted">No events yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Event form component**

Create `src/app/admin/events/_components/event-form.tsx`:

```tsx
"use client";
import { Button } from "@/components/ui/button";

export type ClusterOption = { id: string; name: string };
export type EventFormValues = {
  name?: string; date?: string; time?: string; venue?: string; organizer?: string;
  description?: string; cover?: string; registration_deadline?: string;
  slots_total?: number; status?: string; scope?: string; cluster_id?: string | null;
};

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export function EventForm({
  action,
  values = {},
  clusters,
  isPYH,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  values?: EventFormValues;
  clusters: ClusterOption[];
  isPYH: boolean;
  submitLabel: string;
}) {
  return (
    <form action={action} className="glass grid max-w-2xl gap-4 rounded-2xl p-6">
      <label className="block"><span className={label}>Name</span>
        <input name="name" required defaultValue={values.name} className={field} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className={label}>Date</span>
          <input type="date" name="date" required defaultValue={values.date} className={field} /></label>
        <label className="block"><span className={label}>Time</span>
          <input name="time" defaultValue={values.time} className={field} /></label>
      </div>
      <label className="block"><span className={label}>Venue</span>
        <input name="venue" defaultValue={values.venue} className={field} /></label>
      <label className="block"><span className={label}>Organizer</span>
        <input name="organizer" defaultValue={values.organizer} className={field} /></label>
      <label className="block"><span className={label}>Cover image URL</span>
        <input name="cover" defaultValue={values.cover} className={field} /></label>
      <label className="block"><span className={label}>Description</span>
        <textarea name="description" rows={4} defaultValue={values.description} className={field} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className={label}>Registration deadline</span>
          <input type="datetime-local" name="registration_deadline" required defaultValue={values.registration_deadline} className={field} /></label>
        <label className="block"><span className={label}>Total slots</span>
          <input type="number" name="slots_total" min={0} required defaultValue={values.slots_total} className={field} /></label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className={label}>Status</span>
          <select name="status" defaultValue={values.status ?? "Open"} className={field}>
            <option value="Open">Open (published)</option>
            <option value="Closed">Closed</option>
            <option value="Finished">Finished (archived)</option>
          </select></label>
        <label className="block"><span className={label}>Scope</span>
          <select name="scope" defaultValue={values.scope ?? "Provincial"} className={field}>
            <option value="Provincial">Provincial</option>
            <option value="Chapter">Chapter</option>
          </select></label>
      </div>
      {isPYH && (
        <label className="block"><span className={label}>Cluster</span>
          <select name="cluster_id" defaultValue={values.cluster_id ?? ""} className={field}>
            <option value="">Provincial-wide (no cluster)</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
      )}
      <div><Button type="submit">{submitLabel}</Button></div>
    </form>
  );
}
```

- [ ] **Step 5: Events list page**

Create `src/app/admin/events/page.tsx`:

```tsx
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { EventsTable, type EventListRow } from "./_components/events-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = { title: "Manage Events", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("events")
    .select("id, name, date, status, slots_taken, slots_total, cluster_id")
    .is("deleted_at", null)
    .order("date", { ascending: true });
  const { data: clusters } = await supabase.from("clusters").select("id, name");
  const clusterMap = new Map((clusters as { id: string; name: string }[] | null ?? []).map((c) => [c.id, c.name]));

  const rows: EventListRow[] = ((data as (EventListRow & { cluster_id: string | null })[] | null) ?? []).map((e) => ({
    id: e.id, name: e.name, date: e.date, status: e.status,
    slots_taken: e.slots_taken, slots_total: e.slots_total,
    cluster_name: e.cluster_id ? clusterMap.get(e.cluster_id) ?? null : null,
  }));

  return (
    <AdminShell ctx={ctx} active="events" title="Events">
      <div className="mb-4 flex justify-end">
        <Link href="/admin/events/new"><Button size="sm">New event</Button></Link>
      </div>
      <EventsTable rows={rows} />
    </AdminShell>
  );
}
```

> Events list is scoped by RLS's SELECT policy for events? No — the events public-read policy allows all non-deleted events to be read. Cluster heads will see all events in the list but can only Edit/Delete their own cluster's (enforced by actions + RLS). Acceptable: visibility of event names is public anyway. If stricter list-scoping is wanted, filter `.eq("cluster_id", ctx.clusterId)` for non-PYH — but keep the public read as-is.

- [ ] **Step 6: New + Edit pages**

Create `src/app/admin/events/new/page.tsx`:

```tsx
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../../_components/admin-shell";
import { EventForm } from "../_components/event-form";
import { createEvent } from "../actions";

export const metadata = { title: "New Event", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  const { data: clusters } = await supabase.from("clusters").select("id, name").order("name");
  return (
    <AdminShell ctx={ctx} active="events" title="New event">
      <EventForm action={createEvent} clusters={(clusters as { id: string; name: string }[]) ?? []} isPYH={ctx.isPYH} submitLabel="Create event" />
    </AdminShell>
  );
}
```

Create `src/app/admin/events/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../../../_components/admin-shell";
import { EventForm } from "../../_components/event-form";
import { updateEvent } from "../../actions";
import type { EventRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Edit Event", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("events").select("*").eq("id", id).is("deleted_at", null).single();
  const e = data as EventRow | null;
  if (!e) notFound();
  const { data: clusters } = await supabase.from("clusters").select("id, name").order("name");

  const values = {
    name: e.name, date: e.date, time: e.time ?? "", venue: e.venue ?? "",
    organizer: e.organizer ?? "", description: e.description ?? "", cover: e.cover ?? "",
    registration_deadline: e.registration_deadline.slice(0, 16),
    slots_total: e.slots_total, status: e.status, scope: e.scope, cluster_id: e.cluster_id,
  };
  const action = updateEvent.bind(null, id);

  return (
    <AdminShell ctx={ctx} active="events" title="Edit event">
      <EventForm action={action} values={values} clusters={(clusters as { id: string; name: string }[]) ?? []} isPYH={ctx.isPYH} submitLabel="Save changes" />
    </AdminShell>
  );
}
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: success; new routes listed (`/admin/events`, `/admin/events/new`, `/admin/events/[id]/edit`).

- [ ] **Step 8: Runtime check**

With `npm run dev` + signed in as the PYH bootstrap admin:
- Go to `/admin/events` → list renders; click **New event** → create one (pick a cluster) → redirected back, appears in list.
- **Edit** it, change venue → saved.
- **Archive**/**Publish** toggles status.
- **Delete** → row disappears.

Expected: all CRUD works; the public `/events` page still renders the newly-created Open event (confirm the public site is unaffected).

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/event.ts src/app/admin/events
git commit -m "feat: event CRUD — validation, scoped actions, admin screens"
```

---

## Task 11: User management (PYH-only)

**Files:**
- Create: `src/lib/validation/user.ts`
- Create: `src/app/admin/users/actions.ts`
- Create: `src/app/admin/users/_components/user-form.tsx`
- Create: `src/app/admin/users/_components/users-table.tsx`
- Create: `src/app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `requirePYH` (Task 6); `AdminShell` (Task 9); `createServiceClient` (service role, for auth-user CRUD); `ClusterRow`.
- Produces: server actions `createClusterHead(formData)`, `updateClusterHead(userId, formData)`, `setActive(userId, active)`, `resetPassword(userId, formData)`, `deleteClusterHead(userId)`; the Users screen.

- [ ] **Step 1: User validation schema**

Create `src/lib/validation/user.ts`:

```ts
import { z } from "zod";

export const createUserSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  username: z.string().max(60).optional().or(z.literal("")),
  cluster_id: z.string().uuid(),
  password: z.string().min(10).max(200),
  is_active: z.coerce.boolean().optional().default(true),
});

export const editUserSchema = z.object({
  full_name: z.string().min(2).max(120),
  username: z.string().max(60).optional().or(z.literal("")),
  cluster_id: z.string().uuid(),
});

export const passwordSchema = z.object({
  password: z.string().min(10).max(200),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

- [ ] **Step 2: User actions (service role)**

Create `src/app/admin/users/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { createUserSchema, editUserSchema, passwordSchema } from "@/lib/validation/user";

async function audit(userId: string, action: string, target: string) {
  const supabase = await createServerSupabase();
  await supabase.from("audit_log").insert({ actor_user_id: userId, action, entity: "admins", entity_id: target });
}

export async function createClusterHead(formData: FormData) {
  const ctx = await requirePYH();
  const input = createUserSchema.parse(Object.fromEntries(formData.entries()));
  const svc = createServiceClient();
  const created = await svc.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  const newId = created.data.user.id;
  const { error } = await svc.from("admins").upsert({
    user_id: newId,
    role: "cluster_head",
    full_name: input.full_name,
    username: input.username || null,
    cluster_id: input.cluster_id,
    is_active: input.is_active,
  }, { onConflict: "user_id" });
  if (error) { await svc.auth.admin.deleteUser(newId); throw new Error(error.message); }
  await audit(ctx.userId, "user.create", newId);
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateClusterHead(userId: string, formData: FormData) {
  const ctx = await requirePYH();
  const input = editUserSchema.parse(Object.fromEntries(formData.entries()));
  const svc = createServiceClient();
  const { error } = await svc.from("admins").update({
    full_name: input.full_name,
    username: input.username || null,
    cluster_id: input.cluster_id,
  }).eq("user_id", userId).eq("role", "cluster_head");
  if (error) throw new Error(error.message);
  await audit(ctx.userId, "user.update", userId);
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function setActive(userId: string, active: boolean) {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  await svc.from("admins").update({ is_active: active }).eq("user_id", userId).eq("role", "cluster_head");
  // Ban the auth user while inactive so they cannot sign in.
  await svc.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  await audit(ctx.userId, active ? "user.activate" : "user.deactivate", userId);
  revalidatePath("/admin/users");
}

export async function resetPassword(userId: string, formData: FormData) {
  const ctx = await requirePYH();
  const { password } = passwordSchema.parse(Object.fromEntries(formData.entries()));
  const svc = createServiceClient();
  const { error } = await svc.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
  await audit(ctx.userId, "user.reset_password", userId);
  revalidatePath("/admin/users");
}

export async function deleteClusterHead(userId: string) {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  // Soft-delete the admin row, then remove the auth user so they cannot log in.
  await svc.from("admins").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("user_id", userId).eq("role", "cluster_head");
  await svc.auth.admin.deleteUser(userId);
  await audit(ctx.userId, "user.delete", userId);
  revalidatePath("/admin/users");
}
```

> All actions call `requirePYH()` first and use the service-role client (RLS-bypassing) — safe because the guard already proved the caller is a PYH. `.eq("role", "cluster_head")` prevents a PYH from accidentally editing/deleting another PYH via these forms.

- [ ] **Step 3: User form component**

Create `src/app/admin/users/_components/user-form.tsx`:

```tsx
"use client";
import { Button } from "@/components/ui/button";

export type ClusterOption = { id: string; name: string };

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export function CreateUserForm({ action, clusters }: { action: (fd: FormData) => void; clusters: ClusterOption[] }) {
  return (
    <form action={action} className="glass grid max-w-xl gap-4 rounded-2xl p-6">
      <label className="block"><span className={label}>Full name</span>
        <input name="full_name" required className={field} /></label>
      <label className="block"><span className={label}>Email</span>
        <input type="email" name="email" required className={field} /></label>
      <label className="block"><span className={label}>Username (optional)</span>
        <input name="username" className={field} /></label>
      <label className="block"><span className={label}>Cluster</span>
        <select name="cluster_id" required className={field}>
          <option value="">Select cluster…</option>
          {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <label className="block"><span className={label}>Password</span>
        <input type="text" name="password" required minLength={10} className={field} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" value="true" defaultChecked /> Active</label>
      <div><Button type="submit">Create cluster head</Button></div>
    </form>
  );
}
```

- [ ] **Step 4: Users table component**

Create `src/app/admin/users/_components/users-table.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { setActive, resetPassword, deleteClusterHead } from "../actions";

export type UserRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  cluster_name: string | null;
  is_active: boolean;
};

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-black/5 dark:border-white/10">
            <th className="p-3 font-medium">Name</th>
            <th className="p-3 font-medium">Username</th>
            <th className="p-3 font-medium">Cluster</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.user_id} className="border-t border-black/5 dark:border-white/10">
              <td className="p-3">{u.full_name ?? "—"}</td>
              <td className="p-3">{u.username ?? "—"}</td>
              <td className="p-3">{u.cluster_name ?? "—"}</td>
              <td className="p-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-500/15 text-emerald-600" : "bg-slate-500/15 text-slate-500"}`}>
                  {u.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  <button disabled={pending} onClick={() => start(() => setActive(u.user_id, !u.is_active))} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 disabled:opacity-40">
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button disabled={pending} onClick={() => { const p = prompt("New password (min 10 chars):"); if (p) { const fd = new FormData(); fd.set("password", p); start(() => resetPassword(u.user_id, fd)); } }} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 dark:text-royal-300 disabled:opacity-40">Reset password</button>
                  <button disabled={pending} onClick={() => { if (confirm("Delete this cluster head?")) start(() => deleteClusterHead(u.user_id)); }} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40">Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-10 text-center text-muted">No cluster heads yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Users page**

Create `src/app/admin/users/page.tsx`:

```tsx
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { UsersTable, type UserRow } from "./_components/users-table";
import { CreateUserForm } from "./_components/user-form";
import { createClusterHead } from "./actions";

export const metadata = { title: "User Management", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data: admins } = await supabase
    .from("admins")
    .select("user_id, full_name, username, cluster_id, is_active")
    .eq("role", "cluster_head")
    .is("deleted_at", null);
  const { data: clusters } = await supabase.from("clusters").select("id, name").order("name");
  const clusterMap = new Map((clusters as { id: string; name: string }[] | null ?? []).map((c) => [c.id, c.name]));

  const rows: UserRow[] = ((admins as { user_id: string; full_name: string | null; username: string | null; cluster_id: string | null; is_active: boolean }[] | null) ?? []).map((a) => ({
    user_id: a.user_id,
    full_name: a.full_name,
    username: a.username,
    cluster_name: a.cluster_id ? clusterMap.get(a.cluster_id) ?? null : null,
    is_active: a.is_active,
  }));

  return (
    <AdminShell ctx={ctx} active="users" title="Cluster Heads">
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <UsersTable rows={rows} />
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Add cluster head</h2>
          <CreateUserForm action={createClusterHead} clusters={(clusters as { id: string; name: string }[]) ?? []} />
        </div>
      </div>
    </AdminShell>
  );
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success; `/admin/users` route present.

- [ ] **Step 7: Runtime check (as PYH)**

With `npm run dev`, signed in as bootstrap PYH:
- `/admin/users` renders. Create a cluster head (name, email, cluster, password) → appears in table.
- Sign out, sign in as the new cluster head → lands on `/admin`; nav shows only Registrations + Events (no Users/Logs); visiting `/admin/users` directly redirects to `/admin?error=forbidden`.
- Back as PYH: Deactivate the cluster head → sign-in as them now fails. Reactivate. Reset password → new password works. Delete → row gone and they can't log in.

Expected: all user-management flows behave; cluster head is correctly denied PYH screens.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation/user.ts src/app/admin/users
git commit -m "feat: PYH-only user management for cluster heads"
```

---

## Task 12: Logs screen + final RBAC/app verification

**Files:**
- Create: `src/app/admin/logs/page.tsx`

**Interfaces:**
- Consumes: `requirePYH` (Task 6); `AdminShell`; `audit_log` table.
- Produces: PYH-only logs screen listing login activity + audit trail.

- [ ] **Step 1: Logs page**

Create `src/app/admin/logs/page.tsx`:

```tsx
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";

export const metadata = { title: "Activity Logs", robots: { index: false } };
export const dynamic = "force-dynamic";

type LogRow = { id: string; action: string; entity: string; entity_id: string | null; actor_user_id: string | null; created_at: string };

export default async function LogsPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, actor_user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data as LogRow[] | null) ?? [];

  return (
    <AdminShell ctx={ctx} active="logs" title="Activity Logs">
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-black/5 dark:border-white/10">
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Entity</th>
              <th className="p-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-black/5 dark:border-white/10">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="p-3">{r.entity}</td>
                <td className="p-3 font-mono text-xs">{r.entity_id ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-10 text-center text-muted">No activity yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success; `/admin/logs` present.

- [ ] **Step 3: Re-run the RBAC DB proof (regression gate)**

Run: `npm run prove:rbac`
Expected: `8 passed, 0 failed` (confirms Tasks 10–11 didn't loosen policies).

- [ ] **Step 4: Full runtime smoke as both roles**

With `npm run dev`:
- **As PYH:** all four nav tabs work; Logs shows `auth.login`, `event.create`, `user.create`, etc. rows.
- **As cluster head:** create an event (auto-assigned to their cluster); it appears; they can view registrations only for their cluster's events on `/admin`.
- **Idle timeout:** temporarily lower `IDLE_TIMEOUT_MS` in `src/middleware.ts` to `10 * 1000` (10s), rebuild/reload, wait 11s, navigate → redirected to `/admin/login?error=timeout`. **Restore it to `30 * 60 * 1000` and rebuild.**
- **Public site:** load `/`, `/events`, `/chapters` → visually identical to before (no design regressions).

Expected: all pass; restore the timeout constant before committing.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/logs/page.tsx src/middleware.ts
git commit -m "feat: PYH activity logs screen; verify RBAC end-to-end"
```

---

## Self-Review Notes (coverage against spec)

- Roles / two-tier model → Tasks 2, 6. Legacy enum values retained → Task 2.
- Clusters table + seed → Task 1.
- Middleware gate + session refresh + idle timeout → Task 7; verified Task 12.
- Per-action authz helpers (`requirePYH`, `requireClusterAccess`) → Task 6; used in Tasks 9–12.
- CSRF (server actions, SameSite cookies) → global constraint; cookies set in Tasks 7–8.
- Login activity logging → Task 8; viewer → Task 12.
- Event ownership (`created_by`, `cluster_id`) → Task 3; CRUD + publish/archive/delete → Task 10.
- Registration scoping by cluster → Task 4 (RLS) + Task 9 (page).
- User management (create/edit/deactivate/delete/reset/assign cluster) → Task 11.
- New admin UI matching existing style, public site untouched → Tasks 9–12 (new files only).
- RBAC proof against real DB → Task 5; regression re-run Task 12.
- Session timeout behavior → Task 7 + Task 12 Step 4.
- **Deferred (Phase 3b, not in this plan):** image/gallery uploads, announcements, reports/analytics. Confirmed out of scope in the spec.
