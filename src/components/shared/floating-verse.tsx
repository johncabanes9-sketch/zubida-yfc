"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, RefreshCw, X } from "lucide-react";
import { verses } from "@/data/stats";

export function FloatingVerse() {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const next = () => setIdx((i) => (i + 1) % verses.length);
  const verse = verses[idx];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Daily Bible verse"
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-dawn-soft text-gold-300 shadow-glow transition-transform hover:scale-105 motion-safe:animate-float"
      >
        <BookOpen className="h-6 w-6" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="glass fixed bottom-24 right-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl p-6 shadow-soft"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400">
                <BookOpen className="h-4 w-4" /> Daily Verse
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-midnight dark:hover:text-cream"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <motion.blockquote
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-lg leading-relaxed"
            >
              “{verse.text}”
            </motion.blockquote>
            <div className="mt-4 flex items-center justify-between">
              <cite className="text-sm font-semibold not-italic text-royal-600 dark:text-gold-300">
                {verse.reference}
              </cite>
              <button
                onClick={next}
                className="flex items-center gap-1.5 rounded-full bg-royal-700/10 px-3 py-1.5 text-xs font-semibold text-royal-700 transition-colors hover:bg-royal-700/20 dark:bg-gold-400/15 dark:text-gold-300"
              >
                <RefreshCw className="h-3.5 w-3.5" /> New verse
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
