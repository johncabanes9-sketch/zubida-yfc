"use server";
import { revalidatePath } from "next/cache";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/supabase/audit";
import { validateImage } from "@/lib/images/validate";
import { testimonialPhotoKey } from "@/lib/testimonials/paths";
import { testimonialSchema } from "@/lib/validation/testimonial";
import { reapPaths } from "@/lib/pages/reap";
import type { TestimonialRow } from "@/lib/supabase/database.types";

const NEEDS_CONSENT = "Confirm you have this person's consent to publish their words under their name.";

/** Trimmed, or null when blank — blank means withheld, never "". */
const optional = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

function audit(userId: string, action: string, id: string) {
  return recordAudit({ actorUserId: userId, action, entity: "testimonials", entityId: id });
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/admin/testimonials");
}

function parse(formData: FormData) {
  return testimonialSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    chapter_id: String(formData.get("chapter_id") ?? ""),
    quote: String(formData.get("quote") ?? ""),
  });
}

async function loadTestimonial(id: string) {
  const { data } = await createServiceClient().from("testimonials")
    .select("id, name, quote, photo_path").eq("id", id).is("deleted_at", null).maybeSingle();
  return data as Pick<TestimonialRow, "id" | "name" | "quote" | "photo_path"> | null;
}

export async function createTestimonial(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get("consent") !== "on") return { error: NEEDS_CONSENT };

  // consent_at/consent_by are sent to satisfy NOT NULL, but testimonials_guard
  // overwrites both with the caller and now() — the database records them.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("testimonials").insert({
    name: parsed.data.name,
    role: optional(parsed.data.role),
    chapter_id: optional(parsed.data.chapter_id),
    quote: parsed.data.quote,
    consent_at: new Date().toISOString(),
    consent_by: ctx.userId,
  }).select("id");
  if (error || !data || data.length === 0) return { error: "Could not save this testimonial." };
  await audit(ctx.userId, "testimonial.create", data[0].id);
  revalidate();
  return {};
}

export async function updateTestimonial(id: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const current = await loadTestimonial(id);
  if (!current) return { error: "Testimonial not found." };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // New words, or the same words under a different name, are a new
  // statement: they need consent again, and testimonials_guard re-stamps the
  // record when either changes.
  const reworded = parsed.data.quote !== (current.quote ?? "").trim()
    || parsed.data.name !== (current.name ?? "").trim();
  if (reworded && formData.get("consent") !== "on") return { error: NEEDS_CONSENT };

  // Publishing is setTestimonialPublished's alone.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("testimonials").update({
    name: parsed.data.name,
    role: optional(parsed.data.role),
    chapter_id: optional(parsed.data.chapter_id),
    quote: parsed.data.quote,
  }).eq("id", id).select("id");
  if (error) return { error: "Could not save this testimonial." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, reworded ? "testimonial.reword" : "testimonial.update", id);
  revalidate();
  return {};
}

export async function setTestimonialPublished(id: string, published: boolean): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  if (!(await loadTestimonial(id))) return { error: "Testimonial not found." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("testimonials")
    .update({ is_published: published }).eq("id", id).select("id");
  if (error) return { error: "Could not change this testimonial." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, published ? "testimonial.publish" : "testimonial.unpublish", id);
  revalidate();
  return {};
}

export async function uploadTestimonialPhoto(id: string, formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const current = await loadTestimonial(id);
  if (!current) return { error: "Testimonial not found." };

  // A face is personal content: consent before a single byte is stored.
  if (formData.get("consent") !== "on") return { error: "Confirm you have this person's consent to publish their photo." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateImage(bytes, file.size);
  if (!v.ok) return { error: v.reason };

  const svc = createServiceClient();
  const key = testimonialPhotoKey(v.mime);
  const upl = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
  if (upl.error) return { error: "Upload failed." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("testimonials")
    .update({ photo_path: key }).eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    await svc.storage.from("media").remove([key]);
    return { error: "Could not save this photo." };
  }
  // Old photo only after the row has moved off it.
  if (current.photo_path && current.photo_path !== key) await reapPaths(svc, [current.photo_path]);
  await audit(ctx.userId, "testimonial.photo", id);
  revalidate();
  return {};
}

export async function removeTestimonialPhoto(id: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const current = await loadTestimonial(id);
  if (!current) return { error: "Testimonial not found." };
  if (!current.photo_path) return {};

  // File first, then the reference.
  const reap = await reapPaths(createServiceClient(), [current.photo_path]);
  if (reap.error) return { error: reap.error };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("testimonials")
    .update({ photo_path: null }).eq("id", id).select("id");
  if (error) return { error: "Could not remove this photo." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "testimonial.photo.remove", id);
  revalidate();
  return {};
}

export async function deleteTestimonial(id: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const current = await loadTestimonial(id);
  if (!current) return { error: "Testimonial not found." };

  // 1. Off the homepage first.
  const supabase = await createServerSupabase();
  const hide = await supabase.from("testimonials")
    .update({ is_published: false }).eq("id", id).select("id");
  if (hide.error) return { error: "Could not delete this testimonial." };
  if (!hide.data || hide.data.length === 0) return { error: "Not permitted." };

  // 2. The photo file (public-read bucket), aborting on failure.
  const reap = await reapPaths(createServiceClient(), current.photo_path ? [current.photo_path] : []);
  if (reap.error) return { error: reap.error };

  // 3. Erase: deleting is how a person's consent is withdrawn, so nothing of
  //    them stays behind (testimonials_live_or_erased).
  const { data, error } = await supabase.from("testimonials").update({
    deleted_at: new Date().toISOString(),
    name: null,
    role: null,
    quote: null,
    photo_path: null,
  }).eq("id", id).select("id");
  if (error) return { error: "Could not delete this testimonial." };
  if (!data || data.length === 0) return { error: "Not permitted." };
  await audit(ctx.userId, "testimonial.delete", id);
  revalidate();
  return {};
}
