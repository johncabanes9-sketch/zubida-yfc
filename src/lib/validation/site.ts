import { z } from "zod";

// Socials are optional: a blank URL hides the icon rather than linking to undefined.
const optionalUrl = z.string().url().max(500).optional().or(z.literal(""));

export const siteSettingsSchema = z.object({
  name: z.string().min(1).max(80),
  full_name: z.string().min(1).max(160),
  tagline: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  province: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().min(1).max(60),
  office: z.string().min(1).max(300),
  facebook_url: optionalUrl,
  instagram_url: optionalUrl,
  footer_explore_heading: z.string().min(1).max(60),
  footer_reach_heading: z.string().min(1).max(60),
  footer_closing_line: z.string().min(1).max(300),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

// href is NOT accepted from the client for insert/delete — it identifies an
// existing seeded row only. Labels/order/visibility are the editable fields.
export const navItemSchema = z.object({
  href: z.string().min(1).max(120),
  label: z.string().min(1).max(60),
  sort_order: z.coerce.number().int().min(0).max(999),
  visible: z.coerce.boolean(),
});

export type NavItemInput = z.infer<typeof navItemSchema>;
