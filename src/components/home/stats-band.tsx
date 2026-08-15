import { getSiteStats } from "@/lib/data/stats";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { Reveal } from "@/components/shared/reveal";
import { Sunburst } from "@/components/shared/sunburst";

export async function StatsBand() {
  const stats = await getSiteStats();

  // No verifiable figure to show — omit the band rather than publish zeroes.
  if (stats.length === 0) return null;

  return (
    <section className="relative overflow-hidden bg-dawn-soft py-16 text-white">
      <div className="pointer-events-none absolute -left-20 -top-20 text-white/10">
        <Sunburst className="h-72 w-72 motion-safe:animate-spin-slow" rays={20} />
      </div>
      <div className="pointer-events-none absolute -bottom-24 -right-16 text-white/10">
        <Sunburst className="h-80 w-80 motion-safe:animate-spin-slow" rays={24} />
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-20 gap-y-8 px-4 sm:px-6 lg:px-8">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.1} className="text-center">
            <div className="font-display text-4xl font-semibold text-gold-300 sm:text-5xl">
              <AnimatedCounter value={s.value} suffix={s.suffix} />
            </div>
            <p className="mt-2 text-sm font-medium uppercase tracking-[0.12em] text-cream/80">
              {s.label}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
