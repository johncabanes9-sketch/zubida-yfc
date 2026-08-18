import "server-only";
import { createServiceClient } from "../supabase/server.ts";
import type { LeaderRow } from "@/lib/supabase/database.types";
import { publicUrl } from "../images/paths.ts";

export type PublicLeader = {
  id: string;
  name: string;
  slug: string;
  position: string;
  /** null when withheld — render nothing, never a stand-in. */
  message: string | null;
  photo: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  chapterName: string | null;
};

/**
 * Published, undeleted leaders in display order. Returns [] whenever the
 * database is unreachable — the page renders its withholding notice rather than
 * failing, matching getChapters(). There is deliberately no fixture fallback: an
 * outage must not resurrect the twelve invented profiles.
 */
export async function getLeaders(): Promise<PublicLeader[]> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("leaders")
      .select("*, chapters(name)")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return [];

    return (data as (LeaderRow & { chapters: { name: string } | null })[]).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      position: r.position,
      message: r.message,
      photo: r.photo_path ? publicUrl(r.photo_path) : null,
      facebookUrl: r.facebook_url,
      instagramUrl: r.instagram_url,
      chapterName: r.chapters?.name ?? null,
    }));
  } catch {
    return [];
  }
}
