import { z } from "zod";

const optionalText = z.string().max(2000).optional().or(z.literal(""));

export const eventSchema = z.object({
  name: z.string().min(3).max(160),
  date: z.string().min(1), // yyyy-mm-dd
  time: z.string().max(60).optional().or(z.literal("")),
  venue: optionalText,
  organizer: optionalText,
  description: optionalText,
  cover: z.string().url().max(500).optional().or(z.literal("")),
  registration_deadline: z.string().min(1), // ISO datetime-local
  slots_total: z.coerce.number().int().min(0).max(100000),
  status: z.enum(["Open", "Closed", "Finished"]),
  scope: z.enum(["Provincial", "Chapter"]),
  cluster_id: z.string().uuid().optional().or(z.literal("")),
});

export type EventInput = z.infer<typeof eventSchema>;
