"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Subscribes to the event row via Supabase Realtime and shows the live
 * remaining-slot count. Falls back to the server-rendered count if realtime
 * isn't available.
 */
export function LiveSlots({
  eventId,
  slotsTaken,
  slotsTotal,
}: {
  eventId: string;
  slotsTaken: number;
  slotsTotal: number;
}) {
  const [taken, setTaken] = useState(slotsTaken);

  useEffect(() => {
    // Only UUID event ids exist in the DB; mock ids (e1, e2…) have no row.
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        (payload) => setTaken((payload.new as { slots_taken: number }).slots_taken),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const left = Math.max(0, slotsTotal - taken);
  return <>{left} left</>;
}
