# Image Uploads (Supabase Storage Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give events real, uploadable, role-scoped images stored in Supabase Storage, rendered in a keyboard-accessible public carousel — the storage foundation every later content slice depends on.

**Architecture:** A single public-read `media` bucket, written only through guarded server actions using the service-role client. An `event_images` table stores object *paths* (not URLs) with `sort_order`, and its RLS mirrors `events` ownership via a parent subquery so ownership cannot drift. `events.cover` is retained as the single-image fallback, so any event without uploads renders exactly as it does today.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript, Supabase (Postgres + Storage), Zod, Tailwind. Migrations run via `npm run db:migrate` (a `pg`-based runner over `SUPABASE_DB_URL` — there is no Docker/`supabase` CLI here).

## Global Constraints

- **Do not redesign the frontend.** No changes to layout, styling, animations, or routing. Preserve the existing visual identity.
- **Do not remove or regress working features.** `events.cover` must keep working; events with no uploads must look identical to today.
- **No opportunistic refactoring.** Touch only what the task requires.
- **There is no unit-test framework in this project** (no jest/vitest). Tests are executable `scripts/prove-*.mjs` node scripts asserted against the real hosted database, registered in `package.json`. Follow that convention exactly. Do NOT add a test framework.
- **Guard first.** Every mutating server action calls its guard (`requirePYH` / `requireClusterAccess` from `src/lib/supabase/admin-auth.ts`) as its **first statement**, before Zod parsing or any DB access. Server actions are publicly callable POST endpoints regardless of which page renders them.
- **`src/lib/rbac.ts` is types-only.** The guards live in `src/lib/supabase/admin-auth.ts`.
- SQL helpers available: `is_pyh(uuid)`, `is_admin(uuid)`, `admin_cluster(uuid)`.
- Allowed image types: **jpeg, png, webp only**. SVG is excluded deliberately (it can carry script). Max **5 MB/file**, max **10 files** per submission.
- Do not stage `tsconfig.tsbuildinfo` (tracked build artifact; leave it dirty).
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `.eslintrc.json` | Create. Lint config (currently absent — `npm run lint` opens an interactive prompt). |
| `supabase/migrations/0014_storage_media.sql` | Create. `media` bucket + storage constraints. |
| `supabase/migrations/0015_event_images.sql` | Create. `event_images` table, index, RLS mirroring `events`. |
| `src/lib/images/validate.ts` | Create. Pure magic-byte + size validation. No I/O, no Supabase — so it is testable standalone. |
| `src/lib/images/paths.ts` | Create. Object-key construction + public-URL derivation. |
| `src/lib/data/events.ts` | Modify. `getEvents()` joins `event_images`. |
| `src/data/types.ts` | Modify. `EventItem.images?: EventImage[]`. |
| `src/app/admin/events/actions.ts` | Modify. Add upload/delete/reorder actions. |
| `src/app/admin/events/_components/event-form.tsx` | Modify. File input + preview. |
| `src/app/admin/events/_components/event-images-manager.tsx` | Create. Existing-image list, delete, reorder. |
| `src/components/shared/event-carousel.tsx` | Create. Public carousel. |
| `src/components/shared/event-modal.tsx` | Modify. Render carousel. |
| `src/app/page.tsx` | Modify. `export const revalidate = 60` (stale-events bug). |
| `next.config.mjs` | Modify. Add Supabase hostname to `remotePatterns`. |
| `scripts/prove-rbac.mjs` | Modify. `event_images` RBAC assertions. |
| `scripts/prove-uploads.mjs` | Create. Validation + round-trip proofs. |

---

### Task 1: Fix the two standalone bugs (ESLint + stale homepage)

These are independent of images and land first so later diffs are lint-clean.

**Files:**
- Create: `.eslintrc.json`
- Modify: `package.json` (devDependencies), `src/app/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run lint`; a homepage that revalidates.

- [ ] **Step 1: Reproduce the lint failure**

Run: `npm run lint`
Expected: it does NOT lint — it prints an interactive prompt `? How would you like to configure ESLint?`. That is the bug: the script has never run.

- [ ] **Step 2: Install ESLint and create the config**

```bash
npm install --save-dev eslint@^8 eslint-config-next@15.1.6
```

