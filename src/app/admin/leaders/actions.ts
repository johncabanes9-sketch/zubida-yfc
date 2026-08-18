"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, createServerSupabase, loadAdminContext } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { leaderSchema } from "@/lib/validation/leader";
import { validateImage } from "@/lib/images/validate";
import { leaderImageKey } from "@/lib/leaders/paths";
import { reapPaths } from "@/lib/pages/reap";
import type { LeaderRow } from "@/lib/supabase/database.types";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A name made entirely of non-ASCII-alphanumeric characters (an em dash, or
 * non-Latin script) slugifies to "". Falling through with an empty slug would
 * let a first such row save, then collide with a second — reporting "A leader
 * with that name already exists." for two unrelated names. A random suffix
 * keeps the row creatable without inventing a fake slug from content we don't
 * have.
 */
const slugFor = (name: string) => slugify(name) || crypto.randomUUID().slice(0, 8);

/**
 * Trimmed, or null when blank — blank means withheld, never an empty string.
 * Accepts both a raw FormData value and a parsed (optional) zod string, since
 * this runs on both here.
 */
const optional = (v: FormDataEntryValue | string | null | undefined) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log")
      .insert({ actor_user_id: userId, action, entity: "leaders", entity_id: id });
  } catch {
    // best-effort; never block the mutation on logging failure
  }
}

function parseLeaderForm(formData: FormData) {
  return leaderSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    position: String(formData.get("position") ?? ""),
    chapter_id: String(formData.get("chapter_id") ?? ""),
    message: String(formData.get("message") ?? ""),
    facebook_url: String(formData.get("facebook_url") ?? ""),
    instagram_url: String(formData.get("instagram_url") ?? ""),
  });
}

export async function createLeader(formData: FormData): Promise<{ error?: string }> {
  const ctx = await loadAdminContext();
  const parsed = parseLeaderForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const chapter_id = optional(parsed.data.chapter_id);
  const message = optional(parsed.data.message);

  // cluster_id is sent ONLY for provincial-level rows. When a chapter is chosen
  // the trigger derives it, and sending both invites the two to disagree.
  const cluster_id = chapter_id ? undefined : ctx.clusterId;
  if (!chapter_id && !cluster_id && !ctx.isPYH) {
    return { error: "Choose a chapter, or ask the provincial youth head to add a provincial-level leader." };
  }

  // The guard needs a real cluster to compare against. `cluster_id` is
  // deliberately undefined on the chapter path, and requireClusterAccess()
  // redirects a non-PYH on a null argument (admin-auth.ts:72) — passing
  // `cluster_id ?? null` would bounce a cluster head adding a leader to their
  // OWN chapter. Look the chapter's cluster up for the guard (service role,
  // matching updateChapter's pre-authorization reads); the trigger still owns
  // what is actually stored.
  const db = createServiceClient();
  const guardCluster = chapter_id
    ? (await db.from("chapters").select("cluster_id").eq("id", chapter_id).maybeSingle()).data?.cluster_id ?? null
    : cluster_id ?? null;
  await requireClusterAccess(guardCluster);

  // message and consent move together: the CHECK rejects any statement that
  // sets a quote without a recorded basis for publishing it.
  const consent = message
    ? { consent_at: new Date().toISOString(), consent_by: ctx.userId }
    : {};

  // The actual write goes through the RLS-respecting client — not the
  // service-role `db` above — so the cluster-scoped policies proven in
  // prove-leaders.mjs are a genuine second guard behind requireClusterAccess,
  // matching createChapter exactly.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("leaders").insert({
    name: parsed.data.name,
    slug: slugFor(parsed.data.name),
    position: parsed.data.position,
    chapter_id,
    cluster_id,
    message,
    facebook_url: optional(parsed.data.facebook_url),
    instagram_url: optional(parsed.data.instagram_url),
    updated_by: ctx.userId,
    ...consent,
  }).select("id");

  if (error) {
    if (error.code === "23505") return { error: "A leader with that name already exists." };
    return { error: "Could not save this leader." };
  }
  // An INSERT's WITH CHECK failure always raises an error (there is no
  // existing row for USING to filter), but an empty result is still checked
  // explicitly rather than assumed impossible — the same discipline applied
  // to update/delete below.
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "leader.create", data[0].id);
  revalidatePath("/admin/leaders");
  revalidatePath("/leaders");
  return {};
}

