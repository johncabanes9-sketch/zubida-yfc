// Proves the deploy-time environment check: a production build with empty or
// half-set configuration fails, naming what is wrong, instead of shipping.
//
// It exists because production ran for weeks with every Supabase variable set
// but empty. Vercel built and served the site; the public pages fell back to
// built-in content, and admin, registration and the contact form were dead.
// Needs no database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const { checkDeployEnv, assertDeployEnv } = await import("../src/lib/env/check.mjs");

const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.anon",
  SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.service",
  CRON_SECRET: "a-long-random-cron-secret",
};

console.log("\n── checkDeployEnv ──");

check("a complete configuration passes", checkDeployEnv(good).errors.length === 0, checkDeployEnv(good));

for (const key of Object.keys(good)) {
  const r = checkDeployEnv({ ...good, [key]: undefined });
  check(`an unset ${key} is an error naming it`, r.errors.some((e) => e.includes(key)), r.errors);
}
for (const key of Object.keys(good)) {
  const r = checkDeployEnv({ ...good, [key]: "" });
  check(`an empty ${key} is an error — the production failure`, r.errors.some((e) => e.includes(key)), r.errors);
}
{
  const r = checkDeployEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: "   " });
  check("a whitespace-only value counts as empty", r.errors.some((e) => e.includes("SUPABASE_SERVICE_ROLE_KEY")), r.errors);
}
{
  const r = checkDeployEnv({});
  check("an empty environment reports every missing variable at once", r.errors.length >= 4, r.errors);
}
for (const bad of ["abcdefghijklmnopqrst.supabase.co", "http://abc.supabase.co", "not a url"]) {
  const r = checkDeployEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: bad });
  check(`a Supabase URL of "${bad}" is rejected`, r.errors.some((e) => e.includes("NEXT_PUBLIC_SUPABASE_URL")), r.errors);
}

console.log("\n── Turnstile: both or neither ──");

check("neither Turnstile key is fine (degraded mode)", checkDeployEnv(good).errors.length === 0, checkDeployEnv(good));
check("both Turnstile keys are fine",
  checkDeployEnv({ ...good, TURNSTILE_SECRET_KEY: "s", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k" }).errors.length === 0, null);
{
  const r = checkDeployEnv({ ...good, TURNSTILE_SECRET_KEY: "s" });
  check("the secret without the site key is an error — it rejects every form", r.errors.some((e) => /TURNSTILE/.test(e)), r.errors);
}
{
  const r = checkDeployEnv({ ...good, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k" });
  check("the site key without the secret is an error — the captcha is never verified", r.errors.some((e) => /TURNSTILE/.test(e)), r.errors);
}

console.log("\n── Messages ──");

{
  const r = checkDeployEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: "super-secret-value-xyz", CRON_SECRET: "" });
  check("an error never echoes a secret's value", !r.errors.join(" ").includes("super-secret-value-xyz"), r.errors);
}

console.log("\n── assertDeployEnv ──");

{
  let threw = null;
  try { assertDeployEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "" }, "production"); } catch (e) { threw = e; }
  check("a production build with an empty URL throws", threw instanceof Error, threw?.message);
  check("the thrown message names the variable and where to set it",
    /NEXT_PUBLIC_SUPABASE_URL/.test(threw?.message ?? "") && /Vercel/.test(threw?.message ?? ""), threw?.message);
}
{
  let threw = null;
  try { assertDeployEnv(good, "production"); } catch (e) { threw = e; }
  check("a production build with a complete configuration does not throw", threw === null, threw?.message);
}
{
  let threw = null;
  const warnings = [];
  const orig = console.warn;
  console.warn = (m) => warnings.push(String(m));
  try { assertDeployEnv({}, "preview"); } catch (e) { threw = e; } finally { console.warn = orig; }
  check("a preview build is never failed, so PR checks stay usable", threw === null, threw?.message);
  check("a preview build warns about what is missing", warnings.some((w) => w.includes("NEXT_PUBLIC_SUPABASE_URL")), warnings);
}
for (const env of [undefined, "development"]) {
  let threw = null;
  try { assertDeployEnv({}, env); } catch (e) { threw = e; }
  check(`a ${env ?? "local"} build is not checked`, threw === null, threw?.message);
}

console.log("\n── Wiring ──");

const config = readFileSync(join(root, "next.config.mjs"), "utf8");
check("next.config runs the check", /assertDeployEnv\(/.test(config), null);
check("the check runs only in the production build phase, not on dev or start",
  /PHASE_PRODUCTION_BUILD/.test(config), null);
check("it keys on Vercel's environment", /VERCEL_ENV/.test(config), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
