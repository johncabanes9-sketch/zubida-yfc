import { z } from "zod";

export const NEWS_CATEGORIES = ["Announcement", "Article", "Blog", "Video"] as const;

/**
 * https only, at both layers: news_posts_external_url_is_https is the floor,
 * this gives the admin a message. `z.string().url()` alone accepts
 * `javascript:` and `data:` URLs, and the card renders this into an href.
 */
const optionalHttpsUrl = z.string().trim().url("Enter a full link, starting with https://").max(500)
  .refine((v) => v.startsWith("https://"), "Links must start with https://")
  .optional().or(z.literal(""));

export const newsPostSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  excerpt: z.string().trim().min(1, "Write a short summary for the card.").max(600),
  category: z.enum(NEWS_CATEGORIES, { message: "Choose a format." }),
  author: z.string().trim().max(120).optional().or(z.literal("")),
  external_url: optionalHttpsUrl,
  published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
});

export type NewsPostInput = z.infer<typeof newsPostSchema>;
