// Proves the chapters directory: schema, cluster-scoped RLS, public withholding,
// soft delete, and that no fabricated content can enter the table.
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

// The table exists and is reachable.
const probe = await admin.from("chapters").select("id").limit(1);
check("the chapters table exists", !probe.error, probe.error?.message);

// The migration must seed nothing. This is the content rule made executable:
// a later seed intended to make the page look finished fails here.
const all = await admin.from("chapters").select("id");
check("the migration seeds zero chapter rows", !all.error && (all.data?.length ?? -1) === 0, all.error?.message ?? all.data?.length);

const sql = readFileSync(join(root, "supabase/migrations/0023_chapters.sql"), "utf8");
check("the migration inserts no chapter rows", !/insert\s+into\s+chapters/i.test(sql), null);
check("the migration carries no placeholder imagery",
  !/picsum\.photos|i\.pravatar\.cc/i.test(sql), null);

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

const pyhEmail = `chapters_pyh_${stamp}@test.com`;
const chEmail = `chapters_ch_${stamp}@test.com`;
const pyhId = await mkUser(pyhEmail);
const chId = await mkUser(chEmail);

const { data: clusters } = await admin.from("clusters").select("id,name").order("name");
const clusterA = clusters[0].id, clusterB = clusters[1].id;

await admin.from("admins").upsert(
  { user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Chapters PYH" },
  { onConflict: "user_id" });
await admin.from("admins").upsert(
  { user_id: chId, role: "cluster_head", cluster_id: clusterA, is_active: true, full_name: "Chapters CH" },
  { onConflict: "user_id" });

const { data: rowA } = await admin.from("chapters").insert({
  cluster_id: clusterA, name: `A ${stamp}`, slug: `a-${stamp}`, municipality: "Test A", is_published: true,
}).select("id").single();
const { data: rowB } = await admin.from("chapters").insert({
  cluster_id: clusterB, name: `B ${stamp}`, slug: `b-${stamp}`, municipality: "Test B", is_published: true,
}).select("id").single();
const { data: rowDraft } = await admin.from("chapters").insert({
  cluster_id: clusterA, name: `Draft ${stamp}`, slug: `draft-${stamp}`, municipality: "Test D", is_published: false,
}).select("id").single();

const ch = await authedClient(chEmail);
const pyh = await authedClient(pyhEmail);

console.log("\n── Public read ──");

const pubPublished = await anonClient.from("chapters").select("id").eq("id", rowA.id);
check("anonymous readers see a published chapter", pubPublished.data?.length === 1, pubPublished.data);

const pubDraft = await anonClient.from("chapters").select("id").eq("id", rowDraft.id);
check("anonymous readers cannot see a draft chapter", (pubDraft.data?.length ?? 0) === 0, pubDraft.data);

console.log("\n── A cluster head is confined to their own cluster ──");

const chReadB = await ch.from("chapters").select("id").eq("id", rowB.id);
check("a cluster head CAN read another cluster's chapter", chReadB.data?.length === 1, chReadB.data);

const chWriteA = await ch.from("chapters").update({ municipality: "Edited by CH" }).eq("id", rowA.id).select("municipality");
check("a cluster head CAN edit their own cluster's chapter",
  chWriteA.data?.[0]?.municipality === "Edited by CH", chWriteA.error?.message ?? chWriteA.data);

// RLS denies by filtering: the update succeeds with zero rows affected.
const chWriteB = await ch.from("chapters").update({ municipality: "hacked" }).eq("id", rowB.id).select("municipality");
check("a cluster head CANNOT edit another cluster's chapter",
  (chWriteB.data?.length ?? 0) === 0, chWriteB.data);

const chMove = await ch.from("chapters").update({ cluster_id: clusterB }).eq("id", rowA.id).select("id");
check("a cluster head CANNOT move a chapter into another cluster",
  (chMove.data?.length ?? 0) === 0, chMove.data);

const chDeleteB = await ch.from("chapters").update({ deleted_at: new Date().toISOString() }).eq("id", rowB.id).select("id");
check("a cluster head CANNOT soft-delete another cluster's chapter",
  (chDeleteB.data?.length ?? 0) === 0, chDeleteB.data);

const chInsertB = await ch.from("chapters").insert({
  cluster_id: clusterB, name: `CH into B ${stamp}`, slug: `chb-${stamp}`, municipality: "Nope",
}).select("id");
check("a cluster head CANNOT create a chapter in another cluster",
  (chInsertB.data?.length ?? 0) === 0 || !!chInsertB.error, chInsertB.data);

// Control: proves the policy genuinely reads admin_cluster() rather than
// always denying. Reassigning the throwaway cluster head to cluster B must
// flip its access — B becomes writable, A stops being writable. Without this,
// every "CANNOT" assertion below would also pass against a policy that denies
// everything, which is exactly how an assertion passes while testing nothing.
await admin.from("admins").update({ cluster_id: clusterB }).eq("user_id", chId);
const chB = await authedClient(chEmail);
const flipB = await chB.from("chapters").update({ municipality: "Now in B" }).eq("id", rowB.id).select("municipality");
check("reassigning the cluster head flips write access TO the new cluster",
  flipB.data?.[0]?.municipality === "Now in B", flipB.error?.message ?? flipB.data);
const flipA = await chB.from("chapters").update({ municipality: "no longer" }).eq("id", rowA.id).select("municipality");
check("reassigning the cluster head flips write access AWAY from the old cluster",
  (flipA.data?.length ?? 0) === 0, flipA.data);
await admin.from("admins").update({ cluster_id: clusterA }).eq("user_id", chId);

console.log("\n── The PYH is not confined ──");

const pyhWriteB = await pyh.from("chapters").update({ municipality: "Edited by PYH" }).eq("id", rowB.id).select("municipality");
check("the PYH CAN edit any cluster's chapter",
  pyhWriteB.data?.[0]?.municipality === "Edited by PYH", pyhWriteB.error?.message ?? pyhWriteB.data);

console.log("\n── Cleanup ──");
await admin.from("chapters").delete().in("id", [rowA.id, rowB.id, rowDraft.id]);
await admin.from("admins").delete().in("user_id", [pyhId, chId]);
await admin.auth.admin.deleteUser(pyhId);
await admin.auth.admin.deleteUser(chId);
const leftover = await admin.from("chapters").select("id").like("slug", `%-${stamp}`);
check("the suite left no chapters behind", (leftover.data?.length ?? 0) === 0, leftover.data);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
