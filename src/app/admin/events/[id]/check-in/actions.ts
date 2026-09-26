"use server";
import { revalidatePath } from "next/cache";
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { parsePass } from "@/lib/checkin/parse";

export type CheckInCode =
  | "CHECKED_IN"
  | "ALREADY"
  | "NOT_FOUND"
  | "WRONG_EVENT"
  | "BAD_TOKEN"
  | "NOT_ELIGIBLE"
  | "UNREADABLE"
  | "ERROR";

export type CheckInResult = {
  ok: boolean;
  code: CheckInCode;
  registration?: {
    id?: string;
    registration_id?: string;
    full_name: string;
    chapter?: string;
    status: string;
    checked_in_at?: string;
  };
};

async function audit(userId: string, action: string, id: string) {
  try {
    await createServiceClient().from("audit_log")
      .insert({ actor_user_id: userId, action, entity: "event_registrations", entity_id: id });
  } catch {
    // best-effort; never block the door on logging failure
  }
}

/**
 * Checks one pass in. Scope is enforced by the database: check_in_registration
 * runs as the caller, under the same RLS that limits a cluster head to their
 * own cluster's events, so it is called through the RLS-bound client.
 */
export async function checkIn(eventId: string, input: string): Promise<CheckInResult> {
  const ctx = await loadAdminContext();
  const pass = parsePass(input);
  if (!pass) return { ok: false, code: "UNREADABLE" };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("check_in_registration", {
    p_event_id: eventId,
    p_code: pass.registrationId,
    p_token: pass.token,
  });
  if (error) {
    console.error(`check_in_registration failed: ${error.message}`);
    return { ok: false, code: "ERROR" };
  }

  const result = data as CheckInResult;
  if (result.code === "CHECKED_IN" && result.registration?.id) {
    await audit(ctx.userId, "registration.check_in", result.registration.id);
    revalidatePath(`/admin/events/${eventId}/check-in`);
  }
  return result;
}

/** Reverses a mistaken check-in: a wrong row tapped, or a pass scanned at the wrong door. */
export async function undoCheckIn(formData: FormData): Promise<void> {
  const ctx = await loadAdminContext();
  const eventId = String(formData.get("event_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!eventId || !id) return;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("event_registrations")
    .update({ checked_in_at: null, checked_in_by: null, check_in_method: null })
    .eq("id", id)
    .eq("event_id", eventId)
    .select("id");
  if (error) throw new Error(`Could not undo the check-in (${error.message})`);
  if (!data || data.length === 0) return;

  await audit(ctx.userId, "registration.check_in_undone", id);
  revalidatePath(`/admin/events/${eventId}/check-in`);
}
