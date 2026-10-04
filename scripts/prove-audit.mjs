// Proves the admin audit trail reports its own failures instead of hiding them.
//
// Every admin action used to carry a private audit() that wrapped the insert in
// try/catch. supabase-js does not throw on a failed insert — it resolves with
// { error } — so a rejected row (bad column, RLS, a paused project) vanished
// without a trace and the catch only ever saw network exceptions. Writes now go
// through one helper that checks { error } and logs it, still without blocking
// the mutation the entry describes. Needs no database.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const { writeAudit } = await import("../src/lib/audit.ts");

// Capture console.error so a failure is provably reported, and silence it.
const logged = [];
const realError = console.error;
const capture = async (fn) => {
  logged.length = 0;
  console.error = (...a) => logged.push(a.join(" "));
  try { return await fn(); } finally { console.error = realError; }
};

const entry = { actorUserId: "u-1", action: "chapter.update", entity: "chapters", entityId: "c-9" };

console.log("\n── writeAudit ──");

{
  let row = null;
  const ok = await capture(() => writeAudit(async (r) => { row = r; return { error: null }; }, entry));
  check("a successful insert reports true", ok === true, ok);
  check("the row uses the audit_log column names", row?.actor_user_id === "u-1" && row?.action === "chapter.update"
    && row?.entity === "chapters" && row?.entity_id === "c-9", row);
  check("no meta key is sent when none is given", row && !("meta" in row), row);
  check("nothing is logged on success", logged.length === 0, logged);
}

{
  let row = null;
  await capture(() => writeAudit(async (r) => { row = r; return { error: null }; },
    { ...entry, actorUserId: null, meta: { ip: "203.0.113.4" } }));
  check("meta is passed through", row?.meta?.ip === "203.0.113.4", row);
  check("a null actor (failed sign-in) is kept as null", row?.actor_user_id === null, row);
}

{
  const ok = await capture(() => writeAudit(async () => ({ error: { message: "permission denied for table audit_log" } }), entry));
  check("an { error } result reports false", ok === false, ok);
  check("an { error } result is logged, not swallowed", logged.length === 1, logged);
  check("the log names the action and entity", /chapter\.update/.test(logged[0] ?? "") && /chapters\/c-9/.test(logged[0] ?? ""), logged);
  check("the log carries the database message", /permission denied/.test(logged[0] ?? ""), logged);
}

{
  let threw = false, ok;
  try {
    ok = await capture(() => writeAudit(async () => { throw new Error("fetch failed"); }, entry));
  } catch { threw = true; }
  check("a thrown insert never propagates to the action", !threw, threw);
  check("a thrown insert reports false", ok === false, ok);
  check("a thrown insert is logged", /fetch failed/.test(logged[0] ?? ""), logged);
}

{
  let threw = false;
  try { await capture(() => writeAudit(async () => { throw "not an Error"; }, entry)); } catch { threw = true; }
  check("a non-Error throw is also contained", !threw && /not an Error/.test(logged[0] ?? ""), logged);
}

console.log("\n── Every audit write goes through the helper ──");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const helpers = new Set(["src/lib/audit.ts", "src/lib/supabase/audit.ts"]);
const offenders = walk(join(root, "src"))
  .map((p) => relative(root, p).replaceAll("\\", "/"))
  .filter((p) => !helpers.has(p))
  .filter((p) => {
    // Catches a split chain (const t = db.from("audit_log"); t.insert(…)) too:
    // any file naming the table that also inserts anything is suspect.
    const src = readFileSync(join(root, p), "utf8");
    return /["']audit_log["']/.test(src) && /\.insert\(/.test(src);
  });
check("no file inserts into audit_log directly", offenders.length === 0, offenders);

// The headline fix: approve/reject used the session client, which RLS refuses.
const status = readFileSync(join(root, "src/app/admin/actions.ts"), "utf8");
check("registration approve/reject audits through the service-role helper",
  /recordAudit\(\{[\s\S]{0,200}registration\.\$\{status\}/.test(status), null);

const login = readFileSync(join(root, "src/app/admin/login/actions.ts"), "utf8");
check("sign-in audit cannot throw on the header read", /try\s*\{\s*\n?\s*ip\s*=\s*\(await headers\(\)\)/.test(login), null);

const wrapper = readFileSync(join(root, "src/lib/supabase/audit.ts"), "utf8");
check("the server wrapper uses the service client", /createServiceClient\(\)/.test(wrapper), null);
check("the server wrapper delegates to writeAudit", /writeAudit\(/.test(wrapper), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