export async function updateLeader(id: string, formData: FormData): Promise<{ error?: string }> {
  // Authenticate BEFORE the service-role read: otherwise an unauthenticated
  // caller gets a distinguishable response ("Leader not found." for an unknown
  // id vs. a redirect for a real one) — a UUID existence oracle, plus an
  // unauthenticated DB round-trip. Matches updateChapter.
  await loadAdminContext();
  const db = createServiceClient();
  const { data: row } = await db.from("leaders")
    .select("id, chapter_id, cluster_id, message, photo_path, consent_at").eq("id", id).maybeSingle();
  if (!row) return { error: "Leader not found." };
  const current = row as Pick<LeaderRow, "id" | "chapter_id" | "cluster_id" | "message" | "photo_path" | "consent_at">;

  // Authorize against the row's CURRENT scope before allowing any change. A
  // chapter-scoped row is guarded by ITS CHAPTER'S cluster (never null — a
  // cluster head editing a leader in their own chapter must not be bounced,
  // same reasoning as createLeader above); a cluster-level row by its own
  // cluster_id; a provincial-level row (both null) opens to the PYH only.
  const currentGuardCluster = current.chapter_id
    ? (await db.from("chapters").select("cluster_id").eq("id", current.chapter_id).maybeSingle()).data?.cluster_id ?? null
    : current.cluster_id;
  const ctx = await requireClusterAccess(currentGuardCluster);

  const parsed = parseLeaderForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const chapter_id = optional(parsed.data.chapter_id);
  const message = optional(parsed.data.message);
  const cluster_id = chapter_id ? undefined : ctx.clusterId;
  if (!chapter_id && !cluster_id && !ctx.isPYH) {
    return { error: "Choose a chapter, or ask the provincial youth head to add a provincial-level leader." };
  }

  // message and consent move together in the SAME update() call: the CHECK
  // rejects any statement that sets a quote without a recorded basis for
  // publishing it, and splitting this into two statements would let the first
  // one land and violate the constraint on its own. An UNCHANGED quote keeps
  // its ORIGINAL basis rather than being re-stamped: without this, an admin
  // who merely toggles "Published" on someone else's leader would silently
  // become consent_by, with consent_at moved to now -- naming a person who
  // never actually obtained consent for that quote. This form never touches
  // photo_path, so when the quote is cleared and no photo already exists on
  // the row, there is no personal content left for the basis to describe --
  // clear it too, rather than leaving consent_at/consent_by dangling and
  // naming a person for content that no longer exists.
  const consent = message
    ? (current.message === message && current.consent_at
        ? {} // unchanged quote keeps the basis originally recorded for it
        : { consent_at: new Date().toISOString(), consent_by: ctx.userId })
    : (current.photo_path ? {} : { consent_at: null, consent_by: null });

  // The actual write goes through the RLS-respecting client — not the
  // service-role `db` used above for the pre-authorization reads — so the
  // cluster-scoped policies are a genuine second guard behind
  // requireClusterAccess, matching updateChapter exactly.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("leaders").update({
    name: parsed.data.name,
    position: parsed.data.position,
    chapter_id,
    cluster_id,
    message,
    facebook_url: optional(parsed.data.facebook_url),
    instagram_url: optional(parsed.data.instagram_url),
    is_published: formData.get("is_published") === "on",
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
    ...consent,
  }).eq("id", id).select("id");

  if (error) {
    if (error.code === "23505") return { error: "A leader with that name already exists." };
    // 42501 is a WITH CHECK rejection — e.g. the derived cluster_id moved the
    // row out of the editor's authority. A 0-row result with no error (an RLS
    // USING mismatch) is handled below, separately, so a denied write is never
    // reported as a silent success either way.
    if (error.code === "42501") return { error: "That change is not permitted." };
    return { error: "Could not save this leader." };
  }
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "leader.update", id);
  revalidatePath("/admin/leaders");
  revalidatePath("/leaders");
  return {};
}

export async function deleteLeader(id: string): Promise<{ error?: string }> {
  await loadAdminContext();
  const db = createServiceClient();
  const { data: row } = await db.from("leaders")
    .select("id, chapter_id, cluster_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Leader not found." };
  const current = row as Pick<LeaderRow, "id" | "chapter_id" | "cluster_id">;

  const guardCluster = current.chapter_id
    ? (await db.from("chapters").select("cluster_id").eq("id", current.chapter_id).maybeSingle()).data?.cluster_id ?? null
    : current.cluster_id;
  const ctx = await requireClusterAccess(guardCluster);

  // Write through the RLS-respecting client, matching deleteChapter.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("leaders")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: "Could not delete this leader." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "leader.delete", id);
  revalidatePath("/admin/leaders");
  revalidatePath("/leaders");
  return {};
}

