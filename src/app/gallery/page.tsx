import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { getGalleryPhotos } from "@/lib/data/gallery";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos from Zubida YFC camps, conferences, households, seminars, sports fests, and mission activities.",
};

// Admin actions revalidate /gallery on every change; this is the backstop.
export const revalidate = 60;

export default async function GalleryPage() {
  const photos = await getGalleryPhotos();
  return (
    <>
      <PageHeader
        eyebrow="Gallery"
        title="Grace, caught in a moment"
        subtitle="Worship, service, and friendship across the province — relive the memories."
      />
      <section
        aria-labelledby="gallery-list"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <h2 id="gallery-list" className="sr-only">
          Photo gallery
        </h2>
        {photos.length > 0 ? (
          <GalleryGrid photos={photos} />
        ) : (
          <UnpublishedNotice
            title="No photos published yet"
            detail="Photos from our camps, conferences, households, and missions will appear here once the provincial media team uploads them."
          />
        )}
      </section>
    </>
  );
}
