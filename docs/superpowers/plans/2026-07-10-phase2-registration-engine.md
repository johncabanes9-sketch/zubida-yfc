# Event Registration Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 1 demo event registration into a concurrency-safe, Supabase-backed system that cannot overbook or double-register, with real QR codes, queued confirmation emails, a public status lookup, and a minimal admin approval dashboard.

**Architecture:** A Next.js Route Handler (`/api/register`) is the sole gatekeeper for guest registrations: it validates (Zod), verifies CAPTCHA (Turnstile), rate-limits (Postgres), then calls a single atomic PostgreSQL `SECURITY DEFINER` RPC that claims a slot with a conditional `UPDATE` and inserts the registration under a unique `(event_id, lower(email))` index. Correctness lives in the database, so it holds under any concurrency. Confirmation email is sent via Resend inside Next 15 `after()` (off the critical path). Public status lookup and admin reads go through RLS + dedicated RPCs — registration data is never publicly readable.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (PostgreSQL + Auth + Realtime), `@supabase/supabase-js`, `@supabase/ssr`, Zod, `qrcode`, Resend, Cloudflare Turnstile, Vitest (test runner), Supabase CLI (local Postgres for tests).

## Global Constraints

- Next.js 15 App Router, React 19, TypeScript strict mode — all already configured in Phase 1.
- Guest registration only — **no login** required to register. Admin dashboard is the only authenticated surface (Supabase Auth email+password).
- Duplicate prevention is a DB invariant: unique index `(event_id, lower(email)) WHERE deleted_at IS NULL`. Never rely on app-level checks alone.
- Slot claiming MUST be atomic in Postgres (conditional `UPDATE ... RETURNING`). App-level check-then-insert is forbidden.
- Every table: UUID PK (`gen_random_uuid()`), `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger-maintained), `deleted_at timestamptz` soft delete, FKs, indexes on searchable columns.
- `event_registrations` has NO public `SELECT` and NO public `INSERT`. Public access is only through `register_for_event` and `check_registration` RPCs.
- Service-role key is server-only. Never import it into a client component or expose via `NEXT_PUBLIC_`.
- Human registration code format: `ZYFC-XXXX-####` (4 uppercase alnum, 4 digits).
- Typed error codes returned by the engine: `FULL`, `CLOSED`, `DEADLINE_PASSED`, `DUPLICATE`, `RATE_LIMITED`, `INVALID`, `CAPTCHA_FAILED`, `SERVER_ERROR`.
- Degraded local mode: if `TURNSTILE_SECRET_KEY` is unset, skip CAPTCHA; if `RESEND_API_KEY` is unset, log email to `email_log` as `queued` without sending. Dev is never blocked on third-party keys.
- Existing Supabase project — migrations are SQL run against it (and against the local Supabase stack for tests). Do not add project-creation steps.

---

## File Structure

```
supabase/
  config.toml                         local Supabase stack config (CLI)
  migrations/
    0001_events.sql                   events table + indexes + updated_at trigger
    0002_registrations.sql            event_registrations table + unique index
    0003_admin_audit_rate_email.sql   admins, audit_log, rate_limits, email_log
    0004_functions.sql                register_for_event, check_registration, check_rate_limit
    0005_rls.sql                      RLS enable + policies
  seed.sql                            import Phase 1 mock events

src/
  lib/
    supabase/
      server.ts        createServerClient (service role) — server only
      browser.ts       createBrowserClient (anon) — realtime/subscriptions
      admin-auth.ts    getSessionUser + requireAdmin helpers
      database.types.ts generated types (checked in)
    validation/registration.ts   Zod schema + RegistrationInput type (shared)
    qr.ts              generateQrDataUrl(token) -> string
    reg-code.ts        generateRegistrationCode() -> "ZYFC-...."
    email/
      resend.ts        sendConfirmationEmail(...) with degraded-mode fallback
      confirmation.tsx React email template
    errors.ts          RegistrationError codes + mapping to HTTP status

  app/
    api/register/route.ts            POST handler (the gatekeeper)
    registration-status/page.tsx     public lookup UI
    registration-status/actions.ts   server action calling check_registration RPC
    admin/login/page.tsx             admin sign-in
    admin/page.tsx                   dashboard (list, approve/reject, export, live)
    admin/actions.ts                 server actions: approve, reject, exportCsv

  components/events/
    registration-form.tsx            REPLACE Phase 1 demo form: real submit + Turnstile + retry
    live-slots.tsx                   realtime slot counter for event cards/modal
  components/admin/
    registrations-table.tsx          client table with live updates

tests/
  setup/supabase.ts    test client + helpers (truncate, seed event)
  concurrency.test.ts  headline: 200 concurrent -> exactly 50 succeed
  duplicate.test.ts    same email+event -> one wins
  deadline.test.ts     past deadline / closed -> typed errors
  validation.test.ts   Zod rejects malformed payloads
  rls.test.ts          anon cannot read registrations; check_registration scoped
  rate-limit.test.ts   window exceeded -> RATE_LIMITED

vitest.config.ts
.env.local (gitignored) / .env.example (committed)
```

---

## Task 1: Tooling, dependencies, env, Supabase local stack

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `vitest.config.ts`, `.env.example`, `supabase/config.toml`
- Modify: `.gitignore` (ensure `.env.local`, `supabase/.branches`, `supabase/.temp`)

**Interfaces:**
- Produces: npm scripts `test`, `test:run`, `db:start`, `db:reset`, `db:types`; env var names used by all later tasks.

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr qrcode resend zod
npm install -D vitest @types/qrcode dotenv
```

- [ ] **Step 2: Confirm Supabase CLI is available**

Run: `npx supabase --version`
Expected: prints a version (e.g. `2.x.x`). If it errors, run `npm install -D supabase` and retry.

- [ ] **Step 3: Initialize the local Supabase stack config**

Run: `npx supabase init` (accept defaults). This creates `supabase/config.toml`.
Expected: `supabase/config.toml` exists.

- [ ] **Step 4: Add npm scripts to `package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest",
  "test:run": "vitest run",
  "db:start": "supabase start",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: [],
    fileParallelism: false, // DB tests share one Postgres; run serially
  },
});
```

- [ ] **Step 6: Create `.env.example`**

```bash
# Supabase (from your project settings, and printed by `supabase start` for local)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email (optional locally — degraded mode logs instead of sending)
RESEND_API_KEY=
RESEND_FROM="Zubida YFC <no-reply@zubidayfc.org>"

# Cloudflare Turnstile (optional locally — degraded mode skips CAPTCHA)
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

- [ ] **Step 7: Start local Supabase and capture keys**

