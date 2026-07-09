"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, requireAdmin } from "@/lib/supabase/admin-auth";

export async function setStatus(
  registrationId: string,
  status: "approved" | "rejected",
) {
  const user = await requireAdmin();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("event_registrations")
    .update({ status })
    .eq("registration_id", registrationId);
  if (error) throw new Error(error.message);
  await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    action: `registration.${status}`,
    entity: "event_registrations",
    entity_id: registrationId,
  });
  revalidatePath("/admin");
}
