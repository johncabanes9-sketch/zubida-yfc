import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ChaptersExplorer } from "@/components/chapters/chapters-explorer";

export const metadata: Metadata = {
  title: "Chapters",
  description:
    "Explore the Youth for Christ chapters across the municipalities of Zamboanga del Sur.",
};

export default function ChaptersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Our Chapters"
        title="One province, twenty-six homes"
        subtitle="From the bay of Pagadian to the hills of the north, find the Zubida YFC chapter nearest you and see what God is doing there."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <ChaptersExplorer />
      </section>
    </>
  );
}
