import { notFound } from "next/navigation";
import { Undo2, Users } from "lucide-react";
import {
  loadAdminContext,
  requireClusterAccess,
  createServerSupabase,
} from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AdminShell } from "../../../_components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckInDesk } from "./_components/check-in-desk";
import { undoCheckIn } from "./actions";

export const metadata = { title: "Check-in", robots: { index: false } };
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 15;

type Recent = {
  id: string;
  registration_id: string;
  full_name: string;
  chapter: string;
  status: string;
  checked_in_at: string;
  check_in_method: "qr" | "manual";
};

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Authenticate before the service-role read, so an unauthenticated caller
  // cannot probe which event ids exist (see updateChapter).
  await loadAdminContext();
  const { data: ev } = await createServiceClient()
    .from("events")
    .select("id, name, date, cluster_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ev) notFound();
  const event = ev as { id: string; name: string; date: string; cluster_id: string | null };
  const ctx = await requireClusterAccess(event.cluster_id);

  const supabase = await createServerSupabase();
  const holding = () =>
    supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .is("deleted_at", null)
      .in("status", ["pending", "approved"]);
  const [{ count: expected }, { count: arrived }, { data: recentData }] = await Promise.all([
    holding(),
    holding().not("checked_in_at", "is", null),
    supabase
      .from("event_registrations")
      .select("id, registration_id, full_name, chapter, status, checked_in_at, check_in_method")
      .eq("event_id", id)
      .is("deleted_at", null)
      .not("checked_in_at", "is", null)
      .order("checked_in_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);
  const recent = (recentData as Recent[] | null) ?? [];

  return (
    <AdminShell
      ctx={ctx}
      active="events"
      title={`Check-in · ${event.name}`}
      description="Scan each pass, or type its registration code. A pass is admitted once."
    >
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <CheckInDesk eventId={id} />

        <section aria-labelledby="attendance-heading" className="space-y-4">
          <div className="glass rounded-3xl p-5 shadow-card">
            <h2 id="attendance-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
              Attendance
            </h2>
            <p className="mt-2 font-display text-4xl font-semibold text-[var(--fg)]">
              {arrived ?? 0}
              <span className="text-xl text-muted"> / {expected ?? 0}</span>
            </p>
            <p className="text-sm text-muted">checked in, of pending and approved registrations</p>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">Most recent</h2>
            {recent.length === 0 ? (
              <EmptyState icon={Users} title="No one checked in yet" description="Check-ins appear here as they happen." />
            ) : (
              <ul className="space-y-2">
                {recent.map((r) => (
                  <li key={r.id} className="glass flex items-center justify-between gap-3 rounded-2xl p-3 shadow-card">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.full_name}</p>
                      <p className="text-xs text-muted">
                        <time dateTime={r.checked_in_at}>
                          {new Date(r.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </time>
                        {" · "}{r.check_in_method === "qr" ? "scanned" : "typed code"}
                        {r.status === "pending" && <> · <Badge tone="warn">pending</Badge></>}
                      </p>
                    </div>
                    <form action={undoCheckIn}>
                      <input type="hidden" name="event_id" value={id} />
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="xs" variant="subtle" aria-label={`Undo check-in for ${r.full_name}`}>
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
