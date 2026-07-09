import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { gallery } from "@/data/gallery";
import { SectionHeading } from "@/components/shared/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

export function FeaturedPhotos() {
  const shots = gallery.slice(0, 5);
  return (
    <section className="bg-cream-100 py-24 dark:bg-midnight-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Featured Photos"
            title="Moments of grace, frame by frame"
            subtitle="Glimpses of worship, service, and friendship from our gatherings."
          />
          <ButtonLink href="/gallery" variant="ghost" className="text-royal-700 dark:text-gold-300">
            Open gallery <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>

        <Reveal className="mt-12">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-2">
            <div className="relative col-span-2 row-span-2 aspect-square overflow-hidden rounded-3xl lg:aspect-auto">
              <FeatImg src={shots[0].src} alt={shots[0].caption} />
            </div>
            {shots.slice(1).map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-3xl">
                <FeatImg src={p.src} alt={p.caption} />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FeatImg({ src, alt }: { src: string; alt: string }) {
  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width:1024px) 50vw, 25vw"
        className="object-cover transition-transform duration-700 hover:scale-105"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-midnight-950/40 to-transparent opacity-0 transition-opacity hover:opacity-100" />
    </>
  );
}
