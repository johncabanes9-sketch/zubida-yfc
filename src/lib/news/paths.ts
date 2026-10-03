const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a news cover in the `media` bucket; news_posts_cover_is_object requires `news/`. */
export function newsCoverKey(mime: string): string {
  return `news/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
