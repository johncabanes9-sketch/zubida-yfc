import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewsBoard } from "@/components/news/news-board";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { isVerified } from "@/lib/content/fixtures";

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
        {isVerified("news") ? (
          <NewsBoard />
        ) : (
          <UnpublishedNotice
            title="No stories published yet"
            detail="Announcements and stories from across the province will appear here once the provincial media team begins publishing."
          />
        )}
      </section>
    </>
  );
}
