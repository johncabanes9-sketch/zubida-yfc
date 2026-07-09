import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { EventCard } from "@/components/shared/event-card";
import { ButtonLink } from "@/components/ui/button";
import { getEvents } from "@/lib/data/events";

export async function EventsPreview() {
  const events = await getEvents();
  const upcoming = events
    .filter((e) => e.status !== "Finished")
    .slice(0, 3);

  return (
    <section className="bg-cream-100 py-24 dark:bg-midnight-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Upcoming Events"
            title="Gather. Encounter. Be sent."
            subtitle="From provincial camps to chapter seminars — there's a place for you at the next gathering."
          />
          <ButtonLink href="/events" variant="ghost" className="text-royal-700 dark:text-gold-300">
            View all events <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
        <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((e, i) => (
            <EventCard key={e.id} event={e} delay={i * 0.1} />
          ))}
        </div>
      </div>
    </section>
  );
}
