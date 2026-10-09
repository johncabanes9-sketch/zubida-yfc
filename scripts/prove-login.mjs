// Proves the officer/admin sign-in flow end to end in a real browser, against
// the project in .env.local (TEST). Creates a throwaway PYH and a throwaway
// account with no admins row, and removes both — users, admins rows and every
// audit_log entry they caused — whatever the outcome.
//
//   1. Public pages stay public; admin pages and POSTs bounce to sign-in.
//   2. The navbar Log in reaches the form; validation, wrong password and an
//      unknown email all refuse with one message and keep the typed email.
//   3. Password show/hide, the ?error= notices, and that unknown codes render nothing.
//   4. An account /admin refuses lands on the notice, signed out — not in the
//      /admin <-> /admin/login redirect loop it used to.
//   5. A real PYH signs in (audited), is kept off the form, and signs out.
//
//   npx next dev -p 3100   (then)   npm run prove:login
//   BASE_URL=http://localhost:3000 npm run prove:login
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const BASE = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const PW = "ProveLogin!2026";
const stamp = Date.now();
const pyhEmail = `prove_login_pyh_${stamp}@test.com`;
const noneEmail = `prove_login_none_${stamp}@test.com`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, c, got) => (c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`)));

async function mkUser(email) {
  const c = await db.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (c.error) throw c.error;
  return c.data.user.id;
}
const ids = [];
let browser;
try {
  const pyhId = await mkUser(pyhEmail); ids.push(pyhId);
  const noneId = await mkUser(noneEmail); ids.push(noneId);
  const { error: aErr } = await db.from("admins").upsert({ user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Prove Login PYH" }, { onConflict: "user_id" });
  if (aErr) throw aErr;

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  // Public stays public
  for (const p of ["/", "/events", "/leaders"]) {
    const r = await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
    check(`public ${p} loads without login (200, not redirected)`, r.status() === 200 && new URL(page.url()).pathname === p, { s: r.status(), u: page.url() });
  }
  // Protected
  for (const p of ["/admin", "/admin/users", "/admin/messages"]) {
    await page.goto(BASE + p);
    check(`unauthenticated ${p} redirects to login`, new URL(page.url()).pathname === "/admin/login", page.url());
  }
  // Server actions/API: an unauthenticated POST to a protected admin page is still bounced by middleware
  const apiRes = await page.request.post(BASE + "/admin/users", { maxRedirects: 0, failOnStatusCode: false });
  check("unauthenticated POST to /admin/users is redirected, not served", [302, 303, 307, 308].includes(apiRes.status()), apiRes.status());

  // Navbar entry
  await page.goto(BASE + "/");
  await page.getByRole("link", { name: /^Log in/ }).first().click();
  await page.waitForURL("**/admin/login");
  check("navbar Log in opens /admin/login", true);

  // Validation
  await page.getByRole("button", { name: "Sign in" }).click();
  const alert = page.locator('form [role="alert"]');
  await alert.waitFor();
  check("empty submit shows a validation message", /Enter your email/.test(await alert.textContent()), await alert.textContent());

  // Wrong password keeps email
  await page.fill('input[name="email"]', pyhEmail);
  await page.fill('input[name="password"]', "wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForFunction(() => /Incorrect email or password/.test(document.querySelector('form [role="alert"]')?.textContent ?? ""));
  check("wrong password shows 'Incorrect email or password.'", true);
  check("refused attempt keeps the typed email", (await page.inputValue('input[name="email"]')) === pyhEmail, await page.inputValue('input[name="email"]'));
  check("refused attempt stays on /admin/login", new URL(page.url()).pathname === "/admin/login", page.url());
  check("inputs flagged aria-invalid", (await page.getAttribute('input[name="password"]', "aria-invalid")) === "true");

  // Unknown email -> same message (no account probing)
  await page.fill('input[name="email"]', `nobody_${stamp}@test.com`);
  await page.fill('input[name="password"]', "whatever");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForFunction((e) => document.querySelector('input[name="email"]')?.value === e && /Incorrect email or password/.test(document.querySelector('form [role="alert"]')?.textContent ?? ""), `nobody_${stamp}@test.com`);
  check("unknown email gets the same message", true);

  // Password toggle
  const pw = page.locator('input[name="password"]');
  await pw.fill("abc");
  await page.getByRole("button", { name: "Show password" }).click();
  check("show password reveals text", (await pw.getAttribute("type")) === "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  check("hide password masks again", (await pw.getAttribute("type")) === "password");

  // Notices
  await page.goto(BASE + "/admin/login?error=timeout");
  check("?error=timeout shows the inactivity notice", /inactivity/.test((await page.locator('form [role="alert"]').textContent()) ?? ""));
  check("a notice does not mark the untouched fields invalid", (await page.getAttribute('input[name="email"]', "aria-invalid")) !== "true", await page.getAttribute('input[name="email"]', "aria-invalid"));
  await page.goto(BASE + "/admin/login?error=%3Cscript%3E");
  check("unknown ?error= value renders nothing", (await page.locator('form [role="alert"]').count()) === 0);

  // Non-admin account
  await page.fill('input[name="email"]', noneEmail);
  await page.fill('input[name="password"]', PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.searchParams.get("error") === "not-admin", { timeout: 60_000 });
  await page.locator('form [role="alert"]').waitFor();
  const noneUrl = page.url();
  const noneText = (await page.locator("main").textContent().catch(() => "")) ?? "";
  check("non-admin account is refused admin access", !/\/admin($|\/(?!login))/.test(new URL(noneUrl).pathname) || /doesn't have access/.test(noneText), { noneUrl });
  check("non-admin sees the no-access notice", /doesn't have access/.test(noneText), { noneUrl, snippet: noneText.slice(0, 160) });
  const after = await page.request.get(BASE + "/admin", { maxRedirects: 0 });
  check("refused account is signed out (no session left)", after.headers().location === "/admin/login", after.headers().location);
  await ctx.clearCookies();

  // Pending + success
  await page.goto(BASE + "/admin/login");
  await page.fill('input[name="email"]', pyhEmail);
  await page.fill('input[name="password"]', PW);
  const submit = page.getByRole("button", { name: "Sign in" });
  await submit.click();
  const sawPending = await page.getByRole("button", { name: /Signing in/ }).isVisible().catch(() => false);
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 60_000 });
  check("valid PYH lands on /admin", true);
  check("submit shows a pending state (best effort)", sawPending, { sawPending });
  const audit = await db.from("audit_log").select("action").eq("actor_user_id", pyhId).eq("action", "auth.login");
  check("successful login is audited", (audit.data?.length ?? 0) >= 1, audit.error?.message);

  // Signed in visiting login -> /admin
  await page.goto(BASE + "/admin/login");
  check("signed-in user visiting /admin/login is sent to /admin", new URL(page.url()).pathname === "/admin", page.url());
  await page.goto(BASE + "/admin/users");
  check("PYH can open /admin/users", new URL(page.url()).pathname === "/admin/users", page.url());

  // Logout
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL("**/admin/login");
  check("sign out returns to /admin/login", true);
  await page.goto(BASE + "/admin");
  check("after sign out /admin is protected again", new URL(page.url()).pathname === "/admin/login", page.url());
} finally {
  await browser?.close();
  for (const id of ids) {
    await db.from("audit_log").delete().eq("actor_user_id", id);
    await db.from("admins").delete().eq("user_id", id);
    await db.auth.admin.deleteUser(id);
  }
  await db.from("audit_log").delete().in("entity_id", [pyhEmail, noneEmail, `nobody_${stamp}@test.com`]);
  const left = await db.auth.admin.listUsers({ perPage: 1000 });
  console.log(`  cleanup: prove users left = ${left.data.users.filter((u) => u.email?.startsWith("prove_login_")).length}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
