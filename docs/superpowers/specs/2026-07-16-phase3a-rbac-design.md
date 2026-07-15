# Phase 3a Design — RBAC, User Management & Event Ownership

**Date:** 2026-07-16
**Status:** Approved (design)
**Depends on:** Phase 2 (registration engine, `admins`/`audit_log`/`events`/`event_registrations`, Supabase Auth, `is_admin` RPC, RLS)

## Hard constraint

**The 8-page public site stays pixel-perfect and untouched.** No changes to public
pages, navbar, footer, or their styling. New capabilities require *new admin
screens* only; those reuse the existing admin look (glass cards, gold/royal
palette, shared UI components). This is the single most important rule of the phase.

## Goal

Turn the flat "any admin can do anything" model into a real two-tier RBAC system,
add PYH-only user management, give events an owner + cluster so Cluster Heads are
scoped to their own data, and harden auth (middleware gate, idle timeout, login
audit). Image/gallery uploads are explicitly **deferred to Phase 3b**.

## Scope

**In scope (Phase 3a):**
1. Two-role model (Provincial Youth Head, Cluster Head) with cluster scoping.
2. Canonical `clusters` table.
3. Auth hardening: middleware gate + session refresh + idle timeout, per-action
   authz helpers, login/logout audit logging.
4. Event ownership (`created_by`, `cluster_id`) + full event CRUD admin UI
   (create / edit / publish / archive / soft-delete).
5. Registration visibility scoped by cluster.
6. New admin shell + nav with role-based item visibility.
7. RBAC proof script against the real DB.

**Out of scope (deferred to Phase 3b):**
- Event image uploads, galleries, replace/delete, optimization (Supabase Storage).
- Announcements management, reports/analytics dashboards, content editing beyond
  events. (These appear in the broader wishlist but are not part of 3a.)

## Roles

| Role | enum value | `cluster_id` | Capabilities |
|------|-----------|--------------|--------------|
| Provincial Youth Head (PYH) | `provincial_youth_head` | `NULL` (all) | Everything: manage users, all events, all registrations, view logs. |
| Cluster Head | `cluster_head` | one cluster | Only their cluster: create events in it, edit events in it, delete only events they created, view/manage registrations for events in it. |

