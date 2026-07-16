import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { events as mockEvents } from "@/data/events";
import type { EventItem } from "@/data/types";
import type { EventRow } from "@/lib/supabase/database.types";
import { publicUrl } from "@/lib/images/paths";

type EventRowWithImages = EventRow & {
  event_images?: { path: string; alt: string | null; sort_order: number }[] | null;
};

/**
 * Loads events from Supabase (real UUIDs, live slot counts). Falls back to the
 * Phase 1 mock data if the database is unreachable or empty, so the public site
 * always renders.
 */
export async function getEvents(): Promise<EventItem[]> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("events")
      .select("*, event_images(path, alt, sort_order)")
      .is("deleted_at", null)
      .order("date", { ascending: true });

    if (error || !data || data.length === 0) return mockEvents;

    return (data as EventRowWithImages[]).map((e) => ({
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
  } catch {
    return mockEvents;
  }
}
