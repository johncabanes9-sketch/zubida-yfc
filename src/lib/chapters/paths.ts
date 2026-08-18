const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a chapter cover inside the `media` bucket, prefixed by slug. */
export function chapterImageKey(slug: string, mime: string): string {
  return `chapters/${slug}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
