const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Object key for a gallery photo inside the `media` bucket. Always under
 * `gallery/` — the gallery_photos_path_is_object CHECK rejects anything else.
 */
export function galleryImageKey(mime: string): string {
  return `gallery/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
