import { z } from "zod";

/** Matches the shape src/lib/validation/site.ts uses for optional URLs. */
const optionalUrl = z.string().url().max(500).optional().or(z.literal(""));

export const leaderSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  position: z.string().trim().min(1, "Position is required.").max(200),
  chapter_id: z.string().uuid().optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  facebook_url: optionalUrl,
  instagram_url: optionalUrl,
});

export type LeaderInput = z.infer<typeof leaderSchema>;
