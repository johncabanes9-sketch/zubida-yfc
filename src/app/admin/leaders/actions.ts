"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, loadAdminContext } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { leaderSchema } from "@/lib/validation/leader";
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
  // OWN chapter. Look the chapter's cluster up for the guard; the trigger still
  // owns what is actually stored.
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

  const { data, error } = await db.from("leaders").insert({
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
  }).select("id").maybeSingle();

  if (error) {
    if (error.code === "23505") return { error: "A leader with that name already exists." };
    return { error: "Could not save this leader." };
  }
  if (!data) return { error: "Not permitted." };
  await audit(ctx.userId, "leader.create", data.id);
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
    .select("id, chapter_id, cluster_id").eq("id", id).maybeSingle();
  if (!row) return { error: "Leader not found." };
  const current = row as Pick<LeaderRow, "id" | "chapter_id" | "cluster_id">;

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
  // one land and violate the constraint on its own.
  const consent = message
    ? { consent_at: new Date().toISOString(), consent_by: ctx.userId }
    : {};

  const { data, error } = await db.from("leaders").update({
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

  const { data, error } = await db.from("leaders")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: "Could not delete this leader." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "leader.delete", id);
  revalidatePath("/admin/leaders");
  revalidatePath("/leaders");
  return {};
}
