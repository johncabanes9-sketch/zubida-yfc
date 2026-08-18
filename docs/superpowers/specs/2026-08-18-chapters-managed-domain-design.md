# Chapters as a Managed Domain

**Date:** 2026-08-18
**Status:** Approved, not yet implemented
**Slice:** First of the deferred content slice (chapters, leaders, news, gallery, testimonials, FAQ)

## Problem

`src/lib/content/fixtures.ts` gates six domains of Phase-1 fixture data behind
`isVerified()`, all currently `false`. The gate's own comment records the intended
endgame:

> Each domain below stays `false` until an authorized administrator supplies
> verified content, at which point the domain should move to a managed table
> rather than having this flag flipped.

Nothing has moved yet. Meanwhile the page CMS (`pages` / `page_sections`) holds
exactly one page — `about` — and only `/chapters`, `/leaders`, `/news`,
`/gallery` render a withholding notice where real content should be.

## Scope decision: two subsystems, not one

The deferred slice was framed as "move the six domains onto `pages`/`page_sections`".
That framing does not survive contact with the data.

**Leaders, chapters, news, gallery and testimonials are collections of records.**
A chapter has a cluster, a municipality, a coordinator, a schedule. Storing twelve
of them in a single `page_sections` JSON blob would mean no per-record
permissions, no querying, no sorting, no pagination, and a full-list rewrite on
every edit. They belong in managed tables — which is what the fixture gate says.

**FAQ is genuinely a section type** — a list of question/answer pairs, the same
shape `feature-cards` and `values-grid` already have. It belongs in the existing
registry and needs no new storage.

This spec covers **chapters only**, as the first vertical slice. The other four
domains follow the pattern it establishes and get re-scoped with real experience.

### Why chapters is the right pilot

`clusters` is a live RBAC table (Bay / North / South) that `admins.cluster_id`
references and existing RLS policies depend on. A chapter belongs to a cluster.
Chapters is therefore the only domain with a real foreign key into existing RBAC,
which makes it the one that exercises **cluster-scoped per-row RLS** — a cluster
head managing their own cluster's chapters and no one else's.

`requireClusterAccess()` already exists in `src/lib/supabase/admin-auth.ts` and is
currently unused. This slice is its first consumer.

## Schema

Migration `0023_chapters.sql`:

```sql
create table if not exists chapters (
  id            uuid primary key default gen_random_uuid(),
  cluster_id    uuid not null references clusters(id) on delete restrict,
  name          text not null,
  slug          text not null unique,
  municipality  text not null,
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
```

- `cluster_id` is `not null` and `on delete restrict`: a chapter without a cluster
  has no owner, and deleting a cluster out from under its chapters would orphan
  the RLS predicate.
- `schedule`, `coordinator` and `cover_path` are nullable **by design**. Under the
  content rule a chapter may exist with its coordinator withheld rather than
  invented. Nullable is the mechanism that makes withholding representable.
- `deleted_at` gives soft delete, matching `events`.

### Fields deliberately not carried over

`src/data/chapters.ts` also carries `memberCount` and `upcoming`. Both are dropped:

- **`memberCount`** — an unverifiable per-chapter figure of exactly the kind the
  content audit already forced out of the site (the "26 chapters" claim). No real
  numbers exist to put in it. Adding a column nobody can populate invites a
  placeholder.
- **`upcoming`** — duplicates the `events` table. A chapter's next event should be
  a query against real event rows, not a typed-in string that silently goes stale.

Either can be added later if the organization supplies real data.

## Row-level security

Mirrors the existing `is_pyh(uid)` helper in `0008b_admins_rbac.sql`:

```sql
create or replace function admin_cluster(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cluster_id from admins
  where user_id = uid and deleted_at is null and is_active = true
$$;
```

Policies:

| Policy | Rule |
| --- | --- |
| `chapters_public_read` | `anon`, `authenticated`: `is_published = true and deleted_at is null` |
| `chapters_admin_read` | any active admin reads all rows, published or not |
| `chapters_pyh_write` | `is_pyh(auth.uid())` — full write |
| `chapters_cluster_write` | `cluster_id = admin_cluster(auth.uid())` — scoped write |

The cluster-scoped write policy must apply to `using` **and** `with check`, so a
cluster head can neither edit a row outside their cluster nor move a row into
another cluster.

**Read is province-wide, write is cluster-scoped.** A cluster head sees every
chapter in the admin list — useful context, and nothing there is secret — but can
only edit their own cluster's rows. This is an explicit decision, not an
oversight: scoping reads as well would hide the province from the people running
parts of it, for no confidentiality gain.

Note `admin_cluster()` returns `null` for a PYH (whose `cluster_id` is null), so
`cluster_id = admin_cluster(uid)` evaluates to `null` — falsy — and the PYH is
covered solely by `chapters_pyh_write`. The same holds for a malformed cluster
head with a null `cluster_id`: the comparison denies rather than permits, which is
the correct default.

## Admin surface

`/admin/chapters` — list plus create/edit, following `/admin/pages` conventions.

Server actions in `src/app/admin/chapters/actions.ts`, each guarded by
`requireClusterAccess(chapter.cluster_id)`. Note the guard needs the row's
current cluster, so the action reads the row before authorizing.

Cover images reuse the existing upload machinery unchanged: `validateImage` for
sniffing, an object-path helper alongside `pageImageKey`, and `reapPaths` on both
replace and delete so storage never accumulates orphans.

### Data entry workflow

The admin form is the only way real chapter data enters the system, so it has to
suit how that data actually arrives: incompletely, over time.

