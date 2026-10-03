import { loadAdminContext, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { GalleryAdmin, type GalleryListItem } from "./_components/gallery-admin";
import type { ClusterRow, GalleryPhotoRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage Gallery", robots: { index: false } };
export const dynamic = "force-dynamic";

type PhotoQueryRow = Pick<
  GalleryPhotoRow,
  "id" | "path" | "caption" | "category" | "width" | "height" | "cluster_id" | "is_published" | "consent_confirmed_at"
> & { clusters: { name: string } | null };

export default async function GalleryAdminPage() {
  const ctx = await loadAdminContext();
  const supabase = await createServerSupabase();

  const { data: photosData } = await supabase
    .from("gallery_photos")
    .select("id, path, caption, category, width, height, cluster_id, is_published, consent_confirmed_at, clusters(name)")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: clustersData } = await supabase.from("clusters").select("id, name").order("name");

  const photos: GalleryListItem[] = ((photosData as PhotoQueryRow[] | null) ?? [])
    .filter((p): p is PhotoQueryRow & { path: string } => p.path !== null)
    .map((p) => ({
      id: p.id,
      path: p.path,
      caption: p.caption,
      category: p.category,
      width: p.width,
      height: p.height,
      cluster_id: p.cluster_id,
      cluster_name: p.clusters?.name ?? null,
      is_published: p.is_published,
      consent_confirmed_at: p.consent_confirmed_at,
    }));

  // Suggested categories are the ones real photos already carry, so the list
  // grows from use instead of from an invented taxonomy.
  const categories = [...new Set(photos.map((p) => p.category).filter((c): c is string => !!c))].sort();
  const clusters = (clustersData as Pick<ClusterRow, "id" | "name">[] | null) ?? [];

  return (
    <AdminShell ctx={ctx} active="gallery" title="Gallery">
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Real photos only, uploaded with permission to publish them. New photos
        save as drafts and stay off the public gallery until you publish them.
        {ctx.isPYH ? "" : " You can add and edit photos for your own cluster."}
      </p>
      <GalleryAdmin
        isPYH={ctx.isPYH}
        clusterId={ctx.clusterId}
        photos={photos}
        clusters={clusters}
        categories={categories}
      />
    </AdminShell>
  );
}
