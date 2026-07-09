"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, UserX } from "lucide-react";
import { leaders } from "@/data/leaders";
import type { LeaderCategory } from "@/data/types";
import { LeaderCard } from "@/components/shared/leader-card";
import { cn } from "@/lib/utils";

const categories: (LeaderCategory | "All")[] = [
  "All",
  "Provincial Coordinator",
  "Provincial Couple Coordinators",
  "Area Heads",
  "Chapter Heads",
  "Core Group Leaders",
];

export function LeadersDirectory() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof categories)[number]>("All");
  const [chapter, setChapter] = useState("All");

  const chapters = useMemo(
    () => ["All", ...Array.from(new Set(leaders.map((l) => l.chapter)))],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leaders.filter((l) => {
      const matchesQ =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.position.toLowerCase().includes(q) ||
        l.chapter.toLowerCase().includes(q);
      const matchesCat = cat === "All" || l.category === cat;
      const matchesChapter = chapter === "All" || l.chapter === chapter;
      return matchesQ && matchesCat && matchesChapter;
    });
  }, [query, cat, chapter]);

  return (
    <div>
      {/* Controls */}
      <div className="glass sticky top-20 z-30 mb-10 rounded-3xl p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, position, or chapter…"
              className="w-full rounded-full border border-black/10 bg-white/70 py-3 pl-12 pr-4 text-sm outline-none transition-colors focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted" />
            <select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="rounded-full border border-black/10 bg-white/70 px-4 py-3 text-sm outline-none focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
            >
              {chapters.map((c) => (
                <option key={c} value={c}>
                  {c === "All" ? "All chapters" : c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
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

      {/* Results */}
      <p className="mb-6 text-sm text-muted">
        Showing <strong className="text-midnight dark:text-cream">{filtered.length}</strong>{" "}
        {filtered.length === 1 ? "leader" : "leaders"}
      </p>

      {filtered.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((l, i) => (
            <LeaderCard key={l.id} leader={l} delay={(i % 4) * 0.08} />
          ))}
        </div>
      ) : (
        <div className="glass flex flex-col items-center justify-center rounded-3xl py-20 text-center">
          <UserX className="h-12 w-12 text-muted" />
          <p className="mt-4 font-display text-xl">No leaders found</p>
          <p className="mt-1 text-sm text-muted">
            Try a different search or clear your filters.
          </p>
        </div>
      )}
    </div>
  );
}
