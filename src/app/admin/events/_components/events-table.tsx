"use client";
import Link from "next/link";
import { useTransition } from "react";
import { setEventStatus, deleteEvent } from "../actions";

export type EventListRow = {
  id: string;
  name: string;
  date: string;
  status: string;
  slots_taken: number;
  slots_total: number;
  cluster_name: string | null;
};

const badge: Record<string, string> = {
  Open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Closed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Finished: "bg-slate-500/15 text-slate-500",
};

export function EventsTable({ rows }: { rows: EventListRow[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-black/5 dark:border-white/10">
            <th className="p-3 font-medium">Event</th>
            <th className="p-3 font-medium">Date</th>
            <th className="p-3 font-medium">Cluster</th>
            <th className="p-3 font-medium">Slots</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-black/5 dark:border-white/10">
              <td className="p-3 font-medium">{e.name}</td>
              <td className="p-3">{e.date}</td>
              <td className="p-3">{e.cluster_name ?? "Provincial"}</td>
              <td className="p-3">{e.slots_taken}/{e.slots_total}</td>
              <td className="p-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge[e.status] ?? ""}`}>{e.status}</span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/events/${e.id}/edit`} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 dark:text-royal-300">Edit</Link>
                  {e.status !== "Open" ? (
                    <button disabled={pending} onClick={() => start(() => setEventStatus(e.id, "Open"))} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 disabled:opacity-40">Publish</button>
                  ) : (
                    <button disabled={pending} onClick={() => start(() => setEventStatus(e.id, "Finished"))} className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-500 disabled:opacity-40">Archive</button>
                  )}
                  <button disabled={pending} onClick={() => { if (confirm("Delete this event?")) start(() => deleteEvent(e.id)); }} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40">Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-10 text-center text-muted">No events yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
