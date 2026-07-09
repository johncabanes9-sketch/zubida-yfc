import "server-only";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { confirmationHtml } from "./confirmation";

/**
 * Sends the confirmation email and records the attempt in email_log.
 * Never throws — email must not break the registration response.
 * Degraded mode: if RESEND_API_KEY is unset, logs as "queued" without sending.
 */
export async function sendConfirmationEmail(args: {
  to: string;
  fullName: string;
  eventName: string;
  registrationId: string;
  qrDataUrl: string;
  statusUrl: string;
}): Promise<void> {
  const db = createServiceClient();
  const key = process.env.RESEND_API_KEY;
  try {
    if (!key) {
      await db.from("email_log").insert({
        registration_id: args.registrationId,
        to_email: args.to,
        status: "queued",
      });
      return;
    }
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "Zubida YFC <onboarding@resend.dev>",
      to: args.to,
      subject: `You're registered for ${args.eventName}`,
      html: confirmationHtml(args),
    });
    await db.from("email_log").insert({
      registration_id: args.registrationId,
      to_email: args.to,
      status: "sent",
    });
  } catch (e) {
    await db
      .from("email_log")
      .insert({
        registration_id: args.registrationId,
        to_email: args.to,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      })
      .then(() => {}, () => {});
  }
}
