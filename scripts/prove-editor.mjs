// Proves the /admin/pages editing loop end to end, in a real browser, against
// the live database: sign-in, SEO, content edits, visibility, reorder, image
// upload/reap/remove, and the cluster-head negatives.
//
// This suite EDITS PUBLISHED CONTENT. There is no dynamic [slug] route, so the
// About page is the only CMS-backed public page and there is no throwaway page
// to work on instead. It therefore snapshots `pages` + `page_sections` + the
// storage listing before the first edit, writes that snapshot to disk, restores
// it in a finally, and then ASSERTS the restore succeeded — a failed restore
// fails the suite loudly instead of quietly leaving /about modified. If the
// process is hard-killed mid-run, scripts/.editor-snapshot.json is the manual
// restore path; it is deleted only on a clean, fully-passing exit.
//
// Usage: npm run prove:editor
//        BASE_URL=http://localhost:3000 npm run prove:editor   (reuse a server)
//
// Prerequisite: npx playwright install chromium
// The browser binary lives in the user's Playwright cache, NOT in node_modules,
// so `npm ci` alone is not enough — see the launch failure message below.
//
// RUN THIS AGAINST `next dev` ONLY. /about sets `export const revalidate = 60`,
// so a production server can answer from the ISR cache: an edit would reach the
// database and the public-page assertions would still read the previous HTML.
// In dev every request re-renders, which is what makes those assertions sound.
// The spawn path starts `next dev`; if you point BASE_URL at an existing server,
// it must be a dev one.
import { createClient } from "@supabase/supabase-js";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_FILE = join(root, "scripts/.editor-snapshot.json");
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SLUG = "about";
const PW = "ProveEditor!2026";
// Every assertion the walkthrough makes when nothing goes wrong. A block that
// exits early reports its own FAIL, but the assertions after it go silently
// missing — this makes a short run loud instead of letting it read as a clean one.
const EXPECTED_ASSERTIONS = 39;
const stamp = Date.now();
// Two disjoint markers — neither is a substring of the other. One shared marker
// made three public-page assertions unsound: once the SEO title is saved, every
// render of /about carries the marker in <title>, so a body search matched the
// head. "a hidden section is gone" could then never pass, and the reorder check
// compared against <title> at offset ~822 instead of the hero heading.
const SEO_MARK = `PROVE-EDITOR-SEO-${stamp}`;
const BODY_MARK = `PROVE-EDITOR-BODY-${stamp}`;
// 12 bytes is all validateImage sniffs; the object only has to exist and be
// owned, not decode. Same constant prove-pages.mjs uses.
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) { console.error("Missing Supabase env vars."); process.exit(1); }
const db = createClient(url, service, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

/**
 * One block of the walkthrough. A click or fill that times out is recorded as a
 * FAIL and the following blocks still run.
 *
 * This matters because a timeout is the shape every real regression takes: when
 * a control breaks it goes missing or disabled, and Playwright waits the full 60s
 * and throws. Letting that propagate skipped the summary line and every later
 * assertion, so a regression reported a stack trace instead of which assertions
 * broke. Proven twice by the mutation pass — a disabled "Move up" and a missing
 * "Show on the public page" each killed a run outright.
 */
async function step(label, fn) {
  console.log(`\n── ${label} ──`);
  try { await fn(); }
  catch (e) { check(`${label}: no unexpected error`, false, String(e?.message ?? e).split("\n")[0]); }
}

// ── Server lifecycle ────────────────────────────────────────────────────────
// Reuse whatever is already answering on BASE_URL; only spawn when nothing is.
// Keeps the one-command property every other prove:* suite has, without paying
// a cold Next compile when a dev server is already open.
async function answering() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.status > 0;
  } catch { return false; }
}

