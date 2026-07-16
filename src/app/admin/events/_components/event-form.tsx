"use client";
import { Button } from "@/components/ui/button";

export type ClusterOption = { id: string; name: string };
export type EventFormValues = {
  name?: string; date?: string; time?: string; venue?: string; organizer?: string;
  description?: string; cover?: string; registration_deadline?: string;
  slots_total?: number; status?: string; scope?: string; cluster_id?: string | null;
};

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export function EventForm({
  action,
  values = {},
  clusters,
  isPYH,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  values?: EventFormValues;
  clusters: ClusterOption[];
  isPYH: boolean;
  submitLabel: string;
}) {
  return (
    <form action={action} className="glass grid max-w-2xl gap-4 rounded-2xl p-6">
      <label className="block"><span className={label}>Name</span>
        <input name="name" required defaultValue={values.name} className={field} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className={label}>Date</span>
          <input type="date" name="date" required defaultValue={values.date} className={field} /></label>
        <label className="block"><span className={label}>Time</span>
          <input name="time" defaultValue={values.time} className={field} /></label>
      </div>
      <label className="block"><span className={label}>Venue</span>
        <input name="venue" defaultValue={values.venue} className={field} /></label>
      <label className="block"><span className={label}>Organizer</span>
        <input name="organizer" defaultValue={values.organizer} className={field} /></label>
      <label className="block"><span className={label}>Cover image URL</span>
        <input name="cover" defaultValue={values.cover} className={field} /></label>
      <label className="block"><span className={label}>Description</span>
        <textarea name="description" rows={4} defaultValue={values.description} className={field} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className={label}>Registration deadline</span>
          <input type="datetime-local" name="registration_deadline" required defaultValue={values.registration_deadline} className={field} /></label>
        <label className="block"><span className={label}>Total slots</span>
          <input type="number" name="slots_total" min={0} required defaultValue={values.slots_total} className={field} /></label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className={label}>Status</span>
          <select name="status" defaultValue={values.status ?? "Open"} className={field}>
            <option value="Open">Open (published)</option>
            <option value="Closed">Closed</option>
            <option value="Finished">Finished (archived)</option>
          </select></label>
        <label className="block"><span className={label}>Scope</span>
          <select name="scope" defaultValue={values.scope ?? "Provincial"} className={field}>
            <option value="Provincial">Provincial</option>
            <option value="Chapter">Chapter</option>
          </select></label>
      </div>
      {isPYH && (
        <label className="block"><span className={label}>Cluster</span>
          <select name="cluster_id" defaultValue={values.cluster_id ?? ""} className={field}>
            <option value="">Provincial-wide (no cluster)</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
      )}
      <div><Button type="submit">{submitLabel}</Button></div>
    </form>
  );
}
