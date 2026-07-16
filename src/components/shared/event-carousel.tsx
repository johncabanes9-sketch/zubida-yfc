"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EventImage } from "@/data/types";

/**
 * Renders an event's uploaded photos in place of the (currently nonexistent)
 * cover image inside `EventModal`. `event-modal.tsx` has never rendered
 * `event.cover` — every event in production today has zero uploaded images,
 * so when `images` is empty this component renders nothing, exactly
 * preserving that status quo. `fallback` is accepted to match the call site
 * contract but is intentionally unused for rendering: showing the cover here
 * would be new UI for every event currently live, which is the regression
 * this task must avoid.
 */
export function EventCarousel({
  images,
  fallback: _fallback,
  name,
}: {
  images: EventImage[];
  fallback: string;
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => (i + dir + images.length) % images.length);
    },
    [images.length],
  );

  if (images.length === 0) {
    return null;
  }

  const current = images[index];
  const multiple = images.length > 1;

  return (
    <div
      className="relative mb-6 h-56 overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5 sm:h-72"
      role="group"
      aria-roledescription="carousel"
      aria-label={`${name} photos`}
      tabIndex={multiple ? 0 : undefined}
      onKeyDown={
        multiple
          ? (e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                go(-1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                go(1);
              }
            }
          : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.url}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
          }
          className="absolute inset-0"
        >
          <Image
            src={current.url}
            alt={current.alt || name}
            fill
            sizes="(max-width:768px) 100vw, 42rem"
            className="object-cover"
          />
        </motion.div>
      </AnimatePresence>

      {multiple && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-midnight-900 backdrop-blur transition hover:bg-white dark:bg-midnight-900/80 dark:text-cream dark:hover:bg-midnight-900"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-midnight-900 backdrop-blur transition hover:bg-white dark:bg-midnight-900/80 dark:text-cream dark:hover:bg-midnight-900"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
            {images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