Run: `npm run db:start`
Expected: prints `API URL`, `anon key`, `service_role key`. Copy these into `.env.local` (create it) for local dev/tests.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example supabase/config.toml .gitignore
git commit -m "chore: add supabase, test tooling, and env scaffolding for phase 2"
```

---

## Task 2: `events` table migration

**Files:**
- Create: `supabase/migrations/0001_events.sql`

**Interfaces:**
- Produces: `events` table with columns `id, name, cover, date, time, venue, organizer, description, registration_deadline, slots_total, slots_taken, status, scope, created_at, updated_at, deleted_at`; `set_updated_at()` trigger function.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_events.sql
create extension if not exists pgcrypto;

-- shared trigger to maintain updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create type event_status as enum ('Open', 'Closed', 'Finished');
create type event_scope as enum ('Provincial', 'Chapter');

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cover text,
  date date not null,
  time text,
  venue text,
  organizer text,
  description text,
  registration_deadline timestamptz not null,
  slots_total int not null check (slots_total >= 0),
  slots_taken int not null default 0 check (slots_taken >= 0),
  status event_status not null default 'Open',
  scope event_scope not null default 'Provincial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint slots_not_overbooked check (slots_taken <= slots_total)
);

create index events_status_idx on events (status) where deleted_at is null;
create index events_date_idx on events (date) where deleted_at is null;

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();
```

- [ ] **Step 2: Apply and verify**

Run: `npm run db:reset`
Expected: completes without error; migration `0001` listed as applied.

- [ ] **Step 3: Sanity check the overbook constraint**

