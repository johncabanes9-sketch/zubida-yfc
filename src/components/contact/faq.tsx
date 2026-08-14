"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

const faqs = [
  {
    q: "Who can join Zubida YFC?",
    a: "Any young person aged 12 to 21 in Zamboanga del Sur is welcome — no requirements, no fees. Come as you are. Just find your nearest chapter on the Chapters page and reach out.",
  },
  {
    q: "How do I register for an event?",
    a: "Head to the Events page, open any event marked 'Open,' and click Register. Fill out the form and you'll receive a confirmation with your QR pass.",
  },
  {
    q: "Is there a membership fee?",
    a: "No. Zubida YFC is free to join. Some events may have a minimal fee to cover food and materials, always kept as affordable as possible.",
  },
  {
    q: "Do I need to be Catholic to attend?",
    a: "YFC is a Catholic community, but everyone is welcome to our open activities. Many members first came simply curious — and found a home.",
  },
  {
    q: "How can I become a leader?",
    a: "Leadership grows out of faithfulness in a household. Join a chapter, take part in the Christian Life Seminar, and your coordinators will walk with you toward formation as a core group leader and beyond.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className="glass overflow-hidden rounded-2xl shadow-card"
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 p-5 text-left"
              aria-expanded={isOpen}
            >
              <span className="font-medium">{f.q}</span>
              <motion.span
                animate={{ rotate: isOpen ? 45 : 0 }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-royal-700/10 text-royal-700 dark:bg-gold-400/15 dark:text-gold-300"
              >
                <Plus className="h-4 w-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted">
                    {f.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