Create `.eslintrc.json`:

```json
{
  "extends": "next/core-web-vitals",
  "ignorePatterns": ["node_modules/", ".next/", "scripts/"]
}
```

- [ ] **Step 3: Run lint and record what it reports**

Run: `npm run lint`
Expected: it now actually lints (no interactive prompt).

**Scope guard:** Fix only genuine errors it reports. If it flags pre-existing style issues across files this plan does not otherwise touch, **record them in the final report — do not bulk-fix them.** That would violate the no-opportunistic-refactoring constraint.

- [ ] **Step 4: Reproduce the stale-homepage bug**

Run: `npm run build`
Expected (this is the bug): the route table shows `○ /` (Static) but `ƒ /events` (Dynamic). Both render `getEvents()`, so the homepage's `<EventsPreview />` is frozen at build time.

- [ ] **Step 5: Fix it**

In `src/app/page.tsx`, add below the imports:

```ts
// The homepage renders <EventsPreview />, which reads live events. Without this
// it is prerendered at build and serves stale (or, on an empty table, mock)
// events forever, while /events (force-dynamic) shows the real ones.
export const revalidate = 60;
```

ISR is used rather than `force-dynamic` to preserve the homepage's static performance; `revalidatePath("/")` in the actions gives immediacy on edit.

- [ ] **Step 6: Verify the fix**

Run: `npm run build`
Expected: the homepage is no longer plain Static — it now shows as revalidating/ISR (`◐` or an `Expire`/revalidate column entry), while every other static page is unchanged.

- [ ] **Step 7: Commit**

```bash
git add .eslintrc.json package.json package-lock.json src/app/page.tsx
git commit -m "fix: configure ESLint; stop homepage serving stale build-time events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Database — media bucket + event_images table

**Files:**
- Create: `supabase/migrations/0014_storage_media.sql`, `supabase/migrations/0015_event_images.sql`

**Interfaces:**
- Produces: bucket id `media`; table `event_images(id, event_id, path, alt, sort_order, created_at, created_by)`.

- [ ] **Step 1: Write `supabase/migrations/0014_storage_media.sql`**

```sql
-- 0014_storage_media.sql — public-read media bucket for uploaded imagery.
-- Writes go through guarded server actions using the service-role key, so no
-- storage.objects write policy is granted to authenticated users: authorization
-- stays in one place (the action guards) instead of being duplicated here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read of objects in this bucket (the site renders them via next/image).
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id = 'media');
```

- [ ] **Step 2: Write `supabase/migrations/0015_event_images.sql`**

Policies mirror `events` ownership through a parent subquery — the same shape `registrations_admin_read` uses in `0010_rls_rbac.sql` — so an image can never be writable by someone who cannot write its event.

```sql
-- 0015_event_images.sql — multiple ordered images per event.
-- `path` is the object key inside the `media` bucket, NOT a full URL, so the
-- Supabase project URL is never baked into rows.
create table if not exists event_images (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  path       text not null,
  alt        text,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists event_images_event_sort_idx
  on event_images (event_id, sort_order);

alter table event_images enable row level security;

-- Public read, but only for events that are not soft-deleted
-- (mirrors events_public_read in 0005_rls.sql).
drop policy if exists event_images_public_read on event_images;
create policy event_images_public_read on event_images
  for select using (
    exists (
      select 1 from events e
      where e.id = event_images.event_id and e.deleted_at is null
    )
  );

-- Writes: PYH anywhere; an ACTIVE cluster head only within its own cluster.
drop policy if exists event_images_write on event_images;
create policy event_images_write on event_images
  for all to authenticated
  using (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_images.event_id
        and is_admin(auth.uid())
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
    )
  )
  with check (
    is_pyh(auth.uid())
    or exists (
      select 1 from events e
      where e.id = event_images.event_id
        and is_admin(auth.uid())
        and e.cluster_id is not distinct from admin_cluster(auth.uid())
    )
  );
