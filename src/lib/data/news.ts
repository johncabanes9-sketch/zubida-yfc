import "server-only";
import { createServiceClient } from "../supabase/server.ts";
import type { NewsCategoryDb, NewsPostRow } from "@/lib/supabase/database.types";
import { publicUrl } from "../images/paths.ts";

export type PublicNewsPost = {
  id: string;
  title: string;
  excerpt: string;
  category: NewsCategoryDb;
  /** null when withheld — render no byline, never a stand-in. */
  author: string | null;
  /** Where the full story lives; null means the card links nowhere. */
  url: string | null;
  date: string;
  cover: string | null;
};

/**
 * Published, undeleted posts, newest first. Returns [] whenever the database
 * is unreachable so the page withholds instead of failing — and there is no
 * fixture fallback: an outage must not resurrect invented articles.
 */
export async function getNewsPosts(limit?: number): Promise<PublicNewsPost[]> {
  try {
    let query = createServiceClient()
      .from("news_posts")
      .select("id, title, excerpt, category, author, external_url, published_on, cover_path")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("published_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error || !data) return [];

    type Row = Pick<NewsPostRow, "id" | "title" | "excerpt" | "category" | "author" | "external_url" | "published_on" | "cover_path">;
    return (data as Row[]).map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: r.excerpt,
      category: r.category,
      author: r.author,
      url: r.external_url,
      date: r.published_on,
      cover: r.cover_path ? publicUrl(r.cover_path) : null,
    }));
  } catch {
    return [];
  }
}
