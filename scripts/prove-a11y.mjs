// Proves the public site's accessibility floor in a real browser, at a phone
// viewport. No database required — every page renders its withheld/empty state
// when there is nothing published, and the floor has to hold there too.
//
//   1. One <main>, one <h1>, a lang on <html>.
//   2. No heading level is skipped.
//   3. Every <img> carries an alt; every link and button has an accessible name.
//   4. Every visible target clears the 24x24 CSS px floor (WCAG 2.5.8).
//   5. The first Tab stop shows a visible focus ring.
//
//   npm run prove:a11y
//   BASE_URL=http://localhost:3000 npm run prove:a11y   (reuse a server)
//
// Needs a Chromium binary that `npm ci` does not install:
//   npx playwright install chromium
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const PATHS = ["/", "/about", "/events", "/leaders", "/chapters", "/gallery", "/news", "/contact"];
/** WCAG 2.2 SC 2.5.8 Target Size (Minimum). */
const MIN_TARGET_PX = 24;

let pass = 0,
  fail = 0;
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

/** Runs inside the page. Returns findings rather than asserting, so every
 *  assertion below reads the same way as the other prove:* suites. */
function audit(minTarget) {
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
  };
  const accessibleName = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim() ||
    (el.querySelector("img")?.getAttribute("alt") || "").trim();

  const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter(visible)
    .map((h) => Number(h.tagName[1]));
  const skips = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) skips.push(`h${levels[i - 1]}->h${levels[i]}`);
  }

  const tooSmall = [...document.querySelectorAll("a,button,[role=button]")]
    .filter(visible)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.height < minTarget || r.width < minTarget))
    .map(({ el, r }) =>
      `${el.tagName}:"${accessibleName(el).slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
    );

  return {
    mains: document.querySelectorAll("main").length,
    h1s: document.querySelectorAll("h1").length,
    imgsNoAlt: [...document.querySelectorAll("img")].filter(
      (i) => i.getAttribute("alt") === null,
    ).length,
    unnamed: [...document.querySelectorAll("a,button")]
      .filter(visible)
      .filter((el) => !accessibleName(el))
      .map((el) => el.outerHTML.slice(0, 90)),
    skips,
    tooSmall,
    lang: document.documentElement.lang || null,
  };
}

let browser, stop;
try {
  stop = await ensureServer();
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error(`ERROR: could not launch Chromium (${e.message.split("\n")[0]}).`);
    console.error("The browser binary is not in node_modules. Run:  npx playwright install chromium");
    process.exit(1);
  }

  for (const path of PATHS) {
    // A phone viewport on purpose: the target-size floor is the assertion most
    // likely to regress, and it only bites where the layout is narrowest.
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(BASE_URL + path, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(800);

    const r = await page.evaluate(audit, MIN_TARGET_PX);

    check(`${path} has exactly one <main>`, r.mains === 1, r.mains);
    check(`${path} has exactly one <h1>`, r.h1s === 1, r.h1s);
    check(`${path} declares a language`, r.lang !== null, r.lang);
    check(`${path} gives every image an alt`, r.imgsNoAlt === 0, r.imgsNoAlt);
    check(`${path} names every link and button`, r.unnamed.length === 0, r.unnamed);
    check(`${path} skips no heading level`, r.skips.length === 0, r.skips);
    check(
      `${path} keeps every target at ${MIN_TARGET_PX}px or more`,
      r.tooSmall.length === 0,
      r.tooSmall,
    );

    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "nothing focused";
      const s = getComputedStyle(el);
      const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      return ring || s.boxShadow !== "none" ? true : `no visible ring on ${el.tagName}`;
    });
    check(`${path} shows a focus ring on the first Tab stop`, focus === true, focus);

    await ctx.close();
  }
} finally {
  await browser?.close();
  stop?.();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
