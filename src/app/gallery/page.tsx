import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { GalleryGrid } from "@/components/gallery/gallery-grid";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos from Zubida YFC camps, conferences, households, seminars, sports fests, and mission activities.",
};

export default function GalleryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Gallery"
        title="Grace, caught in a moment"
        subtitle="Worship, service, and friendship across the province — relive the memories."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <GalleryGrid />
      </section>
    </>
  );
}
