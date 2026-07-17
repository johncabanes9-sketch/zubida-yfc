type MinimalClient = {
  from: (t: string) => any;
  storage: { from: (b: string) => { remove: (paths: string[]) => Promise<{ error: unknown }> } };
};

/**
 * Collects the storage object paths a section owns (objectPath !== null). Only
 * the `image` field carries one today; written defensively so future image-bearing
 * fields are covered. Seed/external images have objectPath: null and are ignored.
 */
export function collectImagePaths(content: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    if (typeof o.objectPath === "string" && o.objectPath.length > 0) out.push(o.objectPath);
    Object.values(o).forEach(visit);
  };
  visit(content);
  return out;
}

/**
 * Removes owned storage objects. Object removal must succeed before the caller
 * proceeds to drop the referencing row/JSON; a failed removal returns an error
 * so the caller aborts rather than orphaning bytes. Mirrors reapEventImages.
 */
export async function reapPaths(svc: MinimalClient, paths: string[]): Promise<{ error?: string }> {
  if (paths.length === 0) return {};
  const rm = await svc.storage.from("media").remove(paths);
  if (rm.error) return { error: "Could not delete the page's image files. Please try again." };
  return {};
}

/** Reaps every owned image across all of a page's sections (used on page delete). */
export async function reapPage(svc: MinimalClient, pageId: string): Promise<{ error?: string }> {
  const { data } = await svc.from("page_sections").select("content").eq("page_id", pageId);
  if (!data || data.length === 0) return {};
  const paths = data.flatMap((r: { content: unknown }) => collectImagePaths(r.content));
  return reapPaths(svc, paths);
}
