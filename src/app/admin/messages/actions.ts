"use server";
import { revalidatePath } from "next/cache";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { recordAudit } from "@/lib/supabase/audit";

export type MessageStatus = "new" | "read" | "archived";

const STATUSES: readonly MessageStatus[] = ["new", "read", "archived"];

function audit(userId: string, action: string, id: string) {
  return recordAudit({ actorUserId: userId, action, entity: "contact_messages", entityId: id });
}

/**
 * Moves a message between new, read and archived. The only change an admin can
 * make to a message: 0031_contact_messages.sql grants UPDATE on the triage
 * columns alone, so what the sender wrote cannot be edited even by mistake.
 */
export async function setMessageStatus(formData: FormData): Promise<void> {
  const ctx = await requirePYH();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as MessageStatus;
  if (!id || !STATUSES.includes(status)) return;

  const supabase = await createServerSupabase();
  const triage =
    status === "new"
      ? { status, read_by: null, read_at: null }
      : { status, read_by: ctx.userId, read_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("contact_messages")
    .update(triage)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Could not update message status (${error.message})`);
  if (!data || data.length === 0) return;

  await audit(ctx.userId, `contact_message.${status}`, id);
  revalidatePath("/admin/messages");
}
