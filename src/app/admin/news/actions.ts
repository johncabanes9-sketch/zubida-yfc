"use server";
import { revalidatePath } from "next/cache";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/supabase/audit";
import { validateImage } from "@/lib/images/validate";
import { newsCoverKey } from "@/lib/news/paths";
import { newsPostSchema } from "@/lib/validation/news";
import { reapPaths } from "@/lib/pages/reap";
import type { NewsPostRow } from "@/lib/supabase/database.types";

/** Trimmed, or null when blank — blank means withheld, never "". */
const optional = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

function audit(userId: string, action: string, id: string) {
  return recordAudit({ actorUserId: userId, action, entity: "news_posts", entityId: id });
}

function revalidate() {
  revalidatePath("/news");
  revalidatePath("/");
  revalidatePath("/admin/news");
}

function parse(formData: FormData) {
  return newsPostSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    excerpt: String(formData.get("excerpt") ?? ""),
    category: String(formData.get("category") ?? ""),
    author: String(formData.get("author") ?? ""),
    external_url: String(formData.get("external_url") ?? ""),
    published_on: String(formData.get("published_on") ?? ""),
  });
}

/** The editable text fields, shared by create and update. Never is_published. */
function fields(data: NonNullable<ReturnType<typeof parse>["data"]>) {
  return {
    title: data.title,
    excerpt: data.excerpt,
    category: data.category,
    author: optional(data.author),
    external_url: optional(data.external_url),
    published_on: data.published_on,
  };
}

async function loadPost(id: string) {
  const { data } = await createServiceClient().from("news_posts")
    .select("id, cover_path").eq("id", id).is("deleted_at", null).maybeSingle();
  return data as Pick<NewsPostRow, "id" | "cover_path"> | null;
}

export async function createNewsPost(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Through the RLS-respecting client, so news_posts_pyh_all is a second guard.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("news_posts")
    .insert({ ...fields(parsed.data), updated_by: ctx.userId })
    .select("id");
  if (error || !data || data.length === 0) return { error: "Could not save this post." };
  await audit(ctx.userId, "news.create", data[0].id);
  revalidate();
  return {};
}

export async function updateNewsPost(id: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  if (!(await loadPost(id))) return { error: "Post not found." };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Publishing is setNewsPostPublished's alone: a second copy of that state in
  // the edit form is how a stale checkbox silently unpublishes things.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("news_posts")
    .update({ ...fields(parsed.data), updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: "Could not save this post." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "news.update", id);
  revalidate();
  return {};
}

export async function setNewsPostPublished(id: string, published: boolean): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  if (!(await loadPost(id))) return { error: "Post not found." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("news_posts")
    .update({ is_published: published, updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: "Could not change this post." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, published ? "news.publish" : "news.unpublish", id);
  revalidate();
  return {};
}

export async function uploadNewsCover(id: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const post = await loadPost(id);
  if (!post) return { error: "Post not found." };

  // A cover may show people, minors included; permission is checked before a
  // single byte is stored.
  if (formData.get("consent") !== "on") {
    return { error: "Confirm you have permission to publish this photo." };
  }
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const svc = createServiceClient();
  const key = newsCoverKey(v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("news_posts").update({
    cover_path: key,
    cover_consent_confirmed_at: new Date().toISOString(),
    cover_consent_confirmed_by: ctx.userId,
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    await svc.storage.from("media").remove([key]);
    return { error: "Could not save this cover." };
  }

  // The old cover goes only after the row has moved off it: a failure here
  // leaks bytes rather than pointing the card at a file that is gone.
  if (post.cover_path && post.cover_path !== key) await reapPaths(svc, [post.cover_path]);
  await audit(ctx.userId, "news.cover", id);
  revalidate();
  return {};
}

export async function removeNewsCover(id: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const post = await loadPost(id);
  if (!post) return { error: "Post not found." };
  if (!post.cover_path) return {};

  // File first: a failed removal leaves the card pointing at a file that
  // still exists, never at one that is already gone.
  const reap = await reapPaths(createServiceClient(), [post.cover_path]);
  if (reap.error) return { error: reap.error };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("news_posts").update({
    cover_path: null,
    cover_consent_confirmed_at: null,
    cover_consent_confirmed_by: null,
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error) return { error: "Could not remove this cover." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "news.cover.remove", id);
  revalidate();
  return {};
}

export async function deleteNewsPost(id: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const post = await loadPost(id);
  if (!post) return { error: "Post not found." };

  // 1. Off the public site first, so a later failure leaves a hidden draft,
  //    never a live card with a missing cover.
  const supabase = await createServerSupabase();
  const hide = await supabase.from("news_posts")
    .update({ is_published: false, updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (hide.error) return { error: "Could not delete this post." };
  if (!hide.data || hide.data.length === 0) return { error: "Not permitted." };

  // 2. The cover file (public-read bucket), aborting on failure.
  const reap = await reapPaths(createServiceClient(), post.cover_path ? [post.cover_path] : []);
  if (reap.error) return { error: reap.error };

  // 3. The tombstone, clearing the cover in the same statement
  //    (news_posts_deleted_has_no_cover).
  const { data, error } = await supabase.from("news_posts").update({
    deleted_at: new Date().toISOString(),
    cover_path: null,
    cover_consent_confirmed_at: null,
    cover_consent_confirmed_by: null,
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error) return { error: "Could not delete this post." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "news.delete", id);
  revalidate();
  return {};
}
