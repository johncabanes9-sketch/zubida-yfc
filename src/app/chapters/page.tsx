import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ChaptersExplorer } from "@/components/chapters/chapters-explorer";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { getChapters } from "@/lib/data/chapters";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Chapters",
  description:
    "Explore the Youth for Christ chapters across the municipalities of Zamboanga del Sur.",
};

export default async function ChaptersPage() {
  const chapters = await getChapters();
  return (
    <>
      {/* Title carried the unverified "twenty-six" figure; the count is not
          published anywhere until the real chapter roster is confirmed. */}
      <PageHeader
        eyebrow="Our Chapters"
        title="One province, many homes"
        subtitle="From the bay of Pagadian to the hills of the north, find the Zubida YFC chapter nearest you and see what God is doing there."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {chapters.length > 0 ? (
          <ChaptersExplorer chapters={chapters} />
        ) : (
          <UnpublishedNotice
            title="Our chapter directory isn't published yet"
            detail="Chapter locations, meeting schedules, and coordinators are being confirmed with the provincial team. To find the chapter nearest you in the meantime, please get in touch through our Contact page."
          />
        )}
      </section>
    </>
  );
}
