// Proves information-accuracy invariants across the app. No database required —
// every assertion is about the source of truth for user-facing content:
//
//   1. Organization identity resolves to exactly one value everywhere.
//   2. The DB-outage fallback and the migration seed cannot drift apart.
//   3. No published surface renders placeholder media or unverified claims.
//   4. Phase-1 demo fixtures stay behind their publication gate.
//
// Companion to ZUBIDA_CONTENT_AUDIT.md. Run: npm run prove:content
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// Assertions about what a file *renders* must ignore comments — a comment that
// names the province or quotes a retired figure is documentation, not output.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (p) => stripComments(read(p));

const { SITE } = await import("../src/lib/constants.ts");
const { PAGE_FALLBACK } = await import("../src/lib/pages/fallback.ts");
const { isVerified } = await import("../src/lib/content/fixtures.ts");

let pass = 0, fail = 0;
const check = (n, c, got) =>
  c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// ── 1. Identity has a single source of truth ───────────────────────────────
// The 0013 seed says its values are copied verbatim from SITE. If they drift,
// the site shows one set of details when the DB is up and another when it is
// down — the exact conflicting-contact-information failure the audit checked for.
const seed = read("supabase/migrations/0013_site_settings.sql");
const seedHas = (v) => seed.includes(v.replace(/'/g, "''"));

for (const [field, value] of Object.entries({
  name: SITE.name,
  fullName: SITE.fullName,
  tagline: SITE.tagline,
  description: SITE.description,
  province: SITE.province,
  email: SITE.email,
  phone: SITE.phone,
  office: SITE.office,
  facebook: SITE.socials.facebook,
  instagram: SITE.socials.instagram,
})) {
  check(`site_settings seed matches SITE.${field}`, seedHas(value), value);
}

// Chrome must read identity from settings, never restate it. A hardcoded copy
// silently survives a rename in /admin/settings.
const navbar = code("src/components/layout/navbar.tsx");
const hero = code("src/components/home/hero.tsx");
check("navbar does not hardcode the province", !navbar.includes(SITE.province), SITE.province);
check("navbar does not hardcode the org name", !navbar.includes(`>${SITE.name}<`), SITE.name);
check("hero does not hardcode the province", !hero.includes(SITE.province), SITE.province);
check(
  "hero does not hardcode the org name",
  !/Welcome to[\s\S]{0,120}Zubida YFC/.test(hero),
  null,
);

// ── 2. Fallback mirrors the migrations ─────────────────────────────────────
// getPage() serves PAGE_FALLBACK whenever the DB is unreachable. Whatever it
// contains is published as fact during an outage, so it carries the same bar as
// the database.
const about = PAGE_FALLBACK.about;
check("About fallback exists", !!about && Array.isArray(about.sections), null);

const aboutJson = JSON.stringify(about);
check(
  "About fallback renders no unverified history timeline",
  !about.sections.some((s) => s.type === "timeline"),
  about.sections.map((s) => s.type),
);
check(
  "About fallback states no unverified chapter count",
  !/twenty-six chapters|26 chapters/i.test(aboutJson),
  null,
);
check(
  "About fallback embeds no placeholder imagery",
  !/picsum\.photos|pravatar\.cc/.test(aboutJson),
  null,
);

// Migration 0017 must actually withhold the same things in the database.
const m17 = read("supabase/migrations/0017_about_unverified_content.sql");
check("migration 0017 hides the timeline section", /type = 'timeline'[\s\S]*visible = false|visible = false[\s\S]*type = 'timeline'/.test(m17), null);
check("migration 0017 removes the picsum About image", m17.includes("picsum.photos"), null);
check("migration 0017 rewrites the chapter-count sentence", m17.includes("twenty-six chapters"), null);

// ── 3. Placeholder media is never rendered unconditionally ─────────────────
// The fixture modules may keep their stock URLs; the surfaces that render them
// must be gated.
for (const page of ["leaders", "chapters", "news", "gallery"]) {
  const src = read(`src/app/${page}/page.tsx`);
  check(
    `/${page} gates its fixture content behind isVerified`,
    src.includes("isVerified") && src.includes("UnpublishedNotice"),
    null,
  );
}

const home = read("src/app/page.tsx");
for (const section of ["NewsPreview", "FeaturedPhotos", "Testimonials"]) {
  check(
    `homepage renders <${section}/> only when its content is verified`,
    new RegExp(`isVerified\\([^)]*\\)\\s*&&\\s*<${section}`).test(home),
    null,
  );
}
check(
  "hero photography is gated",
  /showPhotos\s*&&/.test(hero) && hero.includes("isVerified"),
  null,
);

// ── 4. Fixture gates stay shut until content is confirmed ──────────────────
// These flip only when an administrator supplies verified content — and the
// domain should move to a managed table at that point, not stay a fixture.
for (const domain of ["leaders", "chapters", "news", "gallery", "testimonials", "aboutHistory", "photography"]) {
  check(`fixture domain "${domain}" is not published as fact`, isVerified(domain) === false, domain);
}

// ── 5. Statistics are derived, never asserted ──────────────────────────────
const statsBand = read("src/components/home/stats-band.tsx");
check(
  "stats band reads from the database, not from src/data/stats.ts",
  statsBand.includes("getSiteStats") && !statsBand.includes('from "@/data/stats"'),
  null,
);
const statsLib = code("src/lib/data/stats.ts");
check(
  "derived stats contain no hardcoded figures",
  !/\b(26|4200|4,200|58|340)\b/.test(statsLib),
  null,
);

// ── 6. Events are records, not chrome ──────────────────────────────────────
const eventsLib = read("src/lib/data/events.ts");
check(
  "getEvents no longer falls back to Phase-1 mock events",
  !eventsLib.includes("@/data/events"),
  null,
);
check(
  "getEvents distinguishes an empty schedule from an unreachable one",
  eventsLib.includes('"unavailable"') && eventsLib.includes('"ok"'),
  null,
);

// ── 7. Admin figures are counted, not sampled ──────────────────────────────
const dashboard = read("src/app/admin/page.tsx");
check(
  "dashboard stats use exact counts rather than the fetched page length",
  dashboard.includes('count: "exact"') && !/const total = rows\.length/.test(dashboard),
  null,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
