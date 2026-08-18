# Leaders as a Managed Domain

**Date:** 2026-08-18
**Status:** Approved, not yet implemented
**Slice:** Second of the deferred content slice (chapters ✅, **leaders**, news, gallery, testimonials, FAQ)
**Precedent:** `2026-08-18-chapters-managed-domain-design.md` — implemented, 33 assertions

## Problem

`/leaders` renders twelve fabricated profiles from `src/data/leaders.ts`. The audit
(`ZUBIDA_CONTENT_AUDIT.md` §2.4) records what is wrong with them:

- **Twelve invented people** — names, positions, chapters, and personal messages, none
  traceable to Zubida YFC.
- **A named clergy member** — "Rev. Fr. Emmanuel Sarabia, Provincial Spiritual Director".
  Inventing a priest and a title, and attributing a pastoral message to him, is the most
  serious single item the audit found.
- **`i.pravatar.cc` stock faces** — real-looking photographs of uninvolved people, presented
  as the leadership of a real organization.
- **Dead social links** — every profile carries `"#"`, rendering clickable icons that go
  nowhere.

The `leaders: false` fixture gate withholds all of it today, so `/leaders` shows a notice and
publishes nothing false. This slice replaces the fixture with a managed table so the
organization can publish its real leadership, and deletes the invented data rather than
leaving it in the repository behind a flag.

## What makes this slice different from chapters

Chapters was about places. **This is about people**, and three of its decisions follow from
that rather than from the chapters template.

### 1. The role taxonomy is itself invented

`src/data/types.ts` defines `LeaderCategory` as a five-value union: `Provincial Coordinator`,
`Provincial Couple Coordinators`, `Area Heads`, `Chapter Heads`, `Core Group Leaders`. No
project source traces those five names to Zubida YFC. They were authored in Phase 1 alongside
the twelve fake profiles.

Encoding them as a Postgres enum or `CHECK` constraint would put invented organizational
structure into the schema, where undoing it costs a migration and a data backfill instead of
an admin edit. **`position` is therefore free text** and the organization names its own roles.

The public page loses automatic category grouping as a result. That is the correct trade: a
flat, ordered directory that says only what the organization said is better than tidy
grouping under headings nobody confirmed.

### 2. Photos and quotes are personal data, not decoration

A chapter cover is a photograph of a place. A leader profile carries **a face, a personal
quote, and links to personal social accounts**, all attached to a named individual. The FAQ
puts the youth this ministry serves at ages 12–21, so some Core Group Leaders may be minors.

Copying the chapter-cover pipeline unchanged would put identifiable faces of possibly-underage
leaders on a public page with no recorded basis for publishing them. Consent is therefore
part of the schema — see **Consent** below.

### 3. Scope has two axes, and one of them is new

Chapters had exactly one scope column: `cluster_id`. A leader may be scoped to a chapter, to a
cluster, or to neither (provincial-level). Chapters are rows now, so `chapter_id` can be a
real foreign key — which means the two columns can disagree, and something has to stop that.

## Schema

Migrations `0025_leaders.sql` (table and constraints) and `0026_leaders_rls.sql` (policies
and the trigger), continuing from `0024_chapters_rls.sql`.

```sql
create table if not exists leaders (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  -- Free text by design: see "The role taxonomy is itself invented".
  position      text not null,
  -- Scope. Both null = provincial-level, writable by the PYH only.
  -- cluster_id is derived from chapter_id by trigger when a chapter is set.
  chapter_id    uuid references chapters(id) on delete restrict,
  cluster_id    uuid references clusters(id) on delete restrict,
  -- Personal content. Both require consent; see the CHECK below.
  message       text,
  photo_path    text,
  consent_at    timestamptz,
  consent_by    uuid references auth.users(id),
  -- Nullable, and https-only at the database boundary. Fuller URL parsing
  -- happens in the Zod schema; see "Two layers of URL validation".
  facebook_url  text,
  instagram_url text,
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  deleted_at    timestamptz,

  constraint leaders_personal_content_requires_consent check (
    (photo_path is null and message is null)
    or (consent_at is not null and consent_by is not null)
  ),
  constraint leaders_facebook_url_is_a_url check (
    facebook_url is null or facebook_url ~ '^https://'
  ),
  constraint leaders_instagram_url_is_a_url check (
    instagram_url is null or instagram_url ~ '^https://'
  )
);
```

