// Proves the managed gallery: image dimension parsing, schema, the consent
// constraint, cluster-scoped RLS, public withholding, admin action guards, and
// that the table ships with no invented photos.
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

// ── Image dimensions (no database) ─────────────────────────────────────────
// The masonry grid reserves each photo's box before it loads, so the stored
// width/height must be the DISPLAYED size: a phone JPEG stored landscape with
// an EXIF "rotate 90" tag is shown portrait.
console.log("\n── imageSize ──");
let imageSize;
try {
  ({ imageSize } = await import("../src/lib/images/size.ts"));
} catch (e) {
  imageSize = () => { throw e; };
}
const safe = (bytes) => { try { return imageSize(bytes); } catch (e) { return `threw: ${e.message}`; } };
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le16 = (n) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(640), ...u32(480), 8, 6, 0, 0, 0]);
check("PNG dimensions come from IHDR", JSON.stringify(safe(png)) === '{"width":640,"height":480}', safe(png));

// SOF0 after an unrelated APP0 segment.
const sof0 = (w, h) => [0xff, 0xc0, ...u16(17), 8, ...u16(h), ...u16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
const app0 = [0xff, 0xe0, ...u16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const jpeg = new Uint8Array([0xff, 0xd8, ...app0, ...sof0(1200, 800), 0xff, 0xd9]);
check("JPEG dimensions come from the SOF segment", JSON.stringify(safe(jpeg)) === '{"width":1200,"height":800}', safe(jpeg));

// APP1 Exif, big-endian TIFF, one IFD0 entry: Orientation (0x0112) = 6.
const exif = (orientation) => {
  const tiff = [0x4d, 0x4d, 0, 42, ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return [0xff, 0xe1, ...u16(body.length + 2), ...body];
};
const rotated = new Uint8Array([0xff, 0xd8, ...exif(6), ...sof0(4000, 3000), 0xff, 0xd9]);
check("a JPEG tagged rotate-90 reports its displayed (portrait) size",
  JSON.stringify(safe(rotated)) === '{"width":3000,"height":4000}', safe(rotated));
const upright = new Uint8Array([0xff, 0xd8, ...exif(1), ...sof0(4000, 3000), 0xff, 0xd9]);
check("a JPEG tagged upright keeps its stored size",
  JSON.stringify(safe(upright)) === '{"width":4000,"height":3000}', safe(upright));
// Progressive JPEGs (SOF2) are what many phones and editors write.
// Lightroom, Photoshop and some phones write an XMP APP1 after the Exif one;
// it must not reset the orientation the Exif segment set.
const xmp = (() => { const body = [...Buffer.from("http://ns.adobe.com/xap/1.0/\u0000<x/>")]; return [0xff, 0xe1, ...u16(body.length + 2), ...body]; })();
const exifThenXmp = new Uint8Array([0xff, 0xd8, ...exif(6), ...xmp, ...sof0(4000, 3000), 0xff, 0xd9]);
check("an XMP segment after the Exif one keeps the rotation",
  JSON.stringify(safe(exifThenXmp)) === '{"width":3000,"height":4000}', safe(exifThenXmp));
const progressive = new Uint8Array([0xff, 0xd8, 0xff, 0xc2, ...u16(17), 8, ...u16(300), ...u16(500), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
check("a progressive JPEG (SOF2) is read too", JSON.stringify(safe(progressive)) === '{"width":500,"height":300}', safe(progressive));
// DHT (0xC4) shares the SOF range's high nibble but carries no dimensions.
const dhtFirst = new Uint8Array([0xff, 0xd8, 0xff, 0xc4, ...u16(4), 0, 0, ...sof0(64, 32), 0xff, 0xd9]);
check("a Huffman table before the frame header is skipped, not read as one",
  JSON.stringify(safe(dhtFirst)) === '{"width":64,"height":32}', safe(dhtFirst));

const riff = (chunk) => [0x52, 0x49, 0x46, 0x46, ...le16(0), 0, 0, 0x57, 0x45, 0x42, 0x50, ...chunk];
const vp8 = new Uint8Array(riff([0x56, 0x50, 0x38, 0x20, ...le16(0), 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(800), ...le16(600)]));
check("lossy WebP (VP8) dimensions", JSON.stringify(safe(vp8)) === '{"width":800,"height":600}', safe(vp8));
const w = 1023, h = 767;
const bits = (w - 1) | ((h - 1) << 14);
const vp8l = new Uint8Array(riff([0x56, 0x50, 0x38, 0x4c, ...le16(0), 0, 0, 0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff]));
check("lossless WebP (VP8L) dimensions", JSON.stringify(safe(vp8l)) === '{"width":1023,"height":767}', safe(vp8l));
const vp8x = new Uint8Array(riff([0x56, 0x50, 0x38, 0x58, ...le16(10), 0, 0, 0, 0, 0, 0, ...le24(1999), ...le24(2999)]));
check("extended WebP (VP8X) dimensions", JSON.stringify(safe(vp8x)) === '{"width":2000,"height":3000}', safe(vp8x));

check("bytes with no readable header give null, not a guess",
  safe(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])) === null && safe(new Uint8Array([1, 2, 3])) === null,
  [safe(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), safe(new Uint8Array([1, 2, 3]))]);
check("a truncated header gives null rather than reading past the end",
  safe(png.slice(0, 20)) === null && safe(jpeg.slice(0, 26)) === null, [safe(png.slice(0, 20)), safe(jpeg.slice(0, 26))]);

// ── Source-level: actions, admin UI, public pages ──────────────────────────
console.log("\n── Admin actions (source-level) ──");
const actions = code("src/app/admin/gallery/actions.ts");
const body = (fn) => {
  const start = actions.indexOf(`export async function ${fn}`);
  if (start === -1) return "";
  const next = actions.indexOf("\nexport async function", start + 1);
  return actions.slice(start, next === -1 ? actions.length : next);
};
const orderedBefore = (hay, a, b) => { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; };
const exported = (actions.match(/export async function /g) ?? []).length;
check("the gallery actions exist", exported >= 4, exported);
check("every gallery action goes through requireClusterAccess",
  exported >= 4 && (actions.match(/await requireClusterAccess\(/g) ?? []).length === exported,
  { exported, guarded: (actions.match(/await requireClusterAccess\(/g) ?? []).length });
const writes = [...actions.matchAll(/(\w+)\s*\.from\("gallery_photos"\)\s*\.(insert|update|upsert|delete)\(/g)];
const loose = [...actions.matchAll(/\.from\("gallery_photos"\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/g)];
check("every gallery write goes through the RLS-respecting client",
  writes.length >= 3 && writes.every((m) => m[1] === "supabase"), writes.map((m) => `${m[1]}.${m[2]}`));
check("no gallery write escapes the receiver check", loose.length === writes.length, { strict: writes.length, loose: loose.length });
// The receiver check trusts the NAME; this pins what the name is bound to, so
// `const supabase = createServiceClient()` cannot pass as the RLS client.
const bindings = [...actions.matchAll(/(?:const|let)\s+supabase\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
check("`supabase` is only ever the RLS-bound server client",
  bindings.length >= 1 && bindings.every((b) => b === "await createServerSupabase()"), bindings);
check("photos are soft-deleted, never hard-deleted", !/\.delete\(\)/.test(actions) && /deleted_at/.test(actions), null);
const upload = body("uploadGalleryPhoto");
check("upload refuses to proceed without the consent tick",
  /formData\.get\("consent"\)/.test(upload) && orderedBefore(upload, 'formData.get("consent")', ".upload("), null);
check("upload sniffs the bytes and stores their real dimensions",
  /validateImage\(/.test(upload) && /imageSize\(/.test(upload) && /width:/.test(upload) && /height:/.test(upload), null);
check("upload removes the stored object if the row insert fails",
  /\.remove\(\[key\]\)/.test(upload), null);
const del = body("deleteGalleryPhoto");
// Two copies of publish state (the card toggle and an edit-form checkbox)
// meant saving a caption could silently unpublish a photo.
check("editing a caption never changes whether the photo is published",
  !/is_published/.test(body("updateGalleryPhoto").replace(/\/\/.*$/gm, "")), null);
check("delete reaps the file before soft-deleting the row", orderedBefore(del, "reapPaths(", "deleted_at:"), null);
check("delete checks the reap error instead of swallowing it", /if \(reap\.error\) return/.test(del), null);
check("delete unpublishes the row before the file is reaped",
  orderedBefore(del, "is_published: false", "reapPaths("), null);
check("upload refuses absurd dimensions with a clear message",
  /MAX_DIMENSION/.test(upload), null);
check("delete clears path in the same statement that sets deleted_at",
  /deleted_at:[\s\S]{0,200}path:\s*null|path:\s*null[\s\S]{0,200}deleted_at:/.test(del), null);

console.log("\n── Admin UI (source-level) ──");
const form = code("src/app/admin/gallery/_components/gallery-admin.tsx");
check("the admin gallery page exists", !!code("src/app/admin/gallery/page.tsx"), null);
check("the gallery is in the admin nav", /key:\s*"gallery"[\s\S]{0,80}href:\s*"\/admin\/gallery"/.test(code("src/app/admin/_components/admin-nav.ts")), null);
check("the uploader sends the file under the field the server reads", /\.append\("photo",/.test(form), null);
check("the uploader sends the consent tick", /\.append\("consent",/.test(form), null);
check("upload is disabled until consent is ticked", /disabled=\{[^}]*!consent[^}]*\}/.test(form), null);
check("an oversized photo is refused before it is sent",
  /file\.size > MAX_PHOTO_BYTES[\s\S]{0,300}return;[\s\S]{0,600}uploadGalleryPhoto\(/.test(form), null);
// React 19 resets an uncontrolled <form action={fn}> as soon as fn returns;
// run() returns before the server answers, so a rejected save wiped what the
// admin typed. Forms submit through onSubmit + preventDefault instead.
check("no admin form resets before the server has answered", !/<form\s[^>]*?action=\{/.test(form), null);
check("deleting a photo asks first", /confirm\([^)]*\)\)\s*return;\s*\n\s*run\(\(\) => deleteGalleryPhoto/.test(form), null);

console.log("\n── Public pages (source-level) ──");
const page = code("src/app/gallery/page.tsx");
check("/gallery reads the database", /getGalleryPhotos\(/.test(page) && !/isVerified/.test(page), null);
check("an empty gallery renders the withholding notice",
  /photos\.length\s*>\s*0\s*\?/.test(page) && page.includes("UnpublishedNotice"), null);
check("the grid renders the photos it is given, not a fixture",
  !/@\/data\/gallery/.test(code("src/components/gallery/gallery-grid.tsx"))
  && /photos/.test(code("src/components/gallery/gallery-grid.tsx")), null);
check("the grid's filters come from the photos' own categories, not an invented list",
  !/"Youth Camp"|"ICON"|"Sports Fest"/.test(code("src/components/gallery/gallery-grid.tsx")), null);
check("featured photos read the database", !/@\/data\/gallery/.test(code("src/components/home/featured-photos.tsx")), null);
check("the gallery fixture is deleted", !existsSync(join(root, "src/data/gallery.ts")), null);
check("gallery is no longer a fixture domain", !/"gallery"/.test(code("src/lib/content/fixtures.ts")), null);

// ── Database ───────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("Missing Supabase env vars."); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });
const FIXTURE = "gallery/suite-";
let headId, pyhId, crashed;

try {
  console.log("\n── Schema ──");
  const probe = await admin.from("gallery_photos").select("id").limit(1);
  check("the gallery_photos table exists", !probe.error, probe.error?.message);
  const real = await admin.from("gallery_photos").select("path").not("path", "like", `${FIXTURE}%`);
  check("no migration seeds a photo", !real.error && (real.data ?? []).every((r) => !String(r.path).includes("picsum")), real.error?.message);
  const migration = readdirSync(join(root, "supabase/migrations")).filter((f) => /gallery/.test(f))
    .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8")).join("\n");
  check("the gallery migration exists", migration.length > 0, null);
  check("the gallery migration inserts no photo rows", !/insert\s+into\s+gallery_photos/i.test(migration), null);

  const clusters = await admin.from("clusters").select("id, name").order("name");
  const [clusterA, clusterB] = clusters.data ?? [];
  if (!clusterA || !clusterB) throw new Error("Need two clusters seeded.");

  const headEmail = `gallerytest_head_${crypto.randomUUID()}@example.com`;
  const pyhEmail = `gallerytest_pyh_${crypto.randomUUID()}@example.com`;
  const headPw = crypto.randomUUID(), pyhPw = crypto.randomUUID();
  headId = (await admin.auth.admin.createUser({ email: headEmail, password: headPw, email_confirm: true })).data.user.id;
  pyhId = (await admin.auth.admin.createUser({ email: pyhEmail, password: pyhPw, email_confirm: true })).data.user.id;
  await admin.from("admins").insert([
    { user_id: headId, role: "cluster_head", cluster_id: clusterA.id, is_active: true, full_name: "Gallery Suite Head" },
    { user_id: pyhId, role: "provincial_youth_head", cluster_id: null, is_active: true, full_name: "Gallery Suite PYH" },
  ]);

  const row = (over = {}) => ({
    path: `${FIXTURE}${crypto.randomUUID()}.jpg`, caption: "Suite photo", width: 800, height: 600,
    cluster_id: clusterA.id, consent_confirmed_at: new Date().toISOString(), consent_confirmed_by: pyhId, ...over,
  });

  console.log("\n── Consent and shape constraints ──");
  const noConsent = await admin.from("gallery_photos").insert(row({ consent_confirmed_at: null, consent_confirmed_by: null })).select("id");
  check("a photo without a recorded publishing permission is rejected", !!noConsent.error, noConsent.data);
  const halfConsent = await admin.from("gallery_photos").insert(row({ consent_confirmed_by: null })).select("id");
  check("a permission time without who confirmed it is rejected", !!halfConsent.error, halfConsent.data);
  const withConsent = await admin.from("gallery_photos").insert(row()).select("id");
  check("a photo with a recorded permission saves", !withConsent.error, withConsent.error?.message);
  const zero = await admin.from("gallery_photos").insert(row({ width: 0 })).select("id");
  check("non-positive dimensions are rejected", !!zero.error, zero.data);
  const blank = await admin.from("gallery_photos").insert(row({ caption: "   " })).select("id");
  check("a blank caption is rejected (alt text is required)", !!blank.error, blank.data);
  const external = await admin.from("gallery_photos").insert(row({ path: "https://picsum.photos/seed/x/700/900" })).select("id");
  check("an external URL cannot stand in for an uploaded object", !!external.error, external.data);

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
    const r = await admin.from("gallery_photos").insert(row(over)).select("id").single();
    if (r.error) throw new Error(`fixture insert failed: ${r.error.message}`);
    return r.data.id;
  };
  const pubA = await mk({ is_published: true });
  const draftA = await mk({ is_published: false });
  const deletedA = await mk({ is_published: true, deleted_at: new Date().toISOString(), path: null });
  const deletedWithFile = await admin.from("gallery_photos").insert(row({ deleted_at: new Date().toISOString() })).select("id");
  check("a deleted row cannot keep pointing at a file", !!deletedWithFile.error, deletedWithFile.data);
  const pubB = await mk({ is_published: true, cluster_id: clusterB.id });
  const provincial = await mk({ is_published: true, cluster_id: null });

  const anonSees = (await anonClient.from("gallery_photos").select("id").in("id", [pubA, draftA, deletedA, pubB, provincial])).data?.map((r) => r.id) ?? [];
  check("the public sees published photos", anonSees.includes(pubA) && anonSees.includes(pubB) && anonSees.includes(provincial), anonSees);
  check("the public never sees a draft", !anonSees.includes(draftA), anonSees);
  check("the public never sees a deleted photo", !anonSees.includes(deletedA), anonSees);
  const anonWrite = await anonClient.from("gallery_photos").insert(row({ consent_confirmed_by: null, consent_confirmed_at: null })).select("id");
  check("the public cannot insert", !!anonWrite.error || (anonWrite.data ?? []).length === 0, anonWrite.data);

  const headSees = (await head.from("gallery_photos").select("id").in("id", [draftA, pubB])).data?.length;
  check("a cluster head reads the whole province, drafts included", headSees === 2, headSees);
  // Authenticated inserts must name an object that really exists in storage,
  // so these fixtures upload one first (service role, cleaned up below).
  const realObject = async () => {
    const key = `${FIXTURE}${crypto.randomUUID()}.png`;
    const up = await admin.storage.from("media").upload(key, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" });
    if (up.error) throw new Error(`fixture upload failed: ${up.error.message}`);
    return key;
  };
  const headOwn = await head.from("gallery_photos").insert(row({ path: await realObject(), consent_confirmed_by: headId })).select("id");
  check("a cluster head CAN add a photo to their own cluster", !headOwn.error && headOwn.data?.length === 1, headOwn.error?.message);
  const headOther = await head.from("gallery_photos").insert(row({ path: await realObject(), cluster_id: clusterB.id, consent_confirmed_by: headId })).select("id");
  check("a cluster head CANNOT add a photo to another cluster", !!headOther.error, headOther.data);
  const headProv = await head.from("gallery_photos").insert(row({ path: await realObject(), cluster_id: null, consent_confirmed_by: headId })).select("id");
  check("a cluster head CANNOT add a provincial-level photo", !!headProv.error, headProv.data);
  const headEditOwn = await head.from("gallery_photos").update({ caption: "Edited by own head" }).eq("id", draftA).select("id");
  check("a cluster head CAN edit their own cluster's photo", headEditOwn.data?.length === 1, headEditOwn.error?.message ?? headEditOwn.data);
  const headEditOther = await head.from("gallery_photos").update({ caption: "Hijack" }).eq("id", pubB).select("id");
  check("a cluster head CANNOT edit another cluster's photo", (headEditOther.data ?? []).length === 0, headEditOther.data);
  const headMove = await head.from("gallery_photos").update({ cluster_id: clusterB.id }).eq("id", draftA).select("id");
  check("a cluster head CANNOT move a photo into another cluster", !!headMove.error || (headMove.data ?? []).length === 0, headMove.data);
  const headHardDelete = await head.from("gallery_photos").delete().eq("id", draftA).select("id");
  check("a cluster head CANNOT hard-delete", (headHardDelete.data ?? []).length === 0, headHardDelete.data);
  const headUnconsent = await head.from("gallery_photos").update({ consent_confirmed_at: null, consent_confirmed_by: null }).eq("id", draftA).select("id");
  check("nobody can strip the permission record off a stored photo", !!headUnconsent.error, headUnconsent.data);

  console.log("\n── Direct-API integrity (bypassing the server action) ──");
  // A cluster head holds a JWT and can call PostgREST directly. RLS alone only
  // pins cluster_id; these prove the other columns cannot be forged.
  const forgedBy = await head.from("gallery_photos").insert(row({ path: await realObject(), consent_confirmed_by: pyhId })).select("id");
  check("a cluster head CANNOT record someone else as the permission confirmer", !!forgedBy.error, forgedBy.data);
  const pyhForged = await pyh.from("gallery_photos").insert(row({ path: await realObject(), cluster_id: null, consent_confirmed_by: headId })).select("id");
  check("the PYH CANNOT record someone else as the permission confirmer either", !!pyhForged.error, pyhForged.data);
  const phantom = await head.from("gallery_photos").insert(row({ path: `${FIXTURE}never-uploaded.jpg`, consent_confirmed_by: headId })).select("id");
  check("a row cannot point at a file that was never uploaded", !!phantom.error, phantom.data);
  const pubAPath = (await admin.from("gallery_photos").select("path").eq("id", pubA).single()).data.path;
  const stolen = await head.from("gallery_photos").insert(row({ path: pubAPath, consent_confirmed_by: headId })).select("id");
  check("a row cannot reuse another photo's file", !!stolen.error, stolen.data);
  const reconsent = await head.from("gallery_photos").update({ consent_confirmed_by: headId }).eq("id", draftA).select("id");
  const stale = await head.from("gallery_photos").insert(row({ path: await realObject(), consent_confirmed_by: headId, consent_confirmed_at: "2020-01-01T00:00:00Z", caption: "Suite stale" })).select("consent_confirmed_at").single();
  check("the permission time is stamped by the database, not supplied by the caller",
    !stale.error && Date.now() - Date.parse(stale.data.consent_confirmed_at) < 5 * 60 * 1000, stale.error?.message ?? stale.data);
  const spoofEditor = await head.from("gallery_photos").update({ caption: "Suite spoof", updated_by: pyhId }).eq("id", draftA).select("updated_by").single();
  check("updated_by records the real editor", spoofEditor.data?.updated_by === headId, spoofEditor.error?.message ?? spoofEditor.data);
  check("a cluster head CANNOT rewrite who confirmed permission", !!reconsent.error || (reconsent.data ?? []).length === 0, reconsent.data);
  const repoint = await head.from("gallery_photos").update({ path: await realObject() }).eq("id", draftA).select("id");
  check("a cluster head CANNOT repoint a photo at a different file", !!repoint.error || (repoint.data ?? []).length === 0, repoint.data);
  const pyhRepoint = await pyh.from("gallery_photos").update({ path: await realObject() }).eq("id", pubB).select("id");
  check("the PYH CANNOT repoint a photo at a different file either", !!pyhRepoint.error || (pyhRepoint.data ?? []).length === 0, pyhRepoint.data);
  const undelete = await pyh.from("gallery_photos").update({ deleted_at: null }).eq("id", deletedA).select("id");
  check("a deleted photo cannot be brought back without a file", !!undelete.error || (undelete.data ?? []).length === 0, undelete.data);

  const pyhOther = await pyh.from("gallery_photos").update({ caption: "PYH edit" }).eq("id", pubB).select("id");
  check("the PYH CAN edit any cluster's photo", pyhOther.data?.length === 1, pyhOther.error?.message ?? pyhOther.data);
  const pyhProv = await pyh.from("gallery_photos").insert(row({ path: await realObject(), cluster_id: null, consent_confirmed_by: pyhId })).select("id");
  check("the PYH CAN add a provincial-level photo", !pyhProv.error && pyhProv.data?.length === 1, pyhProv.error?.message);
} catch (e) {
  crashed = e;
} finally {
  console.log("\n── Cleanup ──");
  // By confirmer, not path: tombstoned fixtures have no path left to match.
  await admin.from("gallery_photos").delete().in("consent_confirmed_by", [headId, pyhId].filter(Boolean));
  await admin.from("gallery_photos").delete().like("path", `${FIXTURE}%`);
  const objs = (await admin.storage.from("media").list("gallery", { search: "suite-", limit: 1000 })).data ?? [];
  if (objs.length) await admin.storage.from("media").remove(objs.map((o) => `gallery/${o.name}`));
  await admin.from("admins").delete().in("user_id", [headId, pyhId].filter(Boolean));
  const deletions = await Promise.all([headId, pyhId].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u)));
  check("the throwaway auth users were deleted", deletions.every((d) => !d.error), deletions.map((d) => d.error?.message).filter(Boolean));
  const left = await admin.from("gallery_photos").select("id").like("path", `${FIXTURE}%`);
  check("the suite left no photo fixtures behind", !left.error ? (left.data?.length ?? 0) === 0 : true, left.data);
}

if (crashed) {
  console.error(`\n  Aborted before the end: ${crashed.message}`);
  fail++;
}
console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
