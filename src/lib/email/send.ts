import "server-only";
// Relative, with extensions: prove:email imports this module under plain Node,
// which resolves neither the "@/" alias nor an extensionless specifier.
import { createServiceClient } from "../supabase/server.ts";
import { buildConfirmationMessage, type ConfirmationArgs } from "./confirmation-message.ts";
import { selectTransport } from "./transports/index.ts";
import type { EmailTransport } from "./message.ts";

/**
 * How long a transport gets before the attempt is abandoned and recorded as
 * failed.
 *
 * Without a ceiling, a hung SMTP socket produces no log row at all: the send
 * never settles, so neither the "sent" nor the "failed" insert ever runs, and
 * the platform eventually kills the function mid-flight. Silence is the one
 * outcome this module exists to prevent — a registrant whose pass never
 * arrived, with nothing written down to say so.
 */
const SEND_TIMEOUT_MS = 15_000;

export type EmailLogStatus = "sent" | "queued" | "failed";

export type EmailLogRow = {
  registration_id: string;
  to_email: string;
  status: EmailLogStatus;
  error?: string;
};

/** Seams for the suite: a transport and a log writer that need no network and
 *  no database. `transport: null` forces degraded mode explicitly, which is why
 *  the check below is against `undefined` rather than falsiness. */
export type SendDeps = {
  transport?: EmailTransport | null;
  log?: (row: EmailLogRow) => Promise<void>;
  timeoutMs?: number;
};

type LogClient = Pick<ReturnType<typeof createServiceClient>, "from">;

/** supabase-js resolves `{ error }` on a failed insert instead of throwing, so
 *  an RLS denial or schema drift would otherwise vanish without a trace. */
export async function writeLog(
  row: EmailLogRow,
  client: LogClient = createServiceClient(),
): Promise<void> {
  const { error } = await client.from("email_log").insert(row);
  if (error) throw new Error(`email_log insert failed: ${error.message}`);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`transport timed out after ${ms}ms`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Sends the confirmation email and records the attempt in email_log.
 * Never throws — email must not break the registration response.
 * Degraded mode: with no transport configured, logs as "queued" without sending.
 */
export async function sendConfirmationEmail(
  args: ConfirmationArgs,
  deps: SendDeps = {},
): Promise<void> {
  const log = deps.log ?? ((row: EmailLogRow) => writeLog(row));
  const row = await attemptSend(args, deps);
  // Logged once, after the outcome is settled: a log failure must never be
  // mistaken for a send failure, or a delivered pass gets recorded as "failed".
  try {
    await log(row);
  } catch (e) {
    // Nowhere left to record it but the server log. The caller is a
    // fire-and-forget after() block, so throwing would help nobody. The
    // registration id identifies the row; the address stays out of logs.
    console.error(
      `email_log write failed for ${row.registration_id} (status ${row.status}): ${errorMessage(e)}`,
    );
  }
}

async function attemptSend(args: ConfirmationArgs, deps: SendDeps): Promise<EmailLogRow> {
  const base = { registration_id: args.registrationId, to_email: args.to };
  try {
    const transport = deps.transport !== undefined ? deps.transport : selectTransport();
    if (!transport) return { ...base, status: "queued" };
    await withTimeout(
      transport.send(buildConfirmationMessage(args)),
      deps.timeoutMs ?? SEND_TIMEOUT_MS,
    );
    return { ...base, status: "sent" };
  } catch (e) {
    return { ...base, status: "failed", error: errorMessage(e) };
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