```

- [ ] **Step 3: Apply the migrations**

Run: `npm run db:migrate`
Expected: `0014_storage_media.sql` and `0015_event_images.sql` reported as applied, no errors.

- [ ] **Step 4: Verify the bucket and table exist**

Run:
```bash
node -e "import('dotenv').then(d=>{d.default.config({path:'.env.local'});return import('@supabase/supabase-js')}).then(async(s)=>{const c=s.createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const b=await c.storage.getBucket('media');console.log('bucket:',b.data?.id,'public:',b.data?.public);const t=await c.from('event_images').select('id').limit(1);console.log('event_images reachable:',!t.error);})"
```
Expected: `bucket: media public: true` and `event_images reachable: true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_storage_media.sql supabase/migrations/0015_event_images.sql
git commit -m "feat(db): media storage bucket + event_images table with events-mirrored RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Prove the event_images RLS (TDD — this gates Task 5)

Write the proof BEFORE the upload action, so the action is built against proven rules.

**Files:**
- Modify: `scripts/prove-rbac.mjs`

**Interfaces:**
- Consumes: `event_images` from Task 2; the existing `pyhEmail`/`chEmail`/`evA`/`evB`/`ch`/`admin`/`check` bindings already defined in this script.
- Produces: additional assertions in `npm run prove:rbac`.

- [ ] **Step 1: Add the assertions**

Insert immediately **before** the `// cleanup` comment near the end of `scripts/prove-rbac.mjs`. Note assertion 17: a **positive control**. Without it, an over-strict policy would break real uploads while every denial assertion still passed.

```js
  // 14–17. EVENT_IMAGES — ownership must mirror the parent event.
  const { data: imgA } = await admin.from("event_images")
    .insert({ event_id: evA.id, path: `events/${evA.id}/proof-a.jpg`, sort_order: 0, created_by: pyhId })
    .select("id").single();
  const { data: imgB } = await admin.from("event_images")
    .insert({ event_id: evB.id, path: `events/${evB.id}/proof-b.jpg`, sort_order: 0, created_by: pyhId })
    .select("id").single();

  // 14. CH CANNOT insert an image on cluster-B's event.
  const insBImg = await ch.from("event_images")
    .insert({ event_id: evB.id, path: "events/hack.jpg", sort_order: 0 }).select("id");
  check("CH CANNOT insert image on cluster-B event", insBImg.error !== null || (insBImg.data?.length ?? 0) === 0, insBImg.error?.message ?? insBImg.data);

  // 15. CH CANNOT delete cluster-B's image. A blocked delete is not an error —
  // RLS filters the row out — so assert the row SURVIVES rather than trusting the response.
  await ch.from("event_images").delete().eq("id", imgB.id);
  const survivorB = await admin.from("event_images").select("id").eq("id", imgB.id);
  check("CH CANNOT delete cluster-B image (row survives)", survivorB.data?.length === 1, survivorB.data);

  // 16. Anon CAN read images but CANNOT write them.
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const anonRead = await anonClient.from("event_images").select("id").eq("id", imgA.id);
  const anonWrite = await anonClient.from("event_images")
    .insert({ event_id: evA.id, path: "events/anon.jpg", sort_order: 9 }).select("id");
  check("anon CAN read event_images", !anonRead.error && anonRead.data.length === 1, anonRead.error?.message);
  check("anon CANNOT insert event_images", anonWrite.error !== null || (anonWrite.data?.length ?? 0) === 0, anonWrite.error?.message ?? anonWrite.data);

  // 17. POSITIVE CONTROL: CH CAN insert an image on its OWN cluster's event.
  const insAImg = await ch.from("event_images")
    .insert({ event_id: evA.id, path: `events/${evA.id}/ch-own.jpg`, sort_order: 1 }).select("id");
  check("CH CAN insert image on own cluster-A event", !insAImg.error && insAImg.data?.length === 1, insAImg.error?.message ?? insAImg.data);

  // 18. DELIBERATE DESIGN, PROVEN: a same-cluster admin who did NOT create the
  // event CAN still delete its images, even though events_delete (0011) would
  // forbid deleting the event itself (it requires created_by = auth.uid()).
  // Managing photos is treated as an EDIT to the event — which events_update
  // already allows any same-cluster admin to do — not as deleting the event.
  // This asymmetry is intentional and accepted; it is asserted here so that it
  // is a proven decision rather than an accident of `for all` policy semantics.
  // evA was created by pyhId, NOT by the cluster head, so this is exactly the case.
  await ch.from("event_images").delete().eq("id", imgA.id);
  const goneA = await admin.from("event_images").select("id").eq("id", imgA.id);
  check("CH CAN delete image on a same-cluster event it did NOT create (intentional)", goneA.data?.length === 0, goneA.data);
```

