import "server-only";
import { createServiceClient } from "../supabase/server.ts";
import type { TestimonialRow } from "@/lib/supabase/database.types";
import { publicUrl } from "../images/paths.ts";

export type PublicTestimonial = {
  id: string;
  name: string;
  /** null when withheld — render nothing, never a stand-in. */
  role: string | null;
  chapter: string | null;
  quote: string;
  /** null means no image at all — never a stock face. */
  photo: string | null;
};

/**
 * Published, live testimonials in display order. Returns [] when the database
 * is unreachable so the homepage simply omits the section — there is no
 * fixture fallback: an outage must not resurrect invented people.
 */
export async function getTestimonials(): Promise<PublicTestimonial[]> {
  try {
    const { data, error } = await createServiceClient()
      .from("testimonials")
      // The service client bypasses RLS, so the chapter's own publication
      // state is read and enforced here: a draft or deleted chapter's name
      // must not surface through a testimonial.
      .select("id, name, role, quote, photo_path, chapters(name, is_published, deleted_at)")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error || !data) return [];

    type Row = Pick<TestimonialRow, "id" | "name" | "role" | "quote" | "photo_path"> & {
      chapters: { name: string; is_published: boolean; deleted_at: string | null } | null;
    };
    return (data as unknown as Row[])
      .filter((r) => r.name && r.quote)
      .map((r) => ({
        id: r.id,
        name: r.name!,
        role: r.role,
        chapter: r.chapters?.is_published && !r.chapters.deleted_at ? r.chapters.name : null,
        quote: r.quote!,
        photo: r.photo_path ? publicUrl(r.photo_path) : null,
      }));
  } catch {
    return [];
  }
}
