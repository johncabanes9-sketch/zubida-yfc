// Proves the leadership directory: schema, the consent constraint, cluster-scoped
// RLS, public withholding, and that no fabricated person can enter the table.
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("Missing Supabase env vars."); process.exit(1); }

const admin = createClient(url, service, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

console.log("\n── Schema ──");

const probe = await admin.from("leaders").select("id").limit(1);
check("the leaders table exists", !probe.error, probe.error?.message);

// Every row this suite creates carries this prefix, so Cleanup can sweep its
// own fixtures without touching anything else. A blanket delete would work
// only while the table is empty -- and this branch is the one that makes it
// writable, so it is the last safe moment to scope it.
const FIXTURE = "suite-ld-";

// The migration must seed nothing. This is the content rule made executable: a
// later seed intended to make the page look finished fails here. `!all.error`
// matters as much as the count: without it a failed query reads as a passing
// "zero rows", exactly as prove-chapters.mjs guards against.
const all = await admin.from("leaders").select("id, slug");
const foreign = (all.data ?? []).filter((r) => !r.slug.startsWith(FIXTURE));
check("the migration seeds zero leader rows", !all.error && foreign.length === 0,
  all.error?.message ?? foreign.map((r) => r.slug));

// Rows this suite did not create mean a real leadership directory exists in
// this database. Everything below inserts, mutates policies, deletes admin
// users, and sweeps rows -- none of which belongs anywhere near real people's
// records. Refuse to run rather than assume. check() alone cannot stop this:
// it counts a failure and keeps going.
if (all.error || foreign.length > 0) {
  console.error("\n  Refusing to continue: the leaders table holds rows this suite did not create.");
  process.exit(1);
}

// Self-heal whatever a previous interrupted run left behind. Fixtures only --
// the guard above has already established there is nothing else here.
await admin.from("leaders").delete().like("slug", `${FIXTURE}%`);

// 0026 is a second leaders migration (policies and the derive trigger, not the
// table) -- scan every migration file with "leaders" in its name, not just
// 0025, so a later leaders migration cannot slip an insert or a placeholder
// image in unscanned. Also asserts the scan found something: an empty file
// list would make both checks below pass vacuously.
const leaderMigrationFiles = readdirSync(join(root, "supabase/migrations"))
  .filter((f) => f.includes("leader") && f.endsWith(".sql"));
check("the leaders migrations are all scanned", leaderMigrationFiles.length >= 2,
  leaderMigrationFiles);
const leaderSql = leaderMigrationFiles
  .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"))
  .join("\n");
check("the leaders migrations insert no leader rows",
  !/insert\s+into\s+leaders/i.test(leaderSql), leaderMigrationFiles);
check("the leaders migrations carry no placeholder imagery",
  !/picsum\.photos|i\.pravatar\.cc/i.test(leaderSql), leaderMigrationFiles);

// Everything that creates a row runs inside this block, and Cleanup runs in
// the finally. Without it, ANY failure between here and Cleanup -- a thrown
// TypeError from an unguarded fixture deref, or one of the fixture helpers
// calling process.exit, which does not run finally blocks either -- left
// every row created so far in the database. Those orphans are what broke
// prove:chapters during Task 7 and cost commit 8dbe2d8. Mirrors the
// try/finally prove-chapters.mjs has carried since its own slice.
let headId, pyhId;
let crashed = null;
try {
  console.log("\n── Consent is a constraint, not a convention ──");

  // A face with no recorded basis for publishing it must not be storable at all.
  // Storing-then-hiding is the weaker design the spec rejects.
  const photoNoConsent = await admin.from("leaders")
    .insert({ name: "Consent Probe A", slug: `suite-ld-probe-a-${crypto.randomUUID()}`,
              position: "Probe", photo_path: "leaders/probe/x.jpg" })
    .select("id").maybeSingle();
  check("a photo without consent is rejected", !!photoNoConsent.error, photoNoConsent.data);

  const messageNoConsent = await admin.from("leaders")
    .insert({ name: "Consent Probe B", slug: `suite-ld-probe-b-${crypto.randomUUID()}`,
              position: "Probe", message: "A quote attributed to a named person." })
    .select("id").maybeSingle();
  check("a quote without consent is rejected", !!messageNoConsent.error, messageNoConsent.data);

  // Name and position alone carry no personal content, so they need no consent.
  const plain = await admin.from("leaders")
    .insert({ name: "Consent Probe C", slug: `suite-ld-probe-c-${crypto.randomUUID()}`, position: "Probe" })
    .select("id").maybeSingle();
  check("a leader with no photo and no quote saves without consent",
    !plain.error && !!plain.data?.id, plain.error?.message);

  console.log("\n── Cluster-scoped RLS ──");

  const clusters = await admin.from("clusters").select("id, name").order("name");
  const [clusterA, clusterB] = clusters.data ?? [];
  // Throws rather than exits: this is inside the try, and a leader row was
  // already inserted above -- process.exit does not run the finally block.
  if (!clusterA || !clusterB) throw new Error("Need two clusters seeded.");

  // Throwaway accounts. Deleted in Cleanup; never reuse a real admin here.
  const headEmail = `leadertest_head_${crypto.randomUUID()}@example.com`;
  const pyhEmail = `leadertest_pyh_${crypto.randomUUID()}@example.com`;
  const headPw = crypto.randomUUID();
  const pyhPw = crypto.randomUUID();

  headId = (await admin.auth.admin.createUser({
    email: headEmail, password: headPw, email_confirm: true })).data.user.id;
  pyhId = (await admin.auth.admin.createUser({
    email: pyhEmail, password: pyhPw, email_confirm: true })).data.user.id;

  await admin.from("admins").insert([
    { user_id: headId, role: "cluster_head", cluster_id: clusterA.id, is_active: true,
      full_name: "Leader Suite Cluster Head" },
    { user_id: pyhId, role: "provincial_youth_head", cluster_id: null, is_active: true,
      full_name: "Leader Suite PYH" },
  ]);

  // The consent constraint's ACCEPT branch. The Consent section above can only
  // reach the reject branch: it runs before any auth.users row exists, and
  // consent_by is a foreign key to auth.users, so a satisfied constraint was
  // untestable there. A CHECK that rejected every photo would have passed those
  // assertions too. This is the first point in the suite where a real user id
  // exists, so it is the first point where the accept branch can be proven.
  const consentAccepted = await admin.from("leaders").insert({
    name: "Consent Accept Probe", slug: `suite-ld-accept-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", photo_path: "leaders/probe/accept.jpg",
    consent_at: new Date().toISOString(), consent_by: pyhId }).select("id").maybeSingle();
  check("a photo WITH consent recorded saves", !consentAccepted.error, consentAccepted.error?.message);

  const signedIn = async (email, password) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email, password });
    if (r.error) throw new Error(`sign-in failed: ${r.error.message}`);
    return c;
  };
  const headClient = await signedIn(headEmail, headPw);
  const pyhClient = await signedIn(pyhEmail, pyhPw);

  // Seed one row in each cluster through the service client (bypasses RLS on purpose:
  // this is fixture setup, not an assertion).
  const mkLeader = async (cluster_id, name) => {
    const r = await admin.from("leaders").insert({
      name, slug: `suite-ld-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
      position: "Suite Fixture", cluster_id, is_published: true }).select("id").maybeSingle();
    if (r.error || !r.data?.id) throw new Error(`fixture insert failed: ${r.error?.message ?? "no row returned"}`);
    return r.data.id;
  };
  const rowA = await mkLeader(clusterA.id, "Suite Leader A");
  const rowB = await mkLeader(clusterB.id, "Suite Leader B");

  // Read is deliberately province-wide for any admin. Hiding the province from the
  // people running parts of it buys no confidentiality.
  const headReadsB = await headClient.from("leaders").select("id").eq("id", rowB);
  check("a cluster head CAN read another cluster's leader",
    headReadsB.data?.length === 1, headReadsB.data);

  const ownEdit = await headClient.from("leaders")
    .update({ position: "Edited By Own Head" }).eq("id", rowA).select("id");
  check("a cluster head CAN edit their own cluster's leader",
    !ownEdit.error && ownEdit.data?.length === 1, ownEdit.error?.message ?? ownEdit.data);

  // RLS denial returns 0 rows affected, not an error. Assert on the row count AND
  // re-read the value: "no error" alone would pass against a missing policy.
  const foreignEdit = await headClient.from("leaders")
    .update({ position: "Edited By Foreign Head" }).eq("id", rowB).select("id");
  const bAfter = await admin.from("leaders").select("position").eq("id", rowB).maybeSingle();
  check("a cluster head CANNOT edit another cluster's leader",
    (foreignEdit.data?.length ?? 0) === 0 && bAfter.data?.position === "Suite Fixture",
    { affected: foreignEdit.data?.length, position: bAfter.data?.position });

  // This statement takes a different path than the others: `using` PASSES here
  // (rowA is in cluster A, and so is the head), so the row is not filtered out —
  // `with check` rejects the new row image instead, which Postgres surfaces as an
  // error (42501), not as a zero-row result. Asserting on `data?.length` alone
  // would never go green for this statement (data is null on error, so neither
  // `?? 0` nor `?? -1` reaches a real zero) — assert on the rejection AND re-read
  // the row through the service-role client to confirm it never moved, matching
  // the identical scenario already solved this way in prove-chapters.mjs.
  const moveOut = await headClient.from("leaders")
    .update({ cluster_id: clusterB.id }).eq("id", rowA).select("id");
  const aAfterMove = await admin.from("leaders").select("cluster_id").eq("id", rowA).maybeSingle();
  check("a cluster head CANNOT move a leader into another cluster",
    !!moveOut.error && aAfterMove.data?.cluster_id === clusterA.id,
    { error: moveOut.error?.message, cluster_id: aAfterMove.data?.cluster_id });

  const foreignInsert = await headClient.from("leaders").insert({
    name: "Foreign Insert", slug: `suite-ld-foreign-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", cluster_id: clusterB.id }).select("id");
  // An error alone would also be satisfied by a slug collision, a not-null
  // violation, or a typo'd column. The service-role re-read on a fixed name is
  // what makes this an assertion about the policy.
  const foreignInserted = await admin.from("leaders").select("id").eq("name", "Foreign Insert");
  check("a cluster head CANNOT create a leader in another cluster",
    !!foreignInsert.error && (foreignInserted.data?.length ?? -1) === 0,
    { error: foreignInsert.error?.message, stored: foreignInserted.data });

  // Provincial-level rows have cluster_id null. `null = uuid` is null, not true,
  // so the cluster-head policy never matches them.
  const provincial = await admin.from("leaders").insert({
    name: "Suite Provincial", slug: `suite-ld-prov-${crypto.randomUUID().slice(0, 8)}`,
    position: "Provincial Fixture" }).select("id").maybeSingle();
  const provEdit = await headClient.from("leaders")
    .update({ position: "Edited Provincial" }).eq("id", provincial.data.id).select("id");
  const provAfter = await admin.from("leaders")
    .select("position").eq("id", provincial.data.id).maybeSingle();
  check("a cluster head CANNOT edit a provincial-level leader",
    (provEdit.data?.length ?? -1) === 0 && provAfter.data?.position === "Provincial Fixture",
    { affected: provEdit.data?.length, position: provAfter.data?.position });

  const pyhEdit = await pyhClient.from("leaders")
    .update({ position: "Edited By PYH" }).eq("id", provincial.data.id).select("id");
  check("the PYH CAN edit a provincial-level leader",
    !pyhEdit.error && pyhEdit.data?.length === 1, pyhEdit.error?.message);

  // The app soft-deletes. A hard delete would bypass the deleted_at trail, so no
  // policy covers DELETE for a cluster head and Postgres denies it outright.
  const hardDelete = await headClient.from("leaders").delete().eq("id", rowA).select("id");
  const stillThere = await admin.from("leaders").select("id").eq("id", rowA);
  check("a cluster head CANNOT hard-delete even their own cluster's leader",
    (hardDelete.data?.length ?? 0) === 0 && stillThere.data?.length === 1,
    { affected: hardDelete.data?.length });

  console.log("\n── The trigger must not become an escalation path ──");

  // THE assertion of this task. cluster_id is derived from chapter_id by a BEFORE
  // trigger. If RLS WITH CHECK were evaluated BEFORE that trigger, a cluster head
  // could point a row at another cluster's chapter and the trigger would walk the
  // row out of their authority — a silent privilege escalation. This asserts the
  // ordering the design depends on, rather than assuming it.
  const chapterInB = await admin.from("chapters").insert({
    name: "Suite Chapter In B", slug: `suite-ch-${crypto.randomUUID().slice(0, 8)}`,
    municipality: "Suite", cluster_id: clusterB.id }).select("id").maybeSingle();
  if (chapterInB.error || !chapterInB.data?.id) throw new Error(`chapter fixture failed: ${chapterInB.error?.message ?? "no row returned"}`);

  // The row claims the head's OWN cluster while naming a chapter in another one.
  // That combination is what makes this probe discriminating: if `with check` ran
  // against the submitted row it would see cluster_id = A and allow the insert,
  // and the trigger would then rewrite the stored row to cluster B. Only an order
  // where the trigger runs first denies it. Sending chapter_id alone does NOT
  // prove this — cluster_id would be null, and `null = A` denies the insert
  // whether or not the trigger ever fired. Verified: with the trigger body
  // reduced to `return new`, this assertion goes red; the chapter_id-only form
  // stayed green.
  const escalate = await headClient.from("leaders").insert({
    name: "Escalation Probe", slug: `suite-ld-esc-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", chapter_id: chapterInB.data.id, cluster_id: clusterA.id }).select("id");
  const escalated = await admin.from("leaders").select("id, cluster_id").eq("name", "Escalation Probe");
  check("a cluster head CANNOT escalate by pointing a leader at another cluster's chapter",
    !!escalate.error && (escalated.data?.length ?? -1) === 0,
    { error: escalate.error?.message, stored: escalated.data });

  // The same attempt without naming a cluster at all. Denied for a different
  // reason (derived null, or derived B — either fails the check), but it is the
  // shape an app bug would produce, so it is worth its own line.
  const escalateBlind = await headClient.from("leaders").insert({
    name: "Escalation Probe Blind", slug: `suite-ld-escb-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", chapter_id: chapterInB.data.id }).select("id");
  const escalatedBlind = await admin.from("leaders").select("id").eq("name", "Escalation Probe Blind");
  check("a cluster head CANNOT create a leader in another cluster's chapter without naming a cluster",
    !!escalateBlind.error && (escalatedBlind.data?.length ?? -1) === 0,
    { error: escalateBlind.error?.message, stored: escalatedBlind.data });

  // The UPDATE half of the same vector. leaders_derive_cluster fires on update
  // too, so the escalation is reachable by editing an existing in-cluster row
  // rather than creating one: USING matches rowA while it is still in cluster A,
  // the trigger then derives cluster B from the new chapter_id, and WITH CHECK
  // has to deny on the derived value. Re-reading both columns is the point --
  // an error that left chapter_id rewritten would be an escalation that merely
  // reported itself.
  const escalateUpdate = await headClient.from("leaders")
    .update({ chapter_id: chapterInB.data.id }).eq("id", rowA).select("id");
  const rowAAfter = await admin.from("leaders")
    .select("cluster_id, chapter_id").eq("id", rowA).maybeSingle();
  check("a cluster head CANNOT escalate by moving a leader onto another cluster's chapter",
    !!escalateUpdate.error
      && rowAAfter.data?.cluster_id === clusterA.id
      && rowAAfter.data?.chapter_id === null,
    { error: escalateUpdate.error?.message, stored: rowAAfter.data });

  // The trigger still has to work for the legitimate case.
  const chapterInA = await admin.from("chapters").insert({
    name: "Suite Chapter In A", slug: `suite-ch-${crypto.randomUUID().slice(0, 8)}`,
    municipality: "Suite", cluster_id: clusterA.id }).select("id").maybeSingle();
  const derived = await headClient.from("leaders").insert({
    name: "Derive Probe", slug: `suite-ld-der-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", chapter_id: chapterInA.data.id }).select("id, cluster_id").maybeSingle();
  check("the trigger derives cluster_id from chapter_id for an in-cluster chapter",
    !derived.error && derived.data?.cluster_id === clusterA.id,
    derived.error?.message ?? derived.data?.cluster_id);

  // The spec lists this under Risks. `on delete restrict` is the difference
  // between a blocked delete and a leader silently orphaned from their chapter,
  // so assert it rather than assume it.
  const restricted = await admin.from("chapters").delete().eq("id", chapterInA.data.id).select("id");
  check("a chapter cannot be hard-deleted while a leader points at it",
    !!restricted.error, restricted.data);

  console.log("\n── The public sees only what was published ──");

  // No sign-in. This is the client the website itself uses, and leaders_public_read
  // is the only policy standing between an unpublished draft and the open web.
  const publicClient = createClient(url, anon, { auth: { persistSession: false } });

  const mkPublicFixture = async (name, fields) => {
    const r = await admin.from("leaders").insert({
      name, slug: `suite-ld-pub-${crypto.randomUUID().slice(0, 8)}`, position: "Public Fixture",
      cluster_id: clusterA.id, ...fields }).select("id").maybeSingle();
    if (r.error || !r.data?.id) throw new Error(`public fixture failed: ${r.error?.message ?? "no row returned"}`);
    return r.data.id;
  };
  const livePublished = await mkPublicFixture("Public Live", { is_published: true });
  const draftRow = await mkPublicFixture("Public Draft", { is_published: false });
  const softDeleted = await mkPublicFixture("Public Soft Deleted",
    { is_published: true, deleted_at: new Date().toISOString() });

  const anonLive = await publicClient.from("leaders").select("id").eq("id", livePublished);
  check("an anonymous reader sees a published, undeleted leader",
    anonLive.data?.length === 1, anonLive.error?.message ?? anonLive.data);

  // `?? -1` rather than `?? 0`: an error would leave data null, and an assertion
  // that treats "the query blew up" as "the row was withheld" is not a test.
  const anonDraft = await publicClient.from("leaders").select("id").eq("id", draftRow);
  check("an anonymous reader does NOT see an unpublished draft",
    (anonDraft.data?.length ?? -1) === 0, anonDraft.error?.message ?? anonDraft.data);

  const anonDeleted = await publicClient.from("leaders").select("id").eq("id", softDeleted);
  check("an anonymous reader does NOT see a soft-deleted leader",
    (anonDeleted.data?.length ?? -1) === 0, anonDeleted.error?.message ?? anonDeleted.data);

  console.log("\n── updated_at is maintained by the database ──");

  // 0025 attached no set_updated_at trigger, so updated_at never moved after
  // insert and the column reported a last-changed time that was never true.
  const stampProbe = await admin.from("leaders").insert({
    name: "Stamp Probe", slug: `suite-ld-stamp-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe" }).select("id, created_at, updated_at").maybeSingle();
  check("a fresh row starts with updated_at equal to created_at",
    !!stampProbe.data && stampProbe.data.created_at === stampProbe.data.updated_at,
    stampProbe.error?.message ?? stampProbe.data);

  await admin.from("leaders").update({ position: "Touched" }).eq("id", stampProbe.data.id);
  const touched = await admin.from("leaders")
    .select("created_at, updated_at").eq("id", stampProbe.data.id).maybeSingle();
  // Ordering only. Nothing here depends on how long the update took.
  check("updated_at advances past created_at when the row is updated",
    !!touched.data && new Date(touched.data.updated_at) > new Date(touched.data.created_at),
    touched.error?.message ?? touched.data);

  console.log("\n── Public read ──");

  const { getLeaders } = await import("../src/lib/data/leaders.ts");

  const pubA = await admin.from("leaders").insert({
    name: "Published Leader", slug: `suite-ld-pub-${crypto.randomUUID().slice(0, 8)}`,
    position: "Provincial Coordinator", is_published: true }).select("id").maybeSingle();
  const draft = await admin.from("leaders").insert({
    name: "Draft Leader", slug: `suite-ld-draft-${crypto.randomUUID().slice(0, 8)}`,
    position: "Draft" }).select("id").maybeSingle();

  // A second published leader that survives the soft-delete below. Without one,
  // the absence assertion has nothing to be measured against.
  const pubB = await admin.from("leaders").insert({
    name: "Surviving Leader", slug: `suite-ld-surv-${crypto.randomUUID().slice(0, 8)}`,
    position: "Area Coordinator", is_published: true }).select("id").maybeSingle();

  const published = await getLeaders();
  const ids = published.map((l) => l.id);
  check("getLeaders returns published leaders", ids.includes(pubA.data.id), ids);
  check("getLeaders omits drafts", !ids.includes(draft.data.id), ids);

  const softDeleteUpdate = await admin.from("leaders")
    .update({ deleted_at: new Date().toISOString() }).eq("id", pubA.data.id).select("id");
  check("the soft-delete update succeeded", softDeleteUpdate.data?.length === 1, softDeleteUpdate.error?.message);
  const afterDelete = (await getLeaders()).map((l) => l.id);
  check("a soft-deleted leader leaves the public list", !afterDelete.includes(pubA.data.id), afterDelete);

  // getLeaders() is contractually required to swallow any database error into []
  // (the no-fixture-fallback guarantee) — so on its own, the absence check above
  // cannot tell "the deleted_at filter correctly excluded pubA" apart from "this
  // call errored and returned []". Pairing it with a presence assertion on the
  // SAME afterDelete result closes that gap. This is the identical defect fixed
  // for chapters in cb27541; do not remove it as redundant, it is what makes the
  // line above mean anything.
  check("getLeaders still returns other published leaders after the soft-delete",
    afterDelete.includes(pubB.data.id), afterDelete);

  const noPhoto = published.find((l) => l.id === pubA.data.id);
  check("a leader with no photo_path yields photo === null", noPhoto?.photo === null, noPhoto?.photo);
  check("a leader with no message yields message === null", noPhoto?.message === null, noPhoto?.message);

  console.log("\n── Partial saves and validation ──");

  // Only name and position are required. A required field with no known value is
  // what makes someone type something plausible.
  const partial = await admin.from("leaders").insert({
    name: "Partial Leader", slug: `suite-ld-part-${crypto.randomUUID().slice(0, 8)}`,
    position: "Coordinator" }).select("*").maybeSingle();
  check("a leader saves with chapter, message, and socials all blank",
    !partial.error && partial.data.message === null && partial.data.chapter_id === null,
    partial.error?.message);
  check("a new leader is unpublished by default",
    partial.data?.is_published === false, partial.data?.is_published);

  // The "#" bug the audit logged: every fixture profile had socials of "#".
  const hashLink = await admin.from("leaders").insert({
    name: "Hash Link", slug: `suite-ld-hash-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", facebook_url: "#" }).select("id");
  check("the database rejects \"#\" as a social link", !!hashLink.error, hashLink.data);

  const httpLink = await admin.from("leaders").insert({
    name: "Http Link", slug: `suite-ld-http-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", instagram_url: "http://example.com" }).select("id");
  check("the database rejects a non-https social link", !!httpLink.error, httpLink.data);

  // The database CHECK is the floor, not the whole guard. The form layer must
  // reject the same links BEFORE the write: otherwise the admin sees a generic
  // "Could not save this leader." instead of a usable message, and a scheme the
  // CHECK does not contemplate could reach an href unopposed. `javascript:` and
  // `data:` are the ones that matter -- leader-card.tsx renders these values
  // straight into href, and z.string().url() on its own accepts both.
  const { leaderSchema } = await import("../src/lib/validation/leader.ts");
  // Both columns, not just one: they share optionalUrl today, but nothing
  // would catch instagram_url being switched back to the unrefined shape.
  const formAccepts = (field, v) =>
    leaderSchema.safeParse({ name: "N", position: "P", [field]: v }).success;
  for (const field of ["facebook_url", "instagram_url"]) {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://example.com", "#"]) {
      check(`the form layer rejects ${bad} as ${field}`, !formAccepts(field, bad), null);
    }
  }
  check("the form layer accepts an https social link",
    formAccepts("facebook_url", "https://facebook.com/zubidayfc"), null);
  check("the form layer accepts a blank social link", formAccepts("facebook_url", ""), null);
  check("the form layer accepts an omitted social link",
    leaderSchema.safeParse({ name: "N", position: "P" }).success, null);

  const dupSlug = await admin.from("leaders").insert({
    name: "Dup", slug: partial.data.slug, position: "Probe" }).select("id");
  check("the database rejects a duplicate slug", !!dupSlug.error, dupSlug.data);

  console.log("\n── Photos and consent withdrawal ──");

  const consented = await admin.from("leaders").insert({
    name: "Photo Leader", slug: `suite-ld-photo-${crypto.randomUUID().slice(0, 8)}`,
    position: "Probe", photo_path: "leaders/probe/a.jpg",
    consent_at: new Date().toISOString(), consent_by: pyhId })
    .select("id").maybeSingle();
  check("a photo WITH consent recorded saves", !consented.error, consented.error?.message);

  // Withdrawal must be one statement. Clearing consent while the photo remains is
  // exactly the half-done state the constraint exists to forbid.
  const halfWithdraw = await admin.from("leaders")
    .update({ consent_at: null, consent_by: null }).eq("id", consented.data.id).select("id");
  check("clearing consent while a photo remains is rejected", !!halfWithdraw.error, halfWithdraw.data);

  const fullWithdraw = await admin.from("leaders")
    .update({ consent_at: null, consent_by: null, photo_path: null, message: null })
    .eq("id", consented.data.id).select("id");
  check("clearing consent together with the photo and quote succeeds",
    !fullWithdraw.error && fullWithdraw.data?.length === 1, fullWithdraw.error?.message);

  console.log("\n── Photo action statement order (source-level) ──");

  // Order matters, but the direction flips depending on which side of the
  // write is disposable. On a REPLACE (upload), the row must point at the NEW
  // object before the OLD one is reaped -- a crash between them must not leave
  // the page pointing at bytes that are already gone. On a REMOVE or a
  // WITHDRAWAL, the object must be reaped BEFORE the row stops pointing at it
  // -- a crash between them must not orphan the file with nothing left that
  // can find it to delete it later.
  const src = readFileSync(join(root, "src/app/admin/leaders/actions.ts"), "utf8");
  // Bounded at the NEXT function declaration (or EOF for the last function) —
  // an unbounded slice(start) runs to the end of the file, so a later
  // function's text can silently supply the token this function's own body
  // never contained.
  const body = (fn) => {
    const start = src.indexOf(`export async function ${fn}`);
    const next = src.indexOf("\nexport async function", start + 1);
    return src.slice(start, next === -1 ? src.length : next);
  };
  // `-1 < -1` is false, but `indexOf` returning -1 for the FIRST operand and a
  // real index for the second still compares "correctly" — a vacuous pass. This
  // is the exact defect 1b8301e had to close in the chapters slice. Both indices
  // must be real before the ordering means anything.
  const orderedBefore = (hay, first, second) => {
    const a = hay.indexOf(first), b = hay.indexOf(second);
    return a >= 0 && b >= 0 && a < b;
  };

  // Anchored on the actual statements (the update() object key and the reap
  // call), not the bare word "photo_path" — a pre-authorization
  // `.select("...photo_path")` or a comment mentioning either word would
  // satisfy a bare-word match without the real statements being ordered at
  // all. This is what 1b8301e's own fix looked like once applied for real.
  const upload = body("uploadLeaderPhoto");
  check("uploadLeaderPhoto updates photo_path before reaping the replaced photo",
    orderedBefore(upload, "photo_path: key", "reapPaths("), null);
  const remove = body("removeLeaderPhoto");
  check("removeLeaderPhoto reaps the photo before clearing photo_path",
    orderedBefore(remove, "reapPaths(", "photo_path: null"), null);

  const withdraw = body("withdrawConsent");
  // Same rule as removeLeaderPhoto, and the fix this guards: withdrawConsent
  // originally updated the row first and reaped after, swallowing reapPaths()'s
  // error -- a failed removal still reported withdrawal as successful. Nothing
  // else in this suite would catch that regression; the one-update check just
  // below stays green either way.
  check("withdrawConsent reaps the photo before clearing consent",
    orderedBefore(withdraw, "reapPaths(", "photo_path: null"), null);

  // Order-independent on purpose: the three fields must land in ONE update() call,
  // but which order the implementer writes them in is not a correctness property.
  const withdrawUpdate = withdraw.match(/update\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  check("withdrawConsent clears photo_path, message, and consent in ONE update",
    ["photo_path", "message", "consent_at", "consent_by"].every((f) => withdrawUpdate.includes(f)),
    withdrawUpdate.slice(0, 120));

  console.log("\n-- The consent basis follows the quote, not the editor --");

  // The rule the Task 6 review called the worst defect found in this slice, and
  // the only one that had NO assertion of any kind: reverting it left the suite
  // fully green. An admin who merely toggles "Published" on someone else's
  // leader must not become consent_by, with consent_at moved to now -- that
  // names a person who never obtained consent for that quote.
  //
  // Driven directly against the extracted rule, so every branch is exercised
  // rather than matched as source text. The action itself cannot be called here:
  // it needs an authenticated request context (the limitation recorded in Task 5).
  const { consentPatch } = await import("../src/lib/leaders/consent.ts");
  const basis = (over) => consentPatch({
    message: "A quote.", currentMessage: "A quote.", currentConsentAt: "2026-01-01T00:00:00Z",
    currentPhotoPath: null, userId: "editor-2", now: "2026-08-21T00:00:00Z", ...over });

  check("an unchanged quote keeps the basis originally recorded for it",
    Object.keys(basis({})).length === 0, basis({}));
  check("an edited quote is stamped with a fresh basis",
    basis({ message: "A different quote." }).consent_by === "editor-2",
    basis({ message: "A different quote." }));
  check("a quote that never had a basis is stamped rather than left bare",
    basis({ currentConsentAt: null }).consent_by === "editor-2",
    basis({ currentConsentAt: null }));
  check("a new quote on a row that had none is stamped",
    basis({ currentMessage: null, currentConsentAt: null }).consent_by === "editor-2",
    basis({ currentMessage: null, currentConsentAt: null }));
  check("clearing the quote while a photo survives keeps the basis",
    Object.keys(basis({ message: null, currentPhotoPath: "leaders/x/y.jpg" })).length === 0,
    basis({ message: null, currentPhotoPath: "leaders/x/y.jpg" }));
  check("clearing the quote with no photo left clears the basis too",
    basis({ message: null }).consent_at === null && basis({ message: null }).consent_by === null,
    basis({ message: null }));

  // The action must actually USE the rule -- a correct helper nothing calls
  // proves nothing about what gets written.
  // The arguments matter as much as the call. With only a /consentPatch\(\{/
  // match, changing `currentPhotoPath: current.photo_path` to `null` would
  // regress "clearing a quote while a photo survives keeps the basis" while
  // every assertion above stayed green -- the helper would still be correct,
  // and still be called, with the wrong input.
  const updBody = body("updateLeader");
  check("updateLeader decides consent through the shared rule",
    /consentPatch\(\{/.test(updBody), null);
  for (const arg of ["message,", "currentMessage: current.message",
                     "currentConsentAt: current.consent_at",
                     "currentPhotoPath: current.photo_path",
                     "userId: ctx.userId"]) {
    check(`updateLeader passes ${arg.replace(",", "")} to the consent rule`,
      updBody.includes(arg), null);
  }

  // updateLeader recomputed cluster_id from the EDITOR's cluster on every save,
  // so who opened the form silently decided the row's scope. The PYH's
  // clusterId is null, so the PYH merely toggling "Published" on a
  // cluster-scoped leader rewrote cluster_id to null: the row dropped out of
  // leaders_cluster_head_update and the owning cluster head was locked out
  // permanently, with no error shown. Only a row LEAVING a chapter needs a
  // cluster assigned. updateChapter never touches cluster_id at all.
  const upd = body("updateLeader");
  check("updateLeader leaves a chapter-less row's cluster where it is",
    /current\.chapter_id \? ctx\.clusterId : current\.cluster_id/.test(upd), null);

  // deleteLeader carries the same rule as removeLeaderPhoto, and for a stronger
  // reason: the soft delete is the LAST moment the photograph can be reached.
  // The admin list filters on deleted_at, so once the row is soft-deleted no
  // admin surface can ever load it again to remove the file -- and the media
  // bucket is public-read for every object, so the face stays retrievable by
  // anyone holding the URL, forever. Reaping after the update would leave that
  // state behind on any failure; reaping before it cannot.
  const del = body("deleteLeader");
  check("deleteLeader reads photo_path so the photograph can be reaped",
    /\.select\("[^"]*photo_path[^"]*"\)/.test(del), null);
  check("deleteLeader reaps the photo before soft-deleting the row",
    orderedBefore(del, "reapPaths(", "deleted_at:"), null);

  // The other half of the Task 6 Critical: ordering alone is not enough if the
  // reap error is discarded. A swallowed error reports success while the file
  // stays in the bucket. Matched on the statement, not the bare identifier, so
  // a comment mentioning the error cannot satisfy it.
  for (const fn of ["removeLeaderPhoto", "withdrawConsent", "deleteLeader"]) {
    check(`${fn} checks the reap error instead of swallowing it`,
      /if \(reap\.error\) return/.test(body(fn)), null);
  }

  console.log("\n── Admin action guards (source-level) ──");

  const actions = readFileSync(join(root, "src/app/admin/leaders/actions.ts"), "utf8");
  // Counted against the number of exported actions rather than a fixed floor.
  // The `>= 3` form this replaces was written when there were three actions;
  // there are now six, so three could have lost their guard while an assertion
  // named "every leader action" stayed green. Matches call syntax only ("await
  // requireClusterAccess(") rather than any bare occurrence of the identifier:
  // the naive /requireClusterAccess/g form also matched the import statement.
  const exportedActions = (actions.match(/export async function /g) ?? []).length;
  check("every leader action goes through requireClusterAccess",
    exportedActions >= 6
    && (actions.match(/await requireClusterAccess\(/g) ?? []).length === exportedActions,
    { exportedActions, guarded: (actions.match(/await requireClusterAccess\(/g) ?? []).length });
  check("deleteLeader soft-deletes rather than removing the row",
    /deleted_at/.test(actions) && !/\.delete\(\)/.test(actions), null);

  // The RLS-respecting client is the second guard behind requireClusterAccess
  // (see the fix in commit 1c426f5): writing through the service-role client
  // instead bypasses RLS entirely, so the cluster-scoped policies proven above
  // would be decorative on the admin write path.
  //
  // Every write is enumerated and its receiver checked, rather than counting
  // `supabase.` hits and separately forbidding the literal `db.`. That earlier
  // form was bound to one local variable name: renaming `db` to `svc` (which is
  // what the sibling chapters actions call it) or writing
  // `createServiceClient().from("leaders").update(` defeated the negative
  // entirely, while a `>= 3` floor absorbed the rest. This is the regression
  // guard for the fix that cost a full round; it has to be name-independent.
  // Floor plus receiver check, not an equality with the action count: a future
  // exported action that legitimately writes nothing (a reorder, an export)
  // would otherwise red the suite for no reason. The security property lives
  // in the receiver check, which covers every write the pattern finds.
  const leaderWrites = [...actions.matchAll(
    /(\w+)\s*\.from\("leaders"\)\s*\.(insert|update|upsert|delete)\(/g)];
  // A deliberately looser second pass, so a write the strict pattern cannot
  // see (an unusual chain, a formatting the regex does not anticipate) shows
  // up as a COUNT MISMATCH rather than silently escaping the receiver check.
  const looseWrites = [...actions.matchAll(
    /\.from\("leaders"\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/g)];
  check("every leader write goes through the RLS-respecting client",
    leaderWrites.length >= 6 && leaderWrites.every((m) => m[1] === "supabase"),
    leaderWrites.map((m) => `${m[1]}.${m[2]}`));
  check("no leaders write escapes the receiver check",
    looseWrites.length === leaderWrites.length,
    { strict: leaderWrites.length, loose: looseWrites.length });

} catch (e) {
  crashed = e;
} finally {
  console.log("\n── Cleanup ──");
  // Fixture-pattern delete, not a blanket one. The blanket form this replaces
  // (`.delete().not("id", "is", null)`) emptied the WHOLE table with the
  // service-role key against whatever .env.local points at -- harmless only
  // while the table was empty, which is precisely the state this branch ends.
  // Leaders go first: the FK consent_by -> auth.users(id) means every leader row
  // must be gone before deleteUser can succeed. Matching on the prefix rather
  // than on captured ids also lets any run self-heal what an interrupted
  // previous run left behind, the same property commit 8dbe2d8 gave the chapter
  // half of this block.
  await admin.from("leaders").delete().like("slug", `${FIXTURE}%`);
  // Matched on the fixture pattern, not the captured ids: an interrupted run
  // (this slice's policy-mutation testing hit that repeatedly) never reaches
  // this line, so ids captured in THIS run cannot sweep up rows a PRIOR
  // interrupted run left behind. Those orphans then poison prove:chapters,
  // which asserts the migration seeds zero chapter rows.
  await admin.from("chapters").delete()
    .like("slug", "suite-ch-%").like("name", "Suite Chapter In%");
  await admin.from("admins").delete().in("user_id", [headId, pyhId].filter(Boolean));
  // deleteUser's own result is checked. The "admin accounts were removed" check
  // below queries `admins`, which the statement above has already emptied, so it
  // passes whether or not the auth.users rows actually went -- an orphaned auth
  // user would go unreported forever, and the FK from consent_by would then keep
  // failing future runs for a reason nothing here reports.
  const deletions = await Promise.all(
    [headId, pyhId].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u)));
  // Gated on headId: if the try threw before the users were created there is
  // nothing to delete, and reporting FAIL there would point at the wrong cause.
  check("the throwaway auth users were deleted",
    !headId || deletions.every((d) => !d.error),
    deletions.map((d) => d.error?.message).filter(Boolean));
  const leftoverUsers = await admin.from("admins").select("id")
    .in("user_id", [headId, pyhId].filter(Boolean));
  check("the throwaway admin accounts were removed",
    !leftoverUsers.error && (leftoverUsers.data?.length ?? -1) === 0,
    leftoverUsers.error?.message ?? leftoverUsers.data);

  // Scoped to the fixture prefix, not the whole table. Asserting the table is
  // empty would, once real leaders exist, assert that the suite had just
  // destroyed them -- and report green for having done it.
  const leftover = await admin.from("leaders").select("id").like("slug", `${FIXTURE}%`);
  check("the suite left no leader fixtures behind",
    !leftover.error && (leftover.data?.length ?? -1) === 0,
    leftover.error?.message ?? leftover.data);

  const leftoverChapters = await admin.from("chapters")
    .select("id").like("slug", "suite-ch-%");
  check("the suite left no chapter fixtures behind",
    !leftoverChapters.error && (leftoverChapters.data?.length ?? -1) === 0,
    leftoverChapters.error?.message ?? leftoverChapters.data);

}

if (crashed) {
  console.error("");
  console.error(`  Aborted before the end: ${crashed.message}`);
  fail++;
}
console.log("─".repeat(48));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
