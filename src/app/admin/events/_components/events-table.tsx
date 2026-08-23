"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { setEventStatus, deleteEvent } from "../actions";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CapacityBar } from "@/components/admin/charts/capacity-bar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatShortDate } from "@/lib/utils";

export type EventListRow = {
  id: string;
  name: string;
  date: string;
  status: string;
  slots_taken: number;
  slots_total: number;
  cluster_name: string | null;
};

export function EventsTable({ rows }: { rows: EventListRow[] }) {
  const [pending, start] = useTransition();

  const columns: Column<EventListRow>[] = [
    {
      key: "name",
      header: "Event",
      primary: true,
      cell: (e) => (
        <Link
          href={`/admin/events/${e.id}/edit`}
          className="font-medium text-[var(--fg)] transition-colors hover:text-royal-700 dark:hover:text-gold-300"
        >
          {e.name}
        </Link>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (e) => <span className="whitespace-nowrap">{formatShortDate(e.date)}</span>,
    },
    {
      key: "cluster",
      header: "Cluster",
      // A null cluster_id means the event is province-wide, not that the cluster
      // is unknown — so it reads "Provincial", never an em dash.
      cell: (e) => e.cluster_name ?? "Provincial",
    },
    {
      key: "slots",
      header: "Slots",
      cell: (e) => (
        <CapacityBar
          className="min-w-[10rem]"
          slotsTotal={e.slots_total}
          slotsTaken={e.slots_taken}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (e) => <Badge tone={toneForStatus(e.status)}>{e.status}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      actions: true,
      align: "right",
      cell: (e) => (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <ButtonLink href={`/admin/events/${e.id}/edit`} size="xs" variant="subtle">
            Edit
          </ButtonLink>
          {e.status !== "Open" ? (
            <Button
              size="xs"
              variant="subtle"
              disabled={pending}
              onClick={() => start(() => setEventStatus(e.id, "Open"))}
            >
              Publish
            </Button>
          ) : (
            <Button
              size="xs"
              variant="subtle"
              disabled={pending}
              onClick={() => start(() => setEventStatus(e.id, "Finished"))}
            >
              Archive
            </Button>
          )}
          <Button
            size="xs"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this event?")) start(() => deleteEvent(e.id));
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(e) => e.id}
      caption="Events, with edit, publish, archive and delete actions"
      empty={
        <EmptyState
          icon={CalendarPlus}
          title="No events yet"
          description="Create an event to open registrations for it."
          action={
            <ButtonLink href="/admin/events/new" size="sm">
              Create an event
            </ButtonLink>
          }
        />
      }
    />
  );
}
