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
