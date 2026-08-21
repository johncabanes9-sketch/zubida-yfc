import Image from "next/image";
import { Facebook, Instagram, Quote } from "lucide-react";
import type { PublicLeader } from "@/lib/data/leaders";
import { Reveal } from "./reveal";

export function LeaderCard({
  leader,
  delay = 0,
}: {
  leader: PublicLeader;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <article className="group glass flex h-full flex-col overflow-hidden rounded-3xl shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-soft">
        <div className="relative aspect-[4/5] overflow-hidden bg-royal-700/8 dark:bg-white/5">
          {leader.photo && (
            <Image
              src={leader.photo}
              alt={leader.name}
              fill
              sizes="(max-width:768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-midnight-950/85 via-midnight-950/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            {leader.chapterName && (
              <span className="rounded-full bg-gold-500/90 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-midnight-900">
                {leader.chapterName}
              </span>
            )}
            <h3 className="mt-2 font-display text-xl font-semibold leading-tight">
              {leader.name}
            </h3>
            <p className="text-sm text-cream/80">{leader.position}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          {leader.message && (
            <>
              <Quote className="h-5 w-5 text-gold-500" />
              <p className="mt-2 flex-1 text-sm italic leading-relaxed text-muted">
                {leader.message}
              </p>
            </>
          )}
          {(leader.facebookUrl || leader.instagramUrl) && (
            <div className="mt-4 flex gap-2">
              {leader.facebookUrl && (
                <a
                  href={leader.facebookUrl}
                  aria-label={`${leader.name} on Facebook`}
                  className="grid h-8 w-8 place-items-center rounded-full bg-royal-700/10 text-royal-700 transition-colors hover:bg-royal-700/20 dark:text-gold-300"
                >
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {leader.instagramUrl && (
                <a
                  href={leader.instagramUrl}
                  aria-label={`${leader.name} on Instagram`}
                  className="grid h-8 w-8 place-items-center rounded-full bg-royal-700/10 text-royal-700 transition-colors hover:bg-royal-700/20 dark:text-gold-300"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </article>
    </Reveal>
  );
}
