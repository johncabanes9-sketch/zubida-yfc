import "server-only";
import { confirmationHtml } from "./confirmation";
import { parseDataUrl } from "./data-url";
import type { EmailMessage, InlineImage } from "./message";

export const QR_CID = "registration-qr";

export type ConfirmationArgs = {
  to: string;
  fullName: string;
  eventName: string;
  registrationId: string;
  qrDataUrl: string;
  statusUrl: string;
};

/**
 * Builds the confirmation message, embedding the QR as an inline attachment
 * when it arrives as a data URL. Gmail and most webmail clients refuse to
 * render `data:` image sources, so `cid:` is the only reliable form. A QR that
 * does not render is a registrant turned away at the venue door.
 */
export function buildConfirmationMessage(args: ConfirmationArgs): EmailMessage {
  const parsed = parseDataUrl(args.qrDataUrl);
  const inlineImages: InlineImage[] | undefined = parsed
    ? [
        {
          cid: QR_CID,
          filename: "registration-qr.png",
          content: parsed.content,
          contentType: parsed.contentType,
        },
      ]
    : undefined;

  return {
    to: args.to,
    subject: `You're registered for ${args.eventName}`,
    html: confirmationHtml({
      fullName: args.fullName,
      eventName: args.eventName,
      registrationId: args.registrationId,
      qrSrc: parsed ? `cid:${QR_CID}` : args.qrDataUrl,
      statusUrl: args.statusUrl,
    }),
    inlineImages,
  };
}
