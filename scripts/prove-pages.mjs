// Proves the page CMS: section-content validation, RLS (PYH-only writes),
// fallback rendering, and image reaping. Cleans up after itself.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { parseSectionContent, SECTION_TYPES } = await import("../src/lib/pages/content-schemas.ts");

let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// ── 1. Section content validation ──────────────────────────────────────────
check("registry exposes the 5 v1 section types",
  SECTION_TYPES.length === 5 && SECTION_TYPES.includes("hero") && SECTION_TYPES.includes("timeline"), SECTION_TYPES);

check("rejects an unknown section type",
  parseSectionContent("marquee", {}).ok === false, parseSectionContent("marquee", {}));

check("hero rejects missing title",
  parseSectionContent("hero", { eyebrow: "x" }).ok === false, parseSectionContent("hero", { eyebrow: "x" }));

check("hero accepts valid content",
  parseSectionContent("hero", { eyebrow: "About", title: "Hi", subtitle: "Yo" }).ok === true, null);

check("values-grid rejects an icon outside the allowlist",
  parseSectionContent("values-grid", { eyebrow: "e", title: "t", items: [{ icon: "Skull", title: "a", text: "b" }] }).ok === false, null);

check("values-grid accepts an allowlisted icon",
  parseSectionContent("values-grid", { eyebrow: "e", title: "t", items: [{ icon: "Flame", title: "a", text: "b" }] }).ok === true, null);

check("text-image rejects a non-URL image src",
  parseSectionContent("text-image", { image: { src: "not-a-url", alt: "", width: 1, height: 1, objectPath: null }, eyebrow: "e", title: "t", subtitle: "s", body: "b" }).ok === false, null);

check("text-image accepts valid content",
  parseSectionContent("text-image", { image: { src: "https://example.com/img.jpg", alt: "desc", width: 800, height: 600, objectPath: null }, eyebrow: "e", title: "t", subtitle: "s", body: "b" }).ok === true, null);

// (RLS, fallback, and reap assertions are appended in later tasks.)

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
