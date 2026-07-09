"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { gallery } from "@/data/gallery";
import type { GalleryCategory } from "@/data/types";
import { cn } from "@/lib/utils";

const categories: (GalleryCategory | "All")[] = [
  "All",
  "Youth Camp",
  "Provincial Conference",
  "ICON",
  "Household",
  "CLS",
  "Sports Fest",
  "Mission Activities",
];

export function GalleryGrid() {
  const [cat, setCat] = useState<(typeof categories)[number]>("All");
  const [lightbox, setLightbox] = useState<number | null>(null);

  const shown = useMemo(
    () => (cat === "All" ? gallery : gallery.filter((p) => p.category === cat)),
    [cat],
  );

  const move = (d: number) => {
    setLightbox((i) => {
      if (i === null) return i;
      return (i + d + shown.length) % shown.length;
    });
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-8 flex flex-wrap gap-2">
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

      <div className="mb-6 flex items-center gap-2 text-xs text-muted">
        <Lock className="h-3.5 w-3.5" /> Images are protected — downloading is disabled.
      </div>

      {/* Masonry */}
      <div className="no-save masonry columns-2 md:columns-3 lg:columns-4">
        {shown.map((p, i) => (
          <motion.button
            key={p.id}
            layout
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: (i % 8) * 0.04 }}
            onClick={() => setLightbox(i)}
            onContextMenu={(e) => e.preventDefault()}
            className="group relative block w-full overflow-hidden rounded-2xl shadow-card"
          >
            <Image
              src={p.src}
              alt={p.caption}
              width={p.span === "wide" ? 900 : 700}
              height={p.span === "tall" ? 900 : p.span === "wide" ? 600 : 700}
              sizes="(max-width:768px) 50vw, 25vw"
              className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-midnight-950/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
              <div className="p-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-gold-300">
                  {p.category}
                </span>
                <p className="text-sm text-white">{p.caption}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-midnight-950/95 p-4 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              aria-label="Close"
              onClick={() => setLightbox(null)}
              className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-cream hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>
            <button
              aria-label="Previous"
              onClick={(e) => { e.stopPropagation(); move(-1); }}
              className="absolute left-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-cream hover:bg-white/20 sm:left-8"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              aria-label="Next"
              onClick={(e) => { e.stopPropagation(); move(1); }}
              className="absolute right-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-cream hover:bg-white/20 sm:right-8"
            >
              <ChevronRight className="h-7 w-7" />
            </button>

            <motion.figure
              key={shown[lightbox].id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="no-save relative max-h-[85vh] w-full max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={shown[lightbox].src}
                alt={shown[lightbox].caption}
                width={1200}
                height={900}
                className="mx-auto max-h-[80vh] w-auto rounded-2xl object-contain"
              />
              <figcaption className="mt-4 text-center text-cream">
                <span className="text-xs font-semibold uppercase tracking-wide text-gold-300">
                  {shown[lightbox].category}
                </span>
                <p className="text-sm">{shown[lightbox].caption}</p>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
