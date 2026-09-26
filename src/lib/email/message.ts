import "server-only";

/** An image embedded in the message body and referenced as `cid:<cid>`. */
export type InlineImage = {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  inlineImages?: InlineImage[];
};

/** A transport is configured, or it is not. Unconfigured transports are skipped. */
export type EmailTransport = {
  name: string;
  isConfigured: () => boolean;
  send: (msg: EmailMessage) => Promise<void>;
};
