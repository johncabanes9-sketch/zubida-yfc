// Proves the confirmation-email plumbing. No network, no database — every
// assertion is about the pure functions that decide what gets sent and how:
//
//   1. The QR travels as an inline `cid:` attachment, not a data URL.
//      Gmail and most webmail clients drop `data:` image sources; a QR that
//      does not render is a registrant turned away at the venue door.
//   2. Transport selection prefers Resend, falls back to Gmail, and degrades
//      to log-only — driven by env vars alone, never by a hardcoded default.
//   3. The template escapes the registrant-supplied name.
//
// Run: npm run prove:email
const { parseDataUrl } = await import("../src/lib/email/data-url.ts");
const { buildConfirmationMessage, QR_CID } = await import(
  "../src/lib/email/confirmation-message.ts"
);
const { selectTransport } = await import("../src/lib/email/transports/index.ts");

let pass = 0,
  fail = 0;
const check = (n, c, got) =>
  c
    ? (pass++, console.log(`  PASS  ${n}`))
    : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// A 1x1 PNG, base64 — stands in for the real QR.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const DATA_URL = `data:image/png;base64,${PNG_B64}`;

// ── 1. Data URL parsing ────────────────────────────────────────────────────
const parsed = parseDataUrl(DATA_URL);
check("a base64 data URL yields its MIME type", parsed?.contentType === "image/png", parsed?.contentType);
check(
  "the decoded bytes are a real PNG (magic number)",
  parsed?.content.subarray(0, 4).toString("hex") === "89504e47",
  parsed?.content.subarray(0, 4).toString("hex"),
);
check(
  "the decoded bytes round-trip to the original base64",
  parsed?.content.toString("base64") === PNG_B64,
  parsed?.content.toString("base64"),
);
check("a plain https URL is not a data URL", parseDataUrl("https://x.test/qr.png") === null, "not-null");
check("a non-base64 data URL is rejected", parseDataUrl("data:image/png,rawbytes") === null, "not-null");
check("an empty string is rejected", parseDataUrl("") === null, "not-null");

// ── 2. Message construction ────────────────────────────────────────────────
const msg = buildConfirmationMessage({
  to: "registrant@example.test",
  fullName: 'Maria <script>alert("x")</script> Santos',
  eventName: "Youth Congress 2026",
  registrationId: "ZYFC-000123",
  qrDataUrl: DATA_URL,
  statusUrl: "https://zubidayfc.org/status/abc",
});

check("the recipient is carried through", msg.to === "registrant@example.test", msg.to);
check("the subject names the event", msg.subject === "You're registered for Youth Congress 2026", msg.subject);
check("exactly one inline image is attached", msg.inlineImages?.length === 1, msg.inlineImages?.length);
check("the attachment carries the QR content id", msg.inlineImages?.[0].cid === QR_CID, msg.inlineImages?.[0]?.cid);
check(
  "the attachment content type comes from the data URL",
  msg.inlineImages?.[0].contentType === "image/png",
  msg.inlineImages?.[0]?.contentType,
);
check(
  "the attachment holds the decoded bytes, not the base64 text",
  Buffer.isBuffer(msg.inlineImages?.[0].content) &&
    msg.inlineImages[0].content.toString("base64") === PNG_B64,
  typeof msg.inlineImages?.[0]?.content,
);

// The regression this suite exists for. If the QR is ever emitted as a data
// URL again, Gmail shows a broken image and the pass is unusable.
check('the html references the QR as "cid:"', msg.html.includes(`src="cid:${QR_CID}"`), false);
check("the html contains no data: image source", !msg.html.includes("data:image"), false);

// Fallback: a hosted URL is passed through untouched, with no attachment.
const hosted = buildConfirmationMessage({
  to: "a@b.test",
  fullName: "Ana",
  eventName: "E",
  registrationId: "R",
  qrDataUrl: "https://cdn.test/qr.png",
  statusUrl: "https://zubidayfc.org/status/x",
});
check("a hosted QR URL is used as-is", hosted.html.includes('src="https://cdn.test/qr.png"'), false);
check("a hosted QR URL attaches nothing", hosted.inlineImages === undefined, hosted.inlineImages);

// The name is registrant-supplied and reaches an HTML body.
check(
  "the registrant's name is HTML-escaped",
  msg.html.includes("&lt;script&gt;") && !msg.html.includes("<script>"),
  false,
);
check("the status link is present", msg.html.includes("https://zubidayfc.org/status/abc"), false);
check("the registration id is shown", msg.html.includes("ZYFC-000123"), false);

// ── 3. Transport selection ─────────────────────────────────────────────────
const fake = (name, configured) => ({
  name,
  isConfigured: () => configured,
  send: async () => {},
});

