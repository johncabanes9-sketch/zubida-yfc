import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { EventItem } from "@/data/types";
import type { EventRow } from "@/lib/supabase/database.types";
import { publicUrl } from "@/lib/images/paths";

type EventRowWithImages = EventRow & {
  event_images?: { path: string; alt: string | null; sort_order: number }[] | null;
};

/**
 * `ok` carries the real event list — which may legitimately be empty when nothing
 * is scheduled. `unavailable` means the query failed and we do not know what the
 * real list is.
 *
 * These two states must stay distinct. Events are records, not page chrome: an
 * outage must never be papered over with stand-in events, because a visitor
 * cannot tell a placeholder event from a real one and would register for it.
 */
export type EventsResult =
  | { status: "ok"; events: EventItem[] }
  | { status: "unavailable"; events: [] };

/** Loads events from Supabase (real UUIDs, live slot counts). */
export async function getEvents(): Promise<EventsResult> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("events")
      .select("*, event_images(path, alt, sort_order)")
      .is("deleted_at", null)
      .order("date", { ascending: true });

    if (error || !data) return { status: "unavailable", events: [] };

    const events = (data as EventRowWithImages[]).map((e) => ({
      id: e.id,
      name: e.name,
      cover: e.cover ?? "",
      date: e.date,
      time: e.time ?? "",
      venue: e.venue ?? "",
      organizer: e.organizer ?? "",
      description: e.description ?? "",
      registrationDeadline: e.registration_deadline,
      slotsTotal: e.slots_total,
      slotsTaken: e.slots_taken,
      status: e.status,
      scope: e.scope,
      images: (e.event_images ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ url: publicUrl(i.path), alt: i.alt ?? e.name })),
    }));

    return { status: "ok", events };
  } catch {
    return { status: "unavailable", events: [] };
  }
}
