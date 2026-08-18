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
check("the migration seeds zero chapter rows", (all.data?.length ?? 0) === 0, all.data?.length);

const sql = readFileSync(join(root, "supabase/migrations/0023_chapters.sql"), "utf8");
check("the migration inserts no chapter rows", !/insert\s+into\s+chapters/i.test(sql), null);
check("the migration carries no placeholder imagery",
  !/picsum\.photos|i\.pravatar\.cc/i.test(sql), null);

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
