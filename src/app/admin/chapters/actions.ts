"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, createServerSupabase, loadAdminContext } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { validateImage } from "@/lib/images/validate";
import { chapterImageKey } from "@/lib/chapters/paths";
import { reapPaths } from "@/lib/pages/reap";
import type { ChapterRow } from "@/lib/supabase/database.types";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A name made entirely of non-ASCII-alphanumeric characters (an em dash, or
 * non-Latin script) slugifies to "". Falling through with an empty slug would
 * let a first such chapter save, then collide with a second — reporting "A
 * chapter with that name already exists." for two unrelated names. A random
 * suffix keeps the row creatable without inventing a fake slug from content
 * we don't have.
 */
const slugFor = (name: string) => slugify(name) || crypto.randomUUID().slice(0, 8);

/** Trimmed, or null when blank — blank means withheld, never an empty string. */
const optional = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log")
      .insert({ actor_user_id: userId, action, entity: "chapters", entity_id: id });
  } catch {
    // best-effort; never block the mutation on logging failure
  }
}

export async function createChapter(formData: FormData): Promise<{ error?: string }> {
  const cluster_id = String(formData.get("cluster_id") ?? "");
  if (!cluster_id) return { error: "Choose a cluster." };
  // Authorize against the cluster the row is going into.
  const ctx = await requireClusterAccess(cluster_id);

  const name = String(formData.get("name") ?? "").trim();
  const municipality = String(formData.get("municipality") ?? "").trim();
  if (!name || !municipality) return { error: "Name and municipality are required." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters").insert({
    cluster_id, name, municipality,
    slug: slugFor(name),
    schedule: optional(formData.get("schedule")),
    coordinator: optional(formData.get("coordinator")),
    updated_by: ctx.userId,
  }).select("id");
  if (error) {
    if (/duplicate key/i.test(error.message)) return { error: "A chapter with that name already exists." };
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.create", data[0].id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}

export async function updateChapter(id: string, formData: FormData): Promise<{ error?: string }> {
  // Authenticate BEFORE the service-role read: otherwise an unauthenticated
  // caller gets a distinguishable response ("Chapter not found." for an
  // unknown id vs. a redirect for a real one) — a UUID existence oracle, plus
  // an unauthenticated DB round-trip. Matches src/app/admin/pages/actions.ts.
  await loadAdminContext();
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  // Authorize against the row's CURRENT cluster before allowing any change.
  const ctx = await requireClusterAccess((row as Pick<ChapterRow, "cluster_id">).cluster_id);

  const name = String(formData.get("name") ?? "").trim();
  const municipality = String(formData.get("municipality") ?? "").trim();
  if (!name || !municipality) return { error: "Name and municipality are required." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters").update({
    name, municipality,
    schedule: optional(formData.get("schedule")),
    coordinator: optional(formData.get("coordinator")),
    is_published: formData.get("is_published") === "on",
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.update", id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}

export async function deleteChapter(id: string): Promise<{ error?: string }> {
  await loadAdminContext();
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id, cover_path").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const ctx = await requireClusterAccess((row as Pick<ChapterRow, "cluster_id">).cluster_id);

  // Reap the cover before soft-deleting: a deleted chapter must not leave an
  // orphaned object behind in storage.
  if ((row as Pick<ChapterRow, "cover_path">).cover_path) {
    const reap = await reapPaths(svc, [(row as Pick<ChapterRow, "cover_path">).cover_path!]);
    if (reap.error) return { error: reap.error };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.delete", id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}

export async function uploadChapterCover(id: string, formData: FormData): Promise<{ error?: string }> {
  await loadAdminContext();
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id, slug, cover_path").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const chapter = row as Pick<ChapterRow, "id" | "cluster_id" | "slug" | "cover_path">;
  const ctx = await requireClusterAccess(chapter.cluster_id);

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const key = chapterImageKey(chapter.slug, v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters")
    .update({ cover_path: key, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    await svc.storage.from("media").remove([key]);
    return { error: error?.message ?? "Not permitted." };
  }

  // Reap the replaced cover last: the new one is already saved, so a failure
  // here leaks bytes rather than losing the image the chapter now points at.
  if (chapter.cover_path && chapter.cover_path !== key) {
    await reapPaths(svc, [chapter.cover_path]);
  }
  await audit(ctx.userId, "chapter.cover", id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}

export async function removeChapterCover(id: string): Promise<{ error?: string }> {
  await loadAdminContext();
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id, cover_path").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const chapter = row as Pick<ChapterRow, "id" | "cluster_id" | "cover_path">;
  const ctx = await requireClusterAccess(chapter.cluster_id);
  if (!chapter.cover_path) return {};

  // Object first, then the reference — a failure leaves the row pointing at a
  // file that still exists rather than orphaning bytes nobody references.
  const reap = await reapPaths(svc, [chapter.cover_path]);
  if (reap.error) return { error: reap.error };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("chapters")
    .update({ cover_path: null, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "chapter.cover.remove", id);
  revalidatePath("/chapters");
  revalidatePath("/admin/chapters");
  return {};
}
