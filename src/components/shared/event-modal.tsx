"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Share2,
  User,
  Users,
  X,
} from "lucide-react";
import type { EventItem } from "@/data/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RegistrationForm } from "./registration-form";

export function EventModal({
  event,
  open,
  onClose,
}: {
  event: EventItem;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"details" | "register">("details");
  const [shared, setShared] = useState(false);

  const share = async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : "https://zubidayfc.org/events";
    try {
      if (navigator.share) {
        await navigator.share({ title: event.name, text: event.description, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-midnight-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-cream shadow-soft dark:bg-midnight-900 sm:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-cream/90 px-6 py-4 backdrop-blur dark:border-white/10 dark:bg-midnight-900/90">
              <div className="flex gap-1 rounded-full bg-royal-700/8 p-1 dark:bg-white/5">
                <button
                  onClick={() => setTab("details")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    tab === "details"
                      ? "bg-white text-royal-700 shadow-sm dark:bg-midnight-800 dark:text-gold-300"
                      : "text-muted"
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setTab("register")}
                  disabled={event.status !== "Open"}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                    tab === "register"
                      ? "bg-white text-royal-700 shadow-sm dark:bg-midnight-800 dark:text-gold-300"
                      : "text-muted"
                  }`}
                >
                  Register
                </button>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {tab === "details" ? (
              <div className="p-6">
                <h2 className="font-display text-2xl font-semibold">{event.name}</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info icon={<CalendarDays className="h-4 w-4" />} label="Date" value={formatDate(event.date)} />
                  <Info icon={<Clock className="h-4 w-4" />} label="Time" value={event.time} />
                  <Info icon={<MapPin className="h-4 w-4" />} label="Venue" value={event.venue} />
                  <Info icon={<User className="h-4 w-4" />} label="Organizer" value={event.organizer} />
                  <Info
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Registration deadline"
                    value={formatDate(event.registrationDeadline)}
                  />
                  <Info
                    icon={<Users className="h-4 w-4" />}
                    label="Slots"
                    value={`${event.slotsTaken}/${event.slotsTotal} filled`}
                  />
                </div>
                <p className="mt-6 leading-relaxed text-muted">{event.description}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    onClick={() => setTab("register")}
                    disabled={event.status !== "Open"}
                  >
                    {event.status === "Open" ? "Register Now" : `Registration ${event.status}`}
                  </Button>
                  <Button variant="outline" onClick={share}>
                    <Share2 className="h-4 w-4" />
                    {shared ? "Link copied!" : "Share Event"}
                  </Button>
                </div>
              </div>
            ) : (
              <RegistrationForm event={event} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/60 p-3 dark:bg-white/5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold-500/15 text-gold-600 dark:text-gold-400">
        {icon}
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export { CheckCircle2 };
