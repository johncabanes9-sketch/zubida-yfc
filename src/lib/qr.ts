import QRCode from "qrcode";
// Relative, with the extension: this module is imported by prove:email under
// plain Node, which resolves neither the "@/" alias nor an extensionless path.
import { SITE } from "./constants.ts";

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 1,
    color: { dark: "#12224E", light: "#ffffff" },
  });
}

export function statusUrl(base: string, registrationId: string, token: string) {
  return `${base}/registration-status?id=${encodeURIComponent(registrationId)}&t=${encodeURIComponent(token)}`;
}

/** Only a loopback address earns the development shortcut below. */
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Chooses the base URL for a status link that leaves the server — mailed to a
 * registrant, and encoded into their QR pass.
 *
 * Never the request's own origin in production. `req.nextUrl.origin` is derived
 * from the Host header, which the caller controls, and this link carries the
 * registration id and the qr_token. A registration POSTed with a spoofed Host
 * would mail that token to a domain the sender chose, and mint a QR pointing
 * there too. The canonical URL lives in site_settings.site_url precisely so it
 * does not have to be guessed from a request (migration 0018).
 *
 * Development may use the request origin, but only when it is loopback: a link
 * mailed from a dev server has to be clickable, while a spoofed Host must not
 * win even locally.
 */
export function pickLinkBase({
  requestOrigin,
  configuredUrl,
  isProduction,
}: {
  requestOrigin: string;
  configuredUrl: string;
  isProduction: boolean;
}): string {
  if (!isProduction && LOOPBACK_ORIGIN.test(requestOrigin)) return requestOrigin;
  // Never falls back to the request: a blank setting must not reopen the hole.
  return configuredUrl.trim() || SITE.url;
}