check(
  "with both configured, the first (Resend) wins",
  selectTransport([fake("resend", true), fake("gmail", true)])?.name === "resend",
  selectTransport([fake("resend", true), fake("gmail", true)])?.name,
);
check(
  "with only Gmail configured, Gmail is selected",
  selectTransport([fake("resend", false), fake("gmail", true)])?.name === "gmail",
  selectTransport([fake("resend", false), fake("gmail", true)])?.name,
);
check(
  "with none configured, selection returns null (degraded mode)",
  selectTransport([fake("resend", false), fake("gmail", false)]) === null,
  "not-null",
);

// The real transports must read env at call time, not at import time — a key
// set in Vercel after cold start must still be picked up.
const { resendTransport } = await import("../src/lib/email/transports/resend.ts");
const { gmailTransport } = await import("../src/lib/email/transports/gmail.ts");

const restore = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
};
delete process.env.RESEND_API_KEY;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;

check("Resend is unconfigured with no API key", resendTransport.isConfigured() === false, true);
check("Gmail is unconfigured with no credentials", gmailTransport.isConfigured() === false, true);
check(
  "selection degrades to null when the environment is empty",
  selectTransport() === null,
  "not-null",
);

process.env.GMAIL_USER = "someone@gmail.com";
check(
  "a Gmail user without an app password is still unconfigured",
  gmailTransport.isConfigured() === false,
  true,
);
process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
check("Gmail is configured once both vars are set", gmailTransport.isConfigured() === true, false);
check("selection now picks Gmail", selectTransport()?.name === "gmail", selectTransport()?.name);

process.env.RESEND_API_KEY = "re_test_key";
check("Resend outranks Gmail once its key appears", selectTransport()?.name === "resend", selectTransport()?.name);

// -- 4. The mailed link's base never comes from the request ----------------
// statusUrl() carries the registration id and the qr_token — the event pass —
// and the register route used to build it from req.nextUrl.origin, which is
// the Host header. A registration POSTed with a spoofed Host would mail that
// token to a domain the sender chose, and encode it in the QR as well.
const { pickLinkBase } = await import("../src/lib/qr.ts");
const CONFIGURED = "https://zubidayfc.org";

check(
  "production ignores the request origin entirely",
  pickLinkBase({ requestOrigin: "https://evil.test", configuredUrl: CONFIGURED, isProduction: true }) ===
    CONFIGURED,
  pickLinkBase({ requestOrigin: "https://evil.test", configuredUrl: CONFIGURED, isProduction: true }),
);
check(
  "production ignores the request origin even when it looks local",
  pickLinkBase({ requestOrigin: "http://localhost:3000", configuredUrl: CONFIGURED, isProduction: true }) ===
    CONFIGURED,
  null,
);
// A link mailed from a dev server has to be clickable, or nobody can test the
// flow. That convenience is limited to loopback: a spoofed Host must not win
// even in development.
check(
  "development keeps a loopback origin clickable",
  pickLinkBase({ requestOrigin: "http://localhost:3000", configuredUrl: CONFIGURED, isProduction: false }) ===
    "http://localhost:3000",
  pickLinkBase({ requestOrigin: "http://localhost:3000", configuredUrl: CONFIGURED, isProduction: false }),
);
check(
  "development still refuses a spoofed host",
  pickLinkBase({ requestOrigin: "https://evil.test", configuredUrl: CONFIGURED, isProduction: false }) ===
    CONFIGURED,
  pickLinkBase({ requestOrigin: "https://evil.test", configuredUrl: CONFIGURED, isProduction: false }),
);
check(
  "a blank configured URL falls back to the constant, not to the request",
  pickLinkBase({ requestOrigin: "https://evil.test", configuredUrl: "   ", isProduction: true }) !==
    "https://evil.test",
  pickLinkBase({ requestOrigin: "https://evil.test", configuredUrl: "   ", isProduction: true }),
);

