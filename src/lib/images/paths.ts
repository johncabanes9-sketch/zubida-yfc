const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

/** Object key inside the `media` bucket. Prefixed by event so deletes are simple. */
export function objectKey(eventId: string, mime: string): string {
  return `events/${eventId}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}

/** Derives the public URL at read time, so no project URL is stored in rows. */
export function publicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/media/${path}`;
}