- [ ] **Step 2: Add cleanup**

Under the existing `// cleanup` comment, add this **above** the existing `events` delete (the `on delete cascade` handles the rest, but be explicit):

```js
  await admin.from("event_images").delete().in("event_id", [evA.id, evB.id]);
```

- [ ] **Step 3: Run the proof**

Run: `npm run prove:rbac`
Expected: **19 passed, 0 failed**. (It was 13 before this task; the 6 new checks are numbered 14-18 in prose, but "16" covers two check() calls — anon read AND anon write — so the tally is 19, not 18.)

If assertion 17 fails, the write policy is too strict — fix `0015_event_images.sql`, re-run `npm run db:migrate`, re-run. If 14/15/16 fail, the policy is too loose. If 18 fails, the policy became stricter than the accepted design — do not "fix" it by loosening 14/15; escalate. Do not proceed until this is 19/19.

- [ ] **Step 4: Commit**

```bash
git add scripts/prove-rbac.mjs
git commit -m "test(db): prove event_images ownership mirrors parent event

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Image validation module

Pure functions, no I/O — the security-critical part, isolated so it can be proven directly.

**Files:**
- Create: `src/lib/images/validate.ts`, `src/lib/images/paths.ts`
- Create: `scripts/prove-uploads.mjs`
- Modify: `package.json` (add `prove:uploads` script)

**Interfaces:**
- Produces:
  - `ALLOWED_MIME: readonly string[]`
  - `MAX_BYTES: number` (5242880), `MAX_FILES: number` (10)
  - `sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null`
  - `validateImage(bytes: Uint8Array, size: number): { ok: true; mime: string } | { ok: false; reason: string }`
  - `objectKey(eventId: string, mime: string): string`
  - `publicUrl(path: string): string`

- [ ] **Step 1: Write the failing proof**

Create `scripts/prove-uploads.mjs`:

```js
// Proves upload validation rejects forged/oversized files and that a real
// upload round-trips through Storage without leaving orphans.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { validateImage, sniffImageType, MAX_BYTES } = await import("../src/lib/images/validate.ts");

let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG  = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
// "MZ" — a Windows executable. This is the attack: a real .exe with an image MIME.
const EXE  = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);
const SVG  = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

check("sniffs jpeg", sniffImageType(JPEG) === "image/jpeg", sniffImageType(JPEG));
check("sniffs png",  sniffImageType(PNG)  === "image/png",  sniffImageType(PNG));
check("sniffs webp", sniffImageType(WEBP) === "image/webp", sniffImageType(WEBP));

// The core security assertion: the bytes decide, so a forged declaration is irrelevant.
check("REJECTS exe (MZ) even if the client calls it a jpeg", validateImage(EXE, EXE.length).ok === false, validateImage(EXE, EXE.length));
check("REJECTS svg (script vector)",      validateImage(SVG, SVG.length).ok === false, validateImage(SVG, SVG.length));
check("REJECTS oversized file",           validateImage(JPEG, MAX_BYTES + 1).ok === false, validateImage(JPEG, MAX_BYTES + 1));
// Positive control — without this an always-reject bug would pass everything above.
check("ACCEPTS a real jpeg",              validateImage(JPEG, JPEG.length).ok === true, validateImage(JPEG, JPEG.length));
// The renamed-file case: a real PNG that a browser labels image/jpeg (because the
// user renamed it .jpg) must be ACCEPTED and reported as png, so the caller stores
// the correct contentType. Guards against reintroducing a declared-vs-actual check.
const pngResult = validateImage(PNG, PNG.length);
check("ACCEPTS a real png regardless of what the client called it",
      pngResult.ok === true && pngResult.mime === "image/png", pngResult);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

