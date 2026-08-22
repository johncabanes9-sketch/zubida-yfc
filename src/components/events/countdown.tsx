"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Time remaining until an event (or its registration deadline).
 *
 * Nothing is computed during render on the server. A countdown derived from
 * server time would not match what the browser computes a moment later, and
 * React would report a hydration mismatch on every event card on the page. So
 * the first paint is a stable placeholder and the real figure arrives on mount.
 *
 * It ticks once a minute, not once a second: this counts down days to an event,
 * where a seconds hand is visual noise that also wakes the main thread sixty
 * times more often than the information changes.
 */
const MINUTE_MS = 60_000;

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  past: boolean;
}

function remainingUntil(target: number, now: number): Remaining {
  const diff = target - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, past: true };
  const minutes = Math.floor(diff / MINUTE_MS);
  return {
    days: Math.floor(minutes / (60 * 24)),
    hours: Math.floor((minutes % (60 * 24)) / 60),
    minutes: minutes % 60,
    past: false,
  };
}

function label({ days, hours, minutes, past }: Remaining, passedLabel: string): string {
  if (past) return passedLabel;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ${hours}h to go`;
  if (hours > 0) return `${hours}h ${minutes}m to go`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} to go`;
}

export function Countdown({
  /** ISO timestamp the countdown runs to. */
  target,
  /** What to say once the target has passed. */
  passedLabel = "Starting soon",
  className,
}: {
  target: string;
  passedLabel?: string;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  const targetMs = new Date(target).getTime();
  // An unparseable date is not worth guessing at — render nothing rather than
  // "NaN days to go".
  if (Number.isNaN(targetMs)) return null;

  const text = now === null ? null : label(remainingUntil(targetMs, now), passedLabel);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums",
        className,
      )}
    >
      <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {/* aria-live so a screen reader is told when the figure changes, but
          polite so it never interrupts what the user is already reading. */}
      <span aria-live="polite">
        {text ?? <span className="opacity-0">— days to go</span>}
      </span>
    </span>
  );
}