async function ensureServer() {
  if (await answering()) { console.log(`  reusing the server already on ${BASE_URL}`); return null; }
  const port = new URL(BASE_URL).port || "3000";
  console.log(`  nothing on ${BASE_URL} — starting next dev (first compile is slow)`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", port],
    { cwd: root, stdio: "ignore", env: process.env });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await answering()) {
      console.log("  server is up");
      // Kill the whole tree: `next dev` forks a worker that outlives a plain
      // kill(pid) and keeps the port bound.
      return () => {
        if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else { try { process.kill(-child.pid); } catch { child.kill("SIGKILL"); } }
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("the dev server did not start within 180s");
}

// ── Database helpers ────────────────────────────────────────────────────────
const pageRow = async () => (await db.from("pages")
  .select("id, seo_title, seo_description, page_sections(id, type, content, sort_order, visible)")
  .eq("slug", SLUG).single()).data;

const sectionsByType = async () => {
  const p = await pageRow();
  return Object.fromEntries(p.page_sections.map((s) => [s.type, s]));
};

/** Polls until `fn()` is truthy. Server actions are the real signal, not the toast. */
async function waitDb(fn, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try { if (await fn()) return true; } catch { /* transient read; retry */ }
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Objects one level inside a prefix. storage.list(prefix) is NOT recursive on a
 * parent — list("pages") returns the folder entry `about` and never the objects
 * under it, which silently turned three reap assertions vacuous last time.
 */
async function listUnder(prefix) {
  const { data } = await db.storage.from("media").list(prefix, { limit: 100 });
  return (data ?? []).filter((o) => o.id !== null).map((o) => o.name);
}

async function mkUser(email) {
  const c = await db.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (c.error) {
    if (!/already/i.test(c.error.message)) throw c.error;
    const l = await db.auth.admin.listUsers();
    return l.data.users.find((u) => u.email === email).id;
  }
  return c.data.user.id;
}

/**
 * audit_log.actor_user_id references the user, and every editor action writes a
 * row. Deleting first returns an empty error object `{}` that says nothing —
 * clear the references, then delete.
 */
async function dropUser(id) {
  if (!id) return;
  await db.from("audit_log").delete().eq("actor_user_id", id);
  await db.from("admins").delete().eq("user_id", id);
  await db.auth.admin.deleteUser(id);
}

// ── Snapshot / restore ──────────────────────────────────────────────────────
async function snapshot() {
  const p = await pageRow();
  return {
    pageId: p.id,
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    sections: p.page_sections.map((s) => ({ id: s.id, content: s.content, sort_order: s.sort_order, visible: s.visible })),
    objects: await listUnder(`pages/${SLUG}`),
  };
}

async function restore(snap) {
  await db.from("pages").update({ seo_title: snap.seo_title, seo_description: snap.seo_description }).eq("id", snap.pageId);
  for (const s of snap.sections) {
    await db.from("page_sections").update({ content: s.content, sort_order: s.sort_order, visible: s.visible }).eq("id", s.id);
  }
  const now = await listUnder(`pages/${SLUG}`);
  const strays = now.filter((n) => !snap.objects.includes(n)).map((n) => `pages/${SLUG}/${n}`);
  if (strays.length > 0) await db.storage.from("media").remove(strays);
}

// ── The run ─────────────────────────────────────────────────────────────────
let stopServer = null, browser = null, snap = null, pyhId = null, chId = null;

try {
  snap = await snapshot();
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2));

  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { console.error("ERROR: playwright is not installed. Run `npm install`."); process.exit(1); }

  stopServer = await ensureServer();

  const pyhEmail = `editor_pyh_${stamp}@test.com`, chEmail = `editor_ch_${stamp}@test.com`;
  pyhId = await mkUser(pyhEmail);
  chId = await mkUser(chEmail);
  const { data: clusters } = await db.from("clusters").select("id").order("name");
  await db.from("admins").upsert({ user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Editor PYH" }, { onConflict: "user_id" });
  await db.from("admins").upsert({ user_id: chId, role: "cluster_head", cluster_id: clusters[0].id, is_active: true, full_name: "Editor CH" }, { onConflict: "user_id" });

  try { browser = await chromium.launch(); }
  catch (e) {
    console.error(`ERROR: could not launch Chromium (${e.message.split("\n")[0]}).`);
    console.error("The browser binary is not in node_modules. Run:  npx playwright install chromium");
    process.exit(1);
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000); // a cold dev-server route compile is slow
  page.on("dialog", (d) => d.accept()); // delete + remove-image both confirm()

  const signIn = async (p, email) => {
    await p.goto(`${BASE_URL}/admin/login`);
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', PW);
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL((u) => !u.pathname.endsWith("/admin/login"), { timeout: 60_000 });
  };
  // Every control scoped to its own section card. A bare button[aria-expanded]
  // also matches the mobile nav "Toggle menu", which is hidden at desktop
  // widths, so .first() times out on an element that will never be visible.
  const card = (label) => page.locator("div.glass:has(button[aria-expanded])").filter({ hasText: label }).first();
  // p[role=status], not [role=status]: the Next dev overlay mounts its own
  // <div role="status"> static-route indicator, so the bare attribute selector
  // resolves to two elements and Playwright's strict mode throws.
  const notice = () => page.locator('p[role="status"]');
  const publicHtml = async (p) => { await p.goto(`${BASE_URL}/${SLUG}`, { waitUntil: "domcontentloaded" }); return p.content(); };

  await step("Access control", async () => {
    await page.goto(`${BASE_URL}/admin/pages`);
    check("unauthenticated /admin/pages redirects to the login page", page.url().includes("/admin/login"), page.url());
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    check("unauthenticated editor route redirects to the login page", page.url().includes("/admin/login"), page.url());
  });

  await step("The PYH reaches the editor", async () => {
    await signIn(page, pyhEmail);
    check("the PYH signs in and lands on the dashboard", new URL(page.url()).pathname === "/admin", page.url());
    check("the Pages tab is offered to a PYH", await page.getByRole("link", { name: "Pages", exact: true }).count() === 1, null);
    await page.goto(`${BASE_URL}/admin/pages`);
    check("the pages list links to the About editor", await page.locator(`a[href="/admin/pages/${SLUG}/edit"]`).count() === 1, null);
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    check("the editor renders the SEO form", await page.locator('input[name="seo_title"]').count() === 1, null);
  });

  await step("SEO reaches the public <title>", async () => {
    await page.fill('input[name="seo_title"]', `About ${SEO_MARK}`);
    await page.getByRole("button", { name: "Save SEO" }).click();
    check("the SEO title reaches the database",
      await waitDb(async () => (await pageRow()).seo_title === `About ${SEO_MARK}`), (await pageRow()).seo_title);
    check("the editor reports the SEO save", (await notice().innerText()).includes("SEO saved"), null);
    await page.goto(`${BASE_URL}/${SLUG}`);
    check("the SEO title reaches the public <title>", (await page.title()).includes(SEO_MARK), await page.title());
  });

  await step("A content edit reaches the public page", async () => {
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    const hero = card("Hero banner");
    await hero.locator("button[aria-expanded]").click();
    check("the hero section expands", await hero.locator('button[aria-expanded="true"]').count() === 1, null);
    await hero.locator('label:has(span:text-is("Title")) input').fill(`Our Story ${BODY_MARK}`);
    await hero.getByRole("button", { name: "Save section" }).click();
    check("the hero title reaches the database",
      await waitDb(async () => (await sectionsByType()).hero.content.title === `Our Story ${BODY_MARK}`), null);
    check("the editor reports the section save", (await notice().innerText()).includes("Section saved"), null);
    check("the hero title reaches the public page", (await publicHtml(page)).includes(BODY_MARK), null);
  });

  await step("Hiding removes it from the public page", async () => {
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    await card("Hero banner").getByRole("button", { name: "Hide from the public page" }).click();
    check("hiding reaches the database",
      await waitDb(async () => (await sectionsByType()).hero.visible === false), null);
    const hiddenHtml = await publicHtml(page);
    check("a hidden section is gone from the public page", !hiddenHtml.includes(BODY_MARK),
      { foundAt: hiddenHtml.indexOf(BODY_MARK) });
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    check("the editor badges the section as hidden", await card("Hero banner").locator("text=Hidden").count() === 1, null);
    await card("Hero banner").getByRole("button", { name: "Show on the public page" }).click();
    check("showing reaches the database",
      await waitDb(async () => (await sectionsByType()).hero.visible === true), null);
    check("a shown section is back on the public page", (await publicHtml(page)).includes(BODY_MARK), null);
  });

  await step("Reorder changes the rendered order", async () => {
    const before = await sectionsByType();
    const heroOrder = before.hero.sort_order, tiOrder = before["text-image"].sort_order;
    const tiTitle = before["text-image"].content.title;
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    await card("Hero banner").getByRole("button", { name: "Move down" }).click();
    check("moving down swaps the two sort orders in the database",
      await waitDb(async () => {
        const s = await sectionsByType();
        return s.hero.sort_order === tiOrder && s["text-image"].sort_order === heroOrder;
      }), null);
    const swapped = await publicHtml(page);
    // Both must actually be present: a missing marker is indexOf === -1, and
    // `-1 < n` would otherwise report a pass for a page that rendered neither.
    const tiAt = swapped.indexOf(tiTitle), heroAt = swapped.indexOf(BODY_MARK);
    check("the public page renders the swapped order", tiAt >= 0 && heroAt >= 0 && tiAt < heroAt,
      { ti: tiAt, hero: heroAt });
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    await card("Hero banner").getByRole("button", { name: "Move up" }).click();
    check("moving back up restores the original order",
      await waitDb(async () => (await sectionsByType()).hero.sort_order === heroOrder), null);
  });

  await step("Upload, reap, remove", async () => {
    const startObjects = await listUnder(`pages/${SLUG}`);
    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    const ti = card("Text + image");
    await ti.locator("button[aria-expanded]").click();
    await ti.locator('input[type="file"]').setInputFiles({ name: "prove.webp", mimeType: "image/webp", buffer: WEBP });
    check("the upload records an owned object path on the section",
      await waitDb(async () => (await sectionsByType())["text-image"].content.image?.objectPath?.startsWith(`pages/${SLUG}/`)), null);
    const first = (await sectionsByType())["text-image"].content.image.objectPath;
    check("the uploaded object exists in storage", (await listUnder(`pages/${SLUG}`)).includes(first.split("/").pop()), null);
    check("the public page renders the uploaded image", (await publicHtml(page)).includes(first.split("/").pop()), null);

    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    const ti2 = card("Text + image");
    await ti2.locator("button[aria-expanded]").click();
    await ti2.locator('input[type="file"]').setInputFiles({ name: "prove2.webp", mimeType: "image/webp", buffer: WEBP });
    check("a second upload replaces the recorded path",
      await waitDb(async () => {
        const p = (await sectionsByType())["text-image"].content.image?.objectPath;
        return p && p !== first;
      }), null);
    const second = (await sectionsByType())["text-image"].content.image.objectPath;
    check("the replaced object was reaped from storage",
      await waitDb(async () => !(await listUnder(`pages/${SLUG}`)).includes(first.split("/").pop()), 15_000), null);
    check("exactly one uploaded object remains", (await listUnder(`pages/${SLUG}`)).length === startObjects.length + 1, await listUnder(`pages/${SLUG}`));

    await page.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
    const ti3 = card("Text + image");
    await ti3.locator("button[aria-expanded]").click();
    await ti3.getByRole("button", { name: "Remove image" }).click();
    check("removing clears the image from the section content",
      await waitDb(async () => (await sectionsByType())["text-image"].content.image == null), null);
    check("removing deletes the object from storage",
      !(await listUnder(`pages/${SLUG}`)).includes(second.split("/").pop()), null);
    check("storage is back to where it started",
      (await listUnder(`pages/${SLUG}`)).length === startObjects.length, await listUnder(`pages/${SLUG}`));
  });

  await step("A cluster head cannot reach any of it", async () => {
    const chCtx = await browser.newContext();
    try {
      const chPage = await chCtx.newPage();
      chPage.setDefaultTimeout(60_000);
      await signIn(chPage, chEmail);
      check("the cluster head signs in", new URL(chPage.url()).pathname === "/admin", chPage.url());
      check("no Pages tab is offered to a cluster head", await chPage.getByRole("link", { name: "Pages", exact: true }).count() === 0, null);
      await chPage.goto(`${BASE_URL}/admin/pages`);
      check("the cluster head is redirected away from the pages list", chPage.url().includes("/admin?error=forbidden"), chPage.url());
      await chPage.goto(`${BASE_URL}/admin/pages/${SLUG}/edit`);
      check("the cluster head is redirected away from the editor route", chPage.url().includes("/admin?error=forbidden"), chPage.url());
      check("the editor form never renders for a cluster head", await chPage.locator('input[name="seo_title"]').count() === 0, null);
    } finally {
      await chCtx.close();
    }
  });
} catch (e) {
  // Anything outside a step() — fixture setup, or a DB helper between blocks.
  // Recorded rather than thrown so the cleanup below and the totals still run.
  check("the suite ran to completion", false, String(e?.message ?? e).split("\n")[0]);
} finally {
  if (browser) await browser.close().catch(() => {});

  if (snap) {
    console.log("\n── The suite left no trace ──");
    await restore(snap);
    const after = await pageRow();
    check("the page row was restored", after.seo_title === snap.seo_title && after.seo_description === snap.seo_description,
      { seo_title: after.seo_title });
    const byId = Object.fromEntries(after.page_sections.map((s) => [s.id, s]));
    const drifted = snap.sections.filter((s) => {
      const now = byId[s.id];
      return !now || now.visible !== s.visible || now.sort_order !== s.sort_order
        || JSON.stringify(now.content) !== JSON.stringify(s.content);
    });
    check("every section was restored field for field", drifted.length === 0, drifted.map((d) => d.id));
    check("no uploaded objects were left in storage",
      (await listUnder(`pages/${SLUG}`)).length === snap.objects.length, await listUnder(`pages/${SLUG}`));
  }

  await dropUser(pyhId);
  await dropUser(chId);
  const { data: leftAdmins } = await db.from("admins").select("user_id").in("user_id", [pyhId, chId].filter(Boolean));
  check("the throwaway accounts were removed", (leftAdmins?.length ?? 0) === 0, leftAdmins);

  if (stopServer) stopServer();
}

const ran = pass + fail;
if (ran !== EXPECTED_ASSERTIONS) {
  console.log(`  FAIL  every assertion ran  got=${ran} of ${EXPECTED_ASSERTIONS}`);
  fail++;
}
console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
if (fail === 0 && existsSync(SNAPSHOT_FILE)) unlinkSync(SNAPSHOT_FILE);
else if (fail > 0) console.log(`snapshot kept at ${SNAPSHOT_FILE}`);
process.exit(fail === 0 ? 0 : 1);
