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

/** "rgb(r, g, b)" / "rgba(r, g, b, a)" -> [r, g, b]. Alpha is ignored: the
 *  colours measured here are opaque or near enough that it can't flip a 3:1. */
const parseRgb = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = ([r, g, b]) => {
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The real painted background behind each sampled element: hide its ink,
 *  screenshot just its box, average the pixels in an in-page canvas. This sees
 *  gradients, overlays and stacking bugs that computed styles cannot. */
async function sampleBehind(page, samples) {
  const out = {};
  for (const [key, s] of Object.entries(samples)) {
    if (!s || typeof s !== "object" || !s.box?.w) continue;
    const sel = key === "h1" ? "main h1" : 'header button[aria-label^="Switch to"]';
    await page.addStyleTag({ content: `${sel}, ${sel} * { color: transparent !important; -webkit-text-fill-color: transparent !important; }` });
    const png = await page.screenshot({ clip: { x: s.box.x, y: s.box.y, width: s.box.w, height: s.box.h } });
    await page.evaluate(() => document.head.lastElementChild?.remove());
    out[key] = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
      return sum.map((v) => Math.round(v / (d.length / 4)));
    }, png.toString("base64"));
  }
  return out;
}

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

  // Officers and admins are youth volunteers, not people who keep a bookmark,
  // so the way in to /admin/login is a visible "Log in" in the navbar (a pill
  // at lg+, an item in the menu below that), with the footer link as a quieter
  // second door. Their size is governed by the target-size assertion above.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 90_000 });
    const desk = await page.evaluate(() => {
      const el = document.querySelector('header a[href="/admin/login"]');
      return {
        found: el !== null,
        shown: el ? el.getBoundingClientRect().width > 0 : false,
        name: el ? (el.getAttribute("aria-label") || el.textContent || "").trim() : null,
        footer: document.querySelector('footer a[href="/admin/login"]') !== null,
      };
    });
    check("desktop navbar shows a Log in link to admin sign-in", desk.found && desk.shown, desk);
    check("its accessible name starts with its visible text (label-in-name)", /^Log in/.test(desk.name ?? ""), desk);
    check("the footer still offers a way in to admin sign-in", desk.footer, desk);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 90_000 });
    const hiddenBefore = await page.evaluate(() =>
      [...document.querySelectorAll('header a[href="/admin/login"]')].every((el) => el.getBoundingClientRect().width === 0),
    );
    await page.getByRole("button", { name: "Toggle menu" }).click();
    const inMenu = page.locator('#mobile-menu a[href="/admin/login"]');
    await inMenu.waitFor({ state: "visible" });
    check("on a phone the Log in link waits inside the menu", hiddenBefore && (await inMenu.isVisible()), { hiddenBefore });
    await ctx.close();
  }

  // Light mode over the navy headers. The home hero's overlays once painted
  // behind an ancestor's cream background (no stacking context), leaving white
  // copy on cream; and the transparent navbar kept light-mode slate controls
  // over navy. axe can't see either — it gives up on gradient and overlapped
  // backgrounds — so measure the real pixels behind the text instead.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: "light" });
    await ctx.addInitScript(() => {
      try { localStorage.setItem("zubida-theme", "light"); } catch {}
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    for (const path of ["/", "/about"]) {
      await page.goto(BASE_URL + path, { waitUntil: "networkidle", timeout: 90_000 });
      await page.waitForTimeout(1500);
      const samples = await page.evaluate(() => {
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const fg = (el) => getComputedStyle(el).color;
        const h1 = document.querySelector("main h1");
        const toggle = document.querySelector('header button[aria-label^="Switch to"]');
        return {
          h1: h1 && { color: fg(h1), box: rect(h1) },
          toggle: toggle && { color: fg(toggle), box: rect(toggle) },
          atTop: document.querySelector("header")?.getAttribute("data-at-top"),
        };
      });
      const bg = await sampleBehind(page, samples);
      for (const key of ["h1", "toggle"]) {
        const ratio = bg[key] && samples[key] ? contrast(parseRgb(samples[key].color), bg[key]) : 0;
        const floor = 3; // large text (1.4.3) and UI components (1.4.11)
        check(`light mode ${path}: ${key} clears ${floor}:1 over the header`, ratio >= floor, { ratio: +ratio.toFixed(2), color: samples[key]?.color, bg: bg[key] });
      }
    }
    await ctx.close();
  }
} finally {
  await browser?.close();
  stop?.();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
