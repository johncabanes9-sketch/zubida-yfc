import { z } from "zod";

/**
 * The caption is the photo's alt text as well as its visible label, so it is
 * required. Category is free text (see 0034_gallery_photos.sql); blank means
 * uncategorised, never a stand-in.
 */
export const galleryPhotoSchema = z.object({
  caption: z.string().trim().min(1, "Write a caption — it is also what screen readers announce.").max(300),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  cluster_id: z.string().uuid().optional().or(z.literal("")),
});

export type GalleryPhotoInput = z.infer<typeof galleryPhotoSchema>;
