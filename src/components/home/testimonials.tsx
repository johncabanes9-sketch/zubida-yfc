"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import type { PublicTestimonial } from "@/lib/data/testimonials";
import { SectionHeading } from "@/components/shared/section-heading";

/** Rendered only when at least one testimonial is published (see app/page.tsx). */
export function Testimonials({ testimonials }: { testimonials: PublicTestimonial[] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  // Clamped: a refresh can shrink the list while i still points past its end.
  const t = testimonials[Math.min(i, testimonials.length - 1)];

  const go = (d: number) => {
    setDir(d);
    setI((prev) => (prev + d + testimonials.length) % testimonials.length);
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Testimonials"
        title="Lives changed, one encounter at a time"
        align="center"
      />

      <div
        className="relative mx-auto mt-12 max-w-3xl"
        role="region"
        aria-roledescription="carousel"
        aria-label="Testimonials"
      >
        <div className="glass relative overflow-hidden rounded-[2rem] p-8 shadow-card sm:p-12">
          <Quote className="mx-auto h-10 w-10 text-gold-500/60" />
          <div className="relative mt-6 min-h-[10rem]" aria-live="polite">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={t.id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -40 }}
                transition={{ duration: 0.4 }}
                className="text-center"
              >
                <p className="font-display text-xl leading-relaxed sm:text-2xl">
                  “{t.quote}”
                </p>
                <div className="mt-8 flex items-center justify-center gap-4">
                  {/* No photo means no image — never a stock face. */}
                  {t.photo && (
                    <Image
                      src={t.photo}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full object-cover ring-2 ring-gold-400"
                    />
                  )}
                  <div className={t.photo ? "text-left" : "text-center"}>
                    <p className="font-semibold">{t.name}</p>
                    {(t.role || t.chapter) && (
                      <p className="text-sm text-muted">{[t.role, t.chapter].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {testimonials.length > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => go(-1)}
              aria-label="Previous testimonial"
              className="grid h-11 w-11 place-items-center rounded-full border border-black/10 transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex gap-2">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => { setDir(idx > i ? 1 : -1); setI(idx); }}
                  aria-label={`Testimonial ${idx + 1}`}
                  aria-current={idx === i ? "true" : undefined}
                  className={`h-2 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal-500 ${
                    idx === i ? "w-6 bg-gold-500" : "w-2 bg-royal-700/20 dark:bg-white/20"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => go(1)}
              aria-label="Next testimonial"
              className="grid h-11 w-11 place-items-center rounded-full border border-black/10 transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
