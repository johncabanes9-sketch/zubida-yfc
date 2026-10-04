/**
 * The size an admin image upload is checked against in the browser, before it
 * is sent.
 *
 * Vercel caps a function request body at 4.5MB, so a bigger photo never
 * reaches the server action and fails with a generic error. 4MB leaves room
 * for the multipart overhead. The server's validateImage (MAX_BYTES) stays the
 * authority; this only turns a confusing failure into a clear message.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** A message for a file over the cap, or null when it can be sent. */
export function uploadTooLarge(file: { name: string; size: number }): string | null {
  if (file.size <= MAX_UPLOAD_BYTES) return null;
  return `${file.name} is over 4MB. Resize or compress it, then upload again.`;
}
