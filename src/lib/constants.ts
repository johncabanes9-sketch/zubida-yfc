export const SITE = {
  name: "Zubida YFC",
  fullName: "Zubida Youth for Christ",
  tagline: "One Province. One Mission. One Christ.",
  description:
    "The official Youth for Christ community of Zamboanga del Sur — building Christ-centered leaders and empowering young people across the province.",
  province: "Zamboanga del Sur",
  url: "https://zubidayfc.org",
  // Withheld until the provincial office confirms them. These carried
  // `hello@zubidayfc.org` and `+63 962 000 0000` — Phase-1 stand-ins that
  // reached production because a well-formed placeholder passes every shape
  // check. Blank here means the DB-outage fallback publishes no contact
  // details either; see src/lib/content/contact.ts.
  email: "",
  phone: "",
  office: "YFC Provincial Office, Pagadian City, Zamboanga del Sur",
  socials: {
    // Confirmed by the organization; migration 0027 corrects the stored copy.
    facebook: "https://www.facebook.com/yfczds",
    // Still the handle 0013 invented. UNVERIFIED (ZUBIDA_CONTENT_AUDIT.md §7.1)
    // — the footer renders an icon linking to an account nobody has confirmed
    // exists. Withhold it (set blank in /admin/settings) or replace it.
    instagram: "https://instagram.com/zubidayfc",
    // Blank until the real page is confirmed. Every layer below it is wired
    // (migration 0029), so publishing it is a paste into /admin/settings, not
    // a deploy. Blank hides the icon rather than linking nowhere.
    tiktok: "",
  },
};

/** The registration form's two pure value lists, and the DB-outage fallback
 *  for them. Migration 0030 seeds `option_lists` from exactly these, so the
 *  form offers the same choices whether or not the database answers. Nothing
 *  branches on these values — registrations store them as plain text — which
 *  is what makes them safe for the PYH to edit in /admin/settings. */
export const REGISTRATION_OPTIONS = {
  gender: ["Male", "Female", "Prefer not to say"],
  shirt_size: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
} as const;

export type OptionListKey = keyof typeof REGISTRATION_OPTIONS;
export type RegistrationOptionLists = Record<OptionListKey, string[]>;

/** Mutable copy of the built-ins, shared by the server loader's fallback and
 *  the form's default prop so there is exactly one definition of "the built-in
 *  list" to keep in step with the 0030 seed. */
export const DEFAULT_REGISTRATION_OPTIONS: RegistrationOptionLists = {
  gender: [...REGISTRATION_OPTIONS.gender],
  shirt_size: [...REGISTRATION_OPTIONS.shirt_size],
};

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/leaders", label: "Leaders" },
  { href: "/chapters", label: "Chapters" },
  { href: "/events", label: "Events" },
  { href: "/gallery", label: "Gallery" },
  { href: "/news", label: "News" },
  { href: "/contact", label: "Contact" },
];
