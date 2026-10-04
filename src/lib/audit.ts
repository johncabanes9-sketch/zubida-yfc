/**
 * One audit_log write, shared by every admin action.
 *
 * Audit is best-effort: a failed write must never block the mutation it
 * describes. But supabase-js does not throw on a rejected insert, it resolves
 * with { error }, so a bare try/catch hid every database-side failure. This
 * checks { error } as well and logs both kinds, so a broken trail shows up in
 * the server logs instead of silently going missing.
 */
export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
};

export type AuditRow = {
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  meta?: Record<string, unknown>;
};

export type AuditInsert = (row: AuditRow) => PromiseLike<{ error: { message: string } | null }>;

/** Returns whether the entry was stored. Never throws. */
export async function writeAudit(insert: AuditInsert, entry: AuditEntry): Promise<boolean> {
  const row: AuditRow = {
    actor_user_id: entry.actorUserId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    ...(entry.meta ? { meta: entry.meta } : {}),
  };
  const where = `${entry.action} ${entry.entity}/${entry.entityId}`;
  try {
    const { error } = await insert(row);
    if (!error) return true;
    console.error(`audit_log write failed (${where}): ${error.message}`);
  } catch (e) {
    console.error(`audit_log write failed (${where}): ${e instanceof Error ? e.message : String(e)}`);
  }
  return false;
}