Add to `package.json` scripts:
```json
"prove:uploads": "node --experimental-strip-types scripts/prove-uploads.mjs"
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run prove:uploads`
Expected: FAIL — cannot resolve `src/lib/images/validate.ts` (it doesn't exist yet).

(Node was verified as v22.21.1 at planning time, which supports `--experimental-strip-types` — it needs 22.6+. If the flag nevertheless errors, report it rather than silently switching approach.)

- [ ] **Step 3: Implement `src/lib/images/validate.ts`**

```ts
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 10;

/**
 * Identifies an image from its leading bytes. A multipart upload's declared MIME
 * is client-supplied and trivially forged, so the magic-byte sniff — not the
 * declared type — is what actually decides. SVG is intentionally unsupported:
 * it is XML and can carry <script>.
 */
export function sniffImageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/**
 * The sniffed type is the SINGLE SOURCE OF TRUTH. The client's declared MIME is
 * deliberately not consulted: it adds no safety (the sniff already proves the
 * bytes are jpeg/png/webp) and cross-checking it only rejects legitimate files —
 * e.g. a real PNG renamed to .jpg, which browsers label image/jpeg. Callers must
 * store the returned `mime`, never the client's.
 */
export function validateImage(
  bytes: Uint8Array, size: number,
): { ok: true; mime: string } | { ok: false; reason: string } {
  if (size > MAX_BYTES) return { ok: false, reason: `File exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.` };
  if (size === 0) return { ok: false, reason: "File is empty." };
  const sniffed = sniffImageType(bytes);
  if (!sniffed) return { ok: false, reason: "Not a JPEG, PNG, or WebP image." };
  return { ok: true, mime: sniffed };
}
```

- [ ] **Step 4: Implement `src/lib/images/paths.ts`**

```ts
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

/** Object key inside the `media` bucket. Prefixed by event so deletes are simple. */
export function objectKey(eventId: string, mime: string): string {
  return `events/${eventId}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}

/** Derives the public URL at read time, so no project URL is stored in rows. */
export function publicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/media/${path}`;
}
```

- [ ] **Step 5: Run the proof**

Run: `npm run prove:uploads`
Expected: **8 passed, 0 failed**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/images/ scripts/prove-uploads.mjs package.json
git commit -m "feat: magic-byte image validation + storage path helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Upload / delete / reorder server actions

**Files:**
- Modify: `src/app/admin/events/actions.ts`

**Interfaces:**
- Consumes: `validateImage`, `MAX_FILES` (Task 4); `objectKey` (Task 4); `requireClusterAccess`, `createServiceClient`.
- Produces: `uploadEventImages(eventId: string, form: FormData): Promise<{ error?: string }>`, `deleteEventImage(imageId: string): Promise<{ error?: string }>`, `reorderEventImage(imageId: string, direction: "up" | "down"): Promise<{ error?: string }>`.

- [ ] **Step 1: Read the existing file first**

Read `src/app/admin/events/actions.ts` in full. Match its existing style: `"use server"`, the local `parse()` helper, `requireClusterAccess`, the `audit()` helper (which uses the **service client** — see commit `e4cedc0`; do not "fix" it to use the RLS client), and `revalidatePath`.

- [ ] **Step 2: Add the actions**

Every action's FIRST statement resolves the parent event and calls the guard.

