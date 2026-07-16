"use client";
import { Button } from "@/components/ui/button";

export type ClusterOption = { id: string; name: string };

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export function CreateUserForm({ action, clusters }: { action: (fd: FormData) => void; clusters: ClusterOption[] }) {
  return (
    <form action={action} className="glass grid max-w-xl gap-4 rounded-2xl p-6">
      <label className="block"><span className={label}>Full name</span>
        <input name="full_name" required className={field} /></label>
      <label className="block"><span className={label}>Email</span>
        <input type="email" name="email" required className={field} /></label>
      <label className="block"><span className={label}>Username (optional)</span>
        <input name="username" className={field} /></label>
      <label className="block"><span className={label}>Cluster</span>
        <select name="cluster_id" required className={field}>
          <option value="">Select cluster…</option>
          {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <label className="block"><span className={label}>Password</span>
        <input type="text" name="password" required minLength={10} className={field} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" value="true" defaultChecked /> Active</label>
      <div><Button type="submit">Create cluster head</Button></div>
    </form>
  );
}
