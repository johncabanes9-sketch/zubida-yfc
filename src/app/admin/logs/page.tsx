import { ScrollText } from "lucide-react";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Activity Logs", robots: { index: false } };
export const dynamic = "force-dynamic";

const LOG_PAGE_SIZE = 200;

type LogRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export default async function LogsPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, actor_user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(LOG_PAGE_SIZE);
  const rows = (data as LogRow[] | null) ?? [];

  const columns: Column<LogRow>[] = [
    {
      key: "action",
      header: "Action",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.action}</span>,
    },
    {
      key: "created_at",
      header: "When",
      cell: (r) => (
        <time dateTime={r.created_at} className="whitespace-nowrap">
          {new Date(r.created_at).toLocaleString()}
        </time>
      ),
    },
    { key: "entity", header: "Entity", cell: (r) => r.entity },
    {
      key: "entity_id",
      header: "Target",
      cell: (r) => <span className="font-mono text-xs">{r.entity_id ?? "—"}</span>,
    },
  ];

  return (
    <AdminShell
      ctx={ctx}
      active="logs"
      title="Activity Logs"
      description={`The ${LOG_PAGE_SIZE} most recent administrative actions, newest first.`}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Administrative audit log"
        empty={
          <EmptyState
            icon={ScrollText}
            title="Nothing logged yet"
            description="Administrative actions are recorded here as they happen."
          />
        }
      />
    </AdminShell>
  );
}
