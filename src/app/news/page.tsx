import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewsBoard } from "@/components/news/news-board";

export const metadata: Metadata = {
  title: "News",
  description:
    "Announcements, articles, blogs, and videos from the Zubida YFC community in Zamboanga del Sur.",
};

export default function NewsPage() {
  return (
    <>
      <PageHeader
        eyebrow="News & Stories"
        title="What's happening across the province"
        subtitle="Announcements, reflections, testimonies, and highlights from our chapters and provincial team."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <NewsBoard />
      </section>
    </>
  );
}
