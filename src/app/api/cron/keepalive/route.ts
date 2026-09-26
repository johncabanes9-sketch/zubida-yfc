import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runKeepalive } from "@/lib/keepalive";

export const runtime = "nodejs";
// A cached response would answer the cron without touching the database,
// which is the one thing this route is for.
export const dynamic = "force-dynamic";

/** Called daily by Vercel Cron — see vercel.json. */
export async function GET(req: NextRequest) {
  const result = await runKeepalive({
    authorization: req.headers.get("authorization"),
    secret: process.env.CRON_SECRET,
    ping: async () => {
      const { error } = await createServiceClient()
        .from("site_settings")
        .select("id")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error(error.message);
    },
  });
  return NextResponse.json(result.body, { status: result.status });
}
