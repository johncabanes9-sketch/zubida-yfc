import { z } from "zod";

const optionalText = z.string().max(200).optional().or(z.literal(""));

export const registrationSchema = z.object({
  event_id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  nickname: z.string().max(60).optional().or(z.literal("")),
  birthdate: z.string().optional().or(z.literal("")),
  age: z.coerce.number().int().min(10).max(40),
  gender: optionalText,
  email: z.string().email().max(160),
  phone: optionalText,
  chapter: z.string().min(2).max(120),
  cluster: optionalText,
  parish: optionalText,
  school: optionalText,
  emergency_contact: optionalText,
  emergency_number: optionalText,
  medical_concerns: optionalText,
  food_restrictions: optionalText,
  shirt_size: optionalText,
  transport_needed: z.boolean().optional().default(false),
  // consent must be exactly true
  consent: z.boolean().refine((v) => v === true, {
    message: "Consent is required",
  }),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
