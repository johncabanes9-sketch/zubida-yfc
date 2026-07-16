import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";

export const metadata = { title: "Activity Logs", robots: { index: false } };
export const dynamic = "force-dynamic";

type LogRow = { id: string; action: string; entity: string; entity_id: string | null; actor_user_id: string | null; created_at: string };

export default async function LogsPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, actor_user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data as LogRow[] | null) ?? [];

  return (
    <AdminShell ctx={ctx} active="logs" title="Activity Logs">
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-black/5 dark:border-white/10">
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Entity</th>
              <th className="p-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-black/5 dark:border-white/10">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="p-3">{r.entity}</td>
                <td className="p-3 font-mono text-xs">{r.entity_id ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-10 text-center text-muted">No activity yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
