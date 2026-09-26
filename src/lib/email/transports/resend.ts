import "server-only";
import { Resend } from "resend";
import type { EmailMessage, EmailTransport } from "../message";

const DEFAULT_FROM = "Zubida YFC <onboarding@resend.dev>";

function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function send(msg: EmailMessage): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? DEFAULT_FROM,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    attachments: msg.inlineImages?.map((img) => ({
      filename: img.filename,
      content: img.content,
      contentType: img.contentType,
      contentId: img.cid,
    })),
  });
  // The SDK reports delivery failures in `error` rather than throwing.
  if (error) throw new Error(`${error.name}: ${error.message}`);
}

export const resendTransport: EmailTransport = {
  name: "resend",
  isConfigured,
  send,
};
