// Proves venue check-in: a scanned pass or a typed registration code checks a
// registrant in exactly once, only for the event at the door, only for a pass
// that still holds a slot, and only by an admin whose scope covers the event.
//
// The QR on every pass encodes the /registration-status link, so the parser is
// tested against the exact URL statusUrl() builds.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));
// A missing file reads as empty, so its assertions fail rather than the run.
const code = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { return ""; } };

// ── 1. parsePass — no database ──────────────────────────────────────────────
console.log("\n── parsePass ──");

const { parsePass } = await import("../src/lib/checkin/parse.ts");
const { statusUrl } = await import("../src/lib/qr.ts");

const TOKEN = "3f2b8c1e-9a4d-4e6f-b1a2-7c8d9e0f1a2b";
const REG = "ZYFC-A1B2-1234";

{
  const r = parsePass(statusUrl("https://zubidayfc.org", REG, TOKEN));
  check("the exact URL a pass encodes yields its code and token",
    r?.registrationId === REG && r?.token === TOKEN, r);
}
{
  const r = parsePass(statusUrl("http://localhost:3000", REG, TOKEN));
  check("a pass issued from another origin still parses", r?.registrationId === REG && r?.token === TOKEN, r);
}
{
  const r = parsePass("  zyfc-a1b2-1234 ");
  check("a typed code is trimmed and upper-cased, with no token", r?.registrationId === REG && r?.token === null, r);
}
for (const [label, input] of [
  ["an empty input", "   "],
  ["a URL to some other page", `https://zubidayfc.org/events?id=${REG}&t=${TOKEN}`],
  ["a pass URL with a malformed token", `https://zubidayfc.org/registration-status?id=${REG}&t=not-a-uuid`],
  ["a pass URL with no code", `https://zubidayfc.org/registration-status?t=${TOKEN}`],
  ["free text that is not a code", "hello there"],
]) {
  check(`${label} is rejected`, parsePass(input) === null, parsePass(input));
}
{
  const r = parsePass(`https://zubidayfc.org/registration-status?id=${REG}`);
  check("a pass URL without a token falls back to a manual lookup", r?.registrationId === REG && r?.token === null, r);
}

// ── 2. The admin surface ────────────────────────────────────────────────────
console.log("\n── The admin surface ──");

