import { ArrowRight } from "lucide-react";
import { news } from "@/data/news";
import { SectionHeading } from "@/components/shared/section-heading";
import { NewsCard } from "@/components/shared/news-card";
import { ButtonLink } from "@/components/ui/button";

export function NewsPreview() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading
          eyebrow="Latest News"
          title="Stories from across the province"
          subtitle="Announcements, reflections, and testimonies from our chapters."
        />
        <ButtonLink href="/news" variant="ghost" className="text-royal-700 dark:text-gold-300">
          All stories <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>
      <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
        {news.slice(0, 3).map((n, i) => (
          <NewsCard key={n.id} item={n} delay={i * 0.1} />
        ))}
      </div>
    </section>
  );
}
