import "server-only";
import nodemailer from "nodemailer";
import type { EmailMessage, EmailTransport } from "../message";

/**
 * Gmail SMTP with an App Password (requires 2-Step Verification on the account).
 * Sending limits: ~500 recipients/day on a personal @gmail.com address.
 * Gmail rewrites the From header to the authenticated account, so GMAIL_FROM
 * only controls the display name.
 */
const GMAIL_HOST = "smtp.gmail.com";
const GMAIL_PORT = 465;

function isConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

async function send(msg: EmailMessage): Promise<void> {
  const user = process.env.GMAIL_USER!;
  const transporter = nodemailer.createTransport({
    host: GMAIL_HOST,
    port: GMAIL_PORT,
    secure: true,
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD! },
    // send.ts already abandons a slow attempt, but that only stops waiting —
    // it does not close the socket. These make nodemailer tear the connection
    // down itself, so a wedged SMTP server cannot hold a handle open behind a
    // send that has already been recorded as failed.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_FROM ?? `Zubida YFC <${user}>`,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      attachments: msg.inlineImages?.map((img) => ({
        filename: img.filename,
        content: img.content,
        contentType: img.contentType,
        cid: img.cid,
      })),
    });
  } finally {
    transporter.close();
  }
}

export const gmailTransport: EmailTransport = {
  name: "gmail",
  isConfigured,
  send,
};
