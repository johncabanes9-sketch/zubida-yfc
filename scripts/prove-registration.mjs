// Proves a member can actually register for an event, through the real public
// form in a real browser — the one path the rest of the suites never walk.
//
// Why this exists: the consent checkbox shipped without a `name` attribute, so
// `new FormData(form)` omitted it, the payload always carried `consent: false`,
// and `registrationSchema` rejected every submission with "Consent is required".
// The public form could not be submitted at all. Nothing caught it, because:
//   - prove:behaviors and prove:concurrency call register_for_event() directly,
//     so they never build a FormData;
//   - prove:content only greps the markup;
//   - tsc, lint and build are all clean for a missing attribute.
// Only driving the real form finds this class of bug, so that is what this does.
//
//   npm run prove:registration
//   BASE_URL=http://localhost:3000 npm run prove:registration   (reuse a server)
//
// Needs a Chromium binary that `npm ci` does not install:
//   npx playwright install chromium
//
// CAVEAT — captcha: /api/register skips Turnstile when TURNSTILE_SECRET_KEY is
// unset ("degraded mode"). It is unset in .env.local, so this suite exercises
// the degraded branch. Nothing in src/ ever renders a Turnstile widget, so
// `cf-turnstile-response` is always absent and setting that secret in a
// deployed environment would fail EVERY registration with CAPTCHA_FAILED.
// This suite cannot see that; it is a deployment-config check, not a code one.
//
// The test event is created directly in the database and hard-deleted in a
// `finally`, so it is visible on the public site only while the suite runs.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Unique per run, so a crashed run is always distinguishable from a live event. */
const STAMP = Date.now().toString(36).toUpperCase();
const EVENT_NAME = `AUTOMATED TEST EVENT ${STAMP} — NOT A REAL EVENT`;
const EMAIL = `prove-registration+${STAMP}@example.com`;
const REG_CODE = /^ZYFC-[0-9A-F]{4}-\d{4}$/;

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});
const q = (sql, params) => pool.query(sql, params);

let pass = 0;
let fail = 0;
const check = (n, c, got) =>
  c
    ? (pass++, console.log(`  PASS  ${n}`))
    : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// Reuse whatever is already answering on BASE_URL; only spawn when nothing is.
