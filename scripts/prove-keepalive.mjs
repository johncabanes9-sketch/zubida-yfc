// Proves the Supabase keepalive: a daily Vercel cron calls a secret-guarded
// route that runs one real query, so a free-tier project never sits idle long
// enough to be paused.
//
// It exists because the project was paused once for inactivity and every
// database-backed page and registration went down with it. Needs no database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const { runKeepalive, KEEPALIVE_ROUTE } = await import("../src/lib/keepalive.ts");

console.log("\n── The schedule ──");

let vercel = null;
try { vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")); } catch { /* checked below */ }
const cron = vercel?.crons?.find((c) => c.path === KEEPALIVE_ROUTE);
check("vercel.json schedules the keepalive route", !!cron, vercel?.crons);

// Supabase pauses a free project after 7 days without activity. Vercel Hobby
// allows at most one run a day, so daily is both the ceiling and plenty.
const fields = cron?.schedule?.trim().split(/\s+/) ?? [];
check("the schedule runs at least daily",
  fields.length === 5 && fields[2] === "*" && fields[3] === "*" && fields[4] === "*", cron?.schedule);

const route = readFileSync(join(root, "src/app/api/cron/keepalive/route.ts"), "utf8");
check("the route is where the schedule points", KEEPALIVE_ROUTE === "/api/cron/keepalive", KEEPALIVE_ROUTE);
check("the route is never statically cached", /dynamic\s*=\s*["']force-dynamic["']/.test(route), null);

console.log("\n── runKeepalive ──");

const SECRET = "s3cret-value-for-the-suite";
const okPing = async () => {};

{
  let pinged = false;
  const r = await runKeepalive({ authorization: `Bearer ${SECRET}`, secret: SECRET, ping: async () => { pinged = true; } });
  check("the right secret pings the database and returns 200", r.status === 200 && pinged, r);
}

for (const [label, authorization] of [
  ["no Authorization header", null],
  ["a wrong secret", "Bearer nope"],
  ["the secret without the Bearer scheme", SECRET],
  ["a secret with a trailing extra", `Bearer ${SECRET}x`],
]) {
  let pinged = false;
  const r = await runKeepalive({ authorization, secret: SECRET, ping: async () => { pinged = true; } });
  check(`${label} is rejected with 401 and never reaches the database`, r.status === 401 && !pinged, r);
}

{
  let pinged = false;
  const r = await runKeepalive({ authorization: "Bearer ", secret: undefined, ping: async () => { pinged = true; } });
  check("an unset CRON_SECRET fails closed with 500, not open", r.status === 500 && !pinged, r);
}

{
  let pinged = false;
  const r = await runKeepalive({ authorization: "Bearer ", secret: "", ping: async () => { pinged = true; } });
  check("an empty CRON_SECRET is treated as unset", r.status === 500 && !pinged, r);
}

{
  const r = await runKeepalive({
    authorization: `Bearer ${SECRET}`, secret: SECRET,
    ping: async () => { throw new Error("getaddrinfo ENOTFOUND"); },
  });
  check("a database that does not answer returns 503, so the cron run shows as failed",
    r.status === 503 && /ENOTFOUND/.test(r.body.error ?? ""), r);
}

{
  const r = await runKeepalive({ authorization: `Bearer ${SECRET}`, secret: SECRET, ping: okPing });
  check("a success response carries no secret", !JSON.stringify(r).includes(SECRET), r);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