Run:
```bash
npx supabase db reset >/dev/null 2>&1
psql "$SUPABASE_DB_URL" -c "insert into events (name, registration_deadline, slots_total, slots_taken) values ('x', now()+interval '1 day', 5, 6);"
```
Expected: FAILS with `slots_not_overbooked` violation. (If `psql`/`$SUPABASE_DB_URL` isn't handy, defer this assertion to the Task 6 test — the constraint is re-exercised there.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_events.sql
git commit -m "feat(db): events table with overbooking constraint and updated_at trigger"
```

---

## Task 3: `event_registrations` table migration

**Files:**
- Create: `supabase/migrations/0002_registrations.sql`

**Interfaces:**
- Produces: `event_registrations` table; `registration_status` enum; unique index `event_registrations_unique_email_per_event`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_registrations.sql
create type registration_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_id text not null unique,
  event_id uuid not null references events(id),
  full_name text not null,
  nickname text,
  birthdate date,
  age int check (age between 10 and 40),
  gender text,
  email text not null,
  phone text,
  chapter text not null,
  cluster text,
  parish text,
  school text,
  emergency_contact text,
  emergency_number text,
  medical_concerns text,
  food_restrictions text,
  shirt_size text,
  transport_needed boolean not null default false,
  consent boolean not null default false,
  status registration_status not null default 'pending',
  qr_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Duplicate prevention invariant (case-insensitive email, ignores soft-deleted)
create unique index event_registrations_unique_email_per_event
  on event_registrations (event_id, lower(email))
  where deleted_at is null;

create index event_registrations_event_idx on event_registrations (event_id) where deleted_at is null;
create index event_registrations_status_idx on event_registrations (status) where deleted_at is null;
create index event_registrations_reg_id_idx on event_registrations (registration_id);

create trigger event_registrations_set_updated_at
  before update on event_registrations
  for each row execute function set_updated_at();
```

- [ ] **Step 2: Apply and verify**

Run: `npm run db:reset`
Expected: completes without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_registrations.sql
git commit -m "feat(db): event_registrations with unique-email-per-event invariant"
```

---

## Task 4: admins, audit_log, rate_limits, email_log migration

**Files:**
- Create: `supabase/migrations/0003_admin_audit_rate_email.sql`

**Interfaces:**
- Produces: tables `admins`, `audit_log`, `rate_limits`, `email_log`; `admin_role` enum.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_admin_audit_rate_email.sql
create type admin_role as enum ('super_admin', 'provincial_admin', 'event_organizer');

create table admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role admin_role not null default 'event_organizer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);

create table rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);
create index rate_limits_lookup_idx on rate_limits (ip, endpoint, created_at desc);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  registration_id text,
  to_email text not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now()
);

-- helper used by RLS across admin surfaces
create or replace function is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = uid and deleted_at is null);
$$;
```

- [ ] **Step 2: Apply and verify**

Run: `npm run db:reset`
Expected: completes without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_admin_audit_rate_email.sql
git commit -m "feat(db): admins, audit_log, rate_limits, email_log + is_admin helper"
```

---

## Task 5: Registration RPC functions

**Files:**
- Create: `supabase/migrations/0004_functions.sql`

**Interfaces:**
- Produces:
  - `register_for_event(p jsonb) returns jsonb` — returns `{"ok":true,"registration_id":..,"qr_token":..,"status":"pending"}` or `{"ok":false,"code":"FULL|CLOSED|DEADLINE_PASSED|DUPLICATE"}`.
  - `check_registration(p_registration_id text, p_email text) returns jsonb`.
  - `check_rate_limit(p_ip text, p_endpoint text, p_window_seconds int, p_max int) returns boolean` (true = allowed).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_functions.sql

-- Rate limit: records the attempt and returns whether it is allowed.
create or replace function check_rate_limit(
  p_ip text, p_endpoint text, p_window_seconds int, p_max int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  delete from rate_limits where created_at < now() - interval '1 hour';
  select count(*) into recent
    from rate_limits
    where ip = p_ip and endpoint = p_endpoint
      and created_at > now() - make_interval(secs => p_window_seconds);
  if recent >= p_max then
    return false;
  end if;
  insert into rate_limits (ip, endpoint) values (p_ip, p_endpoint);
  return true;
end $$;

-- Atomic registration: claim a slot then insert, all in one transaction.
create or replace function register_for_event(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid := (p->>'event_id')::uuid;
  v_email text := lower(trim(p->>'email'));
  v_claimed uuid;
  v_reg_code text;
  v_qr uuid := gen_random_uuid();
  v_ev events;
begin
  -- Atomically claim exactly one slot if the event is open, not full, not past deadline.
  update events
    set slots_taken = slots_taken + 1
    where id = v_event_id
      and deleted_at is null
      and status = 'Open'
      and slots_taken < slots_total
      and now() < registration_deadline
    returning id into v_claimed;

  if v_claimed is null then
    -- Distinguish the reason for a clear client message.
    select * into v_ev from events where id = v_event_id and deleted_at is null;
    if v_ev.id is null then
      return jsonb_build_object('ok', false, 'code', 'CLOSED');
    elsif v_ev.status <> 'Open' then
      return jsonb_build_object('ok', false, 'code', 'CLOSED');
    elsif now() >= v_ev.registration_deadline then
      return jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED');
    else
      return jsonb_build_object('ok', false, 'code', 'FULL');
    end if;
  end if;

  -- Human-readable unique registration code.
  v_reg_code := 'ZYFC-' ||
    upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' ||
    lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');

  begin
    insert into event_registrations (
      registration_id, event_id, full_name, nickname, birthdate, age, gender,
      email, phone, chapter, cluster, parish, school, emergency_contact,
      emergency_number, medical_concerns, food_restrictions, shirt_size,
      transport_needed, consent, qr_token
    ) values (
      v_reg_code, v_event_id, p->>'full_name', p->>'nickname',
      (p->>'birthdate')::date, (p->>'age')::int, p->>'gender',
      p->>'email', p->>'phone', p->>'chapter', p->>'cluster', p->>'parish',
      p->>'school', p->>'emergency_contact', p->>'emergency_number',
      p->>'medical_concerns', p->>'food_restrictions', p->>'shirt_size',
      coalesce((p->>'transport_needed')::boolean, false),
      coalesce((p->>'consent')::boolean, false), v_qr
    );
  exception when unique_violation then
    -- Someone with this email already registered: release the claimed slot.
    update events set slots_taken = slots_taken - 1 where id = v_event_id;
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end;

  return jsonb_build_object(
    'ok', true, 'registration_id', v_reg_code,
    'qr_token', v_qr, 'status', 'pending'
  );
end $$;

-- Scoped status lookup (no table enumeration possible).
create or replace function check_registration(p_registration_id text, p_email text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'registration_id', r.registration_id,
      'status', r.status,
      'full_name', r.full_name,
      'event_name', e.name,
      'event_date', e.date,
      'qr_token', r.qr_token
    ) end
  from (select 1) dummy
  left join event_registrations r
    on r.registration_id = p_registration_id
   and lower(r.email) = lower(trim(p_email))
   and r.deleted_at is null
  left join events e on e.id = r.event_id;
$$;

-- Public/anon may execute only these entry points.
revoke all on function register_for_event(jsonb) from public;
revoke all on function check_registration(text, text) from public;
grant execute on function register_for_event(jsonb) to anon, authenticated;
grant execute on function check_registration(text, text) to anon, authenticated;
grant execute on function check_rate_limit(text, text, int, int) to anon, authenticated;
```

- [ ] **Step 2: Apply and verify**

Run: `npm run db:reset`
Expected: completes without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_functions.sql
git commit -m "feat(db): atomic register_for_event, check_registration, check_rate_limit RPCs"
```

---

## Task 6: RLS policies + seed

**Files:**
- Create: `supabase/migrations/0005_rls.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: RLS enabled on all tables; public may `SELECT` non-deleted `events` only; `event_registrations` has no anon `SELECT`/`INSERT`; admins may read registrations + audit.

- [ ] **Step 1: Write the RLS migration**

```sql
-- supabase/migrations/0005_rls.sql
alter table events enable row level security;
alter table event_registrations enable row level security;
alter table admins enable row level security;
alter table audit_log enable row level security;
alter table email_log enable row level security;
alter table rate_limits enable row level security;

-- events: anyone can read live events; only admins write.
create policy events_public_read on events
  for select using (deleted_at is null);
create policy events_admin_write on events
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- event_registrations: NO anon read/insert. Admins can read + update.
create policy registrations_admin_read on event_registrations
  for select to authenticated using (is_admin(auth.uid()));
create policy registrations_admin_update on event_registrations
  for update to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- admins / audit_log: admin-only.
create policy admins_self_read on admins
  for select to authenticated using (is_admin(auth.uid()));
create policy audit_admin_read on audit_log
  for select to authenticated using (is_admin(auth.uid()));
-- email_log, rate_limits: no policies => only service role / SECURITY DEFINER funcs touch them.
```

- [ ] **Step 2: Write the seed (import Phase 1 mock events)**

```sql
-- supabase/seed.sql
insert into events (name, cover, date, time, venue, organizer, description, registration_deadline, slots_total, slots_taken, status, scope) values
('Zubida Provincial Youth Camp 2026','https://picsum.photos/seed/yfccamp/1000/700','2026-08-14','8:00 AM','Camp Abelardo, Pagadian City','Zubida YFC Provincial Team','Three days of worship, teaching, and encounter for youth across all 26 chapters.','2026-08-01',600,418,'Open','Provincial'),
('ICON: Ignite Conference','https://picsum.photos/seed/yfcicon/1000/700','2026-09-06','1:00 PM','Pagadian City Convention Center','Provincial Youth Coordinator','The flagship one-day conference gathering young leaders.','2026-08-28',900,611,'Open','Provincial'),
('Christian Life Seminar — Labangan','https://picsum.photos/seed/yfccls/1000/700','2026-07-26','9:00 AM','St. Isidore Parish, Labangan','Labangan Chapter','A weekend introduction to the heart of the Gospel.','2026-07-20',120,120,'Closed','Chapter'),
('Household Leaders'' Formation','https://picsum.photos/seed/yfchousehold/1000/700','2026-07-19','2:00 PM','Molave Parish Hall','North Cluster','Practical formation for core group leaders.','2026-07-15',80,54,'Open','Chapter');
```

- [ ] **Step 3: Apply and verify seed loads**

Run: `npm run db:reset`
Expected: completes; `events` has 4 rows (reset auto-applies `seed.sql`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_rls.sql supabase/seed.sql
git commit -m "feat(db): RLS policies and seed events"
```

---

## Task 7: Test harness + headline concurrency test

**Files:**
- Create: `tests/setup/supabase.ts`
- Create: `tests/concurrency.test.ts`

**Interfaces:**
- Consumes: `register_for_event` RPC (Task 5), events table (Task 2).
- Produces: `makeServiceClient()`, `resetDb()`, `insertEvent(overrides)` test helpers.

- [ ] **Step 1: Write the test helpers**

```ts
// tests/setup/supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

export function makeServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function insertEvent(
  db: SupabaseClient,
  overrides: Partial<{ slots_total: number; status: string; deadlineDays: number }> = {},
) {
  const { slots_total = 50, status = "Open", deadlineDays = 7 } = overrides;
  const deadline = new Date(Date.now() + deadlineDays * 864e5).toISOString();
  const { data, error } = await db
    .from("events")
    .insert({
      name: "Test Event",
      date: "2026-12-01",
      registration_deadline: deadline,
      slots_total,
      slots_taken: 0,
      status,
      scope: "Provincial",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function clearRegistrations(db: SupabaseClient, eventId: string) {
  await db.from("event_registrations").delete().eq("event_id", eventId);
  await db.from("events").delete().eq("id", eventId);
}

export function payload(eventId: string, email: string) {
  return {
    event_id: eventId,
    full_name: "Test Person",
    email,
    chapter: "Pagadian City",
    age: 18,
    consent: true,
  };
}
```

- [ ] **Step 2: Write the failing concurrency test**

```ts
// tests/concurrency.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeServiceClient, insertEvent, clearRegistrations, payload } from "./setup/supabase";

const db = makeServiceClient();
let eventId: string;
const SLOTS = 50;
const ATTEMPTS = 200;

beforeAll(async () => { eventId = await insertEvent(db, { slots_total: SLOTS }); });
afterAll(async () => { await clearRegistrations(db, eventId); });

describe("registration concurrency", () => {
  it("never overbooks: exactly SLOTS succeed out of ATTEMPTS concurrent", async () => {
    const calls = Array.from({ length: ATTEMPTS }, (_, i) =>
      db.rpc("register_for_event", { p: payload(eventId, `guest${i}@example.com`) }),
    );
    const results = await Promise.all(calls);

    const ok = results.filter((r) => (r.data as any)?.ok === true).length;
    const full = results.filter((r) => (r.data as any)?.code === "FULL").length;

    expect(ok).toBe(SLOTS);
    expect(full).toBe(ATTEMPTS - SLOTS);

    const { data: ev } = await db.from("events").select("slots_taken").eq("id", eventId).single();
    expect(ev!.slots_taken).toBe(SLOTS);

    const { count } = await db
      .from("event_registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(count).toBe(SLOTS);
  });
});
```

- [ ] **Step 3: Run to verify it passes (engine already implemented in Task 5)**

Run: `npm run test:run -- tests/concurrency.test.ts`
Expected: PASS — `ok === 50`, `full === 150`, `slots_taken === 50`, `count === 50`.
(If it fails with more than 50 successes, the atomic UPDATE is wrong — stop and fix Task 5 before continuing.)

- [ ] **Step 4: Commit**

```bash
git add tests/setup/supabase.ts tests/concurrency.test.ts
git commit -m "test: prove registration engine never overbooks under 200 concurrent calls"
```

---

## Task 8: Duplicate, deadline, and rate-limit tests

**Files:**
- Create: `tests/duplicate.test.ts`, `tests/deadline.test.ts`, `tests/rate-limit.test.ts`

**Interfaces:**
- Consumes: helpers from Task 7; `register_for_event`, `check_rate_limit` RPCs.

- [ ] **Step 1: Write the duplicate test**

```ts
// tests/duplicate.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeServiceClient, insertEvent, clearRegistrations, payload } from "./setup/supabase";

const db = makeServiceClient();
let eventId: string;
beforeAll(async () => { eventId = await insertEvent(db, { slots_total: 10 }); });
afterAll(async () => { await clearRegistrations(db, eventId); });

it("same email + event: exactly one succeeds, other is DUPLICATE", async () => {
  const [a, b] = await Promise.all([
    db.rpc("register_for_event", { p: payload(eventId, "Same@Example.com") }),
    db.rpc("register_for_event", { p: payload(eventId, "same@example.com") }),
  ]);
  const codes = [a, b].map((r) => (r.data as any));
  const oks = codes.filter((c) => c.ok).length;
  const dups = codes.filter((c) => c.code === "DUPLICATE").length;
  expect(oks).toBe(1);
  expect(dups).toBe(1);

  const { data: ev } = await db.from("events").select("slots_taken").eq("id", eventId).single();
  expect(ev!.slots_taken).toBe(1); // released the duplicate's claim
});
```

- [ ] **Step 2: Write the deadline / closed / full tests**

```ts
// tests/deadline.test.ts
import { describe, it, expect } from "vitest";
import { makeServiceClient, insertEvent, clearRegistrations, payload } from "./setup/supabase";

const db = makeServiceClient();

it("past deadline returns DEADLINE_PASSED", async () => {
  const id = await insertEvent(db, { deadlineDays: -1 });
  const { data } = await db.rpc("register_for_event", { p: payload(id, "a@x.com") });
  expect((data as any).code).toBe("DEADLINE_PASSED");
  await clearRegistrations(db, id);
});

it("closed event returns CLOSED", async () => {
  const id = await insertEvent(db, { status: "Closed" });
  const { data } = await db.rpc("register_for_event", { p: payload(id, "b@x.com") });
  expect((data as any).code).toBe("CLOSED");
  await clearRegistrations(db, id);
});

it("full event returns FULL", async () => {
  const id = await insertEvent(db, { slots_total: 1 });
  await db.rpc("register_for_event", { p: payload(id, "c@x.com") });
  const { data } = await db.rpc("register_for_event", { p: payload(id, "d@x.com") });
  expect((data as any).code).toBe("FULL");
  await clearRegistrations(db, id);
});
```

- [ ] **Step 3: Write the rate-limit test**

```ts
// tests/rate-limit.test.ts
import { describe, it, expect } from "vitest";
import { makeServiceClient } from "./setup/supabase";

const db = makeServiceClient();

it("allows up to max then blocks within the window", async () => {
  const ip = "203.0.113." + Math.floor(Math.random() * 250);
  const calls = [];
  for (let i = 0; i < 6; i++) {
    calls.push(db.rpc("check_rate_limit", { p_ip: ip, p_endpoint: "register", p_window_seconds: 60, p_max: 5 }));
  }
  const results = await Promise.all(calls);
  const allowed = results.filter((r) => r.data === true).length;
  expect(allowed).toBe(5);
});
```

- [ ] **Step 4: Run all tests**

Run: `npm run test:run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/duplicate.test.ts tests/deadline.test.ts tests/rate-limit.test.ts
git commit -m "test: duplicate, deadline/closed/full, and rate-limit behaviors"
```

---

## Task 9: Validation schema, error map, and small helpers

**Files:**
- Create: `src/lib/validation/registration.ts`, `src/lib/errors.ts`, `src/lib/reg-code.ts`, `src/lib/qr.ts`
- Create: `tests/validation.test.ts`

**Interfaces:**
- Produces:
  - `registrationSchema` (Zod) + `type RegistrationInput`.
  - `ERROR_STATUS: Record<RegistrationErrorCode, number>` and `type RegistrationErrorCode`.
  - `generateQrDataUrl(text: string): Promise<string>`.

- [ ] **Step 1: Write the failing validation test**

```ts
// tests/validation.test.ts
import { describe, it, expect } from "vitest";
import { registrationSchema } from "../src/lib/validation/registration";

const base = { event_id: "11111111-1111-1111-1111-111111111111", full_name: "Ana", email: "ana@x.com", chapter: "Pagadian City", age: 18, consent: true };

it("accepts a valid payload", () => {
  expect(registrationSchema.safeParse(base).success).toBe(true);
});
it("rejects missing consent", () => {
  expect(registrationSchema.safeParse({ ...base, consent: false }).success).toBe(false);
});
it("rejects bad email", () => {
  expect(registrationSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
});
it("rejects out-of-range age", () => {
  expect(registrationSchema.safeParse({ ...base, age: 99 }).success).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- tests/validation.test.ts`
Expected: FAIL — cannot resolve `registrationSchema`.

- [ ] **Step 3: Write the Zod schema**

```ts
// src/lib/validation/registration.ts
import { z } from "zod";

export const registrationSchema = z.object({
  event_id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  nickname: z.string().max(60).optional().or(z.literal("")),
  birthdate: z.string().optional().or(z.literal("")),
  age: z.coerce.number().int().min(10).max(40),
  gender: z.string().optional().or(z.literal("")),
  email: z.string().email().max(160),
  phone: z.string().max(40).optional().or(z.literal("")),
  chapter: z.string().min(2),
  cluster: z.string().optional().or(z.literal("")),
  parish: z.string().optional().or(z.literal("")),
  school: z.string().optional().or(z.literal("")),
  emergency_contact: z.string().optional().or(z.literal("")),
  emergency_number: z.string().optional().or(z.literal("")),
  medical_concerns: z.string().optional().or(z.literal("")),
  food_restrictions: z.string().optional().or(z.literal("")),
  shirt_size: z.string().optional().or(z.literal("")),
  transport_needed: z.boolean().optional().default(false),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- tests/validation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the error map**

```ts
// src/lib/errors.ts
export type RegistrationErrorCode =
  | "FULL" | "CLOSED" | "DEADLINE_PASSED" | "DUPLICATE"
  | "RATE_LIMITED" | "INVALID" | "CAPTCHA_FAILED" | "SERVER_ERROR";

export const ERROR_STATUS: Record<RegistrationErrorCode, number> = {
  INVALID: 400, CAPTCHA_FAILED: 400, DUPLICATE: 409,
  FULL: 409, CLOSED: 409, DEADLINE_PASSED: 409,
  RATE_LIMITED: 429, SERVER_ERROR: 500,
};

export const ERROR_MESSAGE: Record<RegistrationErrorCode, string> = {
  FULL: "This event is fully booked.",
  CLOSED: "Registration for this event is closed.",
  DEADLINE_PASSED: "The registration deadline has passed.",
  DUPLICATE: "This email is already registered for this event.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INVALID: "Please check the form and try again.",
  CAPTCHA_FAILED: "Captcha verification failed. Please retry.",
  SERVER_ERROR: "Something went wrong on our end. Please try again.",
};
```

- [ ] **Step 6: Write the QR + reg-code helpers**

```ts
// src/lib/qr.ts
import QRCode from "qrcode";
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 320, margin: 1, color: { dark: "#12224E", light: "#ffffff" } });
}
```

```ts
// src/lib/reg-code.ts
// The authoritative code is generated in SQL; this mirror is used only for
// building the status URL in tests/tooling if ever needed.
export function statusUrl(base: string, registrationId: string, token: string) {
  return `${base}/registration-status?id=${encodeURIComponent(registrationId)}&t=${encodeURIComponent(token)}`;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/registration.ts src/lib/errors.ts src/lib/qr.ts src/lib/reg-code.ts tests/validation.test.ts
git commit -m "feat: registration Zod schema, error map, QR + status-url helpers"
```

---

## Task 10: Supabase clients + generated types

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/admin-auth.ts`
- Create: `src/lib/supabase/database.types.ts` (generated)

**Interfaces:**
- Produces:
  - `createServiceClient()` — server-only, service role.
  - `createBrowserSupabase()` — anon, for realtime.
  - `createServerSupabase()` — SSR client bound to cookies (admin auth).
  - `requireAdmin()` — returns the user or redirects to `/admin/login`.

- [ ] **Step 1: Generate DB types**

Run: `npm run db:types`
Expected: `src/lib/supabase/database.types.ts` created with a `Database` type.

- [ ] **Step 2: Write the service client (server-only)**

```ts
// src/lib/supabase/server.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

- [ ] **Step 3: Write the browser client**

```ts
// src/lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 4: Write SSR + admin-auth helpers**

```ts
// src/lib/supabase/admin-auth.ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => all.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );
}

export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: isAdmin } = await supabase.rpc("is_admin", { uid: user.id });
  if (!isAdmin) redirect("/admin/login?error=not-admin");
  return user;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: supabase service/browser/ssr clients + requireAdmin guard"
```

---

## Task 11: Email sending (Resend) with degraded mode

**Files:**
- Create: `src/lib/email/resend.ts`, `src/lib/email/confirmation.tsx`

**Interfaces:**
- Consumes: `createServiceClient` (Task 10) for `email_log`.
- Produces: `sendConfirmationEmail({ to, fullName, eventName, registrationId, qrDataUrl }): Promise<void>` — never throws; logs to `email_log`.

- [ ] **Step 1: Write the email template**

```tsx
// src/lib/email/confirmation.tsx
export function confirmationHtml(p: {
  fullName: string; eventName: string; registrationId: string; qrDataUrl: string; statusUrl: string;
}) {
  return `<!doctype html><html><body style="font-family:sans-serif;background:#FBF8F1;padding:24px">
    <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px">
      <h1 style="color:#1E40AF;font-size:22px">You're registered, ${p.fullName}!</h1>
      <p style="color:#333">Your slot for <strong>${p.eventName}</strong> is reserved (pending approval).</p>
      <p style="text-align:center"><img src="${p.qrDataUrl}" width="200" height="200" alt="QR pass"/></p>
      <p style="text-align:center;font-size:18px;color:#1E40AF"><strong>${p.registrationId}</strong></p>
      <p style="text-align:center"><a href="${p.statusUrl}" style="color:#E09E1F">Check your status</a></p>
      <p style="color:#888;font-size:12px">Zubida YFC · One Province. One Mission. One Christ.</p>
    </div></body></html>`;
}
```

- [ ] **Step 2: Write the sender with degraded mode**

```ts
// src/lib/email/resend.ts
import "server-only";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { confirmationHtml } from "./confirmation";

export async function sendConfirmationEmail(args: {
  to: string; fullName: string; eventName: string;
  registrationId: string; qrDataUrl: string; statusUrl: string;
}): Promise<void> {
  const db = createServiceClient();
  const key = process.env.RESEND_API_KEY;
  try {
    if (!key) {
      await db.from("email_log").insert({ registration_id: args.registrationId, to_email: args.to, status: "queued" });
      return; // degraded mode: no key locally
    }
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "Zubida YFC <onboarding@resend.dev>",
      to: args.to,
      subject: `You're registered for ${args.eventName}`,
      html: confirmationHtml(args),
    });
    await db.from("email_log").insert({ registration_id: args.registrationId, to_email: args.to, status: "sent" });
  } catch (e) {
    await db.from("email_log").insert({
      registration_id: args.registrationId, to_email: args.to, status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/
git commit -m "feat: Resend confirmation email with degraded-mode logging"
```

---

## Task 12: The `/api/register` route handler (gatekeeper)

**Files:**
- Create: `src/app/api/register/route.ts`

**Interfaces:**
- Consumes: `registrationSchema`, `ERROR_STATUS`, `createServiceClient`, `generateQrDataUrl`, `sendConfirmationEmail`, `check_rate_limit`/`register_for_event` RPCs.
- Produces: `POST /api/register` → `200 { ok:true, registration_id, qr_token, qr, status }` or `4xx/5xx { ok:false, code, message }`.

- [ ] **Step 1: Write the route handler**

```ts
// src/app/api/register/route.ts
import { after, NextRequest, NextResponse } from "next/server";
import { registrationSchema } from "@/lib/validation/registration";
import { ERROR_STATUS, ERROR_MESSAGE, type RegistrationErrorCode } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { generateQrDataUrl } from "@/lib/qr";
import { statusUrl } from "@/lib/reg-code";
import { sendConfirmationEmail } from "@/lib/email/resend";

function fail(code: RegistrationErrorCode) {
  return NextResponse.json({ ok: false, code, message: ERROR_MESSAGE[code] }, { status: ERROR_STATUS[code] });
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // degraded mode
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
  let body: unknown;
  try { body = await req.json(); } catch { return fail("INVALID"); }

  const { captchaToken, ...rest } = (body ?? {}) as Record<string, unknown>;

  const parsed = registrationSchema.safeParse(rest);
  if (!parsed.success) return fail("INVALID");

  if (!(await verifyTurnstile(captchaToken as string | undefined, ip))) return fail("CAPTCHA_FAILED");

  const db = createServiceClient();

  const { data: allowed } = await db.rpc("check_rate_limit", {
    p_ip: ip, p_endpoint: "register", p_window_seconds: 60, p_max: 5,
  });
  if (allowed === false) return fail("RATE_LIMITED");

  const { data, error } = await db.rpc("register_for_event", { p: parsed.data });
  if (error) return fail("SERVER_ERROR");

  const result = data as { ok: boolean; code?: RegistrationErrorCode; registration_id?: string; qr_token?: string; status?: string };
  if (!result.ok) return fail(result.code ?? "SERVER_ERROR");

  const origin = req.nextUrl.origin;
  const link = statusUrl(origin, result.registration_id!, result.qr_token!);
  const qr = await generateQrDataUrl(link);

  // Off the critical path: email after the response is sent.
  after(async () => {
    await sendConfirmationEmail({
      to: parsed.data.email,
      fullName: parsed.data.full_name,
      eventName: "your event",
      registrationId: result.registration_id!,
      qrDataUrl: qr,
      statusUrl: link,
    });
  });

  return NextResponse.json({
    ok: true, registration_id: result.registration_id,
    qr_token: result.qr_token, qr, status: result.status,
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test against the running app**

Run (in one terminal `npm run dev`, then):
```bash
curl -s -X POST http://localhost:3000/api/register -H "content-type: application/json" \
 -d '{"event_id":"<paste a seeded event id>","full_name":"Test","email":"smoke@test.com","chapter":"Pagadian City","age":18,"consent":true}'
```
Expected: JSON `{ ok:true, registration_id:"ZYFC-...", qr:"data:image/png;base64,...", status:"pending" }`. A repeat with the same email returns `{ ok:false, code:"DUPLICATE" }` (409).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/register/route.ts
git commit -m "feat: /api/register gatekeeper — validate, captcha, rate-limit, atomic RPC, QR, queued email"
```

---

## Task 13: Wire the registration form to the real endpoint

**Files:**
- Modify: `src/components/shared/registration-form.tsx` (replace the Phase 1 `setTimeout` simulation)
- Modify: `src/components/shared/event-modal.tsx` (pass `event.id` through — already available)

**Interfaces:**
- Consumes: `POST /api/register`.
- Produces: on success, shows the real QR (`qr` data URL) + `registration_id`; on typed error, shows the mapped message; retries network failures.

- [ ] **Step 1: Replace the submit handler**

Replace the `submit` function and success rendering in `registration-form.tsx` so it:
- builds the payload from form fields + `event.id`,
- disables the button immediately (guard already present),
- `POST`s to `/api/register` with up to 2 automatic retries on network error (not on 4xx),
- on `ok`, stores `{ registrationId, qr }` and renders the returned `qr` image instead of `FakeQR`,
- on `!ok`, renders `ERROR_MESSAGE[code]` inline and re-enables the form.

```tsx
// key excerpt — the new submit handler
const [error, setError] = useState<string | null>(null);
const [result, setResult] = useState<null | { registrationId: string; qr: string }>(null);

async function postWithRetry(payload: Record<string, unknown>, tries = 3): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res; // includes 4xx/5xx — only network errors retry
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

const submit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (submitting || result) return;
  setError(null);
  setSubmitting(true);
  const fd = new FormData(e.currentTarget);
  const payload = {
    event_id: event.id,
    full_name: fd.get("fullName"),
    nickname: fd.get("nickname"),
    birthdate: fd.get("birthdate"),
    age: fd.get("age"),
    gender: fd.get("gender"),
    email: fd.get("email"),
    phone: fd.get("phone"),
    chapter: fd.get("chapter"),
    cluster: fd.get("cluster"),
    parish: fd.get("parish"),
    school: fd.get("school"),
    emergency_contact: fd.get("emContact"),
    emergency_number: fd.get("emNumber"),
    medical_concerns: fd.get("medical"),
    food_restrictions: fd.get("food"),
    shirt_size: fd.get("shirt"),
    transport_needed: fd.get("transport") === "on",
    consent: fd.get("consent") === "on",
    captchaToken: (fd.get("cf-turnstile-response") as string) || undefined,
  };
  try {
    const res = await postWithRetry(payload);
    const data = await res.json();
    if (data.ok) setResult({ registrationId: data.registration_id, qr: data.qr });
    else setError(data.message ?? "Something went wrong. Please try again.");
  } catch {
    setError("We couldn't reach the server. Please check your connection and try again.");
  } finally {
    setSubmitting(false);
  }
};
```

In the success view, replace `<FakeQR seed={done} />` with `<img src={result.qr} width={132} height={132} alt="Registration QR" />` and use `result.registrationId`. Render `{error && <p className="...text-rose-600">{error}</p>}` above the submit button.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles; `/events` still static, `/api/register` shows as a dynamic function route.

- [ ] **Step 3: Manual test**

With `npm run dev` and local Supabase running: open `/events`, register for an Open event → see real QR + ID. Register again same email → see the "already registered" message.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/registration-form.tsx src/components/shared/event-modal.tsx
git commit -m "feat: wire registration form to real /api/register with retry + typed errors"
```

---

## Task 14: Realtime live slot counter

**Files:**
- Create: `src/components/events/live-slots.tsx`
- Modify: `src/components/shared/event-card.tsx` (use live count when available)

**Interfaces:**
- Consumes: `createBrowserSupabase`, Supabase Realtime on `events`.
- Produces: `<LiveSlots eventId slotsTaken slotsTotal />` — subscribes to row updates and re-renders the remaining count.

- [ ] **Step 1: Enable Realtime on events (migration)**

Add to a new migration `supabase/migrations/0006_realtime.sql`:
```sql
alter publication supabase_realtime add table events;
```
Run: `npm run db:reset`. Expected: no error.

- [ ] **Step 2: Write the component**

```tsx
// src/components/events/live-slots.tsx
"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function LiveSlots({ eventId, slotsTaken, slotsTotal }: { eventId: string; slotsTaken: number; slotsTotal: number }) {
  const [taken, setTaken] = useState(slotsTaken);
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`event-${eventId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        (payload) => setTaken((payload.new as { slots_taken: number }).slots_taken))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);
  const left = Math.max(0, slotsTotal - taken);
  return <span>{left} left</span>;
}
```

- [ ] **Step 3: Use it in the event card**

In `event-card.tsx`, replace the static `{event.slotsTotal - event.slotsTaken} left` with `<LiveSlots eventId={event.id} slotsTaken={event.slotsTaken} slotsTotal={event.slotsTotal} />` (keep the static progress bar as-is for now).

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` → passes. Manually: open `/events` in two tabs, register in one, watch the count drop in the other.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_realtime.sql src/components/events/live-slots.tsx src/components/shared/event-card.tsx
git commit -m "feat: realtime live slot counter via supabase realtime"
```

---

## Task 15: Public registration status lookup

**Files:**
- Create: `src/app/registration-status/page.tsx`, `src/app/registration-status/actions.ts`

**Interfaces:**
- Consumes: `check_registration` RPC.
- Produces: a page that takes `id` + `email` (form) or `id` + `t` (from email link) and shows status + QR.

- [ ] **Step 1: Write the server action**

```ts
// src/app/registration-status/actions.ts
"use server";
import { createServiceClient } from "@/lib/supabase/server";

export async function lookupRegistration(registrationId: string, email: string) {
  const db = createServiceClient();
  const { data, error } = await db.rpc("check_registration", {
    p_registration_id: registrationId.trim(),
    p_email: email.trim(),
  });
  if (error) return { found: false as const };
  return data as { found: boolean; status?: string; event_name?: string; event_date?: string; full_name?: string; registration_id?: string };
}
```

- [ ] **Step 2: Write the page (client form + result)**

Create a client component page with:
- an input for Registration ID and Email, a Check button,
- calls `lookupRegistration`, shows a status badge (`pending`/`approved`/`rejected`) with the event name + date,
- reuses `PageHeader` for the hero and the glass card styling from Phase 1.

```tsx
// src/app/registration-status/page.tsx
"use client";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { lookupRegistration } from "./actions";

export default function StatusPage() {
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Awaited<ReturnType<typeof lookupRegistration>> | null>(null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRes(await lookupRegistration(id, email));
    setLoading(false);
  };

  return (
    <>
      <PageHeader eyebrow="Registration" title="Check your status" subtitle="Enter your registration ID and email to see whether your slot is confirmed." />
      <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <form onSubmit={check} className="glass space-y-4 rounded-3xl p-6 shadow-card">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ZYFC-XXXX-1234" required className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-midnight-800" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" required className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-midnight-800" />
          <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "Checking…" : "Check status"}</Button>
        </form>
        {res && (
          <div className="glass mt-6 rounded-3xl p-6 text-center shadow-card">
            {res.found ? (
              <>
                <p className="text-sm text-muted">{res.event_name}</p>
                <p className="mt-2 font-display text-2xl font-semibold capitalize">{res.status}</p>
                <p className="mt-1 text-sm text-muted">{res.full_name} · {res.registration_id}</p>
              </>
            ) : (
              <p className="font-medium">No matching registration found. Double-check your ID and email.</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: compiles; `/registration-status` present.

- [ ] **Step 4: Commit**

```bash
git add src/app/registration-status/
git commit -m "feat: public registration status lookup via scoped RPC"
```

---

## Task 16: Admin login

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 10).
- Produces: email+password sign-in that redirects to `/admin` on success.

- [ ] **Step 1: Create an admin user + row (one-time, documented)**

Run (documented in the step, executed by operator):
```bash
# create the auth user via Supabase Studio (http://localhost:54323) or:
npx supabase auth admin create-user --email admin@zubidayfc.org --password 'ChangeMe123!' 2>/dev/null || true
# then mark them admin:
psql "$SUPABASE_DB_URL" -c "insert into admins (user_id, role) select id, 'super_admin' from auth.users where email='admin@zubidayfc.org' on conflict do nothing;"
```
Expected: one row in `admins`.

- [ ] **Step 2: Write the login server action**

```ts
// src/app/admin/login/actions.ts
"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/admin-auth";

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/admin/login?error=invalid");
  redirect("/admin");
}
```

- [ ] **Step 3: Write the login page**

```tsx
// src/app/admin/login/page.tsx
import { signIn } from "./actions";
import { Button } from "@/components/ui/button";

export default function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <section className="mx-auto flex min-h-[80svh] max-w-md items-center px-4">
      <form action={signIn} className="glass w-full space-y-4 rounded-3xl p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold">Admin sign in</h1>
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-midnight-800" />
        <input name="password" type="password" required placeholder="Password" className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-midnight-800" />
        <Button type="submit" size="lg" className="w-full">Sign in</Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`. Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/login/
git commit -m "feat: admin login via supabase auth"
```

---

## Task 17: Admin dashboard — list, approve/reject, export, live

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/components/admin/registrations-table.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 10), `event_registrations` (admin RLS read/update), `audit_log`.
- Produces: server-rendered page guarded by `requireAdmin`; approve/reject server actions writing status + audit row; CSV export; realtime table updates.

- [ ] **Step 1: Write the admin server actions**

```ts
// src/app/admin/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, requireAdmin } from "@/lib/supabase/admin-auth";

export async function setStatus(registrationId: string, status: "approved" | "rejected") {
  const user = await requireAdmin();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("event_registrations")
    .update({ status })
    .eq("registration_id", registrationId);
  if (error) throw new Error(error.message);
  await supabase.from("audit_log").insert({
    actor_user_id: user.id, action: `registration.${status}`,
    entity: "event_registrations", entity_id: registrationId,
  });
  revalidatePath("/admin");
}
```

- [ ] **Step 2: Write the dashboard page (guarded, server component)**

```tsx
// src/app/admin/page.tsx
import { requireAdmin, createServerSupabase } from "@/lib/supabase/admin-auth";
import { RegistrationsTable } from "@/components/admin/registrations-table";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data: regs } = await supabase
    .from("event_registrations")
    .select("registration_id, full_name, email, chapter, status, created_at, event_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const total = regs?.length ?? 0;
  const pending = regs?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-semibold">Admin dashboard</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total" value={total} />
        <Stat label="Pending" value={pending} />
      </div>
      <div className="mt-10">
        <RegistrationsTable initial={regs ?? []} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold text-royal-700 dark:text-gold-300">{value}</p>
    </div>
  );
}
```

- [ ] **Step 3: Write the client table (approve/reject + CSV + realtime)**

```tsx
// src/components/admin/registrations-table.tsx
"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { setStatus } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

type Row = { registration_id: string; full_name: string; email: string; chapter: string; status: string; created_at: string };

export function RegistrationsTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel("admin-registrations")
      .on("postgres_changes", { event: "*", schema: "public", table: "event_registrations" }, () => {
        // simplest correct behavior: refetch the visible page
        supabase.from("event_registrations")
          .select("registration_id, full_name, email, chapter, status, created_at")
          .is("deleted_at", null).order("created_at", { ascending: false }).limit(200)
          .then(({ data }) => data && setRows(data as Row[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const exportCsv = () => {
    const header = "registration_id,full_name,email,chapter,status,created_at\n";
    const body = rows.map((r) => [r.registration_id, r.full_name, r.email, r.chapter, r.status, r.created_at].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "registrations.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex justify-end"><Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button></div>
      <div className="overflow-x-auto rounded-2xl glass">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-muted"><tr>
            <th className="p-3">ID</th><th className="p-3">Name</th><th className="p-3">Chapter</th><th className="p-3">Status</th><th className="p-3">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.registration_id} className="border-t border-black/5 dark:border-white/10">
                <td className="p-3 font-mono text-xs">{r.registration_id}</td>
                <td className="p-3">{r.full_name}</td>
                <td className="p-3">{r.chapter}</td>
                <td className="p-3 capitalize">{r.status}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button onClick={() => setStatus(r.registration_id, "approved")} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600">Approve</button>
                    <button onClick={() => setStatus(r.registration_id, "rejected")} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600">Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: compiles; `/admin` and `/admin/login` present as dynamic routes.

- [ ] **Step 5: Manual end-to-end**

Sign in at `/admin/login` with the admin user (Task 16). Register a guest at `/events`. Confirm it appears live in the table, approve it, then confirm `/registration-status` shows `approved`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/actions.ts src/components/admin/registrations-table.tsx
git commit -m "feat: admin dashboard — live list, approve/reject with audit, CSV export"
```

---

## Task 18: RLS verification test + full suite + final build

**Files:**
- Create: `tests/rls.test.ts`

**Interfaces:**
- Consumes: anon client (anon key), `check_registration` RPC.

- [ ] **Step 1: Write the RLS test**

```ts
// tests/rls.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { makeServiceClient, insertEvent, clearRegistrations, payload } from "./setup/supabase";
import "dotenv/config";

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const service = makeServiceClient();

it("anon cannot read event_registrations directly", async () => {
  const { data, error } = await anon.from("event_registrations").select("*").limit(1);
  // RLS returns empty (not an error) for SELECT with no policy match
  expect(error === null ? (data?.length ?? 0) : 0).toBe(0);
});

it("check_registration returns only the matching row", async () => {
  const id = await insertEvent(service, { slots_total: 5 });
  const { data: reg } = await service.rpc("register_for_event", { p: payload(id, "scoped@x.com") });
  const regId = (reg as any).registration_id;
  const { data: hit } = await anon.rpc("check_registration", { p_registration_id: regId, p_email: "scoped@x.com" });
  expect((hit as any).found).toBe(true);
  const { data: miss } = await anon.rpc("check_registration", { p_registration_id: regId, p_email: "wrong@x.com" });
  expect((miss as any).found).toBe(false);
  await clearRegistrations(service, id);
});
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test:run`
Expected: all suites pass (concurrency, duplicate, deadline, rate-limit, validation, rls).

- [ ] **Step 3: Final production build**

Run: `npm run build`
Expected: compiles; Phase 1 pages still static; `/api/register`, `/admin`, `/admin/login`, `/registration-status` present.

- [ ] **Step 4: Commit**

```bash
git add tests/rls.test.ts
git commit -m "test: RLS — anon cannot read registrations; check_registration is scoped"
```

---

## Self-Review

**Spec coverage:**
- Atomic slot claim + unique-email invariant → Tasks 2, 3, 5; proven by Task 7, 8.
- Guest registration, no login → Task 12, 13.
- CAPTCHA (Turnstile) → Task 12 (`verifyTurnstile`, degraded mode).
- Rate limiting → Task 4 (table), 5 (`check_rate_limit`), 12 (call), 8 (test).
- Real QR → Task 9 (`generateQrDataUrl`), 12/13 (usage).
- Queued email via `after()` + Resend + degraded mode → Task 11, 12.
- Status lookup via scoped RPC → Task 5, 15; RLS-safe proven in Task 18.
- Admin approval + dashboard + audit + CSV + live → Tasks 16, 17.
- RLS (no public read/insert of registrations) → Task 6; proven Task 18.
- All tables UUID/timestamps/soft-delete/indexes → Tasks 2–4.
- Env vars + degraded mode → Task 1, 11, 12.
- Realtime live slots → Task 14.
- Concurrency/duplicate/deadline/validation/rate-limit/RLS tests → Tasks 7, 8, 9, 18.

**Placeholder scan:** No TBD/TODO. Each code step contains real code. Task 13 shows the full new submit handler and the exact replacements to make in the existing file.

**Type consistency:** `register_for_event(p jsonb)` is called with `{ p: payload }` everywhere (Tasks 7, 8, 12, 18). Error codes in `RegistrationErrorCode` (Task 9) match the SQL-returned codes (Task 5) and the route's `fail()` (Task 12). `registrationSchema` field names match the SQL insert columns (Task 5) and the form payload keys (Task 13). `check_registration(p_registration_id, p_email)` signature consistent across Tasks 5, 15, 18.

**Note on a known ordering detail:** Task 7's concurrency test passes immediately because the engine (Task 5) is already implemented — this is intentional (the DB function is the unit under test and can't be sensibly stubbed). The test still fails correctly if the atomic UPDATE is ever regressed.
