import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../../_components/admin-shell";
import { EventForm } from "../_components/event-form";
import { createEvent } from "../actions";

export const metadata = { title: "New Event", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();
  const { data: clusters } = await supabase.from("clusters").select("id, name").order("name");
  return (
    <AdminShell ctx={ctx} active="events" title="New event">
      <EventForm action={createEvent} clusters={(clusters as { id: string; name: string }[]) ?? []} isPYH={ctx.isPYH} submitLabel="Create event" />
    </AdminShell>
  );
}