/** Cluster to authorize against for a row already on hand: its chapter's
 * cluster when chapter-scoped, otherwise its own cluster_id (null for a
 * provincial-level row, matching updateLeader/deleteLeader). */
async function guardClusterFor(
  db: ReturnType<typeof createServiceClient>,
  leader: Pick<LeaderRow, "chapter_id" | "cluster_id">,
) {
  return leader.chapter_id
    ? (await db.from("chapters").select("cluster_id").eq("id", leader.chapter_id).maybeSingle()).data?.cluster_id ?? null
    : leader.cluster_id;
}

export async function uploadLeaderPhoto(id: string, formData: FormData): Promise<{ error?: string }> {
  await loadAdminContext();
  const db = createServiceClient();
  const { data: row } = await db.from("leaders")
    .select("id, chapter_id, cluster_id, slug, photo_path").eq("id", id).single();
  if (!row) return { error: "Leader not found." };
  const leader = row as Pick<LeaderRow, "id" | "chapter_id" | "cluster_id" | "slug" | "photo_path">;
  const ctx = await requireClusterAccess(await guardClusterFor(db, leader));

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const key = leaderImageKey(leader.slug, v.mime);
  const upl = await db.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  // A new photo is new personal content, so consent is stamped fresh here —
  // unlike updateLeader's unchanged-quote exception, there is no prior basis
  // for THIS image to preserve. photo_path and the consent pair land in the
  // SAME update(): the CHECK rejects any statement that separates them, so
  // there is no "upload now, record consent later" path by construction.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("leaders").update({
    photo_path: key,
    consent_at: new Date().toISOString(),
    consent_by: ctx.userId,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    await db.storage.from("media").remove([key]);
    return { error: error?.message ?? "Not permitted." };
  }

  // Reap the replaced photo last: the new one is already saved, so a failure
  // here leaks bytes rather than losing the image the leader now points at.
  if (leader.photo_path && leader.photo_path !== key) {
    await reapPaths(db, [leader.photo_path]);
  }
  await audit(ctx.userId, "leader.photo", id);
  revalidatePath("/leaders");
  revalidatePath("/admin/leaders");
  return {};
}

export async function removeLeaderPhoto(id: string): Promise<{ error?: string }> {
  await loadAdminContext();
  const db = createServiceClient();
  const { data: row } = await db.from("leaders").select("*").eq("id", id).single();
  if (!row) return { error: "Leader not found." };
  const leader = row as LeaderRow;
  const ctx = await requireClusterAccess(await guardClusterFor(db, leader));

  // Object first, then the reference — a failure leaves the row pointing at a
  // file that still exists rather than orphaning bytes nobody references. An
  // empty array is a no-op inside reapPaths, so a leader with no photo simply
  // falls through to clearing a column that is already null.
  const reap = await reapPaths(db, leader.photo_path ? [leader.photo_path] : []);
  if (reap.error) return { error: reap.error };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("leaders")
    .update({ photo_path: null, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "leader.photo.remove", id);
  revalidatePath("/leaders");
  revalidatePath("/admin/leaders");
  return {};
}

export async function withdrawConsent(id: string): Promise<{ error?: string }> {
  await loadAdminContext();
  const db = createServiceClient();
  const { data: row } = await db.from("leaders").select("*").eq("id", id).single();
  if (!row) return { error: "Leader not found." };
  const leader = row as LeaderRow;
  const ctx = await requireClusterAccess(await guardClusterFor(db, leader));

  // All four columns clear in ONE update(): the CHECK ties photo_path/message
  // to consent_at/consent_by, so a statement that cleared consent while
  // either survived is exactly the half-withdrawn state it exists to forbid.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("leaders").update({
    photo_path: null,
    message: null,
    consent_at: null,
    consent_by: null,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };

  if (leader.photo_path) await reapPaths(db, [leader.photo_path]);
  await audit(ctx.userId, "leader.consent.withdraw", id);
  revalidatePath("/leaders");
  revalidatePath("/admin/leaders");
  return {};
}
