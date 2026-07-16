import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { Sunburst } from "@/components/shared/sunburst";
import type { SiteSettings, NavItem } from "@/lib/data/site";

export function Footer({
  site,
  navLinks = NAV_LINKS,
}: {
  site?: SiteSettings;
  navLinks?: NavItem[];
} = {}) {
  const s = site;
  const name = s?.name ?? SITE.name;
  const fullName = s?.fullName ?? SITE.fullName;
  const description = s?.description ?? SITE.description;
  const tagline = s?.tagline ?? SITE.tagline;
  const office = s?.office ?? SITE.office;
  const email = s?.email ?? SITE.email;
  const phone = s?.phone ?? SITE.phone;
  const facebook = s?.socials.facebook ?? SITE.socials.facebook;
  const instagram = s?.socials.instagram ?? SITE.socials.instagram;
  const exploreHeading = s?.footerExploreHeading ?? "Explore";
  const reachHeading = s?.footerReachHeading ?? "Reach Us";
  const closingLine =
    s?.footerClosingLine ?? `Built for the youth of ${SITE.province}. Ad Majorem Dei Gloriam.`;

  return (
    <footer className="relative mt-24 overflow-hidden bg-midnight-950 text-cream">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-radiant blur-2xl" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-dawn-soft text-gold-300">
              <Sunburst className="h-6 w-6" rays={12} />
            </span>
            <span className="font-display text-xl font-semibold">{name}</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/70">
            {description}
          </p>
          <p className="mt-6 font-display text-lg text-gold-300">
            “{tagline}”
          </p>
          <div className="mt-6 flex gap-3">
            {facebook && (
              <a
                href={facebook}
                aria-label="Facebook"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 transition-colors hover:bg-white/10"
              >
                <Facebook className="h-5 w-5" />
              </a>
            )}
            {instagram && (
              <a
                href={instagram}
                aria-label="Instagram"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 transition-colors hover:bg-white/10"
              >
                <Instagram className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-300">
            {exploreHeading}
          </h3>
          <ul className="mt-5 space-y-3 text-sm">
            {navLinks.map((l) => (
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
            {reachHeading}
          </h3>
          <ul className="mt-5 space-y-4 text-sm text-cream/70">
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              {office}
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              <a href={`mailto:${email}`} className="hover:text-gold-300">
                {email}
              </a>
            </li>
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              <a href={`tel:${phone}`} className="hover:text-gold-300">
                {phone}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-cream/50 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {fullName}. All rights reserved.</p>
          <p>{closingLine}</p>
        </div>
      </div>
    </footer>
  );
}
