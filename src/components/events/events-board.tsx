"use client";

import { useMemo, useState } from "react";
import { CalendarX } from "lucide-react";
import type { EventItem } from "@/data/types";
import { EventCard } from "@/components/shared/event-card";
import { cn } from "@/lib/utils";

type TimeFilter = "Upcoming" | "Past" | "All";
type ScopeFilter = "All" | "Provincial" | "Chapter";

export function EventsBoard({ events }: { events: EventItem[] }) {
  const [time, setTime] = useState<TimeFilter>("Upcoming");
  const [scope, setScope] = useState<ScopeFilter>("All");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      const isPast = e.status === "Finished";
      const matchesTime =
        time === "All" ||
        (time === "Upcoming" && !isPast) ||
        (time === "Past" && isPast);
      const matchesScope = scope === "All" || e.scope === scope;
      return matchesTime && matchesScope;
    });
  }, [time, scope]);

  return (
    <div>
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-full bg-royal-700/8 p-1 dark:bg-white/5">
          {(["Upcoming", "Past", "All"] as TimeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTime(t)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                time === t
                  ? "bg-dawn-soft text-white shadow-soft"
                  : "text-muted hover:text-midnight dark:hover:text-cream",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(["All", "Provincial", "Chapter"] as ScopeFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                scope === s
                  ? "bg-gold-500 text-midnight-900"
                  : "bg-royal-700/8 text-muted hover:bg-royal-700/15 dark:bg-white/5",
              )}
            >
              {s === "All" ? "All types" : s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e, i) => (
            <EventCard key={e.id} event={e} delay={(i % 3) * 0.1} />
          ))}
        </div>
      ) : (
        <div className="glass flex flex-col items-center justify-center rounded-3xl py-20 text-center">
          <CalendarX className="h-12 w-12 text-muted" />
          <p className="mt-4 font-display text-xl">No events here yet</p>
          <p className="mt-1 text-sm text-muted">
            Check back soon or switch filters — new gatherings are added often.
          </p>
        </div>
      )}
    </div>
  );
}
