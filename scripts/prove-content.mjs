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
// Same rule for SQL: a `--` line explaining which invented event was retired is
// documentation, not something the file inserts.
const sql = (p) => read(p).replace(/^\s*--.*$/gm, "");
// A file or module that does not exist yet must fail the assertion that needs
// it, not crash the suite before the other seventy have run.
const tryRead = (p) => { try { return read(p); } catch { return ""; } };
const trySql = (p) => tryRead(p).replace(/^\s*--.*$/gm, "");
const tryImport = async (p) => { try { return await import(p); } catch { return null; } };

const { SITE } = await import("../src/lib/constants.ts");
const { PAGE_FALLBACK } = await import("../src/lib/pages/fallback.ts");
const { isVerified } = await import("../src/lib/content/fixtures.ts");

// The Phase-1 contact stand-ins, named once. They are still spelled out in the
// 0013 seed and in 0022's guard, so the suite needs the literals to check both.
const PLACEHOLDER_PHONE = "+63 962 000 0000";
const PLACEHOLDER_EMAIL = "hello@zubidayfc.org";

let pass = 0, fail = 0;
const check = (n, c, got) =>
  c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// ── 1. Identity has a single source of truth ───────────────────────────────
// The 0013 seed says its values are copied verbatim from SITE. If they drift,
// the site shows one set of details when the DB is up and another when it is
// down — the exact conflicting-contact-information failure the audit checked for.
const seed = read("supabase/migrations/0013_site_settings.sql");
// A blank never counts as a match: `"".includes("")` is true, so a withheld
// value would sail through this loop having proved nothing. That vacuous-pass
// trap has already cost this audit two assertions (§7.1).
const seedHas = (v) => v !== "" && seed.includes(v.replace(/'/g, "''"));

for (const [field, value] of Object.entries({
  name: SITE.name,
  fullName: SITE.fullName,
  tagline: SITE.tagline,
  description: SITE.description,
  province: SITE.province,
  office: SITE.office,
  facebook: SITE.socials.facebook,
  instagram: SITE.socials.instagram,
})) {
  check(`site_settings seed matches SITE.${field}`, seedHas(value), value);
}

// email and phone are deliberately absent from that loop. They are withheld
// rather than matched, and 0013 still carries the stand-ins it seeded — §9
// asserts that both sides are now blank instead.

// site_url arrived in 0018, not the 0013 seed.
const m18 = read("supabase/migrations/0018_site_url.sql");
check("0018 seeds site_url to match SITE.url", m18.includes(SITE.url), SITE.url);

// Chrome must read identity from settings, never restate it. A hardcoded copy
// silently survives a rename in /admin/settings.
const navbar = code("src/components/layout/navbar.tsx");
const hero = code("src/components/home/hero.tsx");
check("navbar does not hardcode the province", !navbar.includes(SITE.province), SITE.province);
check("navbar does not hardcode the org name", !navbar.includes(`>${SITE.name}<`), SITE.name);
check("hero does not hardcode the province", !hero.includes(SITE.province), SITE.province);

// metadataBase drives canonical links and OG image URLs on every page. It must
// come from settings so a wrong domain is a settings edit, not a redeploy — but
// the constant is still allowed as the fallback for a malformed stored value.
const layout = code("src/app/layout.tsx");
check(
  "layout reads metadataBase from settings",
  /metadataBase\(site\.siteUrl\)/.test(layout),
  null,
);
check(
  "layout does not inline the canonical domain",
  !new RegExp(`new URL\\(\\s*["']${SITE.url}`).test(layout),
  SITE.url,
);
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

// The fallback is not the only way invented history could reach a page. The
// Timeline component carried the same six milestones as a DEFAULT parameter, so
// any caller that omitted the prop would publish them — including the retired
// "26 chapters" figure — without touching the database or the fallback. The
// section renderer always passes content.milestones today, which is exactly why
// the default was invisible. A required prop makes the omission a build error
// instead of a silent republication.
const timelineComponent = code("src/components/about/timeline.tsx");
check(
  "the timeline component supplies no default milestones",
  !/milestones\s*=\s*[A-Za-z_$]/.test(timelineComponent),
  null,
);
check(
  "the timeline component asserts no chapter count of its own",
  !/twenty-six chapters|26 chapters/i.test(timelineComponent),
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
for (const page of ["leaders", "news", "gallery"]) {
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
for (const domain of ["leaders", "news", "gallery", "testimonials", "aboutHistory", "photography"]) {
  check(`fixture domain "${domain}" is not published as fact`, isVerified(domain) === false, domain);
}

// The chapters directory moved out of the fixture system entirely (Task 4): the
// fixture file is deleted, "chapters" is no longer a FixtureDomain, and the page
// reads the database directly instead of gating on isVerified().
check("the chapters fixture is deleted", tryRead("src/data/chapters.ts") === "", null);
check(
  "chapters is no longer a fixture domain",
  !/"chapters"/.test(read("src/lib/content/fixtures.ts")),
  null,
);
check(
  "the chapters page reads the database, not the fixture",
  code("src/app/chapters/page.tsx").includes("getChapters") &&
    !code("src/app/chapters/page.tsx").includes("isVerified"),
  null,
);
// An empty directory must withhold, not render an empty grid. Asserted at the
// source because the alternative is a browser, and prove:editor already owns
// that cost for the one page that needs it.
check(
  "an empty chapters list renders the withholding notice",
  /chapters\.length\s*>\s*0\s*\?/.test(code("src/app/chapters/page.tsx")) &&
    code("src/app/chapters/page.tsx").includes("UnpublishedNotice"),
  null,
);

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

// The audit's events check was originally run with the database DOWN, which only
// exercised the fallback path. With the database UP, `seed.sql` had already put
// four fabricated Phase-1 events into `events` — so removing the code fallback
// did not stop them being served; it promoted them from stand-ins to records with
// a working Register button. The seed is the remaining way they come back.
const seedSql = sql("supabase/seed.sql");
for (const invented of [
  "Camp Abelardo",
  "ICON: Ignite Conference",
  "Zubida Provincial Youth Camp",
  "Christian Life Seminar",
  "Household Leaders",
  "26 chapters",
  "picsum.photos",
]) {
  check(`seed.sql does not insert "${invented}"`, !seedSql.includes(invented), invented);
}

// A seed that re-runs on every `db:migrate` cannot be trusted to stay empty by
// convention alone — applying it must be an explicit choice.
const migrator = code("scripts/db-migrate.mjs");
check(
  "db:migrate applies the seed only when --seed is passed",
  /if\s*\(\s*seedOnly\s*\)\s*await applySeed\(\)/.test(migrator),
  null,
);

// And the rows already sitting in the database have to be retired, not just
// prevented from being re-inserted.
const m19 = sql("supabase/migrations/0019_retire_demo_events.sql");
check("migration 0019 soft-deletes the seeded demo events", /deleted_at\s*=\s*now\(\)/.test(m19), null);
check("migration 0019 retires the load-test event", m19.includes("CONCURRENCY TEST"), null);
check(
  "migration 0019 only touches rows still carrying the seed signature",
  m19.includes("picsum.photos") && m19.includes("deleted_at is null"),
  null,
);

// ── 7. Admin figures are counted, not sampled ──────────────────────────────
const dashboard = read("src/app/admin/page.tsx");
check(
  "dashboard stats use exact counts rather than the fetched page length",
  dashboard.includes('count: "exact"') && !/const total = rows\.length/.test(dashboard),
  null,
);

// ── 8. Settings validation rejects malformed contact details ───────────────
const { siteSettingsSchema } = await import("../src/lib/validation/site.ts");
const validSettings = {
  name: SITE.name, full_name: SITE.fullName, tagline: SITE.tagline,
  description: SITE.description, province: SITE.province, site_url: SITE.url,
  // Concrete values, not SITE.email/SITE.phone: this section is about whether
  // the shape rules hold, and those constants are now deliberately blank (§9).
  // Seeding the fixture from them would turn every case below into a test of
  // blank-handling instead.
  email: "office@example.org", phone: "+63 917 123 4567", office: SITE.office,
  facebook_url: SITE.socials.facebook, instagram_url: SITE.socials.instagram,
  footer_explore_heading: "Explore", footer_reach_heading: "Reach Us",
  footer_closing_line: "Line",
};
const accepts = (patch) => siteSettingsSchema.safeParse({ ...validSettings, ...patch }).success;

check("accepts the current settings", accepts({}), null);
check("rejects a site URL with no scheme", !accepts({ site_url: "zubidayfc.org" }), null);
check("rejects a relative site URL", !accepts({ site_url: "/home" }), null);
check("rejects a malformed email", !accepts({ email: "hello@" }), null);
check("rejects a social URL that is not a URL", !accepts({ facebook_url: "facebook/zubidayfc" }), null);
check("allows a blank social URL (hides the icon)", accepts({ facebook_url: "" }), null);
check("rejects a phone containing words", !accepts({ phone: "call the office" }), null);
check("rejects a phone with too few digits", !accepts({ phone: "+63 12" }), null);
check("accepts a normally punctuated phone", accepts({ phone: "+63 (962) 123-4567" }), null);

// Stated plainly: shape validation cannot tell a well-formed placeholder from a
// real number. `+63 962 000 0000` passes — which is why §9 withholds it instead
// of trying to validate it away.
check(
  "shape validation alone does not catch a placeholder number",
  accepts({ phone: PLACEHOLDER_PHONE }),
  null,
);

// Withholding has to be expressible, or the only way to stop publishing a
// placeholder is to invent a replacement for it.
check("allows a blank email (withholds the address)", accepts({ email: "" }), null);
check("allows a blank phone (withholds the number)", accepts({ phone: "" }), null);
check("still rejects a malformed non-blank email", !accepts({ email: "hello@" }), null);
check("still rejects a malformed non-blank phone", !accepts({ phone: "+63 12" }), null);

// ── 9. Contact details are withheld until the office confirms them ─────────
// `+63 962 000 0000` and `hello@zubidayfc.org` were Phase-1 stand-ins that
// reached production. Every other unverified claim was withheld; these were
// published, because a well-formed placeholder looks exactly like a real value.
// The fix is to stop rendering them: blank in the constants, blank in the
// database, and no element at all on the page.

check("SITE withholds the placeholder phone", SITE.phone === "", SITE.phone);
check("SITE withholds the placeholder email", SITE.email === "", SITE.email);

// The outage fallback is the other door into production (§7.1). A blank stored
// value must not be "corrected" back to a stand-in when the database is down.
const siteData = code("src/lib/data/site.ts");
check(
  "the outage fallback reintroduces neither contact stand-in",
  !siteData.includes(PLACEHOLDER_PHONE) && !siteData.includes(PLACEHOLDER_EMAIL),
  null,
);

// One rule decides what is publishable, so a new surface cannot forget it — the
// same reason 0020 put slot release in a trigger rather than in one code path.
const contactLib = await tryImport("../src/lib/content/contact.ts");
const published = (patch) =>
  contactLib?.publishedContact({ email: "office@example.org", phone: "+63 917 123 4567", ...patch }) ?? {};

check("publishes a confirmed email", published({}).email === "office@example.org", published({}));
check("publishes a confirmed phone", published({}).phone === "+63 917 123 4567", published({}));
check("withholds a blank email", published({ email: "" }).email === null, published({ email: "" }));
check("withholds a blank phone", published({ phone: "" }).phone === null, published({ phone: "" }));
check(
  "withholds a whitespace-only number rather than rendering the spaces",
  published({ phone: "   " }).phone === null,
  published({ phone: "   " }),
);
check(
  "trims a padded address rather than publishing the padding",
  published({ email: "  office@example.org  " }).email === "office@example.org",
  published({ email: "  office@example.org  " }),
);
check(
  "withholding one channel does not withhold the other",
  published({ phone: "" }).email === "office@example.org",
  published({ phone: "" }),
);

// Both public surfaces must go through that filter rather than reading the raw
// settings value — otherwise a withheld channel renders an empty label, or a
// `mailto:` link to nothing.
const footer = code("src/components/layout/footer.tsx");
const contactPage = code("src/app/contact/page.tsx");

check("footer routes contact details through publishedContact", /publishedContact\(/.test(footer), null);
check("contact page routes contact details through publishedContact", /publishedContact\(/.test(contactPage), null);
check("footer omits the email row when the address is withheld", /\{\s*email\s*&&/.test(footer), null);
check("footer omits the phone row when the number is withheld", /\{\s*phone\s*&&/.test(footer), null);
check(
  "contact page builds no link from a raw settings value",
  !/mailto:\$\{site\.email\}/.test(contactPage) && !/tel:\$\{site\.phone\}/.test(contactPage),
  null,
);

// A schema that accepts a blank is not enough on its own: a `required` input
// means the browser refuses to submit one, so the administrator has no way to
// withhold a channel they cannot confirm. Socials already carry the affordance
// ("Leave blank to hide the icon"); contact details need the same.
const settingsForm = code("src/app/admin/settings/_components/settings-form.tsx");
const inputFor = (name) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(settingsForm)?.[0] ?? "";

check("the email field can be cleared in /admin/settings", !/\brequired\b/.test(inputFor("email")), inputFor("email"));
check("the phone field can be cleared in /admin/settings", !/\brequired\b/.test(inputFor("phone")), inputFor("phone"));
check("the office address is still required", /\brequired\b/.test(inputFor("office")), inputFor("office"));
check("the contact section says what a blank field means", /Leave blank to withhold/.test(settingsForm), null);

// And the rows already in the database have to be cleared, not merely stopped
// from being re-seeded — the lesson 0019 taught about the invented events.
const m22 = trySql("supabase/migrations/0022_withhold_placeholder_contact.sql");
check(
  "migration 0022 blanks the stored placeholder phone",
  m22.includes(PLACEHOLDER_PHONE) && /phone\s*=\s*''/.test(m22),
  null,
);
check(
  "migration 0022 blanks the stored placeholder email",
  m22.includes(PLACEHOLDER_EMAIL) && /email\s*=\s*''/.test(m22),
  null,
);
check(
  "migration 0022 only clears rows still carrying the stand-in",
  /where[\s\S]*phone\s*=\s*'\+63 962 000 0000'/i.test(m22) &&
    /where[\s\S]*email\s*=\s*'hello@zubidayfc\.org'/i.test(m22),
  null,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
