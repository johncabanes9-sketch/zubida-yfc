import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One table definition that renders two ways.
 *
 * The admin tables previously set `min-w-[760px]` inside `overflow-x-auto`,
 * which on a phone meant every row had to be scrolled sideways to be read or
 * acted on. Here the same columns render as a real `<table>` from `sm` up and
 * as a stacked card list below it. Only one of the two is ever in the DOM's
 * accessibility tree, because the other is `display: none`.
 *
 * Sorting is *controlled*: the caller owns the state and the comparison. That
 * keeps this component hook-free, so it can be used from a server component
 * without dragging the whole table into the client bundle.
 */

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Becomes the card heading in the stacked layout. Set this on exactly one column. */
  primary?: boolean;
  /** Drop this column from the stacked layout — usually because the primary cell repeats it. */
  hideOnCard?: boolean;
  /** Renders full-width at the foot of the card instead of as a label/value row. */
  actions?: boolean;
  align?: "left" | "right";
  sortable?: boolean;
  className?: string;
}

export interface SortState {
  key: string;
  direction: "asc" | "desc";
}

interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  /** Rendered in place of the table body when there are no rows. */
  empty: ReactNode;
  /** Describes the table for screen readers; visually hidden. */
  caption: string;
  sort?: SortState;
  onSortChange?: (key: string) => void;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  caption,
  sort,
  onSortChange,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className={cn("surface rounded-2xl shadow-card", className)}>{empty}</div>;
  }

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const cardRows = columns.filter((c) => c !== primary && !c.hideOnCard && !c.actions);
  const cardActions = columns.filter((c) => c.actions);

  return (
    <div className={cn("surface overflow-hidden rounded-2xl shadow-card", className)}>
      {/* ── sm and up: a real table ───────────────────────────────── */}
      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--rule-strong)] bg-[var(--surface-2)] text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  sort?.key === col.key
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : col.sortable
                      ? "none"
                      : undefined
                }
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted",
                  col.align === "right" && "text-right",
                  col.className,
                )}
              >
                {col.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded transition-colors hover:text-royal-700 dark:hover:text-gold-300",
                      col.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {col.header}
                    <SortGlyph active={sort?.key === col.key} direction={sort?.direction} />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[var(--rule)] transition-colors last:border-0 hover:bg-[var(--surface-2)]"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3 align-middle",
                    col.align === "right" && "text-right",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── below sm: stacked cards, no sideways scrolling ────────── */}
      <ul className="divide-y divide-[var(--rule)] sm:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="p-4">
            <div className="font-medium text-[var(--fg)]">{primary.cell(row)}</div>
            {cardRows.length > 0 && (
              <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                {cardRows.map((col) => (
                  <div key={col.key} className="contents">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {col.header}
                    </dt>
                    <dd className="min-w-0 text-[var(--fg)]">{col.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {cardActions.map((col) => (
              <div key={col.key} className="mt-3">
                {col.cell(row)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SortGlyph({ active, direction }: { active: boolean; direction?: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />;
  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
  );
}

/** Flips direction when the same column is clicked again, otherwise starts descending. */
export function nextSort(current: SortState | undefined, key: string): SortState {
  if (current?.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "desc" };
}
