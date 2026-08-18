const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a leader photo inside the `media` bucket, prefixed by slug. */
export function leaderImageKey(slug: string, mime: string): string {
  return `leaders/${slug}/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