```ts
import { validateImage, MAX_FILES } from "@/lib/images/validate";
import { objectKey } from "@/lib/images/paths";

async function eventClusterOrThrow(eventId: string) {
  const svc = createServiceClient();
  const { data } = await svc.from("events").select("id, cluster_id").eq("id", eventId).is("deleted_at", null).single();
  if (!data) throw new Error("Event not found");
  return data;
}

export async function uploadEventImages(eventId: string, form: FormData): Promise<{ error?: string }> {
  const ev = await eventClusterOrThrow(eventId);
  const ctx = await requireClusterAccess(ev.cluster_id);   // guard before any I/O

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "No files selected." };
  if (files.length > MAX_FILES) return { error: `At most ${MAX_FILES} images per upload.` };

  const svc = createServiceClient();
  const { data: last } = await svc.from("event_images")
    .select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1);
  let next = (last?.[0]?.sort_order ?? -1) + 1;

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const v = validateImage(bytes, file.size);
    if (!v.ok) return { error: `${file.name}: ${v.reason}` };

    const key = objectKey(eventId, v.mime);
    const up = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
    if (up.error) return { error: `${file.name}: upload failed.` };

    const ins = await svc.from("event_images")
      .insert({ event_id: eventId, path: key, sort_order: next++, created_by: ctx.userId });
    if (ins.error) {
      // Don't leave an orphaned object behind if the row insert fails.
      await svc.storage.from("media").remove([key]);
      return { error: `${file.name}: could not be saved.` };
    }
  }

  await audit("event.images.upload", { event_id: eventId, count: files.length });
  revalidatePath("/events"); revalidatePath("/"); revalidatePath(`/admin/events/${eventId}/edit`);
  return {};
}

export async function deleteEventImage(imageId: string): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: img } = await svc.from("event_images").select("id, event_id, path").eq("id", imageId).single();
  if (!img) return { error: "Image not found." };
  const ev = await eventClusterOrThrow(img.event_id);
  await requireClusterAccess(ev.cluster_id);              // guard before deleting

  await svc.storage.from("media").remove([img.path]);     // object first, then row
  const del = await svc.from("event_images").delete().eq("id", imageId);
  if (del.error) return { error: "Could not delete image." };

  await audit("event.images.delete", { event_id: img.event_id, image_id: imageId });
  revalidatePath("/events"); revalidatePath("/"); revalidatePath(`/admin/events/${img.event_id}/edit`);
  return {};
}

export async function reorderEventImage(imageId: string, direction: "up" | "down"): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: img } = await svc.from("event_images").select("id, event_id, sort_order").eq("id", imageId).single();
  if (!img) return { error: "Image not found." };
  const ev = await eventClusterOrThrow(img.event_id);
  await requireClusterAccess(ev.cluster_id);              // guard before reordering

  const { data: neighbour } = await svc.from("event_images")
    .select("id, sort_order").eq("event_id", img.event_id)
    .order("sort_order", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("sort_order", img.sort_order)
    .limit(1).maybeSingle();
  if (!neighbour) return {};                              // already at the end

  await svc.from("event_images").update({ sort_order: neighbour.sort_order }).eq("id", img.id);
  await svc.from("event_images").update({ sort_order: img.sort_order }).eq("id", neighbour.id);

  revalidatePath("/events"); revalidatePath("/"); revalidatePath(`/admin/events/${img.event_id}/edit`);
  return {};
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `requireClusterAccess`'s return shape lacks `userId`, read `src/lib/supabase/admin-auth.ts:41-74` and use the actual field name.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/events/actions.ts
git commit -m "feat: guarded event image upload/delete/reorder actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Read path — types + loader

**Files:**
- Modify: `src/data/types.ts`, `src/lib/data/events.ts`, `next.config.mjs`

**Interfaces:**
- Consumes: `publicUrl` (Task 4); `event_images` (Task 2).
- Produces: `EventImage { url: string; alt: string }`; `EventItem.images: EventImage[]`.

- [ ] **Step 1: Extend the type**

In `src/data/types.ts`, add and extend `EventItem` with an **optional** field so the hardcoded mock data in `src/data/events.ts` still typechecks unchanged:

```ts
export type EventImage = { url: string; alt: string };
```
Add to `EventItem`: `images?: EventImage[];`

- [ ] **Step 2: Join images in the loader**

In `src/lib/data/events.ts`, change the select to embed the related rows and map them. Keep the existing mock fallback exactly as-is.

Change `.select("*")` to:
```ts
.select("*, event_images(path, alt, sort_order)")
```

In the `.map(...)`, add to the returned object:
```ts
images: (e.event_images ?? [])
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((i) => ({ url: publicUrl(i.path), alt: i.alt ?? e.name })),
```
Import `publicUrl` from `@/lib/images/paths`. Cast the row type as needed (`EventRow & { event_images?: ... }`) — do not weaken `EventRow` itself.

- [ ] **Step 3: Allow the Supabase host in next/image**

In `next.config.mjs`, add to `images.remotePatterns` (keep the four existing placeholder hosts — the collections slice retires them, not this one):

```js
{ protocol: "https", hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: "/storage/v1/object/public/**" },
```

If `NEXT_PUBLIC_SUPABASE_URL` may be unset at build, guard with a filter so the config never throws.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/lib/data/events.ts next.config.mjs
git commit -m "feat: load event images in getEvents; allow supabase storage host

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Admin UI

**Files:**
- Create: `src/app/admin/events/_components/event-images-manager.tsx`
- Modify: `src/app/admin/events/_components/event-form.tsx`, `src/app/admin/events/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `uploadEventImages`, `deleteEventImage`, `reorderEventImage` (Task 5).

