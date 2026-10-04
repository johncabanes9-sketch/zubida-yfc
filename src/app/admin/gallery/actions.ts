"use server";
import { revalidatePath } from "next/cache";
import { requireClusterAccess, createServerSupabase, loadAdminContext } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/supabase/audit";
import { validateImage } from "@/lib/images/validate";
import { imageSize } from "@/lib/images/size";
import { galleryImageKey } from "@/lib/gallery/paths";
import { galleryPhotoSchema } from "@/lib/validation/gallery";
import { reapPaths } from "@/lib/pages/reap";
import type { GalleryPhotoRow } from "@/lib/supabase/database.types";

/**
 * Larger than any real camera output under the 4MB upload cap; a header
 * claiming more is malformed or hostile, and would overflow the int columns.
 */
const MAX_DIMENSION = 20000;

/** Trimmed, or null when blank — blank means uncategorised, never "". */
const optional = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

function audit(userId: string, action: string, id: string) {
  return recordAudit({ actorUserId: userId, action, entity: "gallery_photos", entityId: id });
}

function revalidate() {
  revalidatePath("/gallery");
  revalidatePath("/");
  revalidatePath("/admin/gallery");
}

function parse(formData: FormData) {
  return galleryPhotoSchema.safeParse({
    caption: String(formData.get("caption") ?? ""),
    category: String(formData.get("category") ?? ""),
    cluster_id: String(formData.get("cluster_id") ?? ""),
  });
}

/** Loads a live photo with the fields every action authorizes against. */
async function loadPhoto(id: string) {
  const { data } = await createServiceClient().from("gallery_photos")
    .select("id, cluster_id, path").eq("id", id).is("deleted_at", null).maybeSingle();
  return data as Pick<GalleryPhotoRow, "id" | "cluster_id" | "path"> | null;
}

export async function uploadGalleryPhoto(formData: FormData): Promise<{ error?: string }> {
  const ctx = await loadAdminContext();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // A cluster head always uploads into their own cluster; only the PYH chooses
  // (blank = provincial-level). Taking the form's value from a cluster head
  // would only produce a forbidden redirect below.
  const cluster_id = ctx.isPYH ? optional(parsed.data.cluster_id) : ctx.clusterId;
  await requireClusterAccess(cluster_id);

  // The publishing permission is checked before a single byte is stored. The
  // CHECK on consent_confirmed_* is the floor; this is what gives the admin a
  // message instead of an orphaned upload.
  if (formData.get("consent") !== "on") {
    return { error: "Confirm you have permission to publish this photo." };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };
  const size = imageSize(bytes);
  if (!size) return { error: "Could not read this image's size. Try exporting it again as JPEG or PNG." };
  if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) {
    return { error: `This image is over ${MAX_DIMENSION} pixels on a side. Resize it, then upload again.` };
  }

  const svc = createServiceClient();
  const key = galleryImageKey(v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  // Through the RLS-respecting client, so the cluster policies proven in
  // prove-gallery.mjs are a second guard behind requireClusterAccess.
  const now = new Date().toISOString();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("gallery_photos").insert({
    path: key,
    caption: parsed.data.caption,
    category: optional(parsed.data.category),
    width: size.width,
    height: size.height,
    cluster_id,
    consent_confirmed_at: now,
    consent_confirmed_by: ctx.userId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }).select("id");
  if (error || !data || data.length === 0) {
    // No row points at the object, so nothing else could ever remove it.
    await svc.storage.from("media").remove([key]);
    return { error: error?.code === "42501" ? "That change is not permitted." : "Could not save this photo." };
  }
  await audit(ctx.userId, "gallery.upload", data[0].id);
  revalidate();
  return {};
}

export async function updateGalleryPhoto(id: string, formData: FormData): Promise<{ error?: string }> {
  // Authenticate before the service-role read, so an unauthenticated caller
  // cannot probe which ids exist (same reasoning as updateLeader).
  await loadAdminContext();
  const photo = await loadPhoto(id);
  if (!photo) return { error: "Photo not found." };
  const ctx = await requireClusterAccess(photo.cluster_id);

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("gallery_photos").update({
    caption: parsed.data.caption,
    category: optional(parsed.data.category),
    // is_published is deliberately absent: setGalleryPhotoPublished owns it.
    updated_by: ctx.userId,
  }).eq("id", id).select("id");
  if (error) return { error: "Could not save this photo." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "gallery.update", id);
  revalidate();
  return {};
}

export async function setGalleryPhotoPublished(id: string, published: boolean): Promise<{ error?: string }> {
  await loadAdminContext();
  const photo = await loadPhoto(id);
  if (!photo) return { error: "Photo not found." };
  const ctx = await requireClusterAccess(photo.cluster_id);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("gallery_photos")
    .update({ is_published: published, updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: "Could not change this photo." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, published ? "gallery.publish" : "gallery.unpublish", id);
  revalidate();
  return {};
}

export async function deleteGalleryPhoto(id: string): Promise<{ error?: string }> {
  await loadAdminContext();
  const photo = await loadPhoto(id);
  if (!photo) return { error: "Photo not found." };
  const ctx = await requireClusterAccess(photo.cluster_id);

  // 1. Take it off the public site first, through the RLS client — this also
  //    proves the caller may change the row before any file is touched. If
  //    a later step fails, the worst case is a hidden draft, never a public
  //    card pointing at a file that is already gone.
  const supabase = await createServerSupabase();
  const hide = await supabase.from("gallery_photos")
    .update({ is_published: false, updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (hide.error) return { error: "Could not delete this photo." };
  if (!hide.data || hide.data.length === 0) return { error: "Not permitted." };

  // 2. Then the file: the media bucket is public-read, so a tombstoned row
  //    whose object survived would leave the photo reachable by URL with
  //    nothing in the app able to find it again. A failed reap aborts here.
  const reap = await reapPaths(createServiceClient(), photo.path ? [photo.path] : []);
  if (reap.error) return { error: reap.error };

  // 3. Then the tombstone, clearing path in the same statement
  //    (gallery_photos_file_iff_live).
  const { data, error } = await supabase.from("gallery_photos")
    .update({ deleted_at: new Date().toISOString(), path: null, updated_by: ctx.userId })
    .eq("id", id).select("id");
  if (error) return { error: "Could not delete this photo." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "gallery.delete", id);
  revalidate();
  return {};
}
