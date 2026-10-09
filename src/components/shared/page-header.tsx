import { Sunburst } from "./sunburst";
import { Reveal } from "./reveal";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  breadcrumbs,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Defaults to Home › <eyebrow>. The eyebrow is the section's name ("Events");
   *  the title is a sentence ("Come and see what God is doing"), which makes a
   *  poor crumb. Every current caller is a depth-1 route, so the two-step trail
   *  is right for all of them; a nested page passes its own. */
  breadcrumbs?: Crumb[];
}) {
  const crumbs: Crumb[] = breadcrumbs ?? [{ label: "Home", href: "/" }, { label: eyebrow }];
  return (
    <section data-nav-over="dark" className="relative overflow-hidden bg-midnight-950 pb-16 pt-36 text-cream sm:pb-20 sm:pt-44">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-midnight-950 via-midnight-900 to-royal-800/60" />
      <div className="pointer-events-none absolute inset-0 bg-radiant opacity-60" />
      <div className="pointer-events-none absolute -right-24 -top-16 text-gold-400/10">
        <Sunburst className="h-96 w-96 motion-safe:animate-spin-slow" rays={24} />
      </div>
      <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Breadcrumbs
          items={crumbs}
          tone="onDark"
          className="mb-5 flex justify-center [&>ol]:justify-center"
        />
        <div className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-gold-300">
          <Sunburst className="h-4 w-4" rays={8} /> {eyebrow}
        </div>
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-cream/80">
            {subtitle}
          </p>
        )}
      </Reveal>
    </section>
  );
}
