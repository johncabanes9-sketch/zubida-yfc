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

// The consent constraint's ACCEPT branch. The Consent section above can only
// reach the reject branch: it runs before any auth.users row exists, and
// consent_by is a foreign key to auth.users, so a satisfied constraint was
// untestable there. A CHECK that rejected every photo would have passed those
// assertions too. This is the first point in the suite where a real user id
// exists, so it is the first point where the accept branch can be proven.
const consentAccepted = await admin.from("leaders").insert({
  name: "Consent Accept Probe", slug: `accept-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", photo_path: "leaders/probe/accept.jpg",
  consent_at: new Date().toISOString(), consent_by: pyhId }).select("id").maybeSingle();
check("a photo WITH consent recorded saves", !consentAccepted.error, consentAccepted.error?.message);

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

// The row claims the head's OWN cluster while naming a chapter in another one.
// That combination is what makes this probe discriminating: if `with check` ran
// against the submitted row it would see cluster_id = A and allow the insert,
// and the trigger would then rewrite the stored row to cluster B. Only an order
// where the trigger runs first denies it. Sending chapter_id alone does NOT
// prove this — cluster_id would be null, and `null = A` denies the insert
// whether or not the trigger ever fired. Verified: with the trigger body
// reduced to `return new`, this assertion goes red; the chapter_id-only form
// stayed green.
const escalate = await headClient.from("leaders").insert({
  name: "Escalation Probe", slug: `esc-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", chapter_id: chapterInB.data.id, cluster_id: clusterA.id }).select("id");
const escalated = await admin.from("leaders").select("id, cluster_id").eq("name", "Escalation Probe");
check("a cluster head CANNOT escalate by pointing a leader at another cluster's chapter",
  !!escalate.error && (escalated.data?.length ?? -1) === 0,
  { error: escalate.error?.message, stored: escalated.data });

// The same attempt without naming a cluster at all. Denied for a different
// reason (derived null, or derived B — either fails the check), but it is the
// shape an app bug would produce, so it is worth its own line.
const escalateBlind = await headClient.from("leaders").insert({
  name: "Escalation Probe Blind", slug: `escb-${crypto.randomUUID().slice(0, 8)}`,
  position: "Probe", chapter_id: chapterInB.data.id }).select("id");
check("a cluster head CANNOT create a leader in another cluster's chapter without naming a cluster",
  !!escalateBlind.error, escalateBlind.data);

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

console.log("\n── Cleanup ──");
// Blanket delete first: the sections above (and later tasks) add rows this has
// to reach, and the FK consent_by -> auth.users(id) means every leader row must
// be gone before deleteUser can succeed.
await admin.from("leaders").delete().not("id", "is", null);
await admin.from("chapters").delete().in("id",
  [chapterInA.data?.id, chapterInB.data?.id].filter(Boolean));
await admin.from("admins").delete().in("user_id", [headId, pyhId]);
await admin.auth.admin.deleteUser(headId);
await admin.auth.admin.deleteUser(pyhId);
const leftoverUsers = await admin.from("admins").select("id").in("user_id", [headId, pyhId]);
check("the throwaway admin accounts were removed",
  (leftoverUsers.data?.length ?? -1) === 0, leftoverUsers.data);
if (plain.data?.id) await admin.from("leaders").delete().eq("id", plain.data.id);
const leftover = await admin.from("leaders").select("id");
check("the suite left no leaders behind",
  !leftover.error && (leftover.data?.length ?? -1) === 0, leftover.data);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
