import type { DayBucket } from "@/lib/admin/metrics";
import { formatShortDate } from "@/lib/utils";

/**
 * Registrations per day — one series, so no legend: the heading names it.
 *
 * The marks are HTML rather than SVG. At this size that is not a shortcut: the
 * bars stay responsive without viewBox arithmetic, and the axis labels stay at
 * their true type size instead of being scaled by the viewport.
 *
 * The bars are aria-hidden and the numbers are carried by a visually-hidden
 * table, which is also the table view the chart is obliged to provide.
 */
export function TrendBars({
  data,
  caption,
}: {
  data: readonly DayBucket[];
  caption: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="flex h-32 items-center justify-center text-sm text-muted">
        No registrations in this period.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <div aria-hidden="true" className="flex h-32 items-end gap-[2px]">
        {data.map((d) => (
          <div
            key={d.day}
            title={`${formatShortDate(d.day)}: ${d.count}`}
            className="group relative flex-1 rounded-t-[4px] bg-[var(--chart-primary)] transition-opacity hover:opacity-70"
            style={{
              // A zero day still gets 2px so the gap in the series is visible
              // rather than reading as "no data here".
              height: d.count === 0 ? "2px" : `${Math.max(4, (d.count / max) * 100)}%`,
              opacity: d.count === 0 ? 0.25 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--chart-grid)] pt-2 text-xs text-muted">
        <span>{formatShortDate(data[0].day)}</span>
        <span className="font-medium text-[var(--fg)]">
          {total.toLocaleString("en-US")} total
        </span>
        <span>{formatShortDate(data[data.length - 1].day)}</span>
      </div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Registrations</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
