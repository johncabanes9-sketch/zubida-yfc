import "server-only";
import { createServiceClient } from "../supabase/server.ts";
import type { ChapterRow } from "@/lib/supabase/database.types";
import { publicUrl } from "../images/paths.ts";

export type PublicChapter = {
  id: string;
  name: string;
  slug: string;
  municipality: string;
  /** null when the organization has not confirmed it — render nothing, never a stand-in. */
  schedule: string | null;
  coordinator: string | null;
  cover: string | null;
  clusterName: string | null;
};

/**
 * Published, undeleted chapters in display order. Returns [] whenever the
 * database is unreachable — the page renders its withholding notice rather than
 * failing, which is the same degradation getPage() uses. There is deliberately
 * no fixture fallback: an outage must not resurrect invented chapters.
 */
export async function getChapters(): Promise<PublicChapter[]> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("chapters")
      .select("*, clusters(name)")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return [];

    return (data as (ChapterRow & { clusters: { name: string } | null })[]).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      municipality: r.municipality,
      schedule: r.schedule,
      coordinator: r.coordinator,
      cover: r.cover_path ? publicUrl(r.cover_path) : null,
      clusterName: r.clusters?.name ?? null,
    }));
  } catch {
    return [];
  }
}
