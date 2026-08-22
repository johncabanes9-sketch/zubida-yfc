import type { RegistrationStatus } from "@/lib/supabase/database.types";

/** A single day in the trend series. `day` is an ISO date (YYYY-MM-DD) in local time. */
export interface DayBucket {
  day: string;
  count: number;
}

/** Local-time YYYY-MM-DD. `toISOString()` would shift the day for anyone east or
 *  west of UTC — in Zamboanga (UTC+8) it would file every evening under tomorrow. */
export function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Buckets timestamps into one entry per day, oldest first, including days with
 * no registrations. Empty days must be present or the series silently compresses
 * a quiet fortnight into a misleadingly busy-looking chart.
 */
export function bucketByDay(
  timestamps: readonly string[],
  days: number,
  now: Date = new Date(),
): DayBucket[] {
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    counts.set(localDayKey(d), 0);
  }
  for (const ts of timestamps) {
    const key = localDayKey(new Date(ts));
    const existing = counts.get(key);
    if (existing !== undefined) counts.set(key, existing + 1);
  }
  return [...counts.entries()].map(([day, count]) => ({ day, count }));
}

export const STATUS_ORDER: readonly RegistrationStatus[] = [
  "approved",
  "pending",
  "rejected",
  "cancelled",
];

/**
 * Segment colours, in this exact order.
 *
 * The order is load-bearing, not cosmetic: amber sits between green and red so
 * those two are never adjacent. Green beside red is the worst possible pair for
 * deuteranopia, and reordering the segments "logically" (pending first) drops
 * the measured adjacent-pair separation from ΔE 10.6 to 5.2.
 */
export const STATUS_VAR: Record<RegistrationStatus, string> = {
  approved: "var(--chart-approved)",
  pending: "var(--chart-pending)",
  rejected: "var(--chart-rejected)",
  cancelled: "var(--chart-cancelled)",
};

/** Percentage of `total`, guarding the divide-by-zero that an empty table gives. */
export function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/** Remaining capacity, floored at zero — `slots_taken` can exceed `slots_total`
 *  if capacity is lowered after registrations were accepted. */
export function slotsLeft(slotsTotal: number, slotsTaken: number): number {
  return Math.max(0, slotsTotal - slotsTaken);
}
