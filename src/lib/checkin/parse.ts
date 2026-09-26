/**
 * What the door reads off a pass. The QR encodes the /registration-status link
 * that statusUrl() builds; a volunteer typing from a printout gives only the
 * code. A token proves the pass is genuine; without one, check-in is manual and
 * the door confirms the registrant's name by eye.
 */
export type ParsedPass = { registrationId: string; token: string | null };

const CODE = /^ZYFC-[A-Z0-9]{4}-[0-9]{4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normaliseCode(raw: string | null): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

export function parsePass(input: string): ParsedPass | null {
  const text = input.trim();
  if (!text) return null;

  if (!/^https?:\/\//i.test(text)) {
    const registrationId = normaliseCode(text);
    return registrationId ? { registrationId, token: null } : null;
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  // Any origin: a pass issued from a preview or a renamed domain is still a
  // real pass. The path and the token shape are what make it one.
  if (url.pathname.replace(/\/+$/, "") !== "/registration-status") return null;
  const registrationId = normaliseCode(url.searchParams.get("id"));
  if (!registrationId) return null;

  const t = url.searchParams.get("t");
  if (t === null) return { registrationId, token: null };
  // A malformed token is a damaged or forged pass, not a manual lookup.
  return UUID.test(t) ? { registrationId, token: t.toLowerCase() } : null;
}
