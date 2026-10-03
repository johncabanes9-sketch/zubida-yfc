import { z } from "zod";

export const testimonialSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  role: z.string().trim().max(120).optional().or(z.literal("")),
  chapter_id: z.string().uuid().optional().or(z.literal("")),
  quote: z.string().trim().min(1, "Write the quote.").max(600),
});

export type TestimonialInput = z.infer<typeof testimonialSchema>;
