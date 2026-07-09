import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { EventsBoard } from "@/components/events/events-board";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming and past provincial and chapter activities of Zubida YFC — camps, conferences, seminars, and missions.",
};

export default function EventsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Events"
        title="Come and see what God is doing"
        subtitle="Provincial camps, conferences, Christian Life Seminars, and chapter missions — find your next encounter and register online."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <EventsBoard />
      </section>
    </>
  );
}
