import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { PageRow, PageSectionRow } from "@/lib/supabase/database.types";
import type { RenderableSection } from "@/components/pages/section-renderer";
import { PAGE_FALLBACK, type PageMeta } from "@/lib/pages/fallback";
import { publicUrl } from "@/lib/images/paths";

export type { PageMeta };

function metaFromRow(row: PageRow): PageMeta {
  return {
    title: row.title,
    seoTitle: row.seo_title ?? row.title,
    seoDescription: row.seo_description ?? "",
    ogImage: row.og_image_path ? publicUrl(row.og_image_path) : null,
  };
}

/**
 * Loads a page and its visible sections, ordered. Falls back to the hardcoded
 * PAGE_FALLBACK[slug] whenever the DB errors, the page row is missing, or it has
 * no sections — so the public site always renders. Mirrors getSiteSettings.
 */
export async function getPage(
  slug: string,
): Promise<{ page: PageMeta; sections: RenderableSection[] }> {
  const fallback = PAGE_FALLBACK[slug] ?? { meta: { title: slug, seoTitle: slug, seoDescription: "", ogImage: null }, sections: [] };
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("pages")
      .select("*, page_sections(type, content, sort_order, visible)")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return { page: fallback.meta, sections: fallback.sections };

    const row = data as PageRow & { page_sections: Pick<PageSectionRow, "type" | "content" | "sort_order" | "visible">[] };
    const sections = (row.page_sections ?? [])
      .filter((s) => s.visible)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ type: s.type, content: s.content }));

    if (sections.length === 0) return { page: metaFromRow(row), sections: fallback.sections };
    return { page: metaFromRow(row), sections };
  } catch {
    return { page: fallback.meta, sections: fallback.sections };
  }
}

export async function getPageMeta(slug: string): Promise<PageMeta> {
  return (await getPage(slug)).page;
}
