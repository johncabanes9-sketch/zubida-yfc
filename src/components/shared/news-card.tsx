import Image from "next/image";
import { ArrowUpRight, Clock } from "lucide-react";
import type { NewsItem } from "@/data/types";
import { formatDate } from "@/lib/utils";
import { Reveal } from "./reveal";

const catColor: Record<NewsItem["category"], string> = {
  Announcement: "bg-royal-700/12 text-royal-700 dark:text-royal-400",
  Article: "bg-gold-500/15 text-gold-700 dark:text-gold-400",
  Blog: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Video: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

export function NewsCard({ item, delay = 0 }: { item: NewsItem; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <article className="group glass flex h-full flex-col overflow-hidden rounded-3xl shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-soft">
        <div className="relative h-48 overflow-hidden">
          <Image
            src={item.cover}
            alt={item.title}
            fill
            sizes="(max-width:768px) 100vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur ${catColor[item.category]}`}>
            {item.category}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-6">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{formatDate(item.date)}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {item.readTime} min
            </span>
          </div>
          <h3 className="mt-2 font-display text-lg font-semibold leading-snug">
            {item.title}
          </h3>
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
            {item.excerpt}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">By {item.author}</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-royal-700 transition-colors group-hover:text-gold-600 dark:text-gold-300">
              Read <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </article>
    </Reveal>
  );
}
