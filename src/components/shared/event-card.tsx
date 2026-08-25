"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import type { EventItem } from "@/data/types";
import type { RegistrationOptionLists } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EventModal } from "./event-modal";
import { Reveal } from "./reveal";
import { LiveSlots } from "@/components/events/live-slots";
import { Countdown } from "@/components/events/countdown";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { share } from "@/lib/admin/metrics";

export function EventCard({
  event,
  options,
  delay = 0,
}: {
  event: EventItem;
  /** Passed through to the registration form inside the modal. */
  options?: RegistrationOptionLists;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  // share() guards the divide-by-zero. An event with no cap used to compute
  // 0/0 here, which rendered as `width: NaN%` — an invalid declaration the
  // browser drops, leaving the track empty with no explanation.
  const pct = Math.min(100, Math.round(share(event.slotsTaken, event.slotsTotal)));

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
            <Badge
              tone={toneForStatus(event.status)}
              className="absolute right-3 top-3 backdrop-blur"
            >
              {event.status}
            </Badge>
            <span className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-midnight-900 backdrop-blur dark:bg-midnight-900/80 dark:text-cream">
              {event.scope}
            </span>
          </div>

          <div className="flex flex-1 flex-col p-6">
            <h3 className="font-display text-xl font-semibold leading-snug">
              {event.name}
            </h3>
            {event.status === "Open" && (
              <Countdown
                target={event.date}
                passedLabel="Happening now"
                className="mt-2 text-royal-700 dark:text-gold-300"
              />
            )}
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gold-700 dark:text-gold-400" /> {formatDate(event.date)}
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold-700 dark:text-gold-400" /> {event.time}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold-700 dark:text-gold-400" /> {event.venue}
              </li>
            </ul>

            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {event.slotsTaken}/{event.slotsTotal} slots
                </span>
                <span>
                  {event.status === "Open" ? (
                    <LiveSlots eventId={event.id} slotsTaken={event.slotsTaken} slotsTotal={event.slotsTotal} />
                  ) : (
                    "—"
                  )}
                </span>
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

      <EventModal event={event} options={options} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
