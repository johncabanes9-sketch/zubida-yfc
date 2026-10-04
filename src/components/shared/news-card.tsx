import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { PublicNewsPost } from "@/lib/data/news";
import { formatDate } from "@/lib/utils";
import { Reveal } from "./reveal";

const catColor: Record<PublicNewsPost["category"], string> = {
  Announcement: "bg-royal-700/12 text-royal-700 dark:text-royal-400",
  Article: "bg-gold-500/15 text-gold-700 dark:text-gold-400",
  Blog: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Video: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const linkLabel = (category: PublicNewsPost["category"]) => (category === "Video" ? "Watch" : "Read");

/**
 * A news card. When the post has a link the whole card is one outbound link
 * (new tab); without one there is no "Read" affordance at all — the Phase-1
 * card showed a "Read" arrow that went nowhere. No cover means no image
 * block, never a stand-in, and there is no invented read time.
 */
export function NewsCard({ item, delay = 0 }: { item: PublicNewsPost; delay?: number }) {
  const badge = (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold backdrop-blur ${catColor[item.category]}`}>
      {item.category}
    </span>
  );

  const content = (
    <article className="group glass flex h-full flex-col overflow-hidden rounded-3xl shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-soft">
      {item.cover && (
        <div className="relative h-48 overflow-hidden">
          <Image
            src={item.cover}
            alt=""
            fill
            sizes="(max-width:768px) 100vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <span className="absolute left-3 top-3">{badge}</span>
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {!item.cover && badge}
          {/* A date-only value parses as UTC midnight; formatting it in UTC keeps
              the day from slipping when the board renders in the browser. */}
          <time dateTime={item.date}>{formatDate(item.date, { timeZone: "UTC" })}</time>
        </div>
        <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{item.title}</h3>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{item.excerpt}</p>
        {(item.author || item.url) && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted">{item.author ? `By ${item.author}` : ""}</span>
            {item.url && (
              <span className="flex items-center gap-1 text-sm font-semibold text-royal-700 transition-colors group-hover:text-gold-700 dark:text-gold-300 dark:group-hover:text-gold-200">
                {linkLabel(item.category)} <ArrowUpRight className="h-4 w-4" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );

  return (
    <Reveal delay={delay}>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-royal-500"
        >
          {content}
        </a>
      ) : (
        content
      )}
    </Reveal>
  );
}
