import "server-only";

/**
 * Verifies a Cloudflare Turnstile token. Shared by every public form that
 * writes to the database, so the half-configured guard below cannot be fixed
 * in one route and forgotten in another.
 */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // degraded mode: no captcha configured
  // Half-configured is the dangerous state: the secret alone makes every
  // submission fail CAPTCHA_FAILED, because no widget renders without the
  // site key, so no token is ever submitted. It shipped that way once. Fail
  // closed, but say why — a silent 400 on every submission is undiagnosable.
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    console.error(
      "TURNSTILE_SECRET_KEY is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY is not. " +
        "No captcha widget renders, so every public form submission will be rejected. " +
        "Set both, or neither.",
    );
    return false;
  }
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      },
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/** The client IP as the platform reports it, for rate limiting and siteverify. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
}
