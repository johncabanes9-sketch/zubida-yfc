"use client";

import { useEffect, useState, useTransition } from "react";
import { Download } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { setStatus } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export type Row = {
  registration_id: string;
  full_name: string;
  email: string;
  chapter: string;
  status: string;
  created_at: string;
};

const badge: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cancelled: "bg-slate-500/15 text-slate-500",
};

export function RegistrationsTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const refetch = () =>
      supabase
        .from("event_registrations")
        .select("registration_id, full_name, email, chapter, status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200)
        .then(({ data }) => data && setRows(data as Row[]));
    const channel = supabase
      .channel("admin-registrations")
      .on("postgres_changes", { event: "*", schema: "public", table: "event_registrations" }, refetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const act = (id: string, status: "approved" | "rejected") =>
    startTransition(async () => {
      // optimistic
      setRows((rs) => rs.map((r) => (r.registration_id === id ? { ...r, status } : r)));
      await setStatus(id, status);
    });

  const exportCsv = () => {
    const header = "registration_id,full_name,email,chapter,status,created_at\n";
    const body = rows
      .map((r) =>
        [r.registration_id, r.full_name, r.email, r.chapter, r.status, r.created_at]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "zubida-registrations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{rows.length} registrations</p>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-black/5 dark:border-white/10">
              <th className="p-3 font-medium">ID</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Chapter</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.registration_id} className="border-t border-black/5 dark:border-white/10">
                <td className="p-3 font-mono text-xs">{r.registration_id}</td>
                <td className="p-3">
                  <div>{r.full_name}</div>
                  <div className="text-xs text-muted">{r.email}</div>
                </td>
                <td className="p-3">{r.chapter}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      disabled={pending || r.status === "approved"}
                      onClick={() => act(r.registration_id, "approved")}
                      className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      disabled={pending || r.status === "rejected"}
                      onClick={() => act(r.registration_id, "rejected")}
                      className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-muted">
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
