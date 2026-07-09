# Zubida YFC — Phase 2 Design Spec (Event Registration Engine)

**Date:** 2026-07-10
**Status:** Approved
**Depends on:** Phase 1 (public showcase site) — this phase makes the Events
registration flow real and backed by Supabase.

## Goal

Turn the Phase 1 demo registration into a **production-grade, concurrency-safe
event registration system** that cannot overbook or double-register under load,
backed by Supabase/PostgreSQL, with real QR codes, queued confirmation emails,
a public status lookup, and a minimal admin approval dashboard.

## Decisions locked during brainstorming

- **Auth model:** **Guest registration** — anyone registers with their email, no
  login wall. Member accounts/portal are a later phase. Duplicates are prevented
  by a unique `(event_id, lower(email))` constraint.
- **Phase 2 scope (all included):** atomic registration engine, **admin approval
  + dashboard**, **Resend confirmation emails**, **public status lookup**, **real
  scannable QR generation**.
- **Supabase:** project already exists. This spec covers schema, migrations, RLS,
  and app integration — not project creation.
- **Best-choice picks:** Cloudflare **Turnstile** for CAPTCHA (lighter, no Google
  tracking); Next.js 15 **`after()`** for non-blocking email (no heavyweight queue
  in this phase); **atomic conditional-update RPC** for slot claiming.

## Core Concurrency Mechanism (the crux)

Slot claiming happens in a single PostgreSQL transaction inside a
`SECURITY DEFINER` RPC `register_for_event(...)`:

1. Atomically claim a slot:
   ```sql
   UPDATE events
     SET slots_taken = slots_taken + 1
     WHERE id = p_event_id
       AND status = 'Open'
       AND slots_taken < slots_total
       AND now() < registration_deadline
     RETURNING id;
   ```
   If no row returns → determine and raise the precise reason (`FULL`,
   `CLOSED`, `DEADLINE_PASSED`).
2. Insert the registration row. A **unique index
   `(event_id, lower(email)) WHERE deleted_at IS NULL`** makes duplicate
   registration impossible even under a race; a unique-violation is caught and
   returned as `DUPLICATE` (and the claimed slot is rolled back with the
   transaction).
3. Generate `registration_id` (human code `ZYFC-XXXX-####`) and `qr_token`
   (uuid). Return them.

Postgres serializes the conditional `UPDATE`, so correctness never depends on the
app server. No explicit `FOR UPDATE` lock is needed; the conditional update gives
the same guarantee with higher throughput.

**Rejected alternatives:** app-level check-then-insert (classic race →
overbooking); explicit `SELECT … FOR UPDATE` (correct but more lock contention
and more code).

## Request Flow

Guest submits form → `POST /api/register` (Next.js Route Handler). The server is
the gatekeeper — the client never writes to the DB directly.

1. **Validate** payload with Zod (server-side).
2. **Verify CAPTCHA** — Cloudflare Turnstile token via siteverify.
3. **Rate-limit** by IP — Postgres function `check_rate_limit(ip, window,
   max)` against a `rate_limits` table (keeps everything in Supabase; Upstash
   Redis noted as the scale-up path).
4. **Call `register_for_event` RPC** → atomic transaction above. Returns
   `{ registration_id, qr_token }` or a typed error
   (`FULL` / `CLOSED` / `DEADLINE_PASSED` / `DUPLICATE` / `RATE_LIMITED`).
5. **Generate QR** with `qrcode` encoding the status URL
   (`/registration-status?id=<registration_id>&t=<qr_token>`).
6. **Queue email** via Resend inside `after()` so it runs after the response is
   sent (non-blocking). Failures are logged to `email_log`, not surfaced to the
   user's request.
7. Respond → client shows success screen with QR + registration ID.

**Realtime:** the events page subscribes to the `events` row via Supabase
Realtime → live "X slots left" without reload. Admin dashboard subscribes to
`event_registrations` for a live incoming feed.

**Client behavior:** submit button disabled on first click; optimistic
"Reserving your slot…" state; automatic retry (max 2, backoff) on network
failure; friendly "We're a bit busy — hang on" message on HTTP 429/503; typed
error messages for `FULL`/`CLOSED`/`DUPLICATE`.

## Data Model (Supabase migrations)

Conventions for every table: UUID PK (`gen_random_uuid()`), `created_at`,
`updated_at` (via trigger), `deleted_at` soft delete, FKs, indexes on searchable
columns.

### `events`
Promote the Phase 1 mock to a real table. Columns mirror `EventItem` plus:
`slots_taken int not null default 0` (authoritative counter), `status`
(`Open`/`Closed`/`Finished`), `scope`, `registration_deadline timestamptz`.
Indexes: `status`, `date`.

### `event_registrations`
All form fields: `full_name, nickname, birthdate, age, gender, email, phone,
chapter, cluster, parish, school, emergency_contact, emergency_number,
medical_concerns, food_restrictions, shirt_size, transport_needed bool,
consent bool`. Plus: `registration_id text unique`, `event_id fk`,
`status` enum (`pending`/`approved`/`rejected`/`cancelled`) default `pending`,
`qr_token uuid`, timestamps, `deleted_at`.
Indexes: unique `(event_id, lower(email)) WHERE deleted_at IS NULL`;
`registration_id`; `event_id`; `status`.

