import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { ICON_MAP } from "@/lib/pages/icons";
import type { ValuesGridContent } from "@/lib/pages/content-schemas";

export function ValuesGridSection({ content }: { content: ValuesGridContent }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeading eyebrow={content.eyebrow} title={content.title} align={content.align} />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((v, i) => {
          const Icon = ICON_MAP[v.icon as keyof typeof ICON_MAP];
          return (
            <Reveal key={v.title} delay={(i % 3) * 0.1}>
              <div className="glass h-full rounded-3xl p-7 shadow-card transition-transform duration-300 hover:-translate-y-1.5">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold-500/15 text-gold-600 dark:text-gold-400">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{v.text}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
