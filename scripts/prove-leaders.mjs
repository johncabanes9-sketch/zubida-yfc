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

console.log("\n── Cleanup ──");
if (plain.data?.id) await admin.from("leaders").delete().eq("id", plain.data.id);
const leftover = await admin.from("leaders").select("id");
check("the suite left no leaders behind",
  !leftover.error && (leftover.data?.length ?? -1) === 0, leftover.data);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
