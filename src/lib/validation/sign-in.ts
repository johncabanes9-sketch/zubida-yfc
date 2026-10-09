import { z } from "zod";

/** Caps keep a junk POST from reaching Supabase with megabytes of input.
 *  Passwords are not otherwise constrained here: their rules are set where
 *  accounts are created, and sign-in must accept whatever was set there. */
export const SIGN_IN_LIMITS = { email: 254, password: 1024 } as const;

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").max(SIGN_IN_LIMITS.email, "That email address is too long.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(SIGN_IN_LIMITS.password, "That password is too long."),
});

export interface SignInState {
  error: string | null;
  /** True only for a refused attempt — not for a notice carried in by ?error=,
   *  which must not mark untouched fields invalid. */
  fieldError: boolean;
  /** Echoed back so a refused attempt doesn't make the user retype it. */
  email: string;
}

/** Messages for the `?error=` codes that redirects elsewhere send here. */
export const SIGN_IN_NOTICES: Record<string, string> = {
  invalid: "Incorrect email or password.",
  "not-admin": "That account doesn't have access to the YFC admin portal.",
  timeout: "You were signed out after 30 minutes of inactivity. Please sign in again.",
};
