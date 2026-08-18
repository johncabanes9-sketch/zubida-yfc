"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { ChapterRow } from "@/lib/supabase/database.types";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
    slug: slugify(name),
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
  const svc = createServiceClient();
  const { data: row } = await svc.from("chapters").select("id, cluster_id").eq("id", id).single();
  if (!row) return { error: "Chapter not found." };
  const ctx = await requireClusterAccess((row as Pick<ChapterRow, "cluster_id">).cluster_id);

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
