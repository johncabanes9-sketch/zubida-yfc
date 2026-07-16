import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { SITE, NAV_LINKS } from "@/lib/constants";
import type { SiteSettingsRow, NavItemRow } from "@/lib/supabase/database.types";

export type SiteSettings = {
  name: string;
  fullName: string;
  tagline: string;
  description: string;
  province: string;
  email: string;
  phone: string;
  office: string;
  socials: { facebook: string; instagram: string };
  footerExploreHeading: string;
  footerReachHeading: string;
  footerClosingLine: string;
};

export type NavItem = { href: string; label: string };

export type SiteData = { site: SiteSettings; navLinks: NavItem[] };

/** Fallback used whenever the DB is unreachable, empty, or errors. */
const FALLBACK: SiteData = {
  site: {
    name: SITE.name,
    fullName: SITE.fullName,
    tagline: SITE.tagline,
    description: SITE.description,
    province: SITE.province,
    email: SITE.email,
    phone: SITE.phone,
    office: SITE.office,
    socials: { facebook: SITE.socials.facebook, instagram: SITE.socials.instagram },
    footerExploreHeading: "Explore",
    footerReachHeading: "Reach Us",
    footerClosingLine: `Built for the youth of ${SITE.province}. Ad Majorem Dei Gloriam.`,
  },
  navLinks: NAV_LINKS.map((l) => ({ href: l.href, label: l.label })),
};

/**
 * Loads editable site settings + navigation from Supabase. Falls back to the
 * hardcoded constants if the database is unreachable or unseeded, so the public
 * site always renders. Mirrors getEvents().
 */
export async function getSiteSettings(): Promise<SiteData> {
  try {
    const db = createServiceClient();
    const [settingsRes, navRes] = await Promise.all([
      db.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("nav_items").select("*").eq("visible", true).order("sort_order", { ascending: true }),
    ]);

    const row = settingsRes.data as SiteSettingsRow | null;
    const navRows = (navRes.data as NavItemRow[] | null) ?? [];

    const site: SiteSettings = row
      ? {
          name: row.name,
          fullName: row.full_name,
          tagline: row.tagline,
          description: row.description,
          province: row.province,
          email: row.email,
          phone: row.phone,
          office: row.office,
          socials: { facebook: row.facebook_url ?? "", instagram: row.instagram_url ?? "" },
          footerExploreHeading: row.footer_explore_heading,
          footerReachHeading: row.footer_reach_heading,
          footerClosingLine: row.footer_closing_line,
        }
      : FALLBACK.site;

    // An empty nav table must not produce a site with no navigation.
    const navLinks =
      navRows.length > 0 ? navRows.map((n) => ({ href: n.href, label: n.label })) : FALLBACK.navLinks;

    return { site, navLinks };
  } catch {
    return FALLBACK;
  }
}
