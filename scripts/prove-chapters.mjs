// Proves the chapters directory: schema, cluster-scoped RLS, public withholding,
// soft delete, and that no fabricated content can enter the table.
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
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
check("the migration seeds zero chapter rows", !all.error && (all.data?.length ?? -1) === 0, all.error?.message ?? all.data?.length);

// 0024 is a second chapters migration (policies, not the table) — scan every
// migration file with "chapters" in its name, not just 0023, so a later
// chapters migration can't slip an insert or placeholder image in unscanned.
const chapterMigrationFiles = readdirSync(join(root, "supabase/migrations"))
  .filter((f) => f.includes("chapters") && f.endsWith(".sql"));
const chapterSql = chapterMigrationFiles
  .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"))
  .join("\n");
check("the chapters migrations insert no chapter rows",
  !/insert\s+into\s+chapters/i.test(chapterSql), chapterMigrationFiles);
check("the chapters migrations carry no placeholder imagery",
  !/picsum\.photos|i\.pravatar\.cc/i.test(chapterSql), chapterMigrationFiles);

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

// Declared outside the try so the finally block can clean up whatever was
// actually created, even if a later fixture step throws.
let pyhId = null, chId = null, rowAId = null, rowBId = null, rowDraftId = null;

try {
  const pyhEmail = `chapters_pyh_${stamp}@test.com`;
  const chEmail = `chapters_ch_${stamp}@test.com`;
  pyhId = await mkUser(pyhEmail);
  chId = await mkUser(chEmail);

  const { data: clusters, error: clustersError } = await admin.from("clusters").select("id,name").order("name");
  if (clustersError) throw new Error(`could not read clusters: ${clustersError.message}`);
  if ((clusters?.length ?? 0) < 2) throw new Error(`need at least two clusters to test cross-cluster isolation, found ${clusters?.length ?? 0}`);
  const clusterA = clusters[0].id, clusterB = clusters[1].id;

  const upsertPyh = await admin.from("admins").upsert(
    { user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Chapters PYH" },
    { onConflict: "user_id" });
  if (upsertPyh.error) throw new Error(`could not create the PYH admin row: ${upsertPyh.error.message}`);

  const upsertCh = await admin.from("admins").upsert(
    { user_id: chId, role: "cluster_head", cluster_id: clusterA, is_active: true, full_name: "Chapters CH" },
    { onConflict: "user_id" });
  if (upsertCh.error) throw new Error(`could not create the cluster head admin row: ${upsertCh.error.message}`);

  const insA = await admin.from("chapters").insert({
    cluster_id: clusterA, name: `A ${stamp}`, slug: `a-${stamp}`, municipality: "Test A", is_published: true,
  }).select("id").single();
  if (insA.error) throw new Error(`could not create fixture row A: ${insA.error.message}`);
  rowAId = insA.data.id;

  const insB = await admin.from("chapters").insert({
    cluster_id: clusterB, name: `B ${stamp}`, slug: `b-${stamp}`, municipality: "Test B", is_published: true,
  }).select("id").single();
  if (insB.error) throw new Error(`could not create fixture row B: ${insB.error.message}`);
  rowBId = insB.data.id;

  const insDraft = await admin.from("chapters").insert({
    cluster_id: clusterA, name: `Draft ${stamp}`, slug: `draft-${stamp}`, municipality: "Test D", is_published: false,
  }).select("id").single();
  if (insDraft.error) throw new Error(`could not create the fixture draft row: ${insDraft.error.message}`);
  rowDraftId = insDraft.data.id;

  const ch = await authedClient(chEmail);
  const pyh = await authedClient(pyhEmail);

  console.log("\n── Public read ──");

  const pubPublished = await anonClient.from("chapters").select("id").eq("id", rowAId);
  check("anonymous readers see a published chapter", pubPublished.data?.length === 1, pubPublished.data);

  const pubDraft = await anonClient.from("chapters").select("id").eq("id", rowDraftId);
  check("anonymous readers cannot see a draft chapter",
    !pubDraft.error && pubDraft.data.length === 0, pubDraft.error?.message ?? pubDraft.data);

  console.log("\n── A cluster head is confined to their own cluster ──");

  const chReadB = await ch.from("chapters").select("id").eq("id", rowBId);
  check("a cluster head CAN read another cluster's chapter", chReadB.data?.length === 1, chReadB.data);

  const chWriteA = await ch.from("chapters").update({ municipality: "Edited by CH" }).eq("id", rowAId).select("municipality");
  check("a cluster head CAN edit their own cluster's chapter",
    chWriteA.data?.[0]?.municipality === "Edited by CH", chWriteA.error?.message ?? chWriteA.data);

  // RLS denies by filtering: the update succeeds with zero rows affected.
  const chWriteB = await ch.from("chapters").update({ municipality: "hacked" }).eq("id", rowBId).select("municipality");
  check("a cluster head CANNOT edit another cluster's chapter",
    !chWriteB.error && chWriteB.data.length === 0, chWriteB.error?.message ?? chWriteB.data);

  // This statement takes a different path than the others: `using` PASSES
  // here (rowA is in cluster A, and so is the CH), so the row is not
  // filtered out — `with check` rejects the new row image instead, which
  // Postgres surfaces as an error (42501), not as a zero-row result.
  // Asserting on `data?.length ?? 0` alone would go green for ANY error on
  // this statement, including an unrelated one — so assert on the rejection
  // AND re-read the row through the service-role client to confirm it never
  // moved.
  const chMove = await ch.from("chapters").update({ cluster_id: clusterB }).eq("id", rowAId).select("id");
  const moveState = await admin.from("chapters").select("cluster_id").eq("id", rowAId).single();
  check("a cluster head CANNOT move a chapter into another cluster",
    !!chMove.error && !moveState.error && moveState.data.cluster_id === clusterA,
    chMove.error?.code ?? chMove.data);

  const chDeleteB = await ch.from("chapters").update({ deleted_at: new Date().toISOString() }).eq("id", rowBId).select("id");
  check("a cluster head CANNOT soft-delete another cluster's chapter",
    !chDeleteB.error && chDeleteB.data.length === 0, chDeleteB.error?.message ?? chDeleteB.data);

  const chInsertB = await ch.from("chapters").insert({
    cluster_id: clusterB, name: `CH into B ${stamp}`, slug: `chb-${stamp}`, municipality: "Nope",
  }).select("id");
  check("a cluster head CANNOT create a chapter in another cluster",
    (chInsertB.data?.length ?? 0) === 0 || !!chInsertB.error, chInsertB.data);

  // Cluster heads get insert and update, not delete — chapters_cluster_insert
  // and chapters_cluster_update are the only policies covering them; no
  // policy covers DELETE for that role, so Postgres RLS denies the command
  // outright. Both re-read through the service-role client so a deletion
  // that slipped through cannot hide behind RLS filtering on the confirming
  // read.
  const chDelOwn = await ch.from("chapters").delete().eq("id", rowAId).select("id");
  const stillA = await admin.from("chapters").select("id").eq("id", rowAId);
  check("a cluster head CANNOT hard-delete even their own cluster's chapter",
    (chDelOwn.data?.length ?? 0) === 0 && stillA.data?.length === 1,
    chDelOwn.error?.code ?? chDelOwn.data);

  const chDelB = await ch.from("chapters").delete().eq("id", rowBId).select("id");
  const stillB = await admin.from("chapters").select("id").eq("id", rowBId);
  check("a cluster head CANNOT hard-delete another cluster's chapter",
    (chDelB.data?.length ?? 0) === 0 && stillB.data?.length === 1,
    chDelB.error?.code ?? chDelB.data);

  // Control: proves the policy genuinely reads admin_cluster() rather than
  // always denying. Reassigning the throwaway cluster head to cluster B must
  // flip its access — B becomes writable, A stops being writable. Without this,
  // every "CANNOT" assertion above would also pass against a policy that denies
  // everything, which is exactly how an assertion passes while testing nothing.
  const reassignToB = await admin.from("admins").update({ cluster_id: clusterB }).eq("user_id", chId);
  if (reassignToB.error) throw new Error(`could not reassign the cluster head to cluster B: ${reassignToB.error.message}`);
  const chB = await authedClient(chEmail);
  const flipB = await chB.from("chapters").update({ municipality: "Now in B" }).eq("id", rowBId).select("municipality");
  check("reassigning the cluster head flips write access TO the new cluster",
    flipB.data?.[0]?.municipality === "Now in B", flipB.error?.message ?? flipB.data);
  const flipA = await chB.from("chapters").update({ municipality: "no longer" }).eq("id", rowAId).select("municipality");
  check("reassigning the cluster head flips write access AWAY from the old cluster",
    !flipA.error && flipA.data.length === 0, flipA.error?.message ?? flipA.data);

  // Later tasks append assertions before Cleanup and reuse this fixture, so a
  // silently failed restore would make their cluster-scoping assertions lie.
  // Re-read and assert it rather than firing-and-forgetting the update.
  const restoreToA = await admin.from("admins").update({ cluster_id: clusterA }).eq("user_id", chId).select("cluster_id");
  check("the flip control restored the cluster head's own cluster",
    !restoreToA.error && restoreToA.data?.[0]?.cluster_id === clusterA,
    restoreToA.error?.message ?? restoreToA.data);

  console.log("\n── The PYH is not confined ──");

  const pyhWriteB = await pyh.from("chapters").update({ municipality: "Edited by PYH" }).eq("id", rowBId).select("municipality");
  check("the PYH CAN edit any cluster's chapter",
    pyhWriteB.data?.[0]?.municipality === "Edited by PYH", pyhWriteB.error?.message ?? pyhWriteB.data);

  console.log("\n── Public data layer ──");

  const { getChapters } = await import("../src/lib/data/chapters.ts");
  const published = await getChapters();
  const ids = published.map((c) => c.id);
  check("getChapters returns published chapters", ids.includes(rowAId), ids);
  check("getChapters omits drafts", !ids.includes(rowDraftId), ids);

  const softDeleteB = await admin.from("chapters").update({ deleted_at: new Date().toISOString() }).eq("id", rowBId).select("id");
  check("the soft-delete update on rowB succeeded",
    !softDeleteB.error && softDeleteB.data?.length === 1, softDeleteB.error?.message ?? softDeleteB.data);
  const afterDelete = (await getChapters()).map((c) => c.id);
  check("a soft-deleted chapter leaves the public list", !afterDelete.includes(rowBId), afterDelete);

  // getChapters() is contractually required to swallow any database error
  // into [] (the no-fixture-fallback guarantee) — so on its own, the absence
  // check above cannot tell "the deleted_at filter correctly excluded rowB"
  // apart from "this call errored and returned []". A transient failure here
  // would pass the absence assertion without ever exercising the filter.
  // Pairing it with a presence assertion on the same afterDelete result closes
  // that gap, the same way the cluster-head flip control two sections above
  // proves the policy isn't just denying everything — don't remove this as
  // "redundant" with the line above; it's what makes that line meaningful.
  check("getChapters still returns other published chapters after the soft-delete",
    afterDelete.includes(rowAId), afterDelete);

  const withoutCover = published.find((c) => c.id === rowAId);
  check("a chapter with no cover_path yields cover === null", withoutCover?.cover === null, withoutCover?.cover);

  console.log("\n── Partial saves ──");

  // Only name, municipality and cluster are required. A required field with no
  // known value is what makes someone type something plausible.
  const partial = await admin.from("chapters").insert({
    cluster_id: clusterA, name: `Partial ${stamp}`, slug: `partial-${stamp}`, municipality: "Test P",
  }).select("id, coordinator, schedule, is_published").single();
  check("a chapter saves with coordinator and schedule blank",
    !partial.error && partial.data.coordinator === null && partial.data.schedule === null,
    partial.error?.message ?? partial.data);
  check("a new chapter is unpublished by default", !partial.error && partial.data.is_published === false, partial.data);

  const dupe = await admin.from("chapters").insert({
    cluster_id: clusterA, name: "Dupe", slug: `partial-${stamp}`, municipality: "Test",
  }).select("id");
  check("the database rejects a duplicate slug", !!dupe.error, dupe.error?.message ?? dupe.data);

  await admin.from("chapters").delete().eq("id", partial.data.id);
} catch (e) {
  // Anything that threw above — fixture setup, or a guard between blocks.
  // Recorded rather than re-thrown so the cleanup below still runs on a live
  // shared database instead of stranding throwaway users and rows.
  check("the suite ran to completion", false, String(e?.message ?? e).split("\n")[0]);
} finally {
  console.log("\n── Cleanup ──");
  await admin.from("chapters").delete().in("id", [rowAId, rowBId, rowDraftId].filter(Boolean));
  await admin.from("admins").delete().in("user_id", [pyhId, chId].filter(Boolean));
  if (pyhId) await admin.auth.admin.deleteUser(pyhId);
  if (chId) await admin.auth.admin.deleteUser(chId);
  const leftover = await admin.from("chapters").select("id").like("slug", `%-${stamp}`);
  check("the suite left no chapters behind", !leftover.error && (leftover.data?.length ?? -1) === 0, leftover.error?.message ?? leftover.data);
}

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
