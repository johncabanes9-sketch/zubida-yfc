const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Object key for a testimonial photo; testimonials_photo_is_object requires `testimonials/`. */
export function testimonialPhotoKey(mime: string): string {
  return `testimonials/${crypto.randomUUID()}.${EXT[mime] ?? "bin"}`;
}
