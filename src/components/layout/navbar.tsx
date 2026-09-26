"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { ThemeToggle } from "./theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar({
  site = SITE,
  navLinks = NAV_LINKS,
}: {
  site?: { name: string; province: string };
  navLinks?: { href: string; label: string }[];
} = {}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "glass py-2.5 shadow-soft"
          : "bg-transparent py-4",
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* The lockup already reads "CFC-YFC ZUBIDA / ZAMBOANGA DEL SUR", so the
            text block that used to sit beside the sunburst tile would say it
            twice. The name now reaches assistive tech through the alt below,
            which stays DB-driven rather than hardcoded. At this height the
            artwork's own "ZAMBOANGA DEL SUR" line is decorative, not readable —
            the footer renders the lockup large enough to carry it. */}
        <Link href="/" className="group flex items-center">
          <Image
            src="/logo.png"
            alt={`${site.name} — CFC-YFC ${site.province}`}
            width={1200}
            height={833}
            priority
            className="h-12 w-auto transition-transform duration-300 group-hover:scale-[1.03] sm:h-14"
          />
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-royal-700 dark:text-gold-300"
                      : "text-muted hover:text-midnight dark:hover:text-cream",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 -z-10 rounded-full bg-royal-700/10 dark:bg-gold-400/15"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/events" size="sm" variant="gold" className="hidden sm:inline-flex">
            Join Us
          </ButtonLink>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 dark:border-white/15 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden lg:hidden"
          >
            <ul className="glass mx-4 mt-3 flex flex-col gap-1 rounded-2xl p-3">
              {navLinks.map((link) => {
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "block rounded-xl px-4 py-3 text-sm font-medium",
                        active
                          ? "bg-royal-700/10 text-royal-700 dark:bg-gold-400/15 dark:text-gold-300"
                          : "text-muted",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
