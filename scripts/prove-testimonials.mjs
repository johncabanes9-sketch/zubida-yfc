// Proves managed testimonials: consent for every quote, photo integrity,
// erase-on-delete, PYH-only RLS, direct-API integrity, admin action guards,
// and that the homepage reads the database instead of the invented fixture.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// ── Source-level ───────────────────────────────────────────────────────────
console.log("\n── Admin actions (source-level) ──");
const actions = code("src/app/admin/testimonials/actions.ts");
const body = (fn) => {
  const start = actions.indexOf(`export async function ${fn}`);
  if (start === -1) return "";
  const next = actions.indexOf("\nexport async function", start + 1);
  return actions.slice(start, next === -1 ? actions.length : next);
};
const orderedBefore = (hay, a, b) => { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; };
const exported = (actions.match(/export async function /g) ?? []).length;
check("the testimonial actions exist", exported >= 6, exported);
check("every testimonial action requires the PYH",
  exported >= 6 && (actions.match(/await requirePYH\(\)/g) ?? []).length === exported,
  { exported, guarded: (actions.match(/await requirePYH\(\)/g) ?? []).length });
const writes = [...actions.matchAll(/(\w+)\s*\.from\("testimonials"\)\s*\.(insert|update|upsert|delete)\(/g)];
const loose = [...actions.matchAll(/\.from\("testimonials"\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/g)];
check("every testimonial write goes through the RLS-respecting client",
  writes.length >= 5 && writes.every((m) => m[1] === "supabase"), writes.map((m) => `${m[1]}.${m[2]}`));
check("no testimonial write escapes the receiver check", loose.length === writes.length, { strict: writes.length, loose: loose.length });
const bindings = [...actions.matchAll(/(?:const|let)\s+supabase\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
check("`supabase` is only ever the RLS-bound server client",
  bindings.length >= 1 && bindings.every((b) => b === "await createServerSupabase()"), bindings);
check("testimonials are never hard-deleted", !/\.delete\(\)/.test(actions), null);
check("creating a testimonial requires the consent tick",
  /formData\.get\("consent"\)/.test(body("createTestimonial")), null);
check("changing a quote's words requires the consent tick",
  /formData\.get\("consent"\)/.test(body("updateTestimonial")), null);
check("changing the name requires the consent tick too",
  /parsed\.data\.name\s*!==\s*\(?current\.name/.test(body("updateTestimonial")), null);
check("editing never changes whether it is published",
  !/is_published/.test(body("updateTestimonial").replace(/\/\/.*$/gm, "")), null);
const photo = body("uploadTestimonialPhoto");
check("a photo upload requires the consent tick before storing anything",
  orderedBefore(photo, 'formData.get("consent")', ".upload("), null);
check("a photo upload removes its object if the row update fails", /\.remove\(\[key\]\)/.test(photo), null);
check("a replaced photo is reaped only after the row has moved off it", orderedBefore(photo, "photo_path: key", "reapPaths("), null);
const del = body("deleteTestimonial");
check("delete unpublishes before reaping the photo", orderedBefore(del, "is_published: false", "reapPaths("), null);
check("delete reaps the photo before erasing the row", orderedBefore(del, "reapPaths(", "deleted_at:"), null);
check("delete checks the reap error", /if \(reap\.error\) return/.test(del), null);
check("delete erases the person's name and words", /name:\s*null/.test(del) && /quote:\s*null/.test(del), null);

console.log("\n── Admin UI (source-level) ──");
const ui = code("src/app/admin/testimonials/_components/testimonials-admin.tsx");
check("the admin page exists and requires the PYH", /requirePYH\(\)/.test(code("src/app/admin/testimonials/page.tsx")), null);
check("testimonials are in the admin nav for the PYH only",
  /key:\s*"testimonials"[\s\S]{0,140}href:\s*"\/admin\/testimonials"[\s\S]{0,140}pyhOnly:\s*true/.test(code("src/app/admin/_components/admin-nav.ts")), null);
check("no admin form resets before the server has answered", !/<form\s[^>]*?action=\{/.test(ui), null);
check("the photo uploader sends the file under the field the server reads", /\.append\("photo",/.test(ui), null);
check("the photo upload is disabled until consent is ticked", /type="file"[^>]*?disabled=\{[^}]*!photoConsent[^}]*\}/.test(ui), null);
check("an oversized photo is refused before it is sent",
  /file\.size > MAX_PHOTO_BYTES[\s\S]{0,300}return;[\s\S]{0,600}uploadTestimonialPhoto\(/.test(ui), null);
check("deleting asks first", /confirm\([^)]*\)\)\s*return;\s*\n\s*run\(\(\) => deleteTestimonial/.test(ui), null);

console.log("\n── Public (source-level) ──");
const home = code("src/app/page.tsx");
const comp = code("src/components/home/testimonials.tsx");
check("the homepage renders testimonials only when some are published", /testimonials\.length\s*>\s*0\s*&&\s*<Testimonials/.test(home), null);
check("the carousel takes testimonials as props, not the fixture", !/@\/data\/stats/.test(comp) && /testimonials/.test(comp), null);
check("no stand-in face: the image renders only inside a photo guard",
  /\{t\.photo\s*&&\s*\(\s*<Image/.test(comp) && !/avatar/.test(comp), null);
check("the carousel never indexes past a shrunken list", /Math\.min\(\s*i\s*,\s*testimonials\.length\s*-\s*1\s*\)/.test(comp), null);
check("the carousel announces itself and its slide changes",
  /aria-roledescription="carousel"/.test(comp) && /aria-live="polite"/.test(comp), null);
const loader = code("src/lib/data/testimonials.ts");
check("an unpublished or deleted chapter's name is never shown",
  /chapters\([^)]*is_published[^)]*deleted_at[^)]*\)/.test(loader), null);
check("the invented testimonials are gone from the fixture module", !/testimonials/.test(code("src/data/stats.ts")) && !/pravatar/.test(code("src/data/stats.ts")), null);
check("testimonials are no longer a fixture domain", !/"testimonials"/.test(code("src/lib/content/fixtures.ts")), null);

// ── Database ───────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("Missing Supabase env vars."); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });
const TAG = "Suite Person";
const FIXTURE = "testimonials/suite-";
let headId, pyhId, crashed;
const ids = [];

try {
  console.log("\n── Schema ──");
  const probe = await admin.from("testimonials").select("id").limit(1);
  check("the testimonials table exists", !probe.error, probe.error?.message);
  const migration = readdirSync(join(root, "supabase/migrations")).filter((f) => /testimonial/.test(f))
    .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8")).join("\n");
  check("the testimonials migration exists", migration.length > 0, null);
  check("the migration inserts no testimonials", !/insert\s+into\s+testimonials/i.test(migration), null);

  const [clusterA] = (await admin.from("clusters").select("id").order("name")).data ?? [];
  if (!clusterA) throw new Error("Need a cluster seeded.");
  const headEmail = `testimonialtest_head_${crypto.randomUUID()}@example.com`;
  const pyhEmail = `testimonialtest_pyh_${crypto.randomUUID()}@example.com`;
  const headPw = crypto.randomUUID(), pyhPw = crypto.randomUUID();
  headId = (await admin.auth.admin.createUser({ email: headEmail, password: headPw, email_confirm: true })).data.user.id;
  pyhId = (await admin.auth.admin.createUser({ email: pyhEmail, password: pyhPw, email_confirm: true })).data.user.id;
  await admin.from("admins").insert([
    { user_id: headId, role: "cluster_head", cluster_id: clusterA.id, is_active: true, full_name: "Testimonial Suite Head" },
    { user_id: pyhId, role: "provincial_youth_head", cluster_id: null, is_active: true, full_name: "Testimonial Suite PYH" },
  ]);

  const t = (over = {}) => ({ name: `${TAG} ${crypto.randomUUID().slice(0, 6)}`, quote: "Suite quote.",
    consent_at: new Date().toISOString(), consent_by: pyhId, ...over });
  const track = (res) => {
    const d = res.data;
    if (Array.isArray(d)) d.forEach((r) => r?.id && ids.push(r.id));
    else if (d?.id) ids.push(d.id);
    return res;
  };
  const realObject = async () => {
    const key = `${FIXTURE}${crypto.randomUUID()}.png`;
    const up = await admin.storage.from("media").upload(key, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" });
    if (up.error) throw new Error(`fixture upload failed: ${up.error.message}`);
    return key;
  };

  console.log("\n── Consent and shape ──");
  const noConsent = track(await admin.from("testimonials").insert(t({ consent_at: null, consent_by: null })).select("id"));
  check("a quote without a recorded consent is rejected", !!noConsent.error, noConsent.data);
  const blankQuote = track(await admin.from("testimonials").insert(t({ quote: "  " })).select("id"));
  check("a live testimonial needs a quote", !!blankQuote.error, blankQuote.data);
  const blankName = track(await admin.from("testimonials").insert(t({ name: " " })).select("id"));
  check("a live testimonial needs a name", !!blankName.error, blankName.data);
  const ok = track(await admin.from("testimonials").insert(t()).select("id"));
  check("a named quote with consent saves", !ok.error, ok.error?.message);
  const external = track(await admin.from("testimonials").insert(t({ photo_path: "https://i.pravatar.cc/200?img=45" })).select("id"));
  check("an external URL cannot stand in for an uploaded photo", !!external.error, external.data);
  const halfErased = track(await admin.from("testimonials").insert(t({ deleted_at: new Date().toISOString() })).select("id"));
  check("a deleted testimonial cannot keep the person's name or words", !!halfErased.error, halfErased.data);

  console.log("\n── RLS ──");
  const signedIn = async (email, password) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email, password });
    if (r.error) throw new Error(`sign-in failed: ${r.error.message}`);
    return c;
  };
  const head = await signedIn(headEmail, headPw);
  const pyh = await signedIn(pyhEmail, pyhPw);
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const mk = async (over) => {
    const r = await admin.from("testimonials").insert(t(over)).select("id").single();
    if (r.error) throw new Error(`fixture insert failed: ${r.error.message}`);
    ids.push(r.data.id);
    return r.data.id;
  };
  const pub = await mk({ is_published: true });
  const draft = await mk({ is_published: false });

  const seen = (await anonClient.from("testimonials").select("id").in("id", [pub, draft])).data?.map((r) => r.id) ?? [];
  check("the public sees published testimonials only", seen.includes(pub) && !seen.includes(draft), seen);
  const anonCols = await anonClient.from("testimonials").select("consent_by").eq("id", pub);
  check("the public cannot read who recorded consent", !!anonCols.error || (anonCols.data ?? []).every((r) => r.consent_by === undefined), anonCols.data);
  const headInsert = track(await head.from("testimonials").insert(t({ consent_by: headId })).select("id"));
  check("a cluster head CANNOT add a testimonial", !!headInsert.error || (headInsert.data ?? []).length === 0, headInsert.data);
  const headEdit = await head.from("testimonials").update({ quote: "Hijack" }).eq("id", pub).select("id");
  check("a cluster head CANNOT edit a testimonial", (headEdit.data ?? []).length === 0, headEdit.data);
  const pyhInsert = track(await pyh.from("testimonials").insert(t({ consent_by: pyhId })).select("id, consent_by, consent_at").single());
  check("the PYH CAN add a testimonial", !pyhInsert.error, pyhInsert.error?.message);

  console.log("\n── Direct-API integrity ──");
  const forged = track(await pyh.from("testimonials").insert(t({ consent_by: headId, consent_at: "2020-01-01T00:00:00Z" })).select("consent_by, consent_at").single());
  check("the database records the caller as the consent recorder, whatever is sent",
    !forged.error && forged.data.consent_by === pyhId, forged.error?.message ?? forged.data);
  check("the database stamps the consent time", !forged.error && Date.now() - Date.parse(forged.data.consent_at) < 300000, forged.data);
  // Changing someone's words is a new statement under their name: the consent
  // record moves with it, to the editor and now.
  await admin.from("testimonials").update({ consent_at: "2020-01-01T00:00:00Z" }).eq("id", draft);
  const reword = await pyh.from("testimonials").update({ quote: "New words." }).eq("id", draft).select("consent_at, consent_by").single();
  check("changing the quote re-stamps the consent record",
    !reword.error && reword.data.consent_by === pyhId && Date.now() - Date.parse(reword.data.consent_at) < 300000, reword.error?.message ?? reword.data);
  await admin.from("testimonials").update({ consent_at: "2020-01-01T00:00:00Z" }).eq("id", draft);
  const recaption = await pyh.from("testimonials").update({ role: "Alumna" }).eq("id", draft).select("consent_at").single();
  check("an edit that leaves the words alone keeps the original consent time",
    !recaption.error && recaption.data.consent_at.startsWith("2020-01-01"), recaption.error?.message ?? recaption.data);
  const rewrite = await pyh.from("testimonials").update({ consent_by: headId }).eq("id", draft).select("id");
  check("the consent record cannot be rewritten on its own", !!rewrite.error, rewrite.data);
  const phantom = await pyh.from("testimonials").update({ photo_path: `${FIXTURE}never.jpg` }).eq("id", draft).select("id");
  check("a photo cannot point at a file that was never uploaded", !!phantom.error, phantom.data);
  const key = await realObject();
  const setPhoto = await pyh.from("testimonials").update({ photo_path: key }).eq("id", draft).select("photo_path, consent_at").single();
  check("a real uploaded photo can be set, and re-stamps consent",
    !setPhoto.error && setPhoto.data.photo_path === key && Date.now() - Date.parse(setPhoto.data.consent_at) < 300000, setPhoto.error?.message ?? setPhoto.data);
  const share = await pyh.from("testimonials").update({ photo_path: key }).eq("id", pub).select("id");
  check("a photo cannot be shared with another testimonial", !!share.error, share.data);
  const spoof = await pyh.from("testimonials").update({ role: "x", updated_by: headId }).eq("id", draft).select("updated_by").single();
  check("updated_by records the real editor", spoof.data?.updated_by === pyhId, spoof.error?.message ?? spoof.data);
  // Words under a different name are a different person's statement.
  await admin.from("testimonials").update({ consent_at: "2020-01-01T00:00:00Z" }).eq("id", draft);
  const rename = await pyh.from("testimonials").update({ name: `${TAG} renamed` }).eq("id", draft).select("consent_at").single();
  check("changing the name re-stamps the consent record",
    !rename.error && Date.now() - Date.parse(rename.data.consent_at) < 300000, rename.error?.message ?? rename.data);
  const nullQuote = await pyh.from("testimonials").update({ quote: null }).eq("id", pub).select("id");
  check("a live testimonial cannot lose its words", !!nullQuote.error, nullQuote.data);
  const headCols = await head.from("testimonials").select("consent_by").eq("id", pub);
  check("a signed-in non-PYH admin cannot read who recorded consent",
    !!headCols.error || (headCols.data ?? []).length === 0, headCols.data);

  console.log("\n── Erase on delete ──");
  const erase = await pyh.from("testimonials").update({ deleted_at: new Date().toISOString(), name: null, role: null, quote: null, photo_path: null }).eq("id", pub).select("id");
  check("the PYH can erase a testimonial", !erase.error && erase.data?.length === 1, erase.error?.message);
  const erased = (await admin.from("testimonials").select("name, quote, role, photo_path").eq("id", pub).single()).data;
  check("nothing of the person is left", erased && erased.name === null && erased.quote === null && erased.role === null, erased);
  const revive = await pyh.from("testimonials").update({ deleted_at: null, name: `${TAG} revived`, quote: "Invented." }).eq("id", pub).select("id");
  check("an erased testimonial cannot be revived under a fresh consent", !!revive.error || (revive.data ?? []).length === 0, revive.data);
} catch (e) {
  crashed = e;
} finally {
  console.log("\n── Cleanup ──");
  if (ids.length) await admin.from("testimonials").delete().in("id", ids);
  await admin.from("testimonials").delete().like("name", `${TAG}%`);
  const objs = (await admin.storage.from("media").list("testimonials", { search: "suite-", limit: 1000 })).data ?? [];
  if (objs.length) await admin.storage.from("media").remove(objs.map((o) => `testimonials/${o.name}`));
  await admin.from("admins").delete().in("user_id", [headId, pyhId].filter(Boolean));
  const deletions = await Promise.all([headId, pyhId].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u)));
  check("the throwaway auth users were deleted", deletions.every((d) => !d.error), deletions.map((d) => d.error?.message).filter(Boolean));
  const left = await admin.from("testimonials").select("id").like("name", `${TAG}%`);
  check("the suite left no testimonial fixtures behind", !left.error ? (left.data?.length ?? 0) === 0 : true, left.data);
}

if (crashed) {
  console.error(`\n  Aborted before the end: ${crashed.message}`);
  fail++;
}
console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
