import { z } from "zod";
import { ICON_NAMES, type IconName } from "./icons.ts";

// Cast preserves the literal union so inferred content types keep `icon: IconName`
// (a plain-string tuple would erase the allowlist at the type level).
const iconName = z.enum(ICON_NAMES as [IconName, ...IconName[]]);
const text = z.string().min(1).max(400);
const longText = z.string().min(1).max(2000);

// Image inside a section. `src` is what next/image renders. `objectPath` is set
// only when we own the bytes in the media bucket (so reap can delete them);
// seed images point at external URLs and carry objectPath: null.
const sectionImage = z.object({
  src: z.string().url(),
  alt: z.string().max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  objectPath: z.string().max(300).nullable(),
});

export const heroSchema = z.object({
  eyebrow: text,
  title: text,
  subtitle: z.string().max(600).optional(),
});

export const textImageSchema = z.object({
  // Optional so a section can run text-only rather than being padded out with a
  // stand-in photograph. A stock image captioned as a Zubida YFC gathering
  // misrepresents the organization; no image at all does not.
  image: sectionImage.nullable().optional(),
  eyebrow: text,
  title: text,
  subtitle: z.string().max(600),
  body: longText,
});

export const featureCardsSchema = z.object({
  cards: z.array(z.object({ icon: iconName, title: text, body: longText })).min(1).max(4),
});

export const valuesGridSchema = z.object({
  eyebrow: text,
  title: text,
  align: z.enum(["left", "center"]).default("center"),
  items: z.array(z.object({ icon: iconName, title: text, text: longText })).min(1).max(12),
});

export const timelineSchema = z.object({
  eyebrow: text,
  title: text,
  subtitle: z.string().max(600).optional(),
  align: z.enum(["left", "center"]).default("center"),
  milestones: z.array(z.object({ year: z.string().max(12), title: text, text: longText })).min(1).max(24),
});

export type HeroContent = z.infer<typeof heroSchema>;
export type TextImageContent = z.infer<typeof textImageSchema>;
export type FeatureCardsContent = z.infer<typeof featureCardsSchema>;
export type ValuesGridContent = z.infer<typeof valuesGridSchema>;
export type TimelineContent = z.infer<typeof timelineSchema>;

const SCHEMAS = {
  hero: heroSchema,
  "text-image": textImageSchema,
  "feature-cards": featureCardsSchema,
  "values-grid": valuesGridSchema,
  timeline: timelineSchema,
} as const;

export const SECTION_TYPES = Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[];

/** Validates a section's content against its type. Unknown type => rejected. */
export function parseSectionContent(
  type: string, content: unknown,
): { ok: true; data: unknown } | { ok: false; reason: string } {
  const schema = (SCHEMAS as Record<string, z.ZodTypeAny>)[type];
  if (!schema) return { ok: false, reason: `Unknown section type: ${type}` };
  const r = schema.safeParse(content);
  if (!r.success) return { ok: false, reason: r.error.issues[0]?.message ?? "Invalid section content" };
  return { ok: true, data: r.data };
}
