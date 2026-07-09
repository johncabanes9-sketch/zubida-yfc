"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, MapPin, Sparkles, Users } from "lucide-react";
import { chapters } from "@/data/chapters";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/shared/reveal";

// Stylized (non-geographic) positions on the map canvas, grouped by cluster.
const positions: Record<string, { x: number; y: number }> = {
  c1: { x: 46, y: 68 }, // Pagadian - Bay
  c2: { x: 30, y: 24 }, // Molave - North
  c3: { x: 40, y: 58 }, // Labangan - Bay
  c4: { x: 24, y: 40 }, // Aurora - North
  c5: { x: 32, y: 72 }, // Tukuran - Bay
  c6: { x: 60, y: 82 }, // Margosatubig - South
  c7: { x: 20, y: 30 }, // Tambulig - North
  c8: { x: 38, y: 30 }, // Mahayag - North
  c9: { x: 14, y: 22 }, // Dumingag - North
  c10: { x: 70, y: 66 }, // San Miguel - South
  c11: { x: 74, y: 80 }, // Tabina - South
  c12: { x: 28, y: 16 }, // Ramon Magsaysay - North
};

const clusterColor: Record<string, string> = {
  "Bay Cluster": "#F5B942",
  "North Cluster": "#3B6FE0",
  "South Cluster": "#34D399",
};

export function ChaptersExplorer() {
  const [activeId, setActiveId] = useState(chapters[0].id);
  const active = chapters.find((c) => c.id === activeId)!;

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        {/* Stylized map */}
        <Reveal>
          <div className="glass relative aspect-[4/3] overflow-hidden rounded-3xl p-2 shadow-card">
            <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-royal-800 via-midnight-900 to-midnight-950">
              {/* decorative province blob */}
              <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full opacity-30">
                <path
                  d="M12,22 Q18,8 34,12 Q52,6 64,16 Q82,10 86,30 Q92,46 78,58 Q80,76 60,78 Q42,84 30,74 Q14,72 14,54 Q6,40 12,22 Z"
                  fill="none"
                  stroke="#F5B942"
                  strokeWidth="0.5"
                  strokeDasharray="2 1.5"
                />
                <path
                  d="M12,22 Q18,8 34,12 Q52,6 64,16 Q82,10 86,30 Q92,46 78,58 Q80,76 60,78 Q42,84 30,74 Q14,72 14,54 Q6,40 12,22 Z"
                  fill="rgba(59,111,224,0.12)"
                />
              </svg>

              {chapters.map((c) => {
                const pos = positions[c.id];
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    aria-label={c.name}
                    className="group absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="chapter-halo"
                        className="absolute inset-0 -z-10 rounded-full"
                        style={{
                          boxShadow: `0 0 0 6px ${clusterColor[c.cluster]}33`,
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      />
                    )}
                    <span
                      className={cn(
                        "block rounded-full ring-2 ring-white/70 transition-all duration-300",
                        isActive ? "h-4 w-4 scale-110" : "h-3 w-3 group-hover:scale-125",
                      )}
                      style={{ backgroundColor: clusterColor[c.cluster] }}
                    />
                    <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-midnight-950/90 px-2 py-0.5 text-[0.6rem] font-medium text-cream opacity-0 transition-opacity group-hover:opacity-100">
                      {c.municipality}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* legend */}
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-xl bg-midnight-950/70 px-3 py-2 backdrop-blur">
              {Object.entries(clusterColor).map(([name, color]) => (
                <span key={name} className="flex items-center gap-1.5 text-[0.65rem] font-medium text-cream">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Active chapter detail */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className="glass overflow-hidden rounded-3xl shadow-card"
          >
            <div className="relative h-44">
              <Image src={active.cover} alt={active.name} fill sizes="50vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-midnight-950/80 to-transparent" />
              <div className="absolute bottom-4 left-5">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold text-midnight-900"
                  style={{ backgroundColor: clusterColor[active.cluster] }}
                >
                  {active.cluster}
                </span>
                <h3 className="mt-1.5 font-display text-2xl font-semibold text-white">
                  {active.name}
                </h3>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <Detail icon={<MapPin className="h-4 w-4" />} label="Municipality" value={active.municipality} />
              <Detail icon={<Users className="h-4 w-4" />} label="Coordinator" value={active.coordinator} />
              <Detail icon={<CalendarClock className="h-4 w-4" />} label="Meets" value={active.schedule} />
              <Detail icon={<Sparkles className="h-4 w-4" />} label="Up next" value={active.upcoming} />
              <div className="flex items-center justify-between rounded-2xl bg-dawn-soft px-5 py-4 text-white">
                <span className="text-sm font-medium">Active members</span>
                <span className="font-display text-2xl font-semibold text-gold-300">
                  {active.memberCount}
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* All chapters grid */}
      <h2 className="mb-6 mt-16 font-display text-2xl font-semibold">All chapters</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {chapters.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setActiveId(c.id);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={cn(
              "glass flex items-center justify-between rounded-2xl p-4 text-left shadow-card transition-all hover:-translate-y-1",
              c.id === activeId && "ring-2 ring-gold-400",
            )}
          >
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-muted">{c.coordinator}</p>
            </div>
            <span className="text-sm font-semibold text-royal-700 dark:text-gold-300">
              {c.memberCount}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-500/15 text-gold-600 dark:text-gold-400">
        {icon}
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
