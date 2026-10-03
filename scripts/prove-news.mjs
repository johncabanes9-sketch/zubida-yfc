// Proves managed news: schema, link and cover constraints, PYH-only RLS,
// direct-API integrity, admin action guards, and that the public pages read
// the database instead of the invented fixture. The table ships empty.
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
const actions = code("src/app/admin/news/actions.ts");
const body = (fn) => {
  const start = actions.indexOf(`export async function ${fn}`);
  if (start === -1) return "";
  const next = actions.indexOf("\nexport async function", start + 1);
  return actions.slice(start, next === -1 ? actions.length : next);
};
const orderedBefore = (hay, a, b) => { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; };
const exported = (actions.match(/export async function /g) ?? []).length;
check("the news actions exist", exported >= 6, exported);
// News is provincial communication: PYH only, matching the RLS below.
check("every news action requires the PYH",
  exported >= 6 && (actions.match(/await requirePYH\(\)/g) ?? []).length === exported,
  { exported, guarded: (actions.match(/await requirePYH\(\)/g) ?? []).length });
const writes = [...actions.matchAll(/(\w+)\s*\.from\("news_posts"\)\s*\.(insert|update|upsert|delete)\(/g)];
const loose = [...actions.matchAll(/\.from\("news_posts"\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/g)];
check("every news write goes through the RLS-respecting client",
  writes.length >= 5 && writes.every((m) => m[1] === "supabase"), writes.map((m) => `${m[1]}.${m[2]}`));
check("no news write escapes the receiver check", loose.length === writes.length, { strict: writes.length, loose: loose.length });
const bindings = [...actions.matchAll(/(?:const|let)\s+supabase\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
check("`supabase` is only ever the RLS-bound server client",
  bindings.length >= 1 && bindings.every((b) => b === "await createServerSupabase()"), bindings);
check("posts are soft-deleted, never hard-deleted", !/\.delete\(\)/.test(actions) && /deleted_at/.test(actions), null);
check("editing a post never changes whether it is published",
  !/is_published/.test(body("updateNewsPost").replace(/\/\/.*$/gm, "")), null);
const cover = body("uploadNewsCover");
check("a cover upload refuses to proceed without the permission tick",
  /formData\.get\("consent"\)/.test(cover) && orderedBefore(cover, 'formData.get("consent")', ".upload("), null);
check("a cover upload removes its object if the row update fails", /\.remove\(\[key\]\)/.test(cover), null);
check("a replaced cover is reaped only after the row has moved off it",
  orderedBefore(cover, "cover_path: key", "reapPaths("), null);
const del = body("deleteNewsPost");
check("delete unpublishes before reaping the cover", orderedBefore(del, "is_published: false", "reapPaths("), null);
check("delete reaps the cover before the tombstone", orderedBefore(del, "reapPaths(", "deleted_at:"), null);
check("delete checks the reap error", /if \(reap\.error\) return/.test(del), null);
const rmCover = body("removeNewsCover");
check("removing a cover reaps the file before clearing the reference", orderedBefore(rmCover, "reapPaths(", "cover_path: null"), null);

console.log("\n── Admin UI (source-level) ──");
const ui = code("src/app/admin/news/_components/news-admin.tsx");
check("the admin news page exists and requires the PYH", /requirePYH\(\)/.test(code("src/app/admin/news/page.tsx")), null);
check("news is in the admin nav for the PYH only",
  /key:\s*"news"[\s\S]{0,120}href:\s*"\/admin\/news"[\s\S]{0,120}pyhOnly:\s*true/.test(code("src/app/admin/_components/admin-nav.ts")), null);
check("the cover uploader sends the file under the field the server reads", /\.append\("photo",/.test(ui), null);
check("the cover upload is disabled until permission is ticked", /type="file"[^>]*?disabled=\{[^}]*!coverConsent[^}]*\}/.test(ui), null);
check("an oversized cover is refused before it is sent",
  /file\.size > MAX_PHOTO_BYTES[\s\S]{0,300}return;[\s\S]{0,600}uploadNewsCover\(/.test(ui), null);
check("deleting a post asks first", /confirm\([^)]*\)\)\s*return;\s*\n\s*run\(\(\) => deleteNewsPost/.test(ui), null);
// type="url" alone accepts javascript:; https is enforced by the schema and
// the CHECK (proven below). This only proves the browser offers a URL field.
check("the link field is a URL input", /name="external_url"[^>]*type="url"|type="url"[^>]*name="external_url"/.test(ui), null);
// React 19 resets an uncontrolled form whose action returns, and run()
// returns before the server answers: a rejected save would wipe the fields.
check("no admin form resets before the server has answered", !/<form\s[^>]*?action=\{/.test(ui), null);

console.log("\n── Public pages (source-level) ──");
const page = code("src/app/news/page.tsx");
const card = code("src/components/shared/news-card.tsx");
check("/news reads the database", /getNewsPosts\(/.test(page) && !/isVerified/.test(page), null);
check("an empty /news renders the withholding notice", /posts\.length\s*>\s*0\s*\?/.test(page) && page.includes("UnpublishedNotice"), null);
check("the homepage renders news only when posts exist", /posts\.length\s*>\s*0\s*&&\s*<NewsPreview/.test(code("src/app/page.tsx")), null);
check("the board and preview take posts as props, not the fixture",
  !/@\/data\/news/.test(code("src/components/news/news-board.tsx")) && !/@\/data\/news/.test(code("src/components/home/news-preview.tsx")), null);
check("an outbound link opens safely in a new tab", /target="_blank"/.test(card) && /rel="noopener noreferrer"/.test(card), null);
check("a card with no link offers no 'Read' affordance", /item\.url\s*\?/.test(card) || /item\.url\s*&&/.test(card), null);
check("the card invents no read time", !/readTime/.test(card), null);
check("a card with no cover renders no stand-in image", /item\.cover\s*&&/.test(card) || /item\.cover\s*\?/.test(card), null);
check("the news fixture is deleted", !existsSync(join(root, "src/data/news.ts")), null);
check("news is no longer a fixture domain", !/"news"/.test(code("src/lib/content/fixtures.ts")), null);

// ── Database ───────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("Missing Supabase env vars."); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });
const TAG = "Suite news";
const FIXTURE = "news/suite-";
let headId, pyhId, crashed;

try {
  console.log("\n── Schema ──");
  const probe = await admin.from("news_posts").select("id").limit(1);
  check("the news_posts table exists", !probe.error, probe.error?.message);
  const migration = readdirSync(join(root, "supabase/migrations")).filter((f) => /news/.test(f))
    .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8")).join("\n");
  check("the news migration exists", migration.length > 0, null);
  check("the news migration inserts no posts", !/insert\s+into\s+news_posts/i.test(migration), null);

  const [clusterA] = (await admin.from("clusters").select("id").order("name")).data ?? [];
  if (!clusterA) throw new Error("Need a cluster seeded.");
  const headEmail = `newstest_head_${crypto.randomUUID()}@example.com`;
  const pyhEmail = `newstest_pyh_${crypto.randomUUID()}@example.com`;
  const headPw = crypto.randomUUID(), pyhPw = crypto.randomUUID();
  headId = (await admin.auth.admin.createUser({ email: headEmail, password: headPw, email_confirm: true })).data.user.id;
  pyhId = (await admin.auth.admin.createUser({ email: pyhEmail, password: pyhPw, email_confirm: true })).data.user.id;
  await admin.from("admins").insert([
    { user_id: headId, role: "cluster_head", cluster_id: clusterA.id, is_active: true, full_name: "News Suite Head" },
    { user_id: pyhId, role: "provincial_youth_head", cluster_id: null, is_active: true, full_name: "News Suite PYH" },
  ]);

  const post = (over = {}) => ({ title: `${TAG} ${crypto.randomUUID().slice(0, 8)}`, excerpt: "Suite excerpt", category: "Announcement", ...over });
  const realObject = async () => {
    const key = `${FIXTURE}${crypto.randomUUID()}.png`;
    const up = await admin.storage.from("media").upload(key, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" });
    if (up.error) throw new Error(`fixture upload failed: ${up.error.message}`);
    return key;
  };

  console.log("\n── Constraints ──");
  const ok = await admin.from("news_posts").insert(post()).select("id");
  check("a post with just a title, excerpt and format saves", !ok.error, ok.error?.message);
  const badCat = await admin.from("news_posts").insert(post({ category: "Rumour" })).select("id");
  check("an unknown format is rejected", !!badCat.error, badCat.data);
  const blankTitle = await admin.from("news_posts").insert(post({ title: "  " })).select("id");
  check("a blank title is rejected", !!blankTitle.error, blankTitle.data);
  const jsLink = await admin.from("news_posts").insert(post({ external_url: "javascript:alert(1)" })).select("id");
  check("a javascript: link is rejected", !!jsLink.error, jsLink.data);
  const httpLink = await admin.from("news_posts").insert(post({ external_url: "http://example.org" })).select("id");
  check("a plain http link is rejected", !!httpLink.error, httpLink.data);
  const httpsLink = await admin.from("news_posts").insert(post({ external_url: "https://www.facebook.com/zubidayfc/posts/1" })).select("id");
  check("an https link saves", !httpsLink.error, httpsLink.error?.message);
  const coverNoConsent = await admin.from("news_posts").insert(post({ cover_path: `${FIXTURE}x.jpg` })).select("id");
  check("a cover without a recorded publishing permission is rejected", !!coverNoConsent.error, coverNoConsent.data);
  const coverExternal = await admin.from("news_posts").insert(post({ cover_path: "https://picsum.photos/x", cover_consent_confirmed_at: new Date().toISOString(), cover_consent_confirmed_by: pyhId })).select("id");
  check("an external URL cannot stand in for an uploaded cover", !!coverExternal.error, coverExternal.data);
  const deadWithCover = await admin.from("news_posts").insert(post({ deleted_at: new Date().toISOString(), cover_path: `${FIXTURE}y.jpg`, cover_consent_confirmed_at: new Date().toISOString(), cover_consent_confirmed_by: pyhId })).select("id");
  check("a deleted post cannot keep a cover", !!deadWithCover.error, deadWithCover.data);

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
    const r = await admin.from("news_posts").insert(post(over)).select("id").single();
    if (r.error) throw new Error(`fixture insert failed: ${r.error.message}`);
    return r.data.id;
  };
  const pub = await mk({ is_published: true });
  const draft = await mk({ is_published: false });
  const gone = await mk({ is_published: true, deleted_at: new Date().toISOString() });

  const seen = (await anonClient.from("news_posts").select("id").in("id", [pub, draft, gone])).data?.map((r) => r.id) ?? [];
  check("the public sees published posts", seen.includes(pub), seen);
  check("the public never sees a draft or a deleted post", !seen.includes(draft) && !seen.includes(gone), seen);
  const anonInsert = await anonClient.from("news_posts").insert(post()).select("id");
  check("the public cannot insert", !!anonInsert.error || (anonInsert.data ?? []).length === 0, anonInsert.data);
  const headInsert = await head.from("news_posts").insert(post()).select("id");
  check("a cluster head CANNOT publish news", !!headInsert.error || (headInsert.data ?? []).length === 0, headInsert.data);
  const headEdit = await head.from("news_posts").update({ title: "Hijack" }).eq("id", pub).select("id");
  check("a cluster head CANNOT edit news", (headEdit.data ?? []).length === 0, headEdit.data);
  const headReadDraft = await head.from("news_posts").select("id").eq("id", draft);
  check("a cluster head does not see drafts", (headReadDraft.data ?? []).length === 0, headReadDraft.data);
  const pyhInsert = await pyh.from("news_posts").insert(post()).select("id");
  check("the PYH CAN add a post", !pyhInsert.error && pyhInsert.data?.length === 1, pyhInsert.error?.message);
  const pyhDraft = await pyh.from("news_posts").select("id").eq("id", draft);
  check("the PYH sees drafts", pyhDraft.data?.length === 1, pyhDraft.data);

  console.log("\n── Direct-API integrity ──");
  const forged = await pyh.from("news_posts").update({ cover_path: await realObject(), cover_consent_confirmed_at: new Date().toISOString(), cover_consent_confirmed_by: headId }).eq("id", draft).select("id");
  check("nobody can record someone else as the cover's permission confirmer", !!forged.error, forged.data);
  const phantom = await pyh.from("news_posts").update({ cover_path: `${FIXTURE}never-uploaded.jpg`, cover_consent_confirmed_at: new Date().toISOString(), cover_consent_confirmed_by: pyhId }).eq("id", draft).select("id");
  check("a cover cannot point at a file that was never uploaded", !!phantom.error, phantom.data);
  const realKey = await realObject();
  const legit = await pyh.from("news_posts").update({ cover_path: realKey, cover_consent_confirmed_at: new Date().toISOString(), cover_consent_confirmed_by: pyhId }).eq("id", draft).select("id");
  check("the PYH CAN set a cover they uploaded and confirmed", !legit.error && legit.data?.length === 1, legit.error?.message);
  const reuse = await pyh.from("news_posts").update({ cover_path: realKey, cover_consent_confirmed_at: new Date().toISOString(), cover_consent_confirmed_by: pyhId }).eq("id", pub).select("id");
  check("a cover cannot be shared with another post", !!reuse.error, reuse.data);
  const reattribute = await pyh.from("news_posts").update({ cover_consent_confirmed_by: headId }).eq("id", draft).select("id");
  check("a cover's confirmer cannot be rewritten", !!reattribute.error, reattribute.data);
  const restamp = await pyh.from("news_posts").update({ cover_consent_confirmed_at: "2020-01-01T00:00:00Z" }).eq("id", draft).select("id");
  check("a cover's permission time cannot be rewritten", !!restamp.error, restamp.data);
  const stale = await pyh.from("news_posts").update({ cover_path: await realObject(), cover_consent_confirmed_at: "2020-01-01T00:00:00Z", cover_consent_confirmed_by: pyhId }).eq("id", pub).select("cover_consent_confirmed_at").single();
  check("a new cover's permission time is stamped by the database",
    !stale.error && Date.now() - Date.parse(stale.data.cover_consent_confirmed_at) < 5 * 60 * 1000, stale.error?.message ?? stale.data);
  const spoof = await pyh.from("news_posts").update({ title: `${TAG} spoof`, updated_by: headId }).eq("id", draft).select("updated_by").single();
  check("updated_by records the real editor", spoof.data?.updated_by === pyhId, spoof.error?.message ?? spoof.data);
  const dropCover = await pyh.from("news_posts").update({ cover_path: null }).eq("id", draft).select("cover_path").single();
  check("a cover can be cleared directly (consent record left is inert)", !dropCover.error && dropCover.data.cover_path === null, dropCover.error?.message);
} catch (e) {
  crashed = e;
} finally {
  console.log("\n── Cleanup ──");
  await admin.from("news_posts").delete().like("title", `${TAG}%`);
  const objs = (await admin.storage.from("media").list("news", { search: "suite-", limit: 1000 })).data ?? [];
  if (objs.length) await admin.storage.from("media").remove(objs.map((o) => `news/${o.name}`));
  await admin.from("admins").delete().in("user_id", [headId, pyhId].filter(Boolean));
  const deletions = await Promise.all([headId, pyhId].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u)));
  check("the throwaway auth users were deleted", deletions.every((d) => !d.error), deletions.map((d) => d.error?.message).filter(Boolean));
  const left = await admin.from("news_posts").select("id").like("title", `${TAG}%`);
  check("the suite left no post fixtures behind", !left.error ? (left.data?.length ?? 0) === 0 : true, left.data);
}

if (crashed) {
  console.error(`\n  Aborted before the end: ${crashed.message}`);
  fail++;
}
console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
