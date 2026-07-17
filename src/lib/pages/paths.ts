const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a page image inside the `media` bucket, prefixed by slug. */
export function pageImageKey(slug: string, mime: string): string {
  return `pages/${slug}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