The existing bootstrap admin (currently enum `super_admin`) is treated as a PYH for
continuity; migration promotes it to `provincial_youth_head`. The `super_admin`,
`provincial_admin`, `event_organizer` enum values remain in the type (Postgres
enums can't drop values easily) but are unused going forward.

## Data model changes

### New table: `clusters`
```
clusters(
  id uuid pk default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
)
```
Seeded from existing cluster names found in `src/data/chapters.ts`
(e.g. Bay Cluster, North Cluster, …). Chapters are NOT migrated to reference it in
3a (public site untouched); only `events` and `admins` reference `cluster_id`.

### `admins` — extended
Add columns:
- `full_name text`
- `username text unique` (nullable/optional)
- `cluster_id uuid references clusters(id)` (NULL for PYH)
- `is_active boolean not null default true`

Add enum value `cluster_head` to `admin_role`. Deactivation flips `is_active`.
Delete is soft (`deleted_at` set) and also disables the corresponding auth user
(ban / password scramble via service role) so they can't log in.

### `events` — extended
Add columns:
- `created_by uuid references auth.users(id)`
- `cluster_id uuid references clusters(id)` (NULL = provincial-wide event)

`created_at` / `updated_at` already exist. Publish/archive maps to the existing
`status` enum (`Open` = published/live, `Finished`/`Closed` = archived states);
no new status column.

## SQL helper functions (SECURITY DEFINER, `search_path=public`)
- `is_admin(uid)` — unchanged (any active, non-deleted admin).
- `is_pyh(uid)` — true if the user's active admin row has role
  `provincial_youth_head`.
- `admin_cluster(uid)` — returns the admin's `cluster_id` (NULL for PYH).

All three ignore rows where `deleted_at is not null` or `is_active = false`.

## RLS policies (the real backstop)

**events**
- public read: `deleted_at is null` (unchanged).
- insert: `is_pyh(uid)` OR (`is_admin(uid)` AND `cluster_id = admin_cluster(uid)`).
- update: `is_pyh(uid)` OR (`cluster_id = admin_cluster(uid)`).
- delete/soft-delete: `is_pyh(uid)` OR (`created_by = uid` AND
  `cluster_id = admin_cluster(uid)`).

**event_registrations**
- read/update: `is_pyh(uid)` OR the registration's `event_id` belongs to an event
  whose `cluster_id = admin_cluster(uid)`.

**admins**
- self read: any admin can read admin rows (needed for nav/role checks).
- write (insert/update/delete): `is_pyh(uid)` only.

**clusters**
- read: any authenticated admin.
- write: `is_pyh(uid)` only.

**audit_log**
- read: `is_pyh(uid)` only (login logs are PYH-only).
- insert: via SECURITY DEFINER paths / service role.

## Auth & security

### Middleware (`src/middleware.ts`, matcher `/admin/:path*`)
1. Refresh the Supabase session (SSR cookie pattern).
2. If no user and path ≠ `/admin/login` → redirect to `/admin/login`.
3. **Idle timeout:** read a `last_activity` cookie; if `now - last_activity >
   IDLE_TIMEOUT` (default 30 min) → sign out + redirect to
   `/admin/login?error=timeout`. Otherwise refresh the cookie to `now`.

Middleware is a coarse gate only — it does not do row-level authorization.

### Per-action authz helpers (`src/lib/supabase/admin-auth.ts`)
- `requireAdmin()` — exists; also enforce `is_active` and `deleted_at is null`.
- `requirePYH()` — redirect/deny if not `is_pyh`.
- `requireClusterAccess(clusterId)` — allow PYH always, else require
  `clusterId === admin_cluster`.
Every server action calls the appropriate helper before touching data.

### CSRF
All mutations are Next.js **Server Actions** (no loose mutating API routes), which
enforce same-origin in Next 15. Cookies are `SameSite=Lax`, `HttpOnly`, `Secure`
in production. No custom CSRF token machinery.

### Login activity
`signIn` writes `auth.login` (with email + IP where available) and `signOut`
writes `auth.logout` to `audit_log`. Failed logins write `auth.login_failed`.

## Event CRUD (admin UI + actions)

Server actions in `src/app/admin/events/actions.ts`:
`createEvent`, `updateEvent`, `setEventStatus` (publish/archive), `deleteEvent`
(soft). Each validates with Zod (extend `src/lib/validation/`) and calls the right
authz helper. `createEvent` stamps `created_by = auth.uid()` and, for a Cluster
Head, forces `cluster_id = admin_cluster` (they can't create outside their cluster).

**Event-delete simplification (accepted):** Cluster Heads delete only events they
created; PYH deletes/reassigns anything. No per-event grant table — the "unless
granted by PYH" case is served by PYH acting directly.

## New admin UI (matches existing admin style)

Admin shell with role-aware nav:
- `/admin` — Registrations (exists), now scoped to viewer's cluster.
- `/admin/events` — list (scoped) + `/admin/events/new`, `/admin/events/[id]/edit`.
- `/admin/users` — **PYH only.** Create/edit/deactivate/delete Cluster Heads,
  assign cluster, reset password. Create form fields: Full Name, Email, Username
  (optional), Cluster, Password, Status.
- `/admin/logs` — **PYH only.** Login activity + audit trail.

Nav hides items the role can't use; screens still call `requirePYH()`
server-side (defense in depth — hiding UI is not authorization).

User-management actions (`src/app/admin/users/actions.ts`) use the Supabase
**service role** (server-only) to create/update/ban auth users, wrapped by
`requirePYH()`.

## Testing / proof

`scripts/prove-rbac.mjs` (mirrors Phase 2's `prove-*.mjs`), run against the real
throwaway Supabase project. Creates a PYH and a Cluster Head in cluster A, an event
in cluster A and one in cluster B, then asserts as the Cluster Head:
- CAN read/edit cluster-A event and its registrations.
- CANNOT read/edit/delete cluster-B event or its registrations (RLS blocks even a
  direct query with the cluster head's JWT).
- CANNOT insert/update/delete `admins` or `clusters` rows.
- CAN create an event only in cluster A (insert into cluster B is rejected).
Plus: idle-timeout and login-audit behavior verified via the running app over HTTP.

`next build` must stay green; no public-site snapshot changes.

## Migrations (additive, follow existing numbering)
- `0007_clusters.sql` — clusters table + seed.
- `0008_admins_rbac.sql` — admins columns + `cluster_head` enum value + promote
  bootstrap admin + `is_pyh`/`admin_cluster` functions.
- `0009_events_ownership.sql` — events `created_by` + `cluster_id`.
- `0010_rls_rbac.sql` — replace/extend RLS policies per above.

## Risks / notes
- Untyped Supabase clients (no local `gen types`) — extend
  `src/lib/supabase/database.types.ts` by hand, cast RPC/results.
- Existing events have no `cluster_id`/`created_by` → treated as provincial-wide,
  PYH-managed. Fine for the current seed data.
- Idle timeout is cookie-based (not server-enforced revocation); acceptable for an
  internal admin. Supabase token expiry remains the hard backstop.
