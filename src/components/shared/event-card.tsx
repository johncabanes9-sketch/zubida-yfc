"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import type { EventItem } from "@/data/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EventModal } from "./event-modal";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

const statusStyles: Record<EventItem["status"], string> = {
  Open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Closed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Finished: "bg-slate-500/15 text-slate-500 dark:text-slate-400",
};

export function EventCard({ event, delay = 0 }: { event: EventItem; delay?: number }) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, Math.round((event.slotsTaken / event.slotsTotal) * 100));

  return (
    <>
      <Reveal delay={delay}>
        <article className="group glass flex h-full flex-col overflow-hidden rounded-3xl shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-soft">
          <div className="relative h-52 overflow-hidden">
            <Image
              src={event.cover}
              alt={event.name}
              fill
              sizes="(max-width:768px) 100vw, 33vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-midnight-950/70 to-transparent" />
            <span
              className={cn(
                "absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur",
                statusStyles[event.status],
              )}
            >
              {event.status}
            </span>
            <span className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-midnight-900 backdrop-blur dark:bg-midnight-900/80 dark:text-cream">
              {event.scope}
            </span>
          </div>

          <div className="flex flex-1 flex-col p-6">
            <h3 className="font-display text-xl font-semibold leading-snug">
              {event.name}
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gold-500" /> {formatDate(event.date)}
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold-500" /> {event.time}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold-500" /> {event.venue}
              </li>
            </ul>

            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {event.slotsTaken}/{event.slotsTotal} slots
                </span>
                <span>{event.status === "Open" ? `${event.slotsTotal - event.slotsTaken} left` : "—"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-royal-700/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-dawn-soft"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <Button
                onClick={() => setOpen(true)}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                View Details
              </Button>
              <Button
                onClick={() => setOpen(true)}
                variant={event.status === "Open" ? "primary" : "ghost"}
                size="sm"
                className="flex-1"
                disabled={event.status !== "Open"}
              >
                {event.status === "Open" ? "Register" : event.status}
              </Button>
            </div>
          </div>
        </article>
      </Reveal>

      <EventModal event={event} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
