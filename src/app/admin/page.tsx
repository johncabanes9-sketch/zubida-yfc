import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "./_components/admin-shell";
import { RegistrationsTable, type Row } from "@/components/admin/registrations-table";

export const metadata = { title: "Admin Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

/** How many recent registrations the table lists. The stat tiles are counted
 *  separately over the whole table — they must never be derived from this page. */
const TABLE_PAGE_SIZE = 200;

/** Counts rows matching `status` (or all statuses when omitted) without fetching them.
 *  RLS already scopes the count to the viewer's cluster. Returns null when the count
 *  is unavailable, so the UI can say so instead of showing a wrong number. */
async function countRegistrations(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  status?: Row["status"],
): Promise<number | null> {
  let query = supabase
    .from("event_registrations")
    .select("registration_id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  return error ? null : count ?? null;
}

export default async function AdminDashboard() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  // RLS already scopes rows to the viewer's cluster; no extra filter needed.
  const [listed, total, pending, approved] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("registration_id, full_name, email, chapter, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(TABLE_PAGE_SIZE),
    countRegistrations(supabase),
    countRegistrations(supabase, "pending"),
    countRegistrations(supabase, "approved"),
  ]);

  const rows = (listed.data as Row[] | null) ?? [];

  return (
    <AdminShell ctx={ctx} active="registrations" title="Registrations">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total registrations" value={total} />
        <Stat label="Pending approval" value={pending} />
        <Stat label="Approved" value={approved} />
      </div>
      <div className="mt-10">
        {total !== null && total > rows.length && (
          <p className="mb-3 text-xs text-muted">
            Showing the {rows.length} most recent of {total} registrations.
          </p>
        )}
        <RegistrationsTable initial={rows} />
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold text-royal-700 dark:text-gold-300">
        {value === null ? (
          <span className="text-xl text-muted">Unavailable</span>
        ) : (
          value.toLocaleString("en-US")
        )}
      </p>
    </div>
  );
}
