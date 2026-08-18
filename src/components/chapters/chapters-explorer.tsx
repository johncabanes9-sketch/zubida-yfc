import Image from "next/image";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { Reveal } from "@/components/shared/reveal";
import type { PublicChapter } from "@/lib/data/chapters";

export function ChaptersExplorer({ chapters }: { chapters: PublicChapter[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {chapters.map((chapter, index) => (
        <Reveal key={chapter.id} delay={Math.min(index, 6) * 0.05}>
          <div className="glass flex h-full flex-col overflow-hidden rounded-3xl shadow-card">
            {chapter.cover && (
              <div className="relative h-40 shrink-0">
                <Image
                  src={chapter.cover}
                  alt={chapter.name}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-midnight-950/70 to-transparent" />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-4 p-6">
              <div>
                {chapter.clusterName && (
                  <span className="inline-block rounded-full bg-gold-500/15 px-2.5 py-0.5 text-[0.65rem] font-semibold text-gold-600 dark:text-gold-400">
                    {chapter.clusterName}
                  </span>
                )}
                <h3 className="mt-1.5 font-display text-xl font-semibold">{chapter.name}</h3>
              </div>
              <div className="space-y-3">
                <Detail
                  icon={<MapPin className="h-4 w-4" />}
                  label="Municipality"
                  value={chapter.municipality}
                />
                {chapter.coordinator && (
                  <Detail
                    icon={<Users className="h-4 w-4" />}
                    label="Coordinator"
                    value={chapter.coordinator}
                  />
                )}
                {chapter.schedule && (
                  <Detail
                    icon={<CalendarClock className="h-4 w-4" />}
                    label="Meets"
                    value={chapter.schedule}
                  />
                )}
              </div>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-500/15 text-gold-600 dark:text-gold-400">
        {icon}
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
