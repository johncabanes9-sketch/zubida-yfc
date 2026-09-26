import "server-only";
import type { EmailTransport } from "../message";
import { gmailTransport } from "./gmail";
import { resendTransport } from "./resend";

// Ordered by preference: a real transactional sender before personal Gmail,
// which sends from an individual's address and caps at ~500 recipients/day.
export const TRANSPORTS: EmailTransport[] = [resendTransport, gmailTransport];

/** The first configured transport, or null for degraded (log-only) mode. */
export function selectTransport(
  transports: EmailTransport[] = TRANSPORTS,
): EmailTransport | null {
  return transports.find((t) => t.isConfigured()) ?? null;
}
