"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogIn, Menu, X } from "lucide-react";
import Image from "next/image";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { ThemeToggle } from "./theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LOGIN_HREF = "/admin/login";
// Visible text is "Log in"; the accessible name keeps it as a prefix
// (WCAG 2.5.3 label-in-name) and says who the door is for.
const LOGIN_LABEL = "Log in (YFC officers and administrators)";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

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

  // Transparent only at the top with the menu shut; globals.css then switches
  // the tokens to on-dark when the page opens on a navy header.
  const atTop = !scrolled && !open;

  return (
    <header
      data-at-top={atTop}
      className={cn(
        "site-nav fixed inset-x-0 top-0 z-50 transition-all duration-300",
        atTop ? "bg-transparent py-4" : "glass py-2.5 shadow-soft",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
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
            const active = isActive(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-[color:var(--nav-active)]"
                      : "text-[color:var(--nav-link)] hover:text-[color:var(--nav-link-hover)]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 -z-10 rounded-full bg-[color:var(--nav-active-bg)]"
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
          {/* Officers and admins only. The public site never needs it, so it
              stays a quiet outline beside the gold call to action. Anyone
              already signed in is sent straight on to /admin by middleware. */}
          <Link
            href={LOGIN_HREF}
            prefetch={false}
            aria-label={LOGIN_LABEL}
            className="hidden h-10 items-center gap-1.5 rounded-full border border-[color:var(--nav-control-border)] px-4 text-sm font-semibold text-[color:var(--nav-control)] transition-colors hover:bg-[color:var(--nav-control-hover)] lg:inline-flex"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            Log in
          </Link>
          <ButtonLink href="/events" size="sm" variant="gold" className="hidden sm:inline-flex">
            Join Us
          </ButtonLink>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid h-10 w-10 place-items-center rounded-full border border-[color:var(--nav-control-border)] text-[color:var(--nav-control)] transition-colors hover:bg-[color:var(--nav-control-hover)] lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden lg:hidden"
          >
            <ul className="mx-4 mt-3 flex max-h-[calc(100svh-6rem)] flex-col gap-1 overflow-y-auto rounded-2xl border border-[color:var(--rule)] bg-[color:var(--surface)] p-3 shadow-card">
              {navLinks.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-royal-700/10 text-royal-700 dark:bg-gold-400/15 dark:text-gold-300"
                          : "text-muted hover:bg-black/5 hover:text-midnight dark:hover:bg-white/5 dark:hover:text-cream",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
              <li className="sm:hidden">
                <Link
                  href="/events"
                  className="mt-1 block rounded-xl bg-gold-500 px-4 py-3 text-center text-sm font-semibold text-midnight-900 transition-colors hover:bg-gold-400"
                >
                  Join Us
                </Link>
              </li>
              <li className="mt-2 border-t border-[color:var(--rule)] pt-2">
                <Link
                  href={LOGIN_HREF}
                  prefetch={false}
                  aria-label={LOGIN_LABEL}
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-royal-700 transition-colors hover:bg-royal-700/5 dark:text-gold-300 dark:hover:bg-gold-400/10"
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  Log in
                  <span className="ml-auto text-xs font-normal text-muted">Officers &amp; admins</span>
                </Link>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
