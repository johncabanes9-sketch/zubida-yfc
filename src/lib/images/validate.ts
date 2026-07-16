export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 10;

/**
 * Identifies an image from its leading bytes. A multipart upload's declared MIME
 * is client-supplied and trivially forged, so the magic-byte sniff — not the
 * declared type — is what actually decides. SVG is intentionally unsupported:
 * it is XML and can carry <script>.
 */
export function sniffImageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export function validateImage(
  bytes: Uint8Array, declaredMime: string, size: number,
): { ok: true; mime: string } | { ok: false; reason: string } {
  if (size > MAX_BYTES) return { ok: false, reason: `File exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.` };
  if (size === 0) return { ok: false, reason: "File is empty." };
  const sniffed = sniffImageType(bytes);
  if (!sniffed) return { ok: false, reason: "Not a JPEG, PNG, or WebP image." };
  if (!ALLOWED_MIME.includes(declaredMime as (typeof ALLOWED_MIME)[number])) {
    return { ok: false, reason: `Unsupported type ${declaredMime}.` };
  }
  if (sniffed !== declaredMime) return { ok: false, reason: "File contents do not match its declared type." };
  return { ok: true, mime: sniffed };
}
