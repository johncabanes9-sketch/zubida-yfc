import type { MetadataRoute } from "next";
import { NAV_LINKS } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://zubidayfc.org";
  return NAV_LINKS.map((l) => ({
    url: `${base}${l.href === "/" ? "" : l.href}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: l.href === "/" ? 1 : 0.8,
  }));
}
