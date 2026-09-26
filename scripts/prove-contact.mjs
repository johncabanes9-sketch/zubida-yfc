// Proves the contact inbox: a message sent from /contact is validated, gated,
// stored, and readable by the provincial youth head only.
//
// It exists because the form it covers shipped as a mock: submit ran a
// setTimeout and showed "Message received" while the message went nowhere.
// Every other suite stayed green, because nothing asserted that a submission
// reaches anything.
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

const code = (p) => readFileSync(join(root, p), "utf8");

// ── 1. The form is not a mock ────────────────────────────────────────────────
console.log("\n── The public form ──");

const form = code("src/components/contact/contact-form.tsx");
check("the form posts to /api/contact", /fetch\(\s*["']\/api\/contact["']/.test(form), null);
check("the form no longer fakes delivery with a timer", !/setTimeout/.test(form), null);
check("the form no longer tells the sender it is a preview", !/This is a preview/i.test(form), null);
check("the form renders the captcha widget when a site key is set", /<Turnstile\b/.test(form), null);
check("the form reports a failed send instead of hiding it", /role=["']alert["']/.test(form), null);

const register = code("src/app/api/register/route.ts");
check("registration and contact share one captcha verifier",
  /from\s+["']@\/lib\/turnstile["']/.test(register) && !/async function verifyTurnstile/.test(register), null);

// ── 1b. The admin inbox ──────────────────────────────────────────────────────
console.log("\n── The admin inbox ──");

const nav = code("src/app/admin/_components/admin-nav.ts");
check("the admin nav offers Messages to the PYH only",
  /key:\s*"messages"[^}]*pyhOnly:\s*true/.test(nav), null);

const inboxPage = code("src/app/admin/messages/page.tsx");
check("the inbox page requires the PYH", /await requirePYH\(\)/.test(inboxPage), null);
check("the inbox reads through the RLS-bound client, not the service role",
  /createServerSupabase\(\)/.test(inboxPage) && !/createServiceClient/.test(inboxPage), null);

// Comments stripped: prose about a message is not a write to one.
const inboxActions = code("src/app/admin/messages/actions.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check("every inbox action requires the PYH",
  (inboxActions.match(/export async function/g) ?? []).length ===
    (inboxActions.match(/await requirePYH\(\)/g) ?? []).length, null);
check("the inbox actions never touch what the sender wrote",
  !/\b(name|email|subject|message):/.test(inboxActions), null);

// ── 2. submitContact, with every dependency stubbed ─────────────────────────
console.log("\n── submitContact ──");

const { submitContact } = await import("../src/lib/contact/submit.ts");

const valid = {
  name: "  Maria Santos ",
  email: "maria@example.org",
  subject: "Joining a chapter",
  message: "Hello! How do I join the chapter in my parish?",
};

function stubDeps(over = {}) {
  const inserted = [];
  return {
    inserted,
    deps: {
      verifyCaptcha: async () => true,
      rateLimit: async () => true,
      insert: async (row) => { inserted.push(row); },
      ...over,
    },
  };
}

{
  const { inserted, deps } = stubDeps();
  const r = await submitContact({ ...valid }, "203.0.113.9", deps);
  check("a valid message is accepted", r.ok === true, r);
  check("exactly one row is stored", inserted.length === 1, inserted.length);
  check("the stored name is trimmed", inserted[0]?.name === "Maria Santos", inserted[0]?.name);
  check("a blank subject is stored as null, not an empty string",
    (await (async () => {
      const s = stubDeps();
      await submitContact({ ...valid, subject: "   " }, "203.0.113.9", s.deps);
      return s.inserted[0]?.subject === null;
    })()), null);
  check("the captcha token is not stored with the message", !("captchaToken" in (inserted[0] ?? {})), inserted[0]);
}

for (const [label, patch] of [
  ["a missing message", { message: "" }],
  ["a one-word-long message under the floor", { message: "hi" }],
  ["a malformed email", { email: "not-an-email" }],
  ["a missing name", { name: " " }],
  ["an oversized message", { message: "x".repeat(5001) }],
]) {
  const { inserted, deps } = stubDeps();
  const r = await submitContact({ ...valid, ...patch }, "203.0.113.9", deps);
  check(`${label} is rejected as INVALID and not stored`, r.code === "INVALID" && inserted.length === 0, r);
}

{
  const { inserted, deps } = stubDeps();
  const r = await submitContact(null, "203.0.113.9", deps);
  check("a non-object body is rejected as INVALID", r.code === "INVALID" && inserted.length === 0, r);
}

{
  let captchaCalled = false;
  const { inserted, deps } = stubDeps({ verifyCaptcha: async () => { captchaCalled = true; return true; } });
  await submitContact({ ...valid, email: "bad" }, "203.0.113.9", deps);
  check("validation runs before the captcha round-trip", !captchaCalled && inserted.length === 0, captchaCalled);
}

{
  const { inserted, deps } = stubDeps({ verifyCaptcha: async () => false });
  const r = await submitContact({ ...valid, captchaToken: "bad" }, "203.0.113.9", deps);
  check("a failed captcha is rejected and not stored", r.code === "CAPTCHA_FAILED" && inserted.length === 0, r);
}

{
  let seenToken = null;
  const { deps } = stubDeps({ verifyCaptcha: async (t) => { seenToken = t; return true; } });
  await submitContact({ ...valid, captchaToken: "tok-123" }, "203.0.113.9", deps);
  check("the captcha token reaches the verifier", seenToken === "tok-123", seenToken);
}

{
  const { inserted, deps } = stubDeps({ rateLimit: async () => false });
  const r = await submitContact({ ...valid }, "203.0.113.9", deps);
  check("a rate-limited sender is rejected and not stored", r.code === "RATE_LIMITED" && inserted.length === 0, r);
}

{
  const { deps } = stubDeps({ rateLimit: async () => { throw new Error("rpc down"); } });
  const r = await submitContact({ ...valid }, "203.0.113.9", deps);
  check("a rate-limit outage fails closed as SERVER_ERROR", r.code === "SERVER_ERROR", r);
}

{
  const { deps } = stubDeps({ insert: async () => { throw new Error("insert denied"); } });
  const r = await submitContact({ ...valid }, "203.0.113.9", deps);
  check("a failed insert is reported, never shown as sent", r.ok === false && r.code === "SERVER_ERROR", r);
}

// ── 3. Schema and RLS, against the database ─────────────────────────────────
console.log("\n── Schema ──");

const probe = await admin.from("contact_messages").select("id").limit(1);
check("the contact_messages table exists", !probe.error, probe.error?.message);

const contactSql = readdirSync(join(root, "supabase/migrations"))
  .filter((f) => f.includes("contact_messages") && f.endsWith(".sql"))
  .map((f) => code(`supabase/migrations/${f}`))
  .join("\n");
check("the migration seeds no messages", contactSql.length > 0 && !/insert\s+into\s+contact_messages/i.test(contactSql), null);

const stamp = Date.now();
const PW = "ProveContact!2026";

async function mkUser(email) {
  const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (c.error) throw c.error;
  return c.data.user.id;
}

// RLS is only meaningful through an authenticated client: the service-role
// client bypasses it, so a policy assertion written against `admin` proves
// nothing.
async function authedClient(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}

const anonClient = createClient(url, anon, { auth: { persistSession: false } });
let pyhId = null, chId = null, msgId = null;

try {
  const pyhEmail = `contact_pyh_${stamp}@test.com`;
  const chEmail = `contact_ch_${stamp}@test.com`;
  pyhId = await mkUser(pyhEmail);
  chId = await mkUser(chEmail);

  const { data: clusters, error: clustersError } = await admin.from("clusters").select("id").limit(1);
  if (clustersError || !clusters?.length) throw new Error(`need a cluster: ${clustersError?.message ?? "none found"}`);

  for (const row of [
    { user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Contact PYH" },
    { user_id: chId, role: "cluster_head", cluster_id: clusters[0].id, is_active: true, full_name: "Contact CH" },
  ]) {
    const r = await admin.from("admins").upsert(row, { onConflict: "user_id" });
    if (r.error) throw new Error(`could not create admin row: ${r.error.message}`);
  }

  const ins = await admin.from("contact_messages").insert({
    name: `Prove ${stamp}`, email: "prove@example.org", subject: null, message: "A message from prove:contact.",
  }).select("id, status").single();
  if (ins.error) throw new Error(`could not create fixture message: ${ins.error.message}`);
  msgId = ins.data.id;
  check("a new message starts as 'new'", ins.data.status === "new", ins.data.status);

  const bogus = await admin.from("contact_messages").update({ status: "deleted" }).eq("id", msgId);
  check("the status column rejects values outside new/read/archived", !!bogus.error, bogus.error?.message);

  const pyh = await authedClient(pyhEmail);
  const ch = await authedClient(chEmail);

  console.log("\n── RLS ──");

  const anonRead = await anonClient.from("contact_messages").select("id").eq("id", msgId);
  check("anon cannot read messages", (anonRead.data?.length ?? 0) === 0, anonRead.data);

  const anonInsert = await anonClient.from("contact_messages")
    .insert({ name: "Anon", email: "a@example.org", message: "Straight to PostgREST." });
  check("anon cannot insert past the route's captcha and rate limit", !!anonInsert.error, anonInsert.error?.message);

  const chRead = await ch.from("contact_messages").select("id").eq("id", msgId);
  check("a cluster head cannot read the provincial inbox", (chRead.data?.length ?? 0) === 0, chRead.data);

  const chUpdate = await ch.from("contact_messages").update({ status: "archived" }).eq("id", msgId).select("id");
  check("a cluster head cannot change a message", (chUpdate.data?.length ?? 0) === 0, chUpdate.data);

  const pyhRead = await pyh.from("contact_messages").select("id, message").eq("id", msgId);
  check("the PYH reads the message", pyhRead.data?.[0]?.message === "A message from prove:contact.", pyhRead.error?.message ?? pyhRead.data);

  const pyhUpdate = await pyh.from("contact_messages")
    .update({ status: "read", read_by: pyhId, read_at: new Date().toISOString() })
    .eq("id", msgId).select("status");
  check("the PYH marks a message read", pyhUpdate.data?.[0]?.status === "read", pyhUpdate.error?.message ?? pyhUpdate.data);

  const pyhEdit = await pyh.from("contact_messages").update({ message: "rewritten" }).eq("id", msgId).select("id");
  check("the PYH cannot rewrite what a sender wrote", !!pyhEdit.error || (pyhEdit.data?.length ?? 0) === 0, pyhEdit.data);

  await pyh.from("contact_messages").delete().eq("id", msgId);
  const still = await admin.from("contact_messages").select("id").eq("id", msgId);
  check("no one hard-deletes a message through the API", still.data?.length === 1, still.data);
} catch (e) {
  fail++;
  console.log(`  FAIL  fixture setup: ${e.message}`);
} finally {
  if (msgId) await admin.from("contact_messages").delete().eq("id", msgId);
  for (const id of [pyhId, chId].filter(Boolean)) {
    await admin.from("admins").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