const routeSrc = (await import("node:fs")).readFileSync("src/app/api/register/route.ts", "utf8");
check(
  "the register route no longer bases the mailed link on req.nextUrl.origin",
  !/statusUrl\(\s*req\.nextUrl\.origin/.test(routeSrc),
  null,
);

// The status link reaches an href. It is the one interpolation the template
// was not escaping.
const hrefSafe = buildConfirmationMessage({
  to: "a@b.test",
  fullName: "Ana",
  eventName: "E",
  registrationId: "R",
  qrDataUrl: DATA_URL,
  statusUrl: 'https://x.test/s?a=1"><script>alert(1)</script>',
});
check(
  "the status link is escaped before it reaches the href",
  !hrefSafe.html.includes("<script>alert(1)</script>"),
  null,
);

// -- 5. What actually gets written to email_log -----------------------------
// The branchiest function in this module had no coverage: it decides sent vs
// queued vs failed, and it is the only record that a registrant's pass ever
// left the building. Its bugs are invisible in production precisely because it
// never throws.
const { sendConfirmationEmail } = await import("../src/lib/email/send.ts");

const ARGS = {
  to: "registrant@example.test",
  fullName: "Ana",
  eventName: "Camp",
  registrationId: "ZYFC-000999",
  qrDataUrl: DATA_URL,
  statusUrl: "https://zubidayfc.org/status/x",
};
const capture = () => {
  const rows = [];
  return { rows, log: async (row) => { rows.push(row); } };
};

// Sent.
const okT = capture();
let delivered = null;
await sendConfirmationEmail(ARGS, {
  transport: { name: "fake", isConfigured: () => true, send: async (m) => { delivered = m; } },
  log: okT.log,
});
check("a successful send logs exactly one row", okT.rows.length === 1, okT.rows.length);
check("a successful send logs status sent", okT.rows[0]?.status === "sent", okT.rows[0]?.status);
check("the row carries the registration id", okT.rows[0]?.registration_id === ARGS.registrationId, okT.rows[0]);
check("the row carries the recipient", okT.rows[0]?.to_email === ARGS.to, okT.rows[0]);
check("the transport received the built message", delivered?.subject === "You're registered for Camp", delivered?.subject);

// Degraded: no transport configured.
const degraded = capture();
await sendConfirmationEmail(ARGS, { transport: null, log: degraded.log });
check("no transport logs status queued", degraded.rows[0]?.status === "queued", degraded.rows[0]?.status);
check("no transport records no error", degraded.rows[0]?.error === undefined, degraded.rows[0]?.error);

// Failed.
const broken = capture();
await sendConfirmationEmail(ARGS, {
  transport: { name: "fake", isConfigured: () => true, send: async () => { throw new Error("mailbox full"); } },
  log: broken.log,
});
check("a throwing transport logs status failed", broken.rows[0]?.status === "failed", broken.rows[0]?.status);
check("the failure message is recorded", broken.rows[0]?.error === "mailbox full", broken.rows[0]?.error);

// Hung. Without a ceiling this produces NO row at all — the send never settles,
// so neither insert runs and the platform kills the function mid-flight.
const hung = capture();
await sendConfirmationEmail(ARGS, {
  transport: { name: "fake", isConfigured: () => true, send: () => new Promise(() => {}) },
  log: hung.log,
  timeoutMs: 40,
});
check("a hung transport still produces a row", hung.rows.length === 1, hung.rows.length);
check("a hung transport logs status failed", hung.rows[0]?.status === "failed", hung.rows[0]?.status);
check("the timeout says so in the error", /timed out/i.test(hung.rows[0]?.error ?? ""), hung.rows[0]?.error);

// The promise this function makes to its caller: it never throws, whatever
// happens — including the log write itself failing.
let threw = false;
try {
  await sendConfirmationEmail(ARGS, {
    transport: { name: "fake", isConfigured: () => true, send: async () => { throw new Error("x"); } },
    log: async () => { throw new Error("database down"); },
  });
} catch { threw = true; }
check("a failing log write never throws at the caller", threw === false, threw);

// supabase-js does not throw on a failed insert — it resolves `{ error }`. A
// writer that ignores it turns an RLS denial or schema drift into silence.
const { writeLog } = await import("../src/lib/email/send.ts");
const fakeClient = (result) => {
  const inserted = [];
  return {
    inserted,
    from: (table) => ({
      insert: async (row) => {
        inserted.push({ table, row });
        return result;
      },
    }),
  };
};
const ROW = { registration_id: "ZYFC-000999", to_email: ARGS.to, status: "sent" };

const okClient = fakeClient({ error: null });
let okThrew = null;
await writeLog(ROW, okClient).then(() => (okThrew = false), () => (okThrew = true));
check(
  "writeLog inserts the row into email_log",
  okThrew === false && okClient.inserted[0]?.table === "email_log" && okClient.inserted[0]?.row === ROW,
  { okThrew, inserted: okClient.inserted },
);

let rejected = null;
await writeLog(ROW, fakeClient({ error: { message: "new row violates row-level security" } })).then(
  () => (rejected = null),
  (e) => (rejected = e),
);
check(
  "writeLog rejects when the insert resolves { error }",
  rejected instanceof Error && /row-level security/.test(rejected.message),
  rejected && String(rejected),
);

// A delivered email whose log write fails must not be re-recorded as "failed":
// a replay reading that row would send the pass twice.
const attempts = [];
const origError = console.error;
const reported = [];
console.error = (...a) => reported.push(a.map(String).join(" "));
try {
  await sendConfirmationEmail(ARGS, {
    transport: { name: "fake", isConfigured: () => true, send: async () => {} },
    log: async (row) => {
      attempts.push(row.status);
      throw new Error("database down");
    },
  });
} finally {
  console.error = origError;
}
check(
  "a sent email whose log write fails is not re-logged as failed",
  attempts.length === 1 && attempts[0] === "sent",
  attempts,
);
check(
  "a failed log write is reported, with the registration id",
  reported.length === 1 && reported[0].includes(ARGS.registrationId) && reported[0].includes("database down"),
  reported,
);
check(
  "the report does not carry the registrant's email address",
  reported.every((r) => !r.includes(ARGS.to)),
  reported,
);

for (const [k, v] of Object.entries(restore)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