const page = code("src/app/admin/events/[id]/check-in/page.tsx");
check("the check-in page authorizes against the event's cluster", /requireClusterAccess\(/.test(page), null);
const actions = code("src/app/admin/events/[id]/check-in/actions.ts");
check("check-in goes through the RLS-bound client, never the service role, for the write",
  /createServerSupabase\(\)/.test(actions) && /rpc\(\s*["']check_in_registration["']/.test(actions), null);
check("the events list links to check-in", /\/check-in/.test(code("src/app/admin/events/_components/events-table.tsx")), null);

// ── 3. The database ─────────────────────────────────────────────────────────
console.log("\n── check_in_registration ──");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.log("  FAIL  Missing Supabase env vars — database section not run.");
  console.log(`\n${pass} passed, ${fail + 1} failed`);
  process.exit(1);
}
const admin = createClient(url, service, { auth: { persistSession: false } });
const anonClient = createClient(url, anon, { auth: { persistSession: false } });

const stamp = Date.now();
const PW = "ProveCheckin!2026";
async function mkUser(email) {
  const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (c.error) throw c.error;
  return c.data.user.id;
}
async function authedClient(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}

const users = [];
const events = [];

async function mkEvent(cluster_id, name) {
  const { data, error } = await admin.from("events").insert({
    name: `${name} ${stamp}`, date: "2026-12-01", registration_deadline: new Date(Date.now() + 864e5).toISOString(),
    slots_total: 50, slots_taken: 0, status: "Open", scope: "Chapter", cluster_id,
  }).select("id").single();
  if (error) throw new Error(`event fixture: ${error.message}`);
  events.push(data.id);
  return data.id;
}

let n = 0;
async function mkReg(event_id, status = "pending") {
  n++;
  const { data, error } = await admin.from("event_registrations").insert({
    registration_id: `ZYFC-PRV${n}-${String(stamp).slice(-4)}`, event_id,
    full_name: `Checkin Person ${n}`, email: `checkin_${stamp}_${n}@test.com`, chapter: "Test Chapter",
    age: 18, consent: true, status,
  }).select("id, registration_id, qr_token").single();
  if (error) throw new Error(`registration fixture: ${error.message}`);
  return data;
}

const rpc = (client, event, reg, token = null) =>
  client.rpc("check_in_registration", { p_event_id: event, p_code: reg, p_token: token });

try {
  const { data: clusters, error: ce } = await admin.from("clusters").select("id").order("name").limit(2);
  if (ce || (clusters?.length ?? 0) < 2) throw new Error("need two clusters");
  const [clusterA, clusterB] = clusters.map((c) => c.id);

  const chEmail = `checkin_ch_${stamp}@test.com`;
  const pyhEmail = `checkin_pyh_${stamp}@test.com`;
  const chId = await mkUser(chEmail); users.push(chId);
  const pyhId = await mkUser(pyhEmail); users.push(pyhId);
  for (const row of [
    { user_id: chId, role: "cluster_head", cluster_id: clusterA, is_active: true, full_name: "Checkin CH" },
    { user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Checkin PYH" },
  ]) {
    const r = await admin.from("admins").upsert(row, { onConflict: "user_id" });
    if (r.error) throw new Error(`admin fixture: ${r.error.message}`);
  }

  const evA = await mkEvent(clusterA, "CHECKIN A");
  const evA2 = await mkEvent(clusterA, "CHECKIN A2");
  const evB = await mkEvent(clusterB, "CHECKIN B");

  const ch = await authedClient(chEmail);
  const pyh = await authedClient(pyhEmail);

  // QR scan, happy path.
  const r1 = await mkReg(evA, "approved");
  const scan = await rpc(ch, evA, r1.registration_id, r1.qr_token);
  check("a scanned pass checks in", scan.data?.code === "CHECKED_IN" && scan.data?.ok === true, scan.error?.message ?? scan.data);
  check("the result names the registrant for the door to confirm",
    scan.data?.registration?.full_name === "Checkin Person 1", scan.data?.registration);
  const row1 = (await admin.from("event_registrations").select("checked_in_at, checked_in_by, check_in_method").eq("id", r1.id).single()).data;
  check("the check-in is stamped with time, admin and method 'qr'",
    !!row1?.checked_in_at && row1?.checked_in_by === chId && row1?.check_in_method === "qr", row1);

  // A second scan is not a second admission.
  const again = await rpc(ch, evA, r1.registration_id, r1.qr_token);
  check("a second scan reports ALREADY and changes nothing",
    again.data?.code === "ALREADY" && again.data?.registration?.checked_in_at === row1?.checked_in_at, again.data);

  // Manual code entry.
  const r2 = await mkReg(evA, "pending");
  const manual = await rpc(ch, evA, r2.registration_id.toLowerCase(), null);
  check("a typed code checks in a pending registration, case-insensitively",
    manual.data?.code === "CHECKED_IN", manual.error?.message ?? manual.data);
  const row2 = (await admin.from("event_registrations").select("check_in_method").eq("id", r2.id).single()).data;
  check("a typed code is recorded as method 'manual'", row2?.check_in_method === "manual", row2);

  // Forged token.
  const r3 = await mkReg(evA, "approved");
  const forged = await rpc(ch, evA, r3.registration_id, "00000000-0000-4000-8000-000000000000");
  check("a pass whose token does not match is refused as BAD_TOKEN", forged.data?.code === "BAD_TOKEN", forged.data);
  const row3 = (await admin.from("event_registrations").select("checked_in_at").eq("id", r3.id).single()).data;
  check("a refused pass is not checked in", row3?.checked_in_at === null, row3);

  // Wrong event.
  const r4 = await mkReg(evA2, "approved");
  const wrong = await rpc(ch, evA, r4.registration_id, r4.qr_token);
  check("a pass for another event is refused as WRONG_EVENT", wrong.data?.code === "WRONG_EVENT", wrong.data);

  // Statuses that no longer hold a slot.
  for (const status of ["rejected", "cancelled"]) {
    const r = await mkReg(evA, status);
    const res = await rpc(ch, evA, r.registration_id, r.qr_token);
    check(`a ${status} registration is refused as NOT_ELIGIBLE`, res.data?.code === "NOT_ELIGIBLE", res.data);
  }
  {
    const r = await mkReg(evA, "approved");
    await admin.from("event_registrations").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
    const res = await rpc(ch, evA, r.registration_id, r.qr_token);
    check("a deleted registration is NOT_FOUND", res.data?.code === "NOT_FOUND", res.data);
  }
  {
    const res = await rpc(ch, evA, "ZYFC-NOPE-0000", null);
    check("an unknown code is NOT_FOUND", res.data?.code === "NOT_FOUND", res.data);
  }

  console.log("\n── Scope ──");

  const rB = await mkReg(evB, "approved");
  const cross = await rpc(ch, evB, rB.registration_id, rB.qr_token);
  const rowB = (await admin.from("event_registrations").select("checked_in_at").eq("id", rB.id).single()).data;
  check("a cluster head cannot check in at another cluster's event",
    cross.data?.ok !== true && rowB?.checked_in_at === null, cross.error?.message ?? cross.data);

  const pyhRes = await rpc(pyh, evB, rB.registration_id, rB.qr_token);
  check("the PYH checks in at any cluster's event", pyhRes.data?.code === "CHECKED_IN", pyhRes.error?.message ?? pyhRes.data);

  const r5 = await mkReg(evA, "approved");
  const anonRes = await rpc(anonClient, evA, r5.registration_id, r5.qr_token);
  const row5 = (await admin.from("event_registrations").select("checked_in_at").eq("id", r5.id).single()).data;
  check("anon cannot check anyone in", !!anonRes.error && row5?.checked_in_at === null, anonRes.error?.message ?? anonRes.data);

  console.log("\n── Integrity ──");

  const half = await admin.from("event_registrations")
    .update({ checked_in_at: new Date().toISOString(), check_in_method: null }).eq("id", r5.id);
  check("a check-in time without a method is rejected by the table", !!half.error, half.error?.message);

  const badMethod = await admin.from("event_registrations")
    .update({ checked_in_at: new Date().toISOString(), check_in_method: "teleport" }).eq("id", r5.id);
  check("a method outside qr/manual is rejected by the table", !!badMethod.error, badMethod.error?.message);

  // Concurrent double scan: two doors, same pass, same instant.
  const r6 = await mkReg(evA, "approved");
  const [a, b] = await Promise.all([rpc(ch, evA, r6.registration_id, r6.qr_token), rpc(pyh, evA, r6.registration_id, r6.qr_token)]);
  const codes = [a.data?.code, b.data?.code].sort();
  check("two simultaneous scans admit once: one CHECKED_IN, one ALREADY",
    codes[0] === "ALREADY" && codes[1] === "CHECKED_IN", codes);
} catch (e) {
  fail++;
  console.log(`  FAIL  fixture: ${e.message}`);
} finally {
  for (const id of events) {
    await admin.from("event_registrations").delete().eq("event_id", id);
    await admin.from("events").delete().eq("id", id);
  }
  for (const id of users) {
    await admin.from("admins").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
