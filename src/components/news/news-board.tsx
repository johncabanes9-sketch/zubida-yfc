"use client";

import { useMemo, useState } from "react";
import { Newspaper, Search } from "lucide-react";
import { news } from "@/data/news";
import type { NewsCategory } from "@/data/types";
import { NewsCard } from "@/components/shared/news-card";
import { cn } from "@/lib/utils";

const categories: (NewsCategory | "All")[] = [
  "All",
  "Announcement",
  "Article",
  "Blog",
  "Video",
];

export function NewsBoard() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof categories)[number]>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return news.filter((n) => {
      const matchesQ =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.excerpt.toLowerCase().includes(q) ||
        n.author.toLowerCase().includes(q);
      const matchesCat = cat === "All" || n.category === cat;
      return matchesQ && matchesCat;
    });
  }, [query, cat]);

  return (
    <div>
      <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stories…"
            className="w-full rounded-full border border-black/10 bg-white/70 py-3 pl-12 pr-4 text-sm outline-none transition-colors focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                cat === c
                  ? "bg-dawn-soft text-white shadow-soft"
                  : "bg-royal-700/8 text-muted hover:bg-royal-700/15 dark:bg-white/5",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((n, i) => (
            <NewsCard key={n.id} item={n} delay={(i % 3) * 0.1} />
          ))}
        </div>
      ) : (
        <div className="glass flex flex-col items-center justify-center rounded-3xl py-20 text-center">
          <Newspaper className="h-12 w-12 text-muted" />
          <p className="mt-4 font-display text-xl">No stories found</p>
          <p className="mt-1 text-sm text-muted">Try another search or category.</p>
        </div>
      )}
    </div>
  );
}
