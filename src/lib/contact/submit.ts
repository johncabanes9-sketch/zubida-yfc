// Relative, with extensions: prove:contact imports this module under plain
// Node, which resolves neither the "@/" alias nor an extensionless specifier.
import { contactSchema, type ContactInput } from "../validation/contact.ts";

export type ContactErrorCode = "INVALID" | "CAPTCHA_FAILED" | "RATE_LIMITED" | "SERVER_ERROR";

export type ContactResult = { ok: true } | { ok: false; code: ContactErrorCode };

export const CONTACT_ERROR_STATUS: Record<ContactErrorCode, number> = {
  INVALID: 400,
  CAPTCHA_FAILED: 400,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

export const CONTACT_ERROR_MESSAGE: Record<ContactErrorCode, string> = {
  INVALID: "Please check your name, email and message, then try again.",
  CAPTCHA_FAILED: "Captcha verification failed. Please retry.",
  RATE_LIMITED: "Too many messages from your connection. Please wait a few minutes and try again.",
  SERVER_ERROR: "Your message could not be sent. Please try again in a moment.",
};

/** Everything that talks to the network, injected so the suite needs none. */
export type ContactDeps = {
  verifyCaptcha: (token: string | undefined, ip: string) => Promise<boolean>;
  /** false when the sender is over the limit. */
  rateLimit: (ip: string) => Promise<boolean>;
  insert: (row: ContactInput) => Promise<void>;
};

/**
 * Validates, gates and stores one contact message.
 *
 * Returns ok only once the row is written. The form it serves used to report
 * success unconditionally; any failure here must reach the sender instead, so
 * they know to try again or write in another way.
 */
export async function submitContact(
  raw: unknown,
  ip: string,
  deps: ContactDeps,
): Promise<ContactResult> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "INVALID" };
  const { captchaToken, ...rest } = raw as Record<string, unknown>;

  // Validate first: a malformed body should cost no captcha round-trip.
  const parsed = contactSchema.safeParse(rest);
  if (!parsed.success) return { ok: false, code: "INVALID" };

  const token = typeof captchaToken === "string" ? captchaToken : undefined;
  if (!(await deps.verifyCaptcha(token, ip))) return { ok: false, code: "CAPTCHA_FAILED" };

  try {
    // Fail closed: an unavailable limiter must not turn into an unlimited one.
    if (!(await deps.rateLimit(ip))) return { ok: false, code: "RATE_LIMITED" };
    await deps.insert(parsed.data);
  } catch (e) {
    console.error(`contact message not stored: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, code: "SERVER_ERROR" };
  }
  return { ok: true };
}
