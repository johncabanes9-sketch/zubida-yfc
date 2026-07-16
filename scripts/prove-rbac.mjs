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
  const targetEmail = `prove_target_${stamp}@test.com`;
  const pyhId = await mkUser(pyhEmail);
  const chId = await mkUser(chEmail);
  const targetId = await mkUser(targetEmail);

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

  // 7. CH CANNOT write to admins (create a user) — targetId is a real, novel
  // user (satisfies the FK, no existing admins row, so no unique-key clash),
  // so only the admins_pyh_write RLS policy can block this insert.
  const insAdmin = await ch.from("admins").insert({ user_id: targetId, role: "cluster_head", cluster_id: clusterA }).select("id");
  check("CH CANNOT write admins", (insAdmin.data?.length ?? 0) === 0, insAdmin.error?.message ?? insAdmin.data);

  // 8. CH CANNOT read audit_log (PYH-only) — seed a real row via service-role
  // first so an empty table can't masquerade as RLS working.
  await admin.from("audit_log").insert({ actor_user_id: pyhId, action: "rbac.proof.marker", entity: "auth", entity_id: "prove-rbac" });
  const auditRead = await ch.from("audit_log").select("id").limit(5);
  check("CH CANNOT read audit_log (row exists but hidden)", (auditRead.data?.length ?? 0) === 0, auditRead.data);

  // cleanup
  await admin.from("events").delete().in("cluster_id", [clusterA, clusterB]).like("name", "RBAC %");
  await admin.from("events").delete().eq("name", "CH new");
  await admin.from("audit_log").delete().eq("action", "rbac.proof.marker");
  await admin.from("admins").delete().in("user_id", [pyhId, chId, targetId]);
  await admin.auth.admin.deleteUser(pyhId);
  await admin.auth.admin.deleteUser(chId);
  await admin.auth.admin.deleteUser(targetId);

  console.log("─".repeat(48));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
