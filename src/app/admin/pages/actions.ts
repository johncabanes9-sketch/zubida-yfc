"use server";
import { revalidatePath } from "next/cache";
import { requirePYH } from "@/lib/supabase/admin-auth";
import { createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSectionContent } from "@/lib/pages/content-schemas";
import { REGISTRY } from "@/lib/pages/registry";
import { validateImage } from "@/lib/images/validate";
import { pageImageKey } from "@/lib/pages/paths";
import { collectImagePaths, reapPaths } from "@/lib/pages/reap";
import { publicUrl } from "@/lib/images/paths";
import type { PageRow, PageSectionRow } from "@/lib/supabase/database.types";

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log").insert({ actor_user_id: userId, action, entity: "pages", entity_id: id });
  } catch {
    // best-effort; never block the mutation on logging failure
  }
}

async function slugFor(pageId: string): Promise<string> {
  const { data } = await createServiceClient().from("pages").select("slug").eq("id", pageId).single();
  return (data as Pick<PageRow, "slug"> | null)?.slug ?? "";
}

function revalidateFor(slug: string) {
  revalidatePath(slug === "home" ? "/" : `/${slug}`);
  revalidatePath(`/admin/pages/${slug}/edit`);
}

export async function updatePageSeo(pageId: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const seo_title = String(formData.get("seo_title") ?? "").trim().slice(0, 200) || null;
  const seo_description = String(formData.get("seo_description") ?? "").trim().slice(0, 400) || null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("pages")
    .update({ seo_title, seo_description, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", pageId).select("slug");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted or not found." };
  await audit(ctx.userId, "page.seo.update", pageId);
  revalidateFor((data[0] as Pick<PageRow, "slug">).slug);
  return {};
}

export async function addSection(pageId: string, type: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const def = REGISTRY[type];
  if (!def) return { error: "Unknown section type." };
  const supabase = await createServerSupabase();
  const { data: last } = await supabase.from("page_sections")
    .select("sort_order").eq("page_id", pageId).order("sort_order", { ascending: false }).limit(1);
  const next = ((last as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await supabase.from("page_sections")
    .insert({ page_id: pageId, type, content: def.defaultContent, sort_order: next, visible: true }).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, `page.section.add.${type}`, pageId);
  revalidateFor(await slugFor(pageId));
  return {};
}

export async function updateSectionContent(sectionId: string, content: unknown): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, type").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "type">;
  const parsed = parseSectionContent(row.type, content);
  if (!parsed.ok) return { error: parsed.reason };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections")
    .update({ content: parsed.data, updated_at: new Date().toISOString() }).eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.update", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function uploadSectionImage(sectionId: string, fieldKey: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };

  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, type, content").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "type" | "content">;
  const slug = await slugFor(row.page_id);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const key = pageImageKey(slug, v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  // Merge the new image into content[fieldKey], preserving other fields.
  const current = (row.content ?? {}) as Record<string, any>;
  const prevField = (current[fieldKey] ?? {}) as Record<string, any>;
  const nextContent = { ...current, [fieldKey]: { ...prevField, src: publicUrl(key), objectPath: key,
    width: prevField.width ?? 900, height: prevField.height ?? 700, alt: prevField.alt ?? "" } };

  const parsed = parseSectionContent(row.type, nextContent);
  if (!parsed.ok) { await svc.storage.from("media").remove([key]); return { error: parsed.reason }; }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections")
    .update({ content: parsed.data, updated_at: new Date().toISOString() }).eq("id", sectionId).select("id");
  if (error || !data || data.length === 0) { await svc.storage.from("media").remove([key]); return { error: error?.message ?? "Not permitted." }; }

  // Reap the previously-owned image, if any (best-effort — new image already saved).
  const old = collectImagePaths(row.content).filter((p) => p !== key);
  if (old.length > 0) await reapPaths(svc, old);

  await audit(ctx.userId, "page.section.image", sectionId);
  revalidateFor(slug);
  return {};
}

/**
 * Clears an image field and deletes the object we owned for it. The storage
 * object is removed BEFORE the content update so a failure leaves the section
 * pointing at a file that still exists, rather than orphaning bytes nobody
 * references — the same ordering `deleteSection` uses.
 */
export async function removeSectionImage(sectionId: string, fieldKey: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, type, content").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "type" | "content">;

  const current = (row.content ?? {}) as Record<string, unknown>;
  if (current[fieldKey] == null) return {};

  const owned = collectImagePaths({ [fieldKey]: current[fieldKey] });
  const reap = await reapPaths(svc, owned);
  if (reap.error) return { error: reap.error };

  const parsed = parseSectionContent(row.type, { ...current, [fieldKey]: null });
  if (!parsed.ok) return { error: parsed.reason };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections")
    .update({ content: parsed.data, updated_at: new Date().toISOString() }).eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.image.remove", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function deleteSection(sectionId: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, content").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "content">;

  // Remove owned objects BEFORE the row; abort on failure (no untraceable orphan).
  const reap = await reapPaths(svc, collectImagePaths(row.content));
  if (reap.error) return { error: reap.error };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections").delete().eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.delete", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function reorderSection(sectionId: string, direction: "up" | "down"): Promise<{ error?: string }> {
  await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, sort_order").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "sort_order">;
  const { data: neighbour } = await svc.from("page_sections")
    .select("id, sort_order").eq("page_id", row.page_id)
    .order("sort_order", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("sort_order", row.sort_order).limit(1).maybeSingle();
  if (!neighbour) return {};
  const supabase = await createServerSupabase();
  await supabase.from("page_sections").update({ sort_order: (neighbour as any).sort_order }).eq("id", row.id);
  await supabase.from("page_sections").update({ sort_order: row.sort_order }).eq("id", (neighbour as any).id);
  revalidateFor(await slugFor(row.page_id));
  return {};
}

export async function toggleSectionVisible(sectionId: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  const { data: sec } = await svc.from("page_sections").select("id, page_id, visible").eq("id", sectionId).single();
  if (!sec) return { error: "Section not found." };
  const row = sec as Pick<PageSectionRow, "id" | "page_id" | "visible">;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("page_sections").update({ visible: !row.visible }).eq("id", sectionId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "page.section.visible", sectionId);
  revalidateFor(await slugFor(row.page_id));
  return {};
}
