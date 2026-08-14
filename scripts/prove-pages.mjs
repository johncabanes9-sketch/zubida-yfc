// Proves the page CMS: section-content validation, RLS (PYH-only writes),
// fallback rendering, and image reaping. Cleans up after itself.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { parseSectionContent, SECTION_TYPES } = await import("../src/lib/pages/content-schemas.ts");
const { PAGE_FALLBACK } = await import("../src/lib/pages/fallback.ts");
const { collectImagePaths, reapPaths } = await import("../src/lib/pages/reap.ts");

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

// 4, not the 5 seeded in 0016: migration 0017 hides the unverified history
// timeline, and the fallback must mirror what the DB actually renders.
check("About fallback has 4 visible sections matching the seed + 0017",
  PAGE_FALLBACK.about?.sections?.length === 4, PAGE_FALLBACK.about?.sections?.length);
check("every fallback section validates against its schema",
  PAGE_FALLBACK.about.sections.every((s) => parseSectionContent(s.type, s.content).ok), null);

// ── 2. RLS + seed (against the hosted DB) ───────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !service) { console.error("Missing Supabase env vars."); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });

const mkUser = async (email) => {
  const c = await admin.auth.admin.createUser({ email, password: "ProvePages!2026", email_confirm: true });
  if (c.error) { if (/already/i.test(c.error.message)) { const l = await admin.auth.admin.listUsers(); return l.data.users.find((u) => u.email === email).id; } throw c.error; }
  return c.data.user.id;
};
const authed = async (email) => { const c = createClient(url, anonKey, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: "ProvePages!2026" }); if (error) throw error; return c; };

const stamp = Date.now();
const pyhEmail = `pages_pyh_${stamp}@test.com`, chEmail = `pages_ch_${stamp}@test.com`;
// Declared before the try so the finally can clean up whatever setup created,
// even if setup itself (user creation, admin upsert, seed fetch) throws.
let pyhId, chId;
try {
  pyhId = await mkUser(pyhEmail);
  chId = await mkUser(chEmail);
  const { data: clusters } = await admin.from("clusters").select("id").order("name");
  await admin.from("admins").upsert({ user_id: pyhId, role: "provincial_youth_head", is_active: true, full_name: "Pages PYH" }, { onConflict: "user_id" });
  await admin.from("admins").upsert({ user_id: chId, role: "cluster_head", cluster_id: clusters[0].id, is_active: true, full_name: "Pages CH" }, { onConflict: "user_id" });

  const { data: about } = await admin.from("pages").select("id").eq("slug", "about").single();
  const { data: secs } = await admin.from("pages").select("id, page_sections(id, type)").eq("slug", "about").single();
  const sectionId = secs?.page_sections?.[0]?.id;
  check("About page is seeded with 5 sections", (secs?.page_sections?.length ?? 0) === 5, secs?.page_sections?.length);

  const anonC = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonRead = await anonC.from("page_sections").select("id").eq("page_id", about.id);
  check("anon CAN read page_sections", !anonRead.error && anonRead.data.length === 5, anonRead.error?.message);

  const anonWrite = await anonC.from("page_sections").update({ visible: false }).eq("page_id", about.id).select("id");
  check("anon CANNOT write page_sections", (anonWrite.data?.length ?? 0) === 0, anonWrite.data);

  const ch = await authed(chEmail);
  const chWrite = await ch.from("pages").update({ seo_title: "hacked" }).eq("id", about.id).select("id");
  check("cluster head CANNOT write pages", (chWrite.data?.length ?? 0) === 0, chWrite.data);
  const chWriteSec = await ch.from("page_sections").update({ visible: false }).eq("id", sectionId).select("id");
  check("cluster head CANNOT write page_sections", (chWriteSec.data?.length ?? 0) === 0, chWriteSec.data);

  const pyh = await authed(pyhEmail);
  const pyhWrite = await pyh.from("pages").update({ seo_title: "About" }).eq("id", about.id).select("id");
  check("PYH CAN write pages (positive control)", !pyhWrite.error && pyhWrite.data?.length === 1, pyhWrite.error?.message);
  // page_sections positive control: set visible=true (its seeded value) so the write
  // is non-destructive; a passing RLS write still returns the affected row.
  const pyhWriteSec = await pyh.from("page_sections").update({ visible: true }).eq("id", sectionId).select("id");
  check("PYH CAN write page_sections (positive control)", !pyhWriteSec.error && pyhWriteSec.data?.length === 1, pyhWriteSec.error?.message);
} finally {
  if (pyhId) await admin.auth.admin.deleteUser(pyhId);
  if (chId) await admin.auth.admin.deleteUser(chId);
  await admin.from("admins").delete().in("user_id", [pyhId, chId].filter(Boolean));
}

// ── 3. Reap (real prod code path, mirrors prove-uploads) ────────────────────
check("collectImagePaths ignores external (objectPath:null) images",
  collectImagePaths({ image: { src: "https://x/y.jpg", objectPath: null } }).length === 0, null);
check("collectImagePaths finds owned object paths (incl. nested lists)",
  collectImagePaths({ items: [{ image: { objectPath: "pages/about/a.webp" } }] }).join() === "pages/about/a.webp", null);

// Upload a real object, reap it via the shared helper, assert it's gone.
// The finally guarantees the test object never leaks into the shared bucket
// even if reapPaths regresses or throws (mirrors prove-uploads.mjs).
const RIFF = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
const key = `pages/_prove/${stamp}.webp`;
try {
  const up = await admin.storage.from("media").upload(key, RIFF, { contentType: "image/webp", upsert: true });
  check("test object uploaded (positive control)", !up.error, up.error?.message);
  const reap = await reapPaths(admin, [key]);
  check("reapPaths returns no error", !reap.error, reap.error);
  const dl = await admin.storage.from("media").download(key);
  check("object is gone after reap", !!dl.error, "still downloadable");
} finally {
  await admin.storage.from("media").remove([key]); // best-effort; no-op if reap already removed it
}

console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