The table ships **empty**. No seed rows, exactly like chapters.

### Consent

`leaders_personal_content_requires_consent` is the load-bearing constraint of this slice.

**It is stronger than hiding.** The row cannot *exist* carrying a face or a quote without a
recorded basis — who captured consent (`consent_by`) and when (`consent_at`). The database
refuses to hold the data, rather than storing it and declining to render it.

**It gives withdrawal the right shape.** Nulling `consent_at` fails unless `photo_path` and
`message` are cleared in the same statement. "Withdraw consent" is therefore forced to be a
single transaction that reaps the storage object and clears the quote — it cannot degrade
into a flag flip that leaves the file in the bucket.

**Granularity: one record covers both the photo and the quote.** This is an explicit
simplification, approved 2026-08-18. If the organization turns out to treat a face
differently from a written quote — a plausible outcome — this splits into two pairs of
columns and one migration. Nothing else in the design depends on it.

**The public read policy does not repeat the consent test.** The CHECK makes it unreachable:
no row can reach the policy in a state the policy would need to filter. A redundant clause
that can never be false is a vacuous assertion waiting to happen, and this project has
already paid for two of those (audit §7.1, and the cover assertion closed in `1b8301e`).

### Fields deliberately not carried over

| Fixture field | Why it is gone |
|---|---|
| `category` (`LeaderCategory`) | Invented taxonomy — see above. Replaced by free-text `position`. |
| `chapter: string` | A name typed as prose. Replaced by `chapter_id`, a real foreign key. |
| `socials: { facebook: "#" }` | `"#"` is unrepresentable now: nullable columns that must start with `https://`. |
| `photo: "https://i.pravatar.cc/..."` | Remote stock faces. Replaced by `photo_path` into the `media` bucket, consent-gated. |

`src/data/leaders.ts`, the `Leader` interface, and the `LeaderCategory` union are all deleted.

### Two layers of URL validation

The `CHECK` constraints test only the `https://` prefix. That is deliberate: a database
constraint is the wrong place for full URL grammar, and a regex that tries is a regex that
eventually rejects something valid.

Full parsing belongs in the Zod schema at the app boundary, matching
`src/lib/validation/site.ts`, which already defines
`z.string().url().max(500).optional().or(z.literal(""))` for exactly this shape. The `CHECK`
is the floor that holds even if a write bypasses the app; the schema is the ceiling that gives
an administrator a useful error message.

Both reject `"#"`, which is the specific bug being closed. The suite asserts it at both layers.

## Row-level security

`cluster_id` is the single RLS axis, so the policies are the chapters policies with the table
name changed:

- **Public read** — `is_published = true and deleted_at is null`.
- **Admin read** — any active cluster-scoped admin, plus the PYH, reads the whole province.
  Not scoped, for the reason `0024_chapters_rls.sql` records: hiding the province from the
  people running parts of it buys no confidentiality.
- **PYH write** — everything, including provincial-level rows.
- **Cluster head insert/update** — `cluster_id = admin_cluster(auth.uid())`, with `with check`
  as well as `using` so a row cannot be moved into another cluster.
- **No cluster-head DELETE policy at all** — Postgres denies the command outright. The app
  soft-deletes; a hard delete would bypass the `deleted_at` trail.

`admin_cluster(uuid)` already exists in `0008b_admins_rbac.sql`. **Do not redefine it.** The
chapters migration documents why: a second `create or replace` in a later migration silently
wins over the original on a fresh database, and ten existing policy clauses depend on it.

### The trigger, and the ordering it depends on

A `BEFORE INSERT OR UPDATE` trigger sets `cluster_id` from `chapter_id` whenever `chapter_id`
is not null, so the two columns can never disagree and RLS stays a plain `cluster_id`
comparison.

