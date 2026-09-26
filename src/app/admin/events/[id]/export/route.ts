import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import {
  loadAdminContext,
  requireClusterAccess,
  createServerSupabase,
} from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { registrantsCsv, exportFilename, REGISTRANT_SELECT } from "@/lib/export/registrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PostgREST caps a response (1000 rows by default); page past it rather than
 *  hand an organizer a silently truncated list. */
const PAGE = 1000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Authenticate before the service-role read, so an unauthenticated caller
  // cannot probe which event ids exist (see updateChapter).
  await loadAdminContext();
  const { data: ev } = await createServiceClient()
    .from("events")
    .select("id, name, date, cluster_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ev) notFound();
  const event = ev as { id: string; name: string; date: string; cluster_id: string | null };
  const ctx = await requireClusterAccess(event.cluster_id);

  // The RLS-bound client, so the database applies the same scope again.
  const supabase = await createServerSupabase();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("event_registrations")
      .select(REGISTRANT_SELECT)
      .eq("event_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("registration_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`registrant export failed for event ${id}: ${error.message}`);
      return NextResponse.json({ error: "The export could not be generated." }, { status: 500 });
    }
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // Personal data leaving the system: record who took it and how much.
  try {
    await createServiceClient().from("audit_log").insert({
      actor_user_id: ctx.userId,
      action: "registrations.export",
      entity: "events",
      entity_id: id,
      meta: { rows: rows.length },
    });
  } catch {
    // best-effort; never block the export on logging failure
  }

  return new NextResponse(registrantsCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(event.name, event.date)}"`,
      // Personal data: never kept by a browser or shared cache.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
