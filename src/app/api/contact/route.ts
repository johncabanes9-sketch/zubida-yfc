import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTurnstile, clientIp } from "@/lib/turnstile";
import {
  submitContact,
  CONTACT_ERROR_MESSAGE,
  CONTACT_ERROR_STATUS,
} from "@/lib/contact/submit";

export const runtime = "nodejs";

// Tighter than registration's 5/min: nobody legitimately writes the office
// more than a few times in ten minutes.
const RATE_WINDOW_SECONDS = 600;
const RATE_MAX = 3;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }

  const db = createServiceClient();
  const result = await submitContact(raw, ip, {
    verifyCaptcha: verifyTurnstile,
    rateLimit: async (addr) => {
      const { data, error } = await db.rpc("check_rate_limit", {
        p_ip: addr,
        p_endpoint: "contact",
        p_window_seconds: RATE_WINDOW_SECONDS,
        p_max: RATE_MAX,
      });
      if (error) throw new Error(`check_rate_limit: ${error.message}`);
      return data !== false;
    },
    insert: async (row) => {
      const { error } = await db.from("contact_messages").insert(row);
      if (error) throw new Error(`contact_messages insert: ${error.message}`);
    },
  });

  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json(
    { ok: false, code: result.code, message: CONTACT_ERROR_MESSAGE[result.code] },
    { status: CONTACT_ERROR_STATUS[result.code] },
  );
}
