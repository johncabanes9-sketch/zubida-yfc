type MinimalClient = {
  from: (t: string) => any;
  storage: { from: (b: string) => { remove: (paths: string[]) => Promise<{ error: unknown }> } };
};

/**
 * Removes an event's image objects and rows.
 *
 * Events are SOFT-deleted, so event_images' ON DELETE CASCADE never fires — and
 * media_public_read serves any object in the bucket regardless of its event's
 * state. Without an explicit reap the bytes stay live at their direct URL
 * forever after the event is gone.
 *
 * Objects go first, and a failed removal aborts BEFORE the rows are dropped:
 * dropping the rows anyway would leave a file nothing references — an
 * untraceable orphan. Keeping the rows is self-healing, since the caller can
 * retry. This mirrors deleteEventImage's single-image behaviour.
 *
 * Lives here, outside the "use server" action module, so the proof script can
 * import and exercise the REAL code path rather than a hand-mirrored copy.
 */
export async function reapEventImages(
  svc: MinimalClient, eventId: string,
): Promise<{ error?: string }> {
  const { data: imgs } = await svc.from("event_images").select("id, path").eq("event_id", eventId);
  if (!imgs || imgs.length === 0) return {};

  const rm = await svc.storage.from("media").remove(imgs.map((i: { path: string }) => i.path));
  if (rm.error) return { error: "Could not delete the event's image files. Please try again." };

  const del = await svc.from("event_images").delete().eq("event_id", eventId);
  if (del.error) return { error: "Could not delete the event's image records." };

  return {};
}
