import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { EventsTable, type EventListRow } from "./_components/events-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = { title: "Manage Events", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  let query = supabase
    .from("events")
    .select("id, name, date, status, slots_taken, slots_total, cluster_id")
    .is("deleted_at", null)
    .order("date", { ascending: true });
  // Non-PYH admins (cluster heads) only see events scoped to their own cluster; PYH sees all.
  if (!ctx.isPYH) query = query.eq("cluster_id", ctx.clusterId);
  const { data } = await query;
  const { data: clusters } = await supabase.from("clusters").select("id, name");
  const clusterMap = new Map((clusters as { id: string; name: string }[] | null ?? []).map((c) => [c.id, c.name]));

  const rows: EventListRow[] = ((data as (EventListRow & { cluster_id: string | null })[] | null) ?? []).map((e) => ({
    id: e.id, name: e.name, date: e.date, status: e.status,
    slots_taken: e.slots_taken, slots_total: e.slots_total,
    cluster_name: e.cluster_id ? clusterMap.get(e.cluster_id) ?? null : null,
  }));

  return (
    <AdminShell ctx={ctx} active="events" title="Events">
      <div className="mb-4 flex justify-end">
        <Link href="/admin/events/new"><Button size="sm">New event</Button></Link>
      </div>
      <EventsTable rows={rows} />
    </AdminShell>
  );
}
