import "server-only";
import { createServiceClient } from "../supabase/server.ts";
import type { GalleryPhotoRow } from "@/lib/supabase/database.types";
import { publicUrl } from "../images/paths.ts";

export type PublicPhoto = {
  id: string;
  src: string;
  caption: string;
  /** null when uncategorised — it simply joins no filter. */
  category: string | null;
  width: number;
  height: number;
};

/**
 * Published, undeleted photos, newest first within the admin's sort order.
 * Returns [] whenever the database is unreachable, so the page renders its
 * withholding notice rather than failing — and there is deliberately no
 * fixture fallback: an outage must not resurrect stock photos.
 */
export async function getGalleryPhotos(limit?: number): Promise<PublicPhoto[]> {
  try {
    let query = createServiceClient()
      .from("gallery_photos")
      .select("id, path, caption, category, width, height")
      .eq("is_published", true)
      .is("deleted_at", null)
      .not("path", "is", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error || !data) return [];

    return (data as Pick<GalleryPhotoRow, "id" | "path" | "caption" | "category" | "width" | "height">[]).map((r) => ({
      id: r.id,
      src: publicUrl(r.path!),
      caption: r.caption,
      category: r.category,
      width: r.width,
      height: r.height,
    }));
  } catch {
    return [];
  }
}
