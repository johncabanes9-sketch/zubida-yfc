import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Stat } from "@/data/types";

/**
 * Derives the homepage statistics from live data.
 *
 * Only figures with a real source in the database are produced. The Phase-1
 * band advertised four hardcoded numbers (26 chapters, 4,200+ members, 58
 * provincial events, 340+ trained leaders) that were unsourced and contradicted
 * by the app's own fixtures — see ZUBIDA_CONTENT_AUDIT.md §5.
 *
 * There is no `chapters`, `members`, or `leaders` table yet, so those three
 * figures are deliberately absent rather than estimated. When those domains are
 * modelled, add them here; do not reintroduce them as constants.
 *
 * Returns an empty array when nothing can be counted, so the caller omits the
 * band entirely instead of rendering zeroes.
 */
export async function getSiteStats(): Promise<Stat[]> {
  try {
    const db = createServiceClient();
    const [totalRes, upcomingRes] = await Promise.all([
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("status", "Finished"),
    ]);

    if (totalRes.error) return [];

    const total = totalRes.count ?? 0;
    if (total === 0) return [];

    const stats: Stat[] = [{ label: "Events Held", value: total }];
    if (!upcomingRes.error && (upcomingRes.count ?? 0) > 0) {
      stats.push({ label: "Upcoming Events", value: upcomingRes.count ?? 0 });
    }
    return stats;
  } catch {
    return [];
  }
}
