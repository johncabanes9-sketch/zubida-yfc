import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { ChapterAdmin, type ChapterListItem } from "./_components/chapter-form";
import type { ChapterRow, ClusterRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage Chapters", robots: { index: false } };
export const dynamic = "force-dynamic";

type ChapterQueryRow = Pick<
  ChapterRow,
  "id" | "name" | "municipality" | "schedule" | "coordinator" | "is_published" | "cluster_id" | "cover_path"
> & {
  clusters: { name: string } | null;
};

export default async function ChaptersAdmin() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();

  const { data: chaptersData } = await supabase
    .from("chapters")
    .select("id, name, municipality, schedule, coordinator, is_published, cluster_id, cover_path, clusters(name)")
    .is("deleted_at", null)
    .order("cluster_id", { ascending: true })
    .order("name", { ascending: true });

  const { data: clustersData } = await supabase.from("clusters").select("id, name").order("name");

  const chapters: ChapterListItem[] = ((chaptersData as ChapterQueryRow[] | null) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    municipality: c.municipality,
    schedule: c.schedule,
    coordinator: c.coordinator,
    is_published: c.is_published,
    cluster_id: c.cluster_id,
    cluster_name: c.clusters?.name ?? null,
    cover_path: c.cover_path,
  }));

  const allClusters = (clustersData as Pick<ClusterRow, "id" | "name">[] | null) ?? [];
  // A cluster head can only create chapters in their own cluster — don't offer
  // a control the server action will reject. The PYH sees every cluster.
  const creatableClusters = ctx.isPYH
    ? allClusters
    : allClusters.filter((c) => c.id === ctx.clusterId);

  return (
    <AdminShell ctx={ctx} active="chapters" title="Chapters">
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Real chapters only. A chapter needs a name, municipality and cluster to
        save — everything else can wait until it is confirmed. New chapters
        save as drafts and stay off the public page until you publish them.
      </p>
      <ChapterAdmin
        isPYH={ctx.isPYH}
        clusterId={ctx.clusterId}
        chapters={chapters}
        clusters={creatableClusters}
      />
    </AdminShell>
  );
}
