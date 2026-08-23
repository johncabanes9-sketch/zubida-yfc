import Link from "next/link";
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Users,
  XCircle,
} from "lucide-react";
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "./_components/admin-shell";
import { RegistrationsTable, type Row } from "@/components/admin/registrations-table";
import { TrendBars } from "@/components/admin/charts/trend-bars";
import { StatusBreakdown } from "@/components/admin/charts/status-breakdown";
import { CapacityBar } from "@/components/admin/charts/capacity-bar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { bucketByDay } from "@/lib/admin/metrics";
import { formatShortDate } from "@/lib/utils";
import type { RegistrationStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Admin Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

/** How many recent registrations the table lists. The stat tiles are counted
 *  separately over the whole table — they must never be derived from this page. */
const TABLE_PAGE_SIZE = 200;
const TREND_DAYS = 30;
/** PostgREST caps an unbounded select. Asking for a cap explicitly — and comparing
 *  what comes back against an exact count for the same window — is what lets the
 *  chart admit it is partial instead of quietly under-drawing a busy month. */
const TREND_ROW_CAP = 5000;
const UPCOMING_EVENTS = 5;
const ACTIVITY_ROWS = 6;

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

type EventLite = {
  id: string;
  name: string;
  date: string;
  slots_total: number;
  slots_taken: number;
};
type LogLite = { id: string; action: string; entity: string; created_at: string };

export default async function AdminDashboard() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();

  const since = new Date();
  since.setDate(since.getDate() - (TREND_DAYS - 1));
  since.setHours(0, 0, 0, 0);
  const todayIso = new Date().toISOString().slice(0, 10);

  // RLS already scopes every one of these to the viewer's cluster.
  const [
    listed,
    total,
    pending,
    approved,
    rejected,
    cancelled,
    trendRows,
    trendCount,
    events,
    logs,
  ] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("registration_id, full_name, email, chapter, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(TABLE_PAGE_SIZE),
    countRegistrations(supabase),
    countRegistrations(supabase, "pending"),
    countRegistrations(supabase, "approved"),
    countRegistrations(supabase, "rejected"),
    countRegistrations(supabase, "cancelled"),
    supabase
      .from("event_registrations")
      .select("created_at")
      .is("deleted_at", null)
      .gte("created_at", since.toISOString())
      .limit(TREND_ROW_CAP),
    supabase
      .from("event_registrations")
      .select("registration_id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", since.toISOString()),
    supabase
      .from("events")
      .select("id, name, date, slots_total, slots_taken")
      .is("deleted_at", null)
      .gte("date", todayIso)
      .order("date", { ascending: true })
      .limit(UPCOMING_EVENTS),
    ctx.isPYH
      ? supabase
          .from("audit_log")
          .select("id, action, entity, created_at")
          .order("created_at", { ascending: false })
          .limit(ACTIVITY_ROWS)
      : Promise.resolve({ data: null }),
  ]);

  const rows = (listed.data as Row[] | null) ?? [];
  const trendStamps = ((trendRows.data as { created_at: string }[] | null) ?? []).map(
    (r) => r.created_at,
  );
  // A failed read must not masquerade as "nothing happened this month".
  const series = trendRows.error ? null : bucketByDay(trendStamps, TREND_DAYS);
  const windowTotal = trendCount.count ?? 0;
  const trendIsPartial = windowTotal > trendStamps.length;
  const eventsUnavailable = Boolean(events.error);
  const upcoming = (events.data as EventLite[] | null) ?? [];
  const activity = (logs.data as LogLite[] | null) ?? [];

  const statusCounts: Partial<Record<RegistrationStatus, number>> = {
    approved: approved ?? 0,
    pending: pending ?? 0,
    rejected: rejected ?? 0,
    cancelled: cancelled ?? 0,
  };

  const trendDescription = trendIsPartial
    ? "The last " +
      TREND_DAYS +
      " days — showing the most recent " +
      trendStamps.length.toLocaleString("en-US") +
      " of " +
      windowTotal.toLocaleString("en-US")
    : "The last " + TREND_DAYS + " days";

  return (
    <AdminShell
      ctx={ctx}
      active="registrations"
      title="Registrations"
      description="Approve or reject event registrations, and keep an eye on how the province is filling up."
      actions={
        <ButtonLink href="/admin/events/new" size="sm" variant="primary">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          New event
        </ButtonLink>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total registrations" value={total} icon={ClipboardList} tone="royal" />
        <StatCard label="Pending approval" value={pending} icon={Clock} tone="warn" />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} tone="success" />
        <StatCard label="Rejected" value={rejected} icon={XCircle} tone="danger" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Registrations over time" description={trendDescription} />
          <CardBody>
            <TrendBars
              data={series}
              caption={"Registrations per day over the last " + TREND_DAYS + " days"}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="By status" description="Every registration, grouped" />
          <CardBody>
            <StatusBreakdown counts={statusCounts} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Upcoming events"
            description="How full the next events are"
            action={
              <ButtonLink href="/admin/events" size="xs" variant="subtle">
                All events
              </ButtonLink>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title={eventsUnavailable ? "Upcoming events are unavailable" : "No upcoming events"}
              description={
                eventsUnavailable
                  ? "The events could not be read just now. Nothing has been deleted — try again shortly."
                  : "Events dated from today onward appear here with their capacity."
              }
              action={
                <ButtonLink href="/admin/events/new" size="sm">
                  Create an event
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {upcoming.map((e) => (
                <li key={e.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link
                      href={"/admin/events/" + e.id + "/edit"}
                      className="truncate font-medium text-[var(--fg)] transition-colors hover:text-royal-700 dark:hover:text-gold-300"
                    >
                      {e.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{formatShortDate(e.date)}</span>
                  </div>
                  <CapacityBar
                    className="mt-2"
                    slotsTotal={e.slots_total}
                    slotsTaken={e.slots_taken}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="grid gap-1">
              <QuickAction href="/admin/events/new" icon={CalendarPlus} label="Create an event" />
              <QuickAction href="/admin/chapters" icon={Users} label="Manage chapters" />
              <QuickAction href="/admin/leaders" icon={Users} label="Manage leaders" />
              {ctx.isPYH && (
                <QuickAction href="/admin/pages" icon={FileText} label="Edit site pages" />
              )}
            </CardBody>
          </Card>

          {ctx.isPYH && (
            <Card>
              <CardHeader
                title="Recent activity"
                action={
                  <ButtonLink href="/admin/logs" size="xs" variant="subtle">
                    View log
                  </ButtonLink>
                }
              />
              {activity.length === 0 ? (
                <EmptyState title="Nothing logged yet" />
              ) : (
                <ul className="divide-y divide-[var(--rule)]">
                  {activity.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-baseline justify-between gap-3 px-5 py-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-[var(--fg)]">{a.action}</span>{" "}
                        <span className="text-muted">{a.entity}</span>
                      </span>
                      <time dateTime={a.created_at} className="shrink-0 text-xs text-muted">
                        {formatShortDate(a.created_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
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

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof CalendarPlus;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