- [ ] **Step 1: Read the existing form first**

Read `src/app/admin/events/_components/event-form.tsx` and `events-table.tsx`. **Reuse their exact class strings** (e.g. the `field` const, the rounded-full button styling). Do not introduce new visual idiom — the constraint is no redesign.

- [ ] **Step 2: Create the manager component**

`event-images-manager.tsx` — a `"use client"` component taking `{ eventId: string; images: { id: string; url: string; alt: string | null }[] }`. It renders:
- `<input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" />`
- client-side previews via `URL.createObjectURL` (revoke them in a cleanup effect to avoid leaking)
- the existing images with a Delete button and ▲/▼ reorder buttons, wired to the Task 5 actions via `useTransition`
- inline error text from the actions' `{ error }` return, and a disabled/pending state while in flight — matching how `events-table.tsx` handles `pending`.

Upload is a separate `<form action={...}>` from the event's own form: a file POST must not be entangled with the event's text fields, and the event must exist before images can be attached to it.

- [ ] **Step 3: Mount it on the edit page only**

In `[id]/edit/page.tsx`, fetch the event's images and render `<EventImagesManager eventId={id} images={...} />` below the existing `<EventForm />`. **Do not** add it to `new/page.tsx` — there is no event id to attach to until the event is created. This is intentional; note it in the report.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/events/
git commit -m "feat: admin event image manager — upload, preview, reorder, delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Public carousel

**Files:**
- Create: `src/components/shared/event-carousel.tsx`
- Modify: `src/components/shared/event-modal.tsx`

**Interfaces:**
- Consumes: `EventItem.images` (Task 6).

- [ ] **Step 1: Read `event-modal.tsx` first**

Note exactly how it currently renders `cover`, and reuse the surrounding framer-motion idiom already present in the file. Do not add a carousel library.

- [ ] **Step 2: Build the carousel**

`"use client"`. Props: `{ images: EventImage[]; fallback: string; name: string }`.

Requirements — all are constraints, not suggestions:
- If `images.length === 0`, render exactly what the modal renders today from `fallback`. **An event with no uploads must be pixel-identical to today.**
- If `images.length === 1`, render the single image with no controls.
- Prev/next buttons with `aria-label`, plus ArrowLeft/ArrowRight key handling when focused.
- `alt` from the DB (fall back to `name`).
- No autoplay. Respect `prefers-reduced-motion` — gate any transition behind it (the codebase already uses framer-motion; use its `useReducedMotion`).
- Dot indicators reusing existing styling idiom.

- [ ] **Step 3: Render it in the modal**

Replace the modal's current cover `<Image>` with `<EventCarousel images={event.images ?? []} fallback={event.cover} name={event.name} />`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/
git commit -m "feat: accessible event image carousel with single-cover fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Reap event images when an event is deleted

Found by the Task 2 review; accepted as in-scope. `deleteEvent` **soft**-deletes
(`UPDATE events SET deleted_at`), so `event_images`' `on delete cascade` never
fires in the running app. Nothing else reaps images. And `media_public_read` is
unconditional (`using (bucket_id = 'media')`), so the bytes stay fetchable at
their direct URL forever after an event is deleted — paths are unguessable
UUIDs, so it is not enumerable, but a previously-obtained URL never dies.

**Files:**
- Modify: `src/app/admin/events/actions.ts` (the existing `deleteEvent`)

**Interfaces:**
- Consumes: `deleteEvent` (existing), `event_images` (Task 2), the `media` bucket.

- [ ] **Step 1: Read the existing `deleteEvent` first**

It is at roughly `src/app/admin/events/actions.ts:93-102`. Note it calls
`requireClusterAccess` first, then soft-deletes. Do not change that shape.

- [ ] **Step 2: Reap images as part of the soft delete**

