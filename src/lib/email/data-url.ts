import "server-only";

const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/s;

/**
 * Splits a base64 `data:` URL into its bytes and MIME type.
 * Returns null for anything that is not a base64 data URL — callers fall back
 * to using the original string as a plain `src`.
 */
export function parseDataUrl(
  value: string,
): { content: Buffer; contentType: string } | null {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return null;
  return {
    contentType: match[1],
    content: Buffer.from(match[2], "base64"),
  };
}
