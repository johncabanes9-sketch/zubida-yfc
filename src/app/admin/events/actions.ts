"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase, loadAdminContext, requireClusterAccess } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validation/event";
import type { EventRow } from "@/lib/supabase/database.types";

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
