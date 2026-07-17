import { Reveal } from "@/components/shared/reveal";
import { ICON_MAP } from "@/lib/pages/icons";
import type { FeatureCardsContent } from "@/lib/pages/content-schemas";

// The two seeded cards use different badge treatments; preserve that by index.
const BADGE = [
  "bg-dawn-soft text-gold-300",
  "bg-gold-500 text-midnight-900",
];

export function FeatureCardsSection({ content }: { content: FeatureCardsContent }) {
  return (
    <section className="bg-cream-100 py-24 dark:bg-midnight-900/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
        {content.cards.map((card, i) => {
          const Icon = ICON_MAP[card.icon as keyof typeof ICON_MAP];
          return (
            <Reveal key={card.title} delay={i * 0.12}>
              <div className="glass h-full rounded-3xl p-8 shadow-card sm:p-10">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${BADGE[i % BADGE.length]}`}>
                  <Icon className="h-7 w-7" />
                </span>
                <h3 className="mt-6 font-display text-2xl font-semibold">{card.title}</h3>
                <p className="mt-4 leading-relaxed text-muted">{card.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
