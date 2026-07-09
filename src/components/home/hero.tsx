"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Sunburst } from "@/components/shared/sunburst";
import { SITE } from "@/lib/constants";

const slides = [
  "https://picsum.photos/seed/hero-worship/1600/1000",
  "https://picsum.photos/seed/hero-camp/1600/1000",
  "https://picsum.photos/seed/hero-mission/1600/1000",
];

export function Hero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      {/* Slideshow */}
      <div className="absolute inset-0 -z-20">
        <AnimatePresence>
          <motion.div
            key={active}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <Image
              src={slides[active]}
              alt="Youth for Christ in Zamboanga del Sur"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Overlays: dawn gradient + radiant "light of Christ" glow */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-midnight-950/92 via-midnight-900/80 to-royal-800/70" />
      <div className="absolute inset-0 -z-10 bg-radiant opacity-90 mix-blend-screen" />
      <motion.div
        aria-hidden
        className="absolute -right-32 top-10 -z-10 text-gold-400/20"
        initial={{ opacity: 0, rotate: -20 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 1.5 }}
      >
        <Sunburst className="h-[34rem] w-[34rem] motion-safe:animate-spin-slow" rays={24} />
      </motion.div>

      <div className="mx-auto w-full max-w-7xl px-4 pt-24 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300"
          >
            <Sparkles className="h-4 w-4" />
            {SITE.province} · Youth for Christ
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            Welcome to{" "}
            <span className="relative whitespace-nowrap text-gold-300">
              Zubida YFC
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-cream/85"
          >
            Building Christ-centered leaders and empowering young people across
            Zamboanga del Sur. One province, one mission, one Christ.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <ButtonLink href="/events" variant="gold" size="lg">
              Join Us <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink
              href="/events"
              size="lg"
              className="glass text-white hover:bg-white/10"
            >
              <CalendarDays className="h-4 w-4" /> Upcoming Events
            </ButtonLink>
            <ButtonLink href="/about" variant="ghost" size="lg" className="text-cream hover:bg-white/10">
              Learn More
            </ButtonLink>
          </motion.div>
        </div>
      </div>

      {/* Slide indicators */}
      <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-8 bg-gold-400" : "w-2 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