### `admins`
`user_id uuid` (FK → `auth.users`), `role` (`super_admin`/`provincial_admin`/
`event_organizer`), timestamps. Gates the dashboard.

### `audit_log`
`actor_user_id, action, entity, entity_id, meta jsonb, created_at`. Records admin
approve/reject and other privileged actions.

### `rate_limits`
`ip text, endpoint text, created_at`. Rows counted within a sliding window by
`check_rate_limit`. A periodic cleanup (cron or on-write prune) removes old rows.

### `email_log`
`registration_id, to_email, status (queued/sent/failed), error, created_at`.
Observability for the fire-after email send.

## Database Functions (RPC)

- `register_for_event(payload jsonb) returns jsonb` — SECURITY DEFINER; the
  atomic transaction described above.
- `check_registration(p_registration_id text, p_email text) returns jsonb` —
  SECURITY DEFINER; returns only that one registration's public status fields
  (status, event name, date). Prevents enumeration.
- `check_rate_limit(p_ip text, p_endpoint text, p_window int, p_max int)
  returns bool`.
- `set_updated_at()` trigger function.

## Security (RLS)

- **`event_registrations`:** RLS on. No public `SELECT`. No public `INSERT`
  (inserts only via `register_for_event`, which is SECURITY DEFINER and owned by
  a privileged role). Admins (authenticated + present in `admins`) may
  `SELECT`/`UPDATE`.
- **Status lookup:** only through `check_registration` RPC — never direct table
  reads.
- **`events`:** public `SELECT` of non-deleted rows; writes admin-only.
- **Admin dashboard:** Supabase Auth (email + password) + server-side `is_admin`
  check on every admin request/route. `admins` and `audit_log` are admin-only.
- Zod validation on all inputs; parameterized queries only; service-role key used
  server-side only (never shipped to client); HTTPS (Vercel default);
  CSRF-safe (same-origin POST + no cookie-based mutation for public endpoint).

## App Integration (files)

```
src/
  lib/supabase/
    server.ts        server client (service role, server-only)
    browser.ts       browser client (anon key, realtime subscriptions)
    types.ts         generated DB types
  lib/validation/registration.ts   Zod schema (shared client + server)
  lib/qr.ts          QR generation helper
  lib/email/
    resend.ts        Resend client
    templates/confirmation.tsx      email template
  app/api/register/route.ts         the gatekeeper endpoint
  app/registration-status/page.tsx  public lookup page
  app/admin/
    login/page.tsx
    page.tsx         registrations table, approve/reject, export CSV, live counts
  components/events/registration-form.tsx   (wire Phase 1 form to real endpoint)
  components/events/live-slots.tsx           realtime slot counter
supabase/
  migrations/*.sql   schema, indexes, RLS, functions
  seed.sql           import current mock events
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
RESEND_API_KEY=
RESEND_FROM="Zubida YFC <no-reply@zubidayfc.org>"
TURNSTILE_SECRET_KEY=               # server only
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

**Degraded mode for local dev:** if Turnstile keys are absent, CAPTCHA
verification is skipped; if Resend key is absent, emails are logged to
`email_log` as `queued` and not sent. Development is never blocked on missing
third-party keys.

## Testing (TDD — this is how we prove the engine)

1. **Concurrency test (the headline):** fire N=200 simultaneous
   `register_for_event` calls at a 50-slot event; assert **exactly 50** succeed,
   the rest return `FULL`, `slots_taken` = 50, and there are **0 duplicate
   registrations** and **0 overbooking**. Run against a local/test Supabase.
2. **Duplicate test:** two concurrent registrations, same email + event →
   exactly one succeeds, the other returns `DUPLICATE`.
3. **Deadline/closed tests:** registering past deadline → `DEADLINE_PASSED`;
   against a `Closed`/`Finished` event → `CLOSED`.
4. **Validation tests:** Zod rejects malformed payloads (missing consent, bad
   email, out-of-range age).
5. **RLS tests:** anonymous client cannot `SELECT` `event_registrations`;
   `check_registration` returns only the matching row.
6. **Status lookup + admin approve/reject** happy-path integration tests.
7. **Rate-limit test:** exceeding the window returns `RATE_LIMITED` (429).

## Performance Targets (carried from the brief)

- Registration RPC round-trip < 300 ms under normal load.
- Slot-claim correctness at 1,000+ concurrent users (guaranteed by DB atomicity,
  demonstrated by the concurrency test at proportional scale).
- Email send off the critical path (via `after()`), so response time is
  unaffected by SMTP latency.

## Explicitly Deferred to Later Phases

Member accounts/portal, QR **attendance scanner** app, certificates, payments/
donations/merch, the full 15-table admin CRUD, analytics charts, gamification,
push notifications, AI chatbot.

## Success Criteria (Phase 2)

- `next build` passes; all Phase 1 routes still work.
- Concurrency test proves no overbooking and no duplicates.
- A guest can register → receives QR + registration ID → gets a confirmation
  email → can look up status by ID + email.
- An admin can log in, see registrations live, approve/reject, and export CSV.
- RLS verified: no public read of registration data.
- Works in degraded mode locally without third-party keys.
