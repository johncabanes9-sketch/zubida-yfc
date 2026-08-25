import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { EventsBoard } from "@/components/events/events-board";
import { getEvents } from "@/lib/data/events";
import { getRegistrationOptions } from "@/lib/data/options";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming and past provincial and chapter activities of Zubida YFC — camps, conferences, seminars, and missions.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [{ events, status }, options] = await Promise.all([
    getEvents(),
    getRegistrationOptions(),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Events"
        title="Come and see what God is doing"
        subtitle="Provincial camps, conferences, Christian Life Seminars, and chapter missions — find your next encounter and register online."
      />
      <section
        aria-labelledby="events-list"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <h2 id="events-list" className="sr-only">
          All events
        </h2>
        <EventsBoard events={events} options={options} status={status} />
      </section>
    </>
  );
}
