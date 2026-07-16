import { notFound } from "next/navigation";
import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../../../_components/admin-shell";
import { EventForm } from "../../_components/event-form";
import { updateEvent } from "../../actions";
import type { EventRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Edit Event", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("events").select("*").eq("id", id).is("deleted_at", null).single();
  const e = data as EventRow | null;
  if (!e) notFound();
  const { data: clusters } = await supabase.from("clusters").select("id, name").order("name");

  const values = {
    name: e.name, date: e.date, time: e.time ?? "", venue: e.venue ?? "",
    organizer: e.organizer ?? "", description: e.description ?? "", cover: e.cover ?? "",
    registration_deadline: e.registration_deadline.slice(0, 16),
    slots_total: e.slots_total, status: e.status, scope: e.scope, cluster_id: e.cluster_id,
  };
  const action = updateEvent.bind(null, id);

  return (
    <AdminShell ctx={ctx} active="events" title="Edit event">
      <EventForm action={action} values={values} clusters={(clusters as { id: string; name: string }[]) ?? []} isPYH={ctx.isPYH} submitLabel="Save changes" />
    </AdminShell>
  );
}