Insert after the guard and **before** the soft-delete update, so a failure to
reap does not leave an event that looks deleted but still serves images:

```ts
  // Soft-deleting the event hides it, but event_images' ON DELETE CASCADE never
  // fires (we never hard-delete), and media_public_read serves any object in the
  // bucket regardless of its event's state. So reap explicitly: without this the
  // bytes stay live at their direct URL forever after the event is gone.
  const svc = createServiceClient();
  const { data: imgs } = await svc.from("event_images").select("id, path").eq("event_id", id);
  if (imgs && imgs.length > 0) {
    await svc.storage.from("media").remove(imgs.map((i) => i.path));
    await svc.from("event_images").delete().eq("event_id", id);
  }
```

- [ ] **Step 3: Prove it**

Add to `scripts/prove-uploads.mjs` an assertion that after `deleteEvent`-style
soft deletion, no `event_images` rows remain for that event AND the object is
gone from the bucket. Because `deleteEvent` is a server action requiring an auth
context, assert the underlying behavior directly against the DB/bucket rather
than importing the action: insert an event + image + object, run the same reap
sequence, then assert `event_images` is empty for that event and
`storage.from("media").list()` no longer shows the object. Include a positive
control that the object existed before the reap — otherwise the assertion passes
trivially if the upload silently failed.

- [ ] **Step 4: Run**

Run: `npm run prove:uploads`
Expected: all prior assertions still pass, plus the new reap assertions.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/events/actions.ts scripts/prove-uploads.mjs
git commit -m "fix: reap event images and storage objects when an event is deleted

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

Run each and record actual output:
**First: kill any running `next dev` server.** A stray dev server shares the
`.next` directory and silently clobbers production build output after
`next build` finishes, making on-disk verification unreliable (found during
Task 1).

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run prove:rbac      # expect 19 passed, 0 failed
npm run prove:uploads   # expect 8 base assertions + Task 9 reap assertions
npm run prove:behaviors
npm run prove:concurrency
```

Note: `npm run build`'s route table will NOT visibly mark the homepage as ISR —
Next 15.1.6 cannot annotate ISR for App Router pages. Verify via
`.next/prerender-manifest.json` (`routes["/"].initialRevalidateSeconds === 60`)
instead. Do not "fix" a working homepage because the table looks unchanged.

- [ ] **Step 2: Manual verification**

Run `npm run dev`, then confirm and report each:
1. Log in as PYH → edit an event → upload 3 images → previews appear → all 3 listed.
2. Reorder with ▲/▼ → order persists after reload.
3. Delete one → gone from list AND gone from the bucket (no orphan).
4. Public `/events` → open that event → carousel shows 2 images, arrows work, **Tab to it and use arrow keys**.
5. An event with **no** uploads → renders its `cover` exactly as before.
6. Homepage reflects a newly created event (the Task 1 fix).
7. Attempt to upload a `.txt` renamed to `.jpg` → rejected with a clear message.
8. Delete an event that HAS images → its `event_images` rows are gone and its
   objects are gone from the bucket (Task 9's reap).

- [ ] **Step 3: Report**

Report actual outputs — not claims. Any failure, any skipped step, and any lint issues recorded-but-not-fixed from Task 1 must be stated explicitly.

---

## Self-Review

**Spec coverage:** bucket → T2; `event_images` + RLS → T2; upload validation/magic bytes/size → T4; upload path + guards → T5; admin UI (multi-upload, preview, delete, reorder) → T7; carousel + `remotePatterns` → T8; `cover` retention → T6/T8; both bugs → T1; `prove:rbac` extension → T3; `prove-uploads` → T4; manual verification → T9. Compression and drag-and-drop are deferred **by the spec**, not missed. The `setStatus`/Zod defense-in-depth gaps are deferred by the spec.

**Type consistency:** `EventImage { url, alt }` (T6) is consumed as such in T8. `objectKey`/`publicUrl`/`validateImage`/`MAX_FILES` signatures in T4 match their uses in T5/T6. `uploadEventImages(eventId, form)` in T5 matches T7's usage.

**Risk checked at planning time:** `--experimental-strip-types` (T4) needs Node 22.6+; this machine is on v22.21.1, so it is supported.
