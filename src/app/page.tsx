import { Hero } from "@/components/home/hero";
import { StatsBand } from "@/components/home/stats-band";
import { AboutTeaser } from "@/components/home/about-teaser";
import { NewsPreview } from "@/components/home/news-preview";
import { EventsPreview } from "@/components/home/events-preview";
import { FeaturedPhotos } from "@/components/home/featured-photos";
import { Testimonials } from "@/components/home/testimonials";
import { VerseBanner } from "@/components/home/verse-banner";

export default function HomePage() {
  return (
    <>
      <Hero />
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
