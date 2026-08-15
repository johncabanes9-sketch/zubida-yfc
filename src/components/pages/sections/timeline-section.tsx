import { SectionHeading } from "@/components/shared/section-heading";
import { Sunburst } from "@/components/shared/sunburst";
import { Timeline } from "@/components/about/timeline";
import type { TimelineContent } from "@/lib/pages/content-schemas";

export function TimelineSection({ content }: { content: TimelineContent }) {
  return (
    <section className="relative overflow-hidden bg-cream-100 py-24 dark:bg-midnight-900/40">
      <div className="pointer-events-none absolute -left-24 top-1/3 text-gold-400/5">
        <Sunburst className="h-96 w-96" rays={24} />
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} align={content.align} />
        <div className="mt-16">
          <Timeline milestones={content.milestones} />
        </div>
      </div>
    </section>
  );
}
