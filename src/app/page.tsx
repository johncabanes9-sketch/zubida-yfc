import { Hero } from "@/components/home/hero";
import { StatsBand } from "@/components/home/stats-band";
import { AboutTeaser } from "@/components/home/about-teaser";
import { NewsPreview } from "@/components/home/news-preview";
import { EventsPreview } from "@/components/home/events-preview";
import { FeaturedPhotos } from "@/components/home/featured-photos";
import { Testimonials } from "@/components/home/testimonials";
import { VerseBanner } from "@/components/home/verse-banner";
import { getSiteSettings } from "@/lib/data/site";

// The homepage renders <EventsPreview />, which reads live events. Without this
// it is prerendered at build and serves stale (or, on an empty table, mock)
// events forever, while /events (force-dynamic) shows the real ones.
export const revalidate = 60;

export default async function HomePage() {
  const { site } = await getSiteSettings();
  return (
    <>
      <Hero province={site.province} />
      <StatsBand />
      <AboutTeaser />
      <EventsPreview />
      <NewsPreview />
      <FeaturedPhotos />
      <Testimonials />
      <VerseBanner />
    </>
  );
}
