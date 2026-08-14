import Link from "next/link";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { Button } from "@/components/ui/button";
import type { PageRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage Pages", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageListRow = Pick<PageRow, "id" | "slug" | "title" | "updated_at"> & {
  page_sections: { id: string; visible: boolean }[] | null;
};

export default async function PagesAdmin() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("pages")
    .select("id, slug, title, updated_at, page_sections(id, visible)")
    .order("sort_order", { ascending: true });

  const rows = (data as PageListRow[] | null) ?? [];

  return (
    <AdminShell ctx={ctx} active="pages" title="Pages">
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Edit the content of public pages. Changes publish immediately. Only state
        what the organization can stand behind — leave a section hidden rather
        than filling it with placeholder text.
      </p>

      {rows.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-muted">
          No pages found — run <code>npm run db:migrate</code>.
        </p>
      ) : (
        <div className="grid gap-3">
          {rows.map((p) => {
            const sections = p.page_sections ?? [];
            const hidden = sections.filter((s) => !s.visible).length;
            return (
              <div
                key={p.id}
                className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"
              >
                <div>
                  <p className="font-display text-lg font-semibold">{p.title}</p>
                  <p className="text-xs text-muted">
                    /{p.slug} · {sections.length} section
                    {sections.length === 1 ? "" : "s"}
                    {hidden > 0 && ` · ${hidden} hidden`} · updated{" "}
                    {new Date(p.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/${p.slug}`} target="_blank">
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                  <Link href={`/admin/pages/${p.slug}/edit`}>
                    <Button size="sm">Edit</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
