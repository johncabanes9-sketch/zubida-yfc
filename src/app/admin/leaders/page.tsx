import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { LeaderAdmin, type LeaderListItem } from "./_components/leader-form";
import type { LeaderRow, ChapterRow, ClusterRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage Leaders", robots: { index: false } };
export const dynamic = "force-dynamic";

type LeaderQueryRow = Pick<
  LeaderRow,
  | "id" | "name" | "position" | "chapter_id" | "cluster_id" | "message"
  | "facebook_url" | "instagram_url" | "is_published"
> & {
  chapters: { name: string } | null;
  clusters: { name: string } | null;
};

export default async function LeadersAdmin() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();

  const { data: leadersData } = await supabase
    .from("leaders")
    .select(
      "id, name, position, chapter_id, cluster_id, message, facebook_url, instagram_url, is_published, chapters(name), clusters(name)",
    )
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: chaptersData } = await supabase
    .from("chapters")
    .select("id, name, cluster_id")
    .is("deleted_at", null)
    .order("name");

  const leaders: LeaderListItem[] = ((leadersData as LeaderQueryRow[] | null) ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    position: l.position,
    chapter_id: l.chapter_id,
    cluster_id: l.cluster_id,
    message: l.message,
    facebook_url: l.facebook_url,
    instagram_url: l.instagram_url,
    is_published: l.is_published,
    chapter_name: l.chapters?.name ?? null,
    cluster_name: l.clusters?.name ?? null,
  }));

  const allChapters = (chaptersData as Pick<ChapterRow, "id" | "name" | "cluster_id">[] | null) ?? [];
  // A cluster head can only assign leaders to chapters in their own cluster —
  // don't offer a control the server action will reject. The PYH sees every
  // chapter, plus the option to leave it blank for a provincial-level leader.
  const choosableChapters = ctx.isPYH
    ? allChapters
    : allChapters.filter((c) => c.cluster_id === ctx.clusterId);

  return (
    <AdminShell ctx={ctx} active="leaders" title="Leaders">
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Real leaders only. A leader needs only a name and a position to save —
        everything else can wait until it is confirmed. New leaders save as
        drafts and stay off the public page until you publish them. A photo or
        a quote requires recorded consent before it can be saved at all.
      </p>
      <LeaderAdmin
        isPYH={ctx.isPYH}
        clusterId={ctx.clusterId}
        leaders={leaders}
        chapters={choosableChapters}
      />
    </AdminShell>
  );
}
