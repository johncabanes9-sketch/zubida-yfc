"use client";
import { useTransition } from "react";
import { setActive, resetPassword, deleteClusterHead } from "../actions";

export type UserRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  cluster_name: string | null;
  is_active: boolean;
};

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-black/5 dark:border-white/10">
            <th className="p-3 font-medium">Name</th>
            <th className="p-3 font-medium">Username</th>
            <th className="p-3 font-medium">Cluster</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.user_id} className="border-t border-black/5 dark:border-white/10">
              <td className="p-3">{u.full_name ?? "—"}</td>
              <td className="p-3">{u.username ?? "—"}</td>
              <td className="p-3">{u.cluster_name ?? "—"}</td>
              <td className="p-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-500/15 text-emerald-600" : "bg-slate-500/15 text-slate-500"}`}>
                  {u.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  <button disabled={pending} onClick={() => start(() => setActive(u.user_id, !u.is_active))} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 disabled:opacity-40">
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button disabled={pending} onClick={() => { const p = prompt("New password (min 10 chars):"); if (p) { const fd = new FormData(); fd.set("password", p); start(() => resetPassword(u.user_id, fd)); } }} className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 dark:text-royal-300 disabled:opacity-40">Reset password</button>
                  <button disabled={pending} onClick={() => { if (confirm("Delete this cluster head?")) start(() => deleteClusterHead(u.user_id)); }} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40">Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-10 text-center text-muted">No cluster heads yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
