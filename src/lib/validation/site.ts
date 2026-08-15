import { z } from "zod";

// Socials are optional: a blank URL hides the icon rather than linking to undefined.
const optionalUrl = z.string().url().max(500).optional().or(z.literal(""));

// Contact details follow the same rule. Blank is how an administrator withholds
// a channel that has not been confirmed yet — without it, the only way to stop
// publishing a placeholder would be to invent a replacement for it. A non-blank
// value is still held to its full shape.
const optionalEmail = z.string().email().max(200).or(z.literal(""));

// Digits, spaces, and the punctuation real phone numbers are written with. The
// point is to catch a typo or leftover placeholder text, not to enforce a
// national format — the province writes numbers several ways.
const phone = z
  .string()
  .min(7, "Phone number looks too short")
  .max(60)
  .regex(/^[0-9+()\-.\s]+$/, "Phone number may only contain digits, spaces, and + ( ) - .")
  .refine((v) => (v.match(/\d/g) ?? []).length >= 7, "Phone number needs at least 7 digits")
  .or(z.literal(""));

export const siteSettingsSchema = z.object({
  name: z.string().min(1).max(80),
  full_name: z.string().min(1).max(160),
  tagline: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  province: z.string().min(1).max(120),
  // Drives metadataBase, so it must be an absolute URL — a relative or malformed
  // value would corrupt canonical links and OG image URLs site-wide.
  site_url: z.string().url("Site URL must be absolute, e.g. https://example.org").max(500),
  email: optionalEmail,
  phone,
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
