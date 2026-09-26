import { after, NextRequest, NextResponse } from "next/server";
import { registrationSchema } from "@/lib/validation/registration";
import {
  ERROR_STATUS,
  ERROR_MESSAGE,
  isRegistrationErrorCode,
  type RegistrationErrorCode,
} from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { generateQrDataUrl, statusUrl, pickLinkBase } from "@/lib/qr";
import { SITE } from "@/lib/constants";
import { sendConfirmationEmail } from "@/lib/email/send";
import type { RegisterResult } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

function fail(code: RegistrationErrorCode) {
  return NextResponse.json(
    { ok: false, code, message: ERROR_MESSAGE[code] },
    { status: ERROR_STATUS[code] },
  );
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // degraded mode: no captcha configured
  // Half-configured is the dangerous state: the secret alone makes every
  // registration fail CAPTCHA_FAILED, because no widget renders without the
  // site key, so no token is ever submitted. It shipped that way once. Fail
  // closed, but say why — a silent 400 on every submission is undiagnosable.
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    console.error(
      "TURNSTILE_SECRET_KEY is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY is not. " +
        "No captcha widget renders, so every registration will be rejected. " +
        "Set both, or neither.",
    );
    return false;
  }
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      },
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("INVALID");
  }

  const { captchaToken, ...rest } = (raw ?? {}) as Record<string, unknown>;

  const parsed = registrationSchema.safeParse(rest);
  if (!parsed.success) return fail("INVALID");

  if (!(await verifyTurnstile(captchaToken as string | undefined, ip)))
    return fail("CAPTCHA_FAILED");

  const db = createServiceClient();

  const { data: allowed, error: rlError } = await db.rpc("check_rate_limit", {
    p_ip: ip,
    p_endpoint: "register",
    p_window_seconds: 60,
    p_max: 5,
  });
  if (rlError) return fail("SERVER_ERROR");
  if (allowed === false) return fail("RATE_LIMITED");

  const { data: rpcData, error } = await db.rpc("register_for_event", {
    p: parsed.data as Record<string, unknown>,
  });
  if (error) return fail("SERVER_ERROR");

  const data = rpcData as RegisterResult | null;
  if (!data?.ok) {
    const code = isRegistrationErrorCode(data?.code) ? data.code : "SERVER_ERROR";
    return fail(code);
  }

  // Look up event name for the confirmation email / response.
  const { data: ev } = await db
    .from("events")
    .select("name")
    .eq("id", parsed.data.event_id)
    .single();
  const eventName = (ev as { name?: string } | null)?.name ?? "your event";

  // The base must come from configuration, never from the request: this link
  // carries the qr_token, and it is encoded into the QR pass as well as mailed.
  const { data: cfg } = await db
    .from("site_settings")
    .select("site_url")
    .eq("id", 1)
    .maybeSingle();
  const link = statusUrl(
    pickLinkBase({
      requestOrigin: req.nextUrl.origin,
      configuredUrl: (cfg as { site_url: string | null } | null)?.site_url ?? SITE.url,
      isProduction: process.env.NODE_ENV === "production",
    }),
    data.registration_id!,
    data.qr_token!,
  );
  const qr = await generateQrDataUrl(link);

  // Off the critical path — runs after the response is sent.
  after(async () => {
    await sendConfirmationEmail({
      to: parsed.data.email,
      fullName: parsed.data.full_name,
      eventName,
      registrationId: data.registration_id!,
      qrDataUrl: qr,
      statusUrl: link,
    });
  });

  return NextResponse.json({
    ok: true,
    registration_id: data.registration_id,
    qr_token: data.qr_token,
    qr,
    status: data.status,
    event_name: eventName,
  });
}
