"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase, loadAdminContext, requireClusterAccess } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validation/event";
import type { EventRow } from "@/lib/supabase/database.types";
import { validateImage, MAX_FILES } from "@/lib/images/validate";
import { objectKey } from "@/lib/images/paths";

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const result = eventSchema.safeParse(raw);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid event");
  return result.data;
}

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log").insert({ actor_user_id: userId, action, entity: "events", entity_id: id });
  } catch {
    // audit is best-effort; never block the mutation on logging failure
  }
}

export async function createEvent(formData: FormData) {
  const ctx = await loadAdminContext();
  const input = parse(formData);
  // Cluster heads are forced into their own cluster; PYH may choose (or null).
  const clusterId = ctx.isPYH ? (input.cluster_id || null) : ctx.clusterId;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("events")
    .insert({
      name: input.name,
      date: input.date,
      time: input.time || null,
      venue: input.venue || null,
      organizer: input.organizer || null,
      description: input.description || null,
      cover: input.cover || null,
      registration_deadline: new Date(input.registration_deadline).toISOString(),
      slots_total: input.slots_total,
      status: input.status,
      scope: input.scope,
      cluster_id: clusterId,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(ctx.userId, "event.create", (data as { id: string }).id);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function updateEvent(id: string, formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("events").select("cluster_id").eq("id", id).single();
  const ctx = await requireClusterAccess((existing as Pick<EventRow, "cluster_id"> | null)?.cluster_id ?? null);
  const input = parse(formData);
  const patch: Partial<EventRow> = {
    name: input.name,
    date: input.date,
    time: input.time || null,
    venue: input.venue || null,
    organizer: input.organizer || null,
    description: input.description || null,
    cover: input.cover || null,
    registration_deadline: new Date(input.registration_deadline).toISOString(),
    slots_total: input.slots_total,
    status: input.status,
    scope: input.scope,
  };
  if (ctx.isPYH) patch.cluster_id = input.cluster_id || null;
  const { data, error } = await supabase.from("events").update(patch).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await audit(ctx.userId, "event.update", id);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function setEventStatus(id: string, status: "Open" | "Closed" | "Finished") {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("events").select("cluster_id").eq("id", id).single();
  const ctx = await requireClusterAccess((existing as Pick<EventRow, "cluster_id"> | null)?.cluster_id ?? null);
  const { data, error } = await supabase.from("events").update({ status }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await audit(ctx.userId, `event.status.${status}`, id);
  revalidatePath("/admin/events");
}

export async function deleteEvent(id: string) {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("events").select("cluster_id").eq("id", id).single();
  const ctx = await requireClusterAccess((existing as Pick<EventRow, "cluster_id"> | null)?.cluster_id ?? null);
  // Soft delete. RLS delete policy also enforces created_by for cluster heads on hard delete;
  // here we UPDATE deleted_at (an update), so ownership is enforced by the update policy + this guard.
  const { data, error } = await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  await audit(ctx.userId, "event.delete", id);
  revalidatePath("/admin/events");
}

async function eventClusterOrThrow(eventId: string) {
  const svc = createServiceClient();
  const { data } = await svc
    .from("events")
    .select("id, cluster_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .single();
  if (!data) throw new Error("Event not found");
  return data as Pick<EventRow, "id" | "cluster_id">;
}

export async function uploadEventImages(eventId: string, form: FormData): Promise<{ error?: string }> {
  const ev = await eventClusterOrThrow(eventId);
  const ctx = await requireClusterAccess(ev.cluster_id); // guard before any I/O

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "No files selected." };
  if (files.length > MAX_FILES) return { error: `At most ${MAX_FILES} images per upload.` };

  const svc = createServiceClient();
  const { data: last } = await svc
    .from("event_images")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let next = ((last as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1;

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const v = validateImage(bytes, file.size);
    if (!v.ok) return { error: `${file.name}: ${v.reason}` };

    const key = objectKey(eventId, v.mime);
    const up = await svc.storage.from("media").upload(key, bytes, { contentType: v.mime, upsert: false });
    if (up.error) return { error: `${file.name}: upload failed.` };

    const ins = await svc
      .from("event_images")
      .insert({ event_id: eventId, path: key, sort_order: next++, created_by: ctx.userId });
    if (ins.error) {
      // Don't leave an orphaned object behind if the row insert fails.
      await svc.storage.from("media").remove([key]);
      return { error: `${file.name}: could not be saved.` };
    }
  }

  await audit(ctx.userId, "event.images.upload", eventId);
  revalidatePath("/events");
  revalidatePath("/");
  revalidatePath(`/admin/events/${eventId}/edit`);
  return {};
}

export async function deleteEventImage(imageId: string): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: img } = await svc
    .from("event_images")
    .select("id, event_id, path")
    .eq("id", imageId)
    .single();
  if (!img) return { error: "Image not found." };
  const ev = await eventClusterOrThrow(img.event_id);
  const ctx = await requireClusterAccess(ev.cluster_id); // guard before deleting

  // Remove the object BEFORE the row, and only drop the row if removal actually
  // succeeded. If we deleted the row first (or ignored this error), a failed
  // removal would leave a file nothing references — an untraceable orphan.
  // Keeping the row on failure is self-healing: the delete can simply be retried.
  const rm = await svc.storage.from("media").remove([img.path]);
  if (rm.error) return { error: "Could not delete the image file. Please try again." };

  const del = await svc.from("event_images").delete().eq("id", imageId);
  if (del.error) return { error: "Could not delete image." };

  await audit(ctx.userId, "event.images.delete", imageId);
  revalidatePath("/events");
  revalidatePath("/");
  revalidatePath(`/admin/events/${img.event_id}/edit`);
  return {};
}

export async function reorderEventImage(imageId: string, direction: "up" | "down"): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { data: img } = await svc
    .from("event_images")
    .select("id, event_id, sort_order")
    .eq("id", imageId)
    .single();
  if (!img) return { error: "Image not found." };
  const ev = await eventClusterOrThrow(img.event_id);
  await requireClusterAccess(ev.cluster_id); // guard before reordering

  const { data: neighbour } = await svc
    .from("event_images")
    .select("id, sort_order")
    .eq("event_id", img.event_id)
    .order("sort_order", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("sort_order", img.sort_order)
    .limit(1)
    .maybeSingle();
  if (!neighbour) return {}; // already at the end

  await svc.from("event_images").update({ sort_order: neighbour.sort_order }).eq("id", img.id);
  await svc.from("event_images").update({ sort_order: img.sort_order }).eq("id", neighbour.id);

  revalidatePath("/events");
  revalidatePath("/");
  revalidatePath(`/admin/events/${img.event_id}/edit`);
  return {};
}
