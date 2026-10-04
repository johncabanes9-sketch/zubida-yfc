import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit, type AuditEntry } from "@/lib/audit";

/** Records an admin action with the service role. See writeAudit. */
export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  return writeAudit((row) => createServiceClient().from("audit_log").insert(row), entry);
}
