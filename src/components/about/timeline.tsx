"use client";

import { motion, useReducedMotion } from "framer-motion";

export type Milestone = { year: string; title: string; text: string };

const DEFAULT_MILESTONES: Milestone[] = [
  { year: "2003", title: "The First Spark", text: "A handful of students in Pagadian City begin gathering to pray and share the Gospel — the seed of Youth for Christ in Zamboanga del Sur." },
  { year: "2008", title: "Chapters Multiply", text: "The movement spreads north to Molave and Mahayag. The first provincial youth camp draws over 200 delegates." },
  { year: "2013", title: "Clusters Formed", text: "Chapters organize into Bay, North, and South clusters, giving every municipality a spiritual home and closer formation." },
  { year: "2017", title: "ICON is Born", text: "The Ignite Conference launches as the province's flagship annual gathering, commissioning a new wave of young leaders." },
  { year: "2020", title: "Faith Online", text: "When the world stops, the households don't. Zubida YFC moves to virtual gatherings, keeping the youth connected through the pandemic." },
  { year: "2024", title: "One Province, One Mission", text: "With 26 chapters and thousands of members, Zubida YFC adopts its unifying vision: One Province. One Mission. One Christ." },
];

export function Timeline({ milestones = DEFAULT_MILESTONES }: { milestones?: Milestone[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute left-4 top-0 h-full w-px bg-gradient-to-b from-gold-400 via-royal-500 to-transparent sm:left-1/2" />
      <div className="space-y-12">
        {milestones.map((m, i) => (
          <motion.div
            key={m.year}
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`relative pl-12 sm:w-1/2 sm:pl-0 ${
              i % 2 === 0 ? "sm:pr-12 sm:text-right" : "sm:ml-auto sm:pl-12"
            }`}
          >
            <span
              className={`absolute left-[9px] top-1.5 h-4 w-4 rounded-full bg-gold-500 ring-4 ring-cream dark:ring-midnight-950 sm:left-auto ${
                i % 2 === 0 ? "sm:-right-2" : "sm:-left-2"
              }`}
            />
            <div className="glass rounded-2xl p-6 shadow-card">
              <span className="font-display text-2xl font-semibold text-royal-700 dark:text-gold-300">{m.year}</span>
              <h3 className="mt-1 text-lg font-semibold">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
