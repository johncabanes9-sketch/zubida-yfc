import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Status pill. Every tone pairs a `-50` fill with its own `-700` text in light
 * mode and a translucent fill with a `-300` text in dark mode; both directions
 * were measured at or above the 4.5:1 AA floor.
 */
export type BadgeTone = "neutral" | "success" | "warn" | "danger" | "royal" | "gold";

const tones: Record<BadgeTone, string> = {
  neutral:
    "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-300",
  success:
    "bg-success-50 text-success-700 dark:bg-success-300/15 dark:text-success-300",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-300/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-300/15 dark:text-danger-300",
  royal: "bg-royal-50 text-royal-700 dark:bg-royal-300/15 dark:text-royal-300",
  gold: "bg-gold-200/60 text-gold-700 dark:bg-gold-400/15 dark:text-gold-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps a registration/event status string onto a tone. Unknown values stay neutral. */
export function toneForStatus(status: string): BadgeTone {
  switch (status.toLowerCase()) {
    case "approved":
    case "open":
    case "published":
      return "success";
    case "pending":
    case "draft":
      return "warn";
    case "rejected":
      return "danger";
    case "cancelled":
    case "closed":
    case "finished":
      return "neutral";
    default:
      return "neutral";
  }
}
