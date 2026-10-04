// Proves the admin image uploaders refuse an oversized photo in the browser,
// before it is sent.
//
// A server action request on Vercel is capped at 4.5MB, and Next's own default
// is 1MB. A phone photo above the cap died in transit with a generic error, or
// (for event images, which sent every selected file in ONE request) a handful
// of ordinary photos failed together. Each uploader now checks each file
// against a 4MB cap first and sends one file per request. Needs no database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));
const read = (p) => readFileSync(join(root, p), "utf8");

const { MAX_UPLOAD_BYTES, uploadTooLarge } = await import("../src/lib/images/upload-limit.ts");
const { MAX_BYTES } = await import("../src/lib/images/validate.ts");

console.log("\n── The cap ──");

const MB = 1024 * 1024;
check("the cap is 4MB", MAX_UPLOAD_BYTES === 4 * MB, MAX_UPLOAD_BYTES);
check("the cap fits under Vercel's 4.5MB request limit", MAX_UPLOAD_BYTES < 4.5 * MB, MAX_UPLOAD_BYTES);
check("the cap is no looser than the server's validateImage", MAX_UPLOAD_BYTES <= MAX_BYTES, { MAX_UPLOAD_BYTES, MAX_BYTES });

const config = read("next.config.mjs");
const limit = Number(/bodySizeLimit:\s*["'](\d+)mb["']/i.exec(config)?.[1]);
check("server actions accept a capped photo plus multipart overhead", limit * MB > MAX_UPLOAD_BYTES, limit);

console.log("\n── uploadTooLarge ──");

check("a file at the cap is accepted", uploadTooLarge({ name: "a.jpg", size: 4 * MB }) === null, null);
check("a small file is accepted", uploadTooLarge({ name: "a.jpg", size: 300_000 }) === null, null);
const msg = uploadTooLarge({ name: "IMG_2041.jpg", size: 4 * MB + 1 });
check("one byte over the cap is refused", typeof msg === "string", msg);
check("the message names the file", /IMG_2041\.jpg/.test(msg ?? ""), msg);
check("the message states the limit", /4MB/.test(msg ?? ""), msg);
check("the message says what to do", /resize|compress/i.test(msg ?? ""), msg);

console.log("\n── Every admin uploader uses it ──");

const uploaders = [
  "src/app/admin/chapters/_components/chapter-form.tsx",
  "src/app/admin/pages/_components/page-editor.tsx",
  "src/app/admin/events/_components/event-images-manager.tsx",
];
for (const p of uploaders) {
  const src = read(p);
  // Imported AND used (called, or passed to .map) — not merely imported.
  const uses = src.split("\n").filter((l) => /\buploadTooLarge\b/.test(l) && !/^\s*import\b/.test(l));
  check(`${p.split("/").pop()} checks the size before sending`, uses.length > 0, uses);
}

const events = read("src/app/admin/events/_components/event-images-manager.tsx");
check("event images are sent one file per request", /for\s*\(\s*const\s+\w+\s+of\s+files\s*\)[\s\S]{0,400}uploadEventImages\(/.test(events), null);
check("event images no longer advertise the 5MB server limit", !/MAX_BYTES\s*\/\s*1024/.test(events), null);

console.log("\n── Forms keep what was typed when a save is refused ──");

// React 19 resets an uncontrolled <form action={fn}> as soon as fn returns,
// even when the server refused the save, so the admin retypes everything.
// onSubmit + preventDefault leaves the fields alone.
for (const p of ["src/app/admin/chapters/_components/chapter-form.tsx", "src/app/admin/pages/_components/page-editor.tsx"]) {
  const src = read(p);
  check(`${p.split("/").pop()} has no client <form action>`, !/<form[^>]*\saction=\{/.test(src), null);
  check(`${p.split("/").pop()} prevents the default submit`, /preventDefault\(\)/.test(src), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
