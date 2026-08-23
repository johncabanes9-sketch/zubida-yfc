import type { RegistrationStatus } from "@/lib/supabase/database.types";
import { STATUS_ORDER, STATUS_VAR, share } from "@/lib/admin/metrics";

/**
 * Part-to-whole across the four registration states.
 *
 * These are status colours, not a categorical series, so they are reserved and
 * every segment ships with a written label and a count — identity never travels
 * on hue alone. The 2px gaps between fills are the surface showing through,
 * which is also the secondary encoding that keeps adjacent segments separable.
 */
export function StatusBreakdown({
  counts,
}: {
  counts: Partial<Record<RegistrationStatus, number>>;
}) {
  const present = STATUS_ORDER.map((status) => ({
    status,
    count: counts[status] ?? 0,
  }));
  const total = present.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return <p className="text-sm text-muted">No registrations to break down yet.</p>;
  }

  return (
    <div>
      <div
        aria-hidden="true"
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--chart-track)]"
      >
        {present
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.status}
              style={{
                width: `${share(s.count, total)}%`,
                backgroundColor: STATUS_VAR[s.status],
              }}
              className="first:rounded-l-full last:rounded-r-full"
            />
          ))}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {present.map((s) => (
          <li key={s.status} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_VAR[s.status] }}
            />
            <span className="capitalize text-muted">{s.status}</span>
            <span className="ml-auto font-semibold tabular-nums text-[var(--fg)]">
              {s.count.toLocaleString("en-US")}
            </span>
            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">
              {share(s.count, total).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
