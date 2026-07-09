import { Sunburst } from "@/components/shared/sunburst";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="relative flex min-h-[80svh] items-center justify-center overflow-hidden bg-midnight-950 text-center text-cream">
      <div className="pointer-events-none absolute inset-0 bg-radiant opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gold-400/10">
        <Sunburst className="h-[26rem] w-[26rem] motion-safe:animate-spin-slow" rays={24} />
      </div>
      <div className="relative px-6">
        <Sunburst className="mx-auto h-12 w-12 text-gold-400" rays={12} />
        <p className="mt-6 font-display text-7xl font-semibold text-gold-300">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          This path isn&apos;t on the map
        </h1>
        <p className="mx-auto mt-3 max-w-md text-cream/75">
          The page you&apos;re looking for may have moved or never existed — but
          the road home is always open.
        </p>
        <ButtonLink href="/" variant="gold" size="lg" className="mt-8">
          Back to Home
        </ButtonLink>
      </div>
    </section>
  );
}
