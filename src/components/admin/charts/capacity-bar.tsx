import { slotsLeft } from "@/lib/admin/metrics";
import { cn } from "@/lib/utils";

/** Above this share of capacity the bar changes tone to flag "filling up". */
const NEARLY_FULL = 0.9;

/**
 * How full one event is.
 *
 * The tone change at 90% is a status signal, so it is always accompanied by the
 * written remainder ("3 left", "Full") — the colour shift is the redundant
 * channel, never the only one.
 */
export function CapacityBar({
  slotsTotal,
  slotsTaken,
  className,
}: {
  slotsTotal: number;
  slotsTaken: number;
  className?: string;
}) {
  // An event with no cap has nothing to fill; say so rather than dividing by zero.
  if (slotsTotal <= 0) {
    return <p className={cn("text-xs text-muted", className)}>No capacity set</p>;
  }

  const left = slotsLeft(slotsTotal, slotsTaken);
  const filled = Math.min(1, slotsTaken / slotsTotal);
  const isFull = left === 0;
  const isNearlyFull = !isFull && filled >= NEARLY_FULL;

  const fill = isFull
    ? "var(--chart-rejected)"
    : isNearlyFull
      ? "var(--chart-pending)"
      : "var(--chart-primary)";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="tabular-nums text-muted">
          {slotsTaken.toLocaleString("en-US")} / {slotsTotal.toLocaleString("en-US")} slots
        </span>
        <span
          className={cn(
            "font-semibold",
            isFull
              ? "text-danger-700 dark:text-danger-300"
              : isNearlyFull
                ? "text-warn-700 dark:text-warn-300"
                : "text-muted",
          )}
        >
          {isFull ? "Full" : `${left.toLocaleString("en-US")} left`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={slotsTaken}
        aria-valuemin={0}
        aria-valuemax={slotsTotal}
        aria-label={`${slotsTaken} of ${slotsTotal} slots taken`}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--chart-track)]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${filled * 100}%`, backgroundColor: fill }}
        />
      </div>
    </div>
  );
}