**This design assumes RLS `WITH CHECK` is evaluated *after* BEFORE triggers have rewritten the
row.** If that assumption is wrong, the trigger becomes an escalation path: a cluster head
points a new row at another cluster's chapter, the trigger rewrites `cluster_id` to that other
cluster, and the write lands where they have no authority.

**Task 2 proves the assumption rather than trusting it.** It attempts exactly that escalation
as a cluster head and requires it to fail — and then drops the policy and confirms the same
assertion passes, to prove the assertion is not vacuous. If the ordering turns out to run the
other way, the fallback is to reject the mismatch outright with a `CHECK` against a lookup
function instead of silently deriving it.

## Public page

`/leaders` reads the database and renders `UnpublishedNotice` while the table is empty, exactly
as `/chapters` does. `isVerified("leaders")` and the `leaders` entry in the fixture gate are
removed.

The directory keeps text search and a chapter filter. The category filter goes, along with the
taxonomy. A leader with no photo renders without one — no silhouette placeholder, no initials
avatar, because a stand-in for a missing face is the same class of invention as a stand-in
phone number.

## Admin surface

`/admin/leaders`, mirroring `/admin/chapters`: list, create, edit, publish toggle, reorder,
soft delete, and photo upload / replace / remove. Cluster heads see the province and write only
their own cluster; the PYH writes everything including provincial-level rows.

Consent is captured **in the same form submission as the photo or the quote** — the action
writes `consent_at` and `consent_by` alongside `photo_path`, because the CHECK rejects any
statement that separates them. There is no "upload now, record consent later" path, by
construction.

## Testing

`scripts/prove-leaders.mjs`, wired as `npm run prove:leaders`, following the six existing
suites' `check()` harness and plain `.mjs` shape.

It must cover:

1. **The table ships empty** — and the migrations insert no rows. Two assertions, as chapters has.
2. **The RLS negatives, RED-first** — a cluster head cannot write another cluster's leader,
   cannot move a row between clusters, cannot write provincial-level rows, and cannot hard-delete.
3. **The trigger escalation attempt** — described above. The one genuinely new proof in this slice.
4. **The consent CHECK** — a photo without consent is rejected; a quote without consent is
   rejected; nulling consent while a photo remains is rejected.
5. **Withdrawal** — clearing consent, photo, and message together succeeds and reaps the object.
6. **`"#"` is unrepresentable** — the URL CHECKs reject it and any other non-`https://` value.
7. **Public reads** — drafts and soft-deleted rows stay out.
8. **Source-order assertions** on every action that reaps storage, matching `1b8301e`.
9. **Cleanup** — the suite leaves no leaders and no objects behind.

### The false-pass trap

Repeated from the chapters plan because it has not stopped being true: a negative assertion
passes when the policy is correct, when there is **no policy at all**, and when the assertion
was accidentally written against the service-role client. Every negative in this suite gets
driven RED before it is trusted. Do not trust a green suite you have not seen go red.

## Risks

- **The trigger ordering assumption** — the main technical risk. Mitigated by proving it in
  Task 2 with a documented fallback, before anything is built on top of it.
- **Consent granularity may be wrong** — one record covers both the photo and the quote. If the
  organization disagrees, it is one migration. Recorded here so the decision is visible rather
  than buried.
- **Deleting a chapter that a leader points at** — `on delete restrict` blocks it. Chapters are
  soft-deleted, so this only bites on a hard delete, which no policy permits. Worth an
  assertion rather than an assumption.
- **The page will look emptier than the Phase-1 mockup** — no categories, no faces until consent
  exists. That is the design, not a regression.

## Out of scope

- News, gallery, testimonials, and FAQ — later slices of the same deferred content work.
- Linking a leader row to an `admins` account. Being listed publicly and holding an admin login
  are different things, and conflating them would put a login on a page about real people.
- Backfilling any of the twelve fixture profiles. The table ships empty; every real leader is
  entered by an administrator.
