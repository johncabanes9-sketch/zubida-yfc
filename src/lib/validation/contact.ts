import { z } from "zod";

/** Bounds shared with the column checks in 0031_contact_messages.sql. */
export const CONTACT_LIMITS = {
  name: 120,
  email: 160,
  subject: 200,
  messageMin: 10,
  messageMax: 5000,
} as const;

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(CONTACT_LIMITS.name),
  email: z.string().trim().email().max(CONTACT_LIMITS.email),
  // Blank means no subject: stored as null, never as an empty string.
  subject: z
    .string()
    .trim()
    .max(CONTACT_LIMITS.subject)
    .optional()
    .transform((s) => (s ? s : null)),
  message: z.string().trim().min(CONTACT_LIMITS.messageMin).max(CONTACT_LIMITS.messageMax),
});

export type ContactInput = z.infer<typeof contactSchema>;