- **Partial saves must succeed.** Only `name`, `municipality` and `cluster_id` are
  required. A chapter saves with `coordinator` and `schedule` blank and is
  completed later. Form validation must not require a field the schema allows to
  be null — a required field with no known value is precisely the pressure that
  makes someone type something plausible.
- **`is_published` defaults to `false`.** Chapters are entered as drafts, checked,
  and published deliberately. Nothing reaches the public page by being saved.
- **Publishing is per row.** Ten confirmed chapters can go live while two await
  their coordinator, rather than the directory waiting on its slowest entry.
- **Blank means withheld, and the form should say so**, matching the wording
  `/admin/settings` already uses for the contact fields it can withhold.

Navigation: cluster heads gain a Chapters tab. Consistent with the read/write
split above, the list shows every chapter in the province; edit and delete
controls render only for rows in the viewer's own cluster. The UI must not be the
only thing enforcing that — the RLS policy is the real boundary, and the suite
tests it directly rather than through the form.

## Public page

`/chapters` reads published rows through a new `getChapters()` in
`src/lib/data/chapters.ts`, following the shape of `getPage()` — including the
try/catch outage fallback so a database failure degrades rather than 500s.

**Withholding behaviour is unchanged.** The page already renders
`UnpublishedNotice` when `isVerified("chapters")` is false; it will render the
same component with the same copy when there are no published rows. Only the
condition changes. A visitor sees no difference until real chapters are published.

`ChaptersExplorer` is re-typed from the fixture `Chapter` to the database row.

## Content rule: real numbers only, real information only

This is the binding constraint on the slice, not a preference.

**The table ships empty.** The migration creates the table and its policies and
seeds nothing. The twelve fixture chapters are invented — invented coordinators,
invented schedules, invented member counts, `picsum.photos` covers — and must not
be migrated into a table that the public site reads as fact.

`src/data/chapters.ts` is deleted and `"chapters"` is removed from `FixtureDomain`.

Three mechanisms enforce this rather than leaving it to good intentions:

1. **Nullable by design.** `schedule`, `coordinator` and `cover_path` are nullable
   so a chapter can be published with a field genuinely absent. Withholding must
   be representable in the schema, or the schema itself pressures someone to fill
   the gap with something plausible.
2. **No default content anywhere.** Unlike `page_sections`, whose registry entries
   carry `defaultContent`, a new chapter starts with empty optional fields. The
   `text-image` section already sets this precedent in the registry: *"No default
   image: seeding a stock placeholder is how stand-in imagery ends up published
   as though it depicted the organization."*
3. **Asserted, not assumed.** `prove:chapters` asserts the migration inserts zero
   chapter rows, and `prove:content` asserts no `picsum.photos` or `i.pravatar.cc`
   URL can reach a chapter record. A future seed that "makes the page look
   finished" fails the suite.

### On `memberCount`

Excluded because no real figures exist for it, and an empty column on a public
page is a standing invitation to fill it with a plausible one — the same pressure
that produced the "26 chapters" claim the content audit had to remove.

If the organization supplies real per-chapter numbers, the column is added then,
nullable, and published only where a real figure exists. The rule does not change
in that case; only the availability of data does. The same applies to `upcoming`,
which should be a query against real `events` rows if it returns at all.

## Testing

New suite `prove:chapters`, following the six existing `prove:*` suites: plain
`.mjs`, the shared `check()` harness, one command, `N passed, M failed`.

Coverage:

1. **Cluster-scoped RLS** — the sharp edge. A cluster head can write their own
   cluster's chapter and **cannot** write another cluster's, cannot move a row
   into another cluster, and cannot soft-delete outside their cluster.
2. **Public read** — anonymous clients see published, non-deleted rows only.
3. **Withholding** — an empty table renders `UnpublishedNotice`, not an empty grid.
4. **Soft delete** — a deleted chapter leaves the public page and stays readable
   to admins.
5. **Image lifecycle** — replacing a cover reaps the old object; deleting a
   chapter reaps its cover.
6. **Slug uniqueness** — enforced by the database, not only the form.
7. **No fabricated data can enter** — the migration inserts zero chapter rows, and
   no chapter record may carry a `picsum.photos` or `i.pravatar.cc` URL. This is
   the "real numbers only, real information only" rule made executable, so a later
   seed intended to make the page look finished fails the suite instead of
   shipping.

`prove:content` gains assertions that `src/data/chapters.ts` is gone and that
`"chapters"` no longer appears in `FixtureDomain`.

### The false-pass trap

RLS assertions **must** run through an authenticated client scoped to a real test
user. The service-role client bypasses RLS entirely, so a policy test written
against it passes no matter what the policy says. This project has already been
bitten by RLS false-passes once, and by two assertions that passed while testing
nothing in `prove:editor`. Every policy assertion in this suite gets a RED-first
check: break the policy, confirm the assertion fails, restore it.

## Risks

- **Cluster-scoped RLS is new authorization logic and fails silently.** A too-permissive
  policy looks identical to a correct one until someone edits another cluster's data.
  Mitigated by RED-first verification of every policy assertion.
- **`requireClusterAccess` has never run in production.** It exists and is typed but
  has no current consumer; this slice is its first real exercise.
- **Re-typing `ChaptersExplorer`** touches a Phase-1 component built around the
  fixture shape. Expect the filter/search UI to need adjustment where it assumed
  fields that no longer exist (`memberCount`, `upcoming`).

## Out of scope

Leaders, news, gallery, testimonials, and the FAQ section type. Each follows this
pattern and gets its own scoping pass. FAQ in particular needs no table and should
be much smaller.
