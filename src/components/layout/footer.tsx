import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { Sunburst } from "@/components/shared/sunburst";

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden bg-midnight-950 text-cream">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-radiant blur-2xl" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-dawn-soft text-gold-300">
              <Sunburst className="h-6 w-6" rays={12} />
            </span>
            <span className="font-display text-xl font-semibold">{SITE.name}</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/70">
            {SITE.description}
          </p>
          <p className="mt-6 font-display text-lg text-gold-300">
            “{SITE.tagline}”
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href={SITE.socials.facebook}
              aria-label="Facebook"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 transition-colors hover:bg-white/10"
            >
              <Facebook className="h-5 w-5" />
            </a>
            <a
              href={SITE.socials.instagram}
              aria-label="Instagram"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 transition-colors hover:bg-white/10"
            >
              <Instagram className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-300">
            Explore
          </h3>
          <ul className="mt-5 space-y-3 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-cream/70 transition-colors hover:text-gold-300"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-300">
            Reach Us
          </h3>
          <ul className="mt-5 space-y-4 text-sm text-cream/70">
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              {SITE.office}
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              <a href={`mailto:${SITE.email}`} className="hover:text-gold-300">
                {SITE.email}
              </a>
            </li>
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              <a href={`tel:${SITE.phone}`} className="hover:text-gold-300">
                {SITE.phone}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-cream/50 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {SITE.fullName}. All rights reserved.</p>
          <p>Built for the youth of {SITE.province}. Ad Majorem Dei Gloriam.</p>
        </div>
      </div>
    </footer>
  );
}
