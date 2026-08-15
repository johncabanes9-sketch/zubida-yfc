import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../../../_components/admin-shell";
import { PageEditor, type EditorSection } from "../../_components/page-editor";
import { REGISTRY } from "@/lib/pages/registry";
import { ICON_NAMES } from "@/lib/pages/icons";
import type { PageRow, PageSectionRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Edit Page", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageWithSections = PageRow & { page_sections: PageSectionRow[] | null };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("pages")
    .select("*, page_sections(*)")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) notFound();
  const page = data as PageWithSections;

  const sections: EditorSection[] = (page.page_sections ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      type: s.type,
      label: REGISTRY[s.type]?.label ?? s.type,
      content: s.content,
      visible: s.visible,
      // Field definitions are plain data, so they cross the server/client
      // boundary without pulling the section components into the client bundle.
      fields: REGISTRY[s.type]?.editorFields ?? [],
    }));

  const addable = Object.entries(REGISTRY).map(([type, def]) => ({
    type,
    label: def.label,
  }));

  return (
    <AdminShell ctx={ctx} active="pages" title={`Edit: ${page.title}`}>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/admin/pages" className="text-muted hover:underline">
          ← All pages
        </Link>
        <Link
          href={`/${page.slug}`}
          target="_blank"
          className="text-royal-700 hover:underline dark:text-gold-300"
        >
          View /{page.slug} ↗
        </Link>
      </div>

      <PageEditor
        pageId={page.id}
        seoTitle={page.seo_title ?? ""}
        seoDescription={page.seo_description ?? ""}
        sections={sections}
        addable={addable}
        iconNames={ICON_NAMES}
      />
    </AdminShell>
  );
}
