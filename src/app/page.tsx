import { Hero } from "@/components/home/hero";
import { StatsBand } from "@/components/home/stats-band";
import { AboutTeaser } from "@/components/home/about-teaser";
import { NewsPreview } from "@/components/home/news-preview";
import { EventsPreview } from "@/components/home/events-preview";
import { FeaturedPhotos } from "@/components/home/featured-photos";
import { Testimonials } from "@/components/home/testimonials";
import { VerseBanner } from "@/components/home/verse-banner";
import { getSiteSettings } from "@/lib/data/site";
import { isVerified } from "@/lib/content/fixtures";
import { getGalleryPhotos } from "@/lib/data/gallery";
import { getNewsPosts } from "@/lib/data/news";

// The homepage renders <EventsPreview />, which reads live events. Without this
// it is prerendered at build and serves stale (or, on an empty table, mock)
// events forever, while /events (force-dynamic) shows the real ones.
export const revalidate = 60;

export default async function HomePage() {
  const [{ site }, photos, posts] = await Promise.all([
    getSiteSettings(),
    getGalleryPhotos(5),
    getNewsPosts(3),
  ]);
  return (
    <>
      <Hero province={site.province} name={site.name} description={site.description} />
      <StatsBand />
      <AboutTeaser />
      <EventsPreview />
      {/* Testimonials are omitted entirely rather than shown with Phase-1
          placeholder content — an absent section is honest, a section filled
          with invented stories is not. News and photos come from managed
          tables and each section appears once something is published. */}
      {posts.length > 0 && <NewsPreview posts={posts} />}
      {photos.length > 0 && <FeaturedPhotos photos={photos} />}
      {isVerified("testimonials") && <Testimonials />}
      <VerseBanner />
    </>
  );
}
