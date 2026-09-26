import { timingSafeEqual } from "node:crypto";

/**
 * Supabase pauses a free-tier project after a week without activity, and a
 * paused project takes every database-backed page and registration down with
 * it — which happened once already. Public pages are ISR-cached, so real
 * visitors do not reliably reach the database; this route does, once a day.
 */
export const KEEPALIVE_ROUTE = "/api/cron/keepalive";

export type KeepaliveResult = {
  status: 200 | 401 | 500 | 503;
  body: { ok: boolean; error?: string };
};

export type KeepaliveArgs = {
  /** The request's Authorization header. Vercel Cron sends `Bearer <CRON_SECRET>`. */
  authorization: string | null;
  secret: string | undefined;
  /** One real query. Throws when the database does not answer. */
  ping: () => Promise<void>;
};

function matches(authorization: string | null, secret: string): boolean {
  const given = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function runKeepalive({ authorization, secret, ping }: KeepaliveArgs): Promise<KeepaliveResult> {
  // Fail closed: without a secret anyone could make the route query the
  // database on demand. Say why, or a silently failing keepalive lets the
  // project pause anyway.
  if (!secret) {
    console.error("CRON_SECRET is not set; the Supabase keepalive cannot run.");
    return { status: 500, body: { ok: false, error: "CRON_SECRET is not configured" } };
  }
  if (!matches(authorization, secret)) return { status: 401, body: { ok: false } };

  try {
    await ping();
    return { status: 200, body: { ok: true } };
  } catch (e) {
    // 503, not 200: Vercel marks the cron run failed, which is the only
    // signal anyone gets that the project may be heading for a pause.
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Supabase keepalive failed: ${error}`);
    return { status: 503, body: { ok: false, error } };
  }
}
