import { verses } from "@/data/stats";
import { Sunburst } from "@/components/shared/sunburst";
import { Reveal } from "@/components/shared/reveal";

export function VerseBanner() {
  const verse = verses[0];
  return (
    <section className="relative overflow-hidden bg-midnight-950 py-24 text-center text-cream">
      <div className="pointer-events-none absolute inset-0 bg-radiant opacity-70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gold-400/10">
        <Sunburst className="h-[30rem] w-[30rem] motion-safe:animate-spin-slow" rays={28} />
      </div>
      <Reveal className="relative mx-auto max-w-3xl px-6">
        <Sunburst className="mx-auto h-10 w-10 text-gold-400" rays={12} />
        <blockquote className="mt-8 font-display text-2xl font-medium leading-relaxed sm:text-4xl sm:leading-[1.3]">
          “{verse.text}”
        </blockquote>
        <cite className="mt-6 block text-lg font-semibold not-italic text-gold-300">
          — {verse.reference}
        </cite>
      </Reveal>
    </section>
  );
}
