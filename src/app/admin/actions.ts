"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, loadAdminContext } from "@/lib/supabase/admin-auth";

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
  await supabase.from("audit_log").insert({
    actor_user_id: ctx.userId,
    action: `registration.${status}`,
    entity: "event_registrations",
    entity_id: registrationId,
  });
  revalidatePath("/admin");
}