async function answering() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await answering()) {
    console.log(`  reusing the server already on ${BASE_URL}`);
    return null;
  }
  const port = new URL(BASE_URL).port || "3000";
  console.log(`  nothing on ${BASE_URL} — starting next dev (first compile is slow)`);
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--port", port],
    { cwd: root, stdio: "ignore", env: process.env },
  );
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await answering()) {
      console.log("  server is up");
      return () => {
        if (process.platform === "win32")
          spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else {
          try {
            process.kill(-child.pid);
          } catch {
            child.kill("SIGKILL");
          }
        }
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("the dev server did not start within 180s");
}

async function createEvent() {
  const { rows } = await q(
    `insert into events (name, date, time, venue, organizer, description,
                         registration_deadline, slots_total, slots_taken, status, scope)
     values ($1, current_date + 7, '9:00 AM',
             'Automated test — not a real venue', 'Zubida YFC verification suite',
             'Created by npm run prove:registration. Deleted automatically when the suite finishes.',
             now() + interval '1 day', 5, 0, 'Open', 'Provincial')
     returning id`,
    [EVENT_NAME],
  );
  return rows[0].id;
}

/** Deletes every event this suite has ever created, including ones a crashed
 *  run left behind. Named-prefix matching is deliberate: an event this suite
 *  abandons is live on the public site until something removes it. */
async function sweepStale() {
  const { rows } = await q(
    `select id, name from events where name like 'AUTOMATED TEST EVENT %'`,
  );
  for (const r of rows) {
    console.log(`  sweeping a leftover test event: ${r.id} (${r.name})`);
    await cleanup(r.id, true);
  }
  return rows.length;
}

async function cleanup(eventId, quiet = false) {
  const { rows } = await q(
    `select registration_id from event_registrations where event_id = $1`,
    [eventId],
  );
  for (const r of rows)
    await q(`delete from email_log where registration_id = $1`, [r.registration_id]);
  await q(`delete from event_registrations where event_id = $1`, [eventId]);
  await q(`delete from events where id = $1`, [eventId]);
  const { rows: left } = await q(`select id from events where id = $1`, [eventId]);
  if (quiet) {
    if (left.length) throw new Error(`could not delete leftover event ${eventId}`);
    return;
  }
  check("cleanup: the test event is gone from the database", left.length === 0, left.length);
}

(async () => {
  let stop = null;
  let eventId = null;

  // --cleanup-only: remove anything a crashed run left on the live site, and stop.
  if (process.argv.includes("--cleanup-only")) {
    const n = await sweepStale();
    console.log(n === 0 ? "  nothing to sweep — no test events in the database" : `  swept ${n}`);
    await pool.end();
    process.exit(0);
  }

  try {
    await sweepStale();
    eventId = await createEvent();
    console.log(`  created test event ${eventId}`);
    stop = await ensureServer();

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const consoleErrors = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

    await page.goto(`${BASE_URL}/events`, { waitUntil: "networkidle" });

    // The card for our event, then its Register button.
    const card = page.locator("article", { hasText: EVENT_NAME }).first();
    check("the new event appears on the public /events page", await card.count() > 0);
    await card.getByRole("button", { name: "Register" }).first().click();

    // The card's Register button opens the modal on its Details tab, not on the
    // form — the form is one more click away.
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 15_000 });

    // prove:a11y covers all 8 public pages but can never reach this modal: it
    // runs without a database, so no event exists to open. The entire
    // registration surface sits in its blind spot, so it is checked here.
    check("the modal exposes dialog semantics", await dialog.count() === 1);
    check(
      "the dialog is modal",
      (await dialog.getAttribute("aria-modal")) === "true",
      await dialog.getAttribute("aria-modal"),
    );
    check(
      "the dialog has an accessible name",
      ((await dialog.getAttribute("aria-label")) ?? "").includes(EVENT_NAME),
      await dialog.getAttribute("aria-label"),
    );

    // Focus must start inside the dialog and stay there. Without a trap, Tab
    // walks out into the page behind the overlay, where a sighted keyboard user
    // cannot see what is focused.
    const focusInsideOnOpen = await dialog.evaluate((d) => d.contains(document.activeElement));
    check("focus moves into the dialog when it opens", focusInsideOnOpen);
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    const focusStillInside = await dialog.evaluate((d) => d.contains(document.activeElement));
    check("Tab is trapped inside the dialog (25 presses)", focusStillInside);
    check(
      "the page behind the dialog cannot scroll",
      (await page.evaluate(() => document.body.style.overflow)) === "hidden",
      await page.evaluate(() => document.body.style.overflow),
    );

    await dialog.getByRole("button", { name: /^Register Now$/ }).click();
    const form = page.locator('form:has([name="fullName"])');
    await form.waitFor({ state: "visible", timeout: 15_000 });

    // --- Regression guard for the shipped consent bug -----------------------
    // The bug was invisible in the rendered UI: the checkbox looked and behaved
    // normally, it was simply absent from the FormData. Assert the serialised
    // payload, not the markup.
    await form.getByRole("checkbox", { name: /consent|agree|permission/i }).first().check();
    const consentSerialises = await form.evaluate(
      (f) => new FormData(f).get("consent") === "on",
    );
    check("consent is present in FormData when checked (the 588beb7 bug)", consentSerialises);

    // The progress bar must count on mount, not on first keystroke.
    const progressBefore = await page.getByText(/of \d+ required fields/).first().textContent();
    check(
      "progress bar reports a non-zero total before any input",
      /of ([1-9]\d*) required fields/.test(progressBefore ?? ""),
      progressBefore,
    );

    // --- Fill every required control ---------------------------------------
    await form.locator('[name="fullName"]').fill("Prove Registration");
    await form.locator('[name="birthdate"]').fill("2006-05-04");
    await form.locator('[name="age"]').fill("19");
    await form.locator('[name="email"]').fill(EMAIL);
    await form.locator('[name="phone"]').fill("09171234567");
    // Chapter is a <select> of published chapters, or free text when there are
    // none. Pick whichever real option exists rather than naming one: the old
    // hardcoded list was invented and is gone.
    const chapter = form.locator('[name="chapter"]');
    if ((await chapter.evaluate((el) => el.tagName)) === "SELECT") {
      const firstReal = await chapter.evaluate(
        (el) => [...el.options].find((o) => o.value !== "")?.value ?? "",
      );
      await chapter.selectOption(firstReal);
    } else {
      await chapter.fill("Prove Registration Chapter");
    }
    await form.locator('[name="emContact"]').fill("Test Guardian");
    await form.locator('[name="emNumber"]').fill("09181234567");

    // Attach the rejection handler at creation. Awaited later, but if the click
    // below hangs, an unhandled rejection here kills the process before the
    // `finally` can delete the event off the live public site.
    const res = page
      .waitForResponse(
        (r) => r.url().includes("/api/register") && r.request().method() === "POST",
        { timeout: 30_000 },
      )
      .catch((e) => e);

    // NOT getByRole(/register|submit/i): the modal's sticky header carries a
    // "Register" TAB button, which precedes the submit button in DOM order, so
    // `.first()` clicks the tab and no POST is ever sent.
    await form.locator('button[type="submit"]').click();

    const response = await res;
    if (response instanceof Error) throw new Error(`no POST to /api/register: ${response.message}`);
    const payload = await response.json().catch(() => ({}));

    check("POST /api/register returns 200", response.status() === 200, {
      status: response.status(),
      code: payload.code,
      message: payload.message,
    });
    check(
      'the response is NOT the consent rejection ("Consent is required")',
      payload.code !== "INVALID",
      payload.message,
    );
    check("the response carries ok:true", payload.ok === true, payload);
    check(
      "the response carries a well-formed registration id",
      REG_CODE.test(payload.registration_id ?? ""),
      payload.registration_id,
    );
    check(
      "the response carries a QR data URL",
      (payload.qr ?? "").startsWith("data:image/"),
      (payload.qr ?? "").slice(0, 32),
    );

    // --- The success panel the member actually sees -------------------------
    // The heading is "You&apos;re registered!" — a U+2019, not an ASCII quote.
    await page.getByText(/re registered!/i).first().waitFor({ timeout: 15_000 });
    check("the success panel replaces the form", (await form.count()) === 0);
    const shownId = await page.locator("p.font-mono").first().textContent();
    check(
      "the registration id is shown to the member",
      shownId?.trim() === payload.registration_id,
      { shownId: shownId?.trim(), expected: payload.registration_id },
    );
    const qrSrc = await page.getByAltText(/registration QR code/i).getAttribute("src");
    check("the QR image renders from a data URL", (qrSrc ?? "").startsWith("data:image/"));

    // The overlay closes on click; a keyboard user needs Escape or there is no
    // way out of the dialog at all.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600); // the exit animation
    check("Escape closes the dialog", (await page.getByRole("dialog").count()) === 0);
    check(
      "body scroll is restored on close",
      (await page.evaluate(() => document.body.style.overflow)) !== "hidden",
      await page.evaluate(() => document.body.style.overflow),
    );
    check(
      "focus returns to the card control that opened the dialog",
      await page.evaluate(() => document.activeElement?.closest("article") !== null),
    );

    // --- The database agrees ------------------------------------------------
    const { rows } = await q(
      `select registration_id, consent, status, email, event_id
         from event_registrations where event_id = $1`,
      [eventId],
    );
    check("exactly one registration row was written", rows.length === 1, rows.length);
    check("the row records consent = true", rows[0]?.consent === true, rows[0]?.consent);
    check("the row records the submitted email", rows[0]?.email === EMAIL, rows[0]?.email);
    const { rows: ev } = await q(`select slots_taken from events where id = $1`, [eventId]);
    check("the event's slots_taken incremented to 1", ev[0]?.slots_taken === 1, ev[0]?.slots_taken);

    check("no console errors during the flow", consoleErrors.length === 0, consoleErrors);

    await browser.close();
  } catch (e) {
    fail++;
    console.log(`  FAIL  the suite threw: ${e.message}`);
  } finally {
    // Cleanup must run even on a thrown assertion — otherwise a test event is
    // left sitting on the live public site.
    if (eventId) await cleanup(eventId).catch((e) => {
      fail++;
      console.log(`  FAIL  cleanup threw, A TEST EVENT MAY BE LIVE: ${e.message}`);
    });
    if (stop) stop();
    await pool.end();
  }

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
