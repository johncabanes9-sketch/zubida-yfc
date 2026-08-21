import { z } from "zod";

/**
 * Social links are optional, and constrained to https at BOTH layers: the
 * `leaders_*_url_is_https` CHECK constraints are the floor, and this is the
 * ceiling that produces a usable message instead of a generic save failure.
 * The refinement is load-bearing, not cosmetic -- `z.string().url()` on its
 * own accepts `javascript:` and `data:` URLs, and leader-card.tsx renders
 * these values straight into an href.
 *
 * src/lib/validation/site.ts still carries the unrefined shape this was
 * copied from, and its columns have no CHECK behind them; that is a separate
 * pre-existing issue, logged rather than changed here.
 */
const optionalUrl = z.string().url().max(500)
  .refine((v) => v.startsWith("https://"), "Links must start with https://")
  .optional().or(z.literal(""));

export const leaderSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  position: z.string().trim().min(1, "Position is required.").max(200),
  chapter_id: z.string().uuid().optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  facebook_url: optionalUrl,
  instagram_url: optionalUrl,
});

export type LeaderInput = z.infer<typeof leaderSchema>;
