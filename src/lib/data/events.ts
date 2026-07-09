import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { events as mockEvents } from "@/data/events";
import type { EventItem } from "@/data/types";
import type { EventRow } from "@/lib/supabase/database.types";

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
      .select("*")
      .is("deleted_at", null)
      .order("date", { ascending: true });

    if (error || !data || data.length === 0) return mockEvents;

    return (data as EventRow[]).map((e) => ({
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
    }));
  } catch {
    return mockEvents;
  }
}
