import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "./_components/admin-shell";
import { RegistrationsTable, type Row } from "@/components/admin/registrations-table";

export const metadata = { title: "Admin Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  // RLS already scopes rows to the viewer's cluster; no extra filter needed.
  const { data } = await supabase
    .from("event_registrations")
    .select("registration_id, full_name, email, chapter, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data as Row[] | null) ?? [];
  const total = rows.length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;

  return (
    <AdminShell ctx={ctx} active="registrations" title="Registrations">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total" value={total} />
        <Stat label="Pending" value={pending} />
        <Stat label="Approved" value={approved} />
      </div>
      <div className="mt-10">
        <RegistrationsTable initial={rows} />
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold text-royal-700 dark:text-gold-300">
        {value}
      </p>
    </div>
  );
}
