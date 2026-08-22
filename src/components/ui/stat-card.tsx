import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "./badge";

/**
 * A single dashboard figure.
 *
 * `value` is deliberately `number | null`: the dashboard counts rows with a
 * `head: true` query that can fail independently of the page, and a failed
 * count must read as "Unavailable" rather than silently render as 0. Keeping
 * null in the type stops a caller from defaulting that away.
 */
const accents: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-300",
  success: "bg-success-50 text-success-700 dark:bg-success-300/15 dark:text-success-300",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-300/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-300/15 dark:text-danger-300",
  royal: "bg-royal-50 text-royal-700 dark:bg-royal-300/15 dark:text-royal-300",
  gold: "bg-gold-200/60 text-gold-700 dark:bg-gold-400/15 dark:text-gold-300",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "royal",
  footnote,
  className,
}: {
  label: string;
  value: number | null;
  icon: LucideIcon;
  tone?: BadgeTone;
  footnote?: string;
  className?: string;
}) {
  return (
    <div className={cn("surface rounded-2xl p-5 shadow-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", accents[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-[var(--fg)]">
        {value === null ? (
          <span className="text-lg font-medium text-muted">Unavailable</span>
        ) : (
          value.toLocaleString("en-US")
        )}
      </p>
      {footnote && <p className="mt-1 text-xs text-muted">{footnote}</p>}
    </div>
  );
}
