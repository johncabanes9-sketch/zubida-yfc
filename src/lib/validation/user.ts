import { z } from "zod";

export const createUserSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  username: z.string().max(60).optional().or(z.literal("")),
  cluster_id: z.string().uuid(),
  password: z.string().min(10).max(200),
  is_active: z.coerce.boolean().optional().default(true),
});

export const editUserSchema = z.object({
  full_name: z.string().min(2).max(120),
  username: z.string().max(60).optional().or(z.literal("")),
  cluster_id: z.string().uuid(),
});

export const passwordSchema = z.object({
  password: z.string().min(10).max(200),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
