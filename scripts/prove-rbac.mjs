// Proves two-tier RBAC against the hosted DB. Creates a PYH, a cluster-head in
// cluster A, events in clusters A and B, then asserts the cluster head is
// confined to cluster A and cannot manage users. Cleans up after itself.
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

  // 9. CH CANNOT write site_settings (PYH-only global content). The row exists
  // (seeded by migration 0013), so only RLS can make this update affect 0 rows.
  const updSettings = await ch.from("site_settings").update({ tagline: "hacked by CH" }).eq("id", 1).select("id");
  check("CH CANNOT write site_settings", (updSettings.data?.length ?? 0) === 0, updSettings.error?.message ?? updSettings.data);

  // 10. CH CANNOT write nav_items.
  const updNav = await ch.from("nav_items").update({ label: "hacked" }).eq("href", "/about").select("href");
  check("CH CANNOT write nav_items", (updNav.data?.length ?? 0) === 0, updNav.error?.message ?? updNav.data);

  // 11-12. Read back with service-role: a policy that silently allowed the write
  // but returned no rows would pass 9-10 while the site was actually defaced.
  const { data: settingsAfter } = await admin.from("site_settings").select("tagline").eq("id", 1).single();
  check("site_settings tagline unchanged after CH attempt", settingsAfter.tagline !== "hacked by CH", settingsAfter.tagline);
  const { data: navAfter } = await admin.from("nav_items").select("label").eq("href", "/about").single();
  check("nav_items label unchanged after CH attempt", navAfter.label !== "hacked", navAfter.label);

  // 13. PYH CAN write site_settings. Without this, an over-strict policy would
  // break the admin screen and every denial assertion would still pass.
  const pyh = await authedClient(pyhEmail);
  const originalTagline = settingsAfter.tagline;
  const pyhWrite = await pyh.from("site_settings").update({ tagline: "PYH proof write" }).eq("id", 1).select("tagline");
  check("PYH CAN write site_settings", pyhWrite.data?.[0]?.tagline === "PYH proof write", pyhWrite.error?.message ?? pyhWrite.data);
  await admin.from("site_settings").update({ tagline: originalTagline }).eq("id", 1);

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

  // ── The bootstrap path has to produce a usable PYH ───────────────────────
  // /admin/users can only ever create a cluster_head, so setup-admin.mjs is the
  // ONLY way the provincial youth head account comes into existence — the
  // account that owns the page CMS, site settings, and every requirePYH action.
  // A stale role there is invisible: is_admin() still returns true, the account
  // signs in, the dashboard loads, and only the PYH-gated surfaces silently
  // redirect. Asserted statically so it cannot rot again as roles evolve.
  const setupSrc = readFileSync(join(root, "scripts/setup-admin.mjs"), "utf8");
  const rbacSrc = readFileSync(join(root, "src/lib/rbac.ts"), "utf8");
  const knownRoles = [...rbacSrc.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const seededRole = setupSrc.match(/role:\s*"([a-z_]+)"/)?.[1];

  check("the app recognizes exactly two admin roles", knownRoles.length === 2, knownRoles);
  check(
    "the bootstrap script seeds a role the application recognizes",
    knownRoles.includes(seededRole),
    { seededRole, knownRoles },
  );
  check(
    "the bootstrap script seeds the PYH, the only role that can reach the page CMS",
    seededRole === "provincial_youth_head",
    seededRole,
  );
  // Retired events keep status 'Open' — 0019 soft-deletes, it does not close.
  // So picking "some Open event" attaches the proof registration to an event
  // nobody should be able to register for, and makes the check depend on the
  // database having any events at all. It has to bring its own.
  check(
    "the bootstrap script proves against an event it creates, not an arbitrary existing one",
    /from\("events"\)\s*\.?\s*insert\(/.test(setupSrc) && !/\.eq\("status",\s*"Open"\)/.test(setupSrc),
    null,
  );
  // It targets a real account by default; silently changing that account's
  // password is not something a setup script should do without being asked.
  check(
    "the bootstrap script does not reset an existing account's password unasked",
    !/updateUserById\([^)]*password[^)]*\)/.test(setupSrc) || /RESET_PASSWORD/.test(setupSrc),
    null,
  );

  // cleanup
  await admin.from("event_images").delete().in("event_id", [evA.id, evB.id]);
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
