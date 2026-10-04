"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, loadAdminContext } from "@/lib/supabase/admin-auth";
import { recordAudit } from "@/lib/supabase/audit";

export async function setStatus(
  registrationId: string,
  status: "approved" | "rejected",
) {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  // RLS restricts UPDATE to registrations in the admin's cluster (or all for PYH).
  const { data, error } = await supabase
    .from("event_registrations")
    .update({ status })
    .eq("registration_id", registrationId)
    .select("registration_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");
  // Service role: audit_log has no INSERT policy, so the session client's
  // insert was refused by RLS and every approval went unrecorded.
  await recordAudit({
    actorUserId: ctx.userId,
    action: `registration.${status}`,
    entity: "event_registrations",
    entityId: registrationId,
  });
  revalidatePath("/admin");
}
