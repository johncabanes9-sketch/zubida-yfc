// Proves the registrant CSV export: well-formed for Excel and Google Sheets,
// safe against formula injection from what registrants typed, and free of the
// pass secret. Needs no database.
//
// Every value in this file came from the public registration form, so a cell
// is attacker-controlled until proven otherwise: "=HYPERLINK(...)" typed as a
// chapter name becomes a live formula on an organizer's laptop.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, got) => c
  ? (pass++, console.log(`  PASS  ${n}`))
  : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));
const code = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { return ""; } };

const { toCsv, csvCell } = await import("../src/lib/export/csv.ts");
const { REGISTRANT_COLUMNS, REGISTRANT_SELECT, registrantsCsv, exportFilename } = await import("../src/lib/export/registrants.ts");

console.log("\n── csvCell ──");

check("a plain value is left alone", csvCell("Pagadian") === "Pagadian", csvCell("Pagadian"));
check("a comma forces quoting", csvCell("Santos, Maria") === '"Santos, Maria"', csvCell("Santos, Maria"));
check("a quote is doubled inside quotes", csvCell('Say "hi"') === '"Say ""hi"""', csvCell('Say "hi"'));
check("a newline forces quoting", csvCell("line1\nline2") === '"line1\nline2"', csvCell("line1\nline2"));
check("null and undefined become empty", csvCell(null) === "" && csvCell(undefined) === "", [csvCell(null), csvCell(undefined)]);
check("booleans read as Yes / No", csvCell(true) === "Yes" && csvCell(false) === "No", [csvCell(true), csvCell(false)]);
check("numbers are written as numbers", csvCell(18) === "18", csvCell(18));
check("non-ASCII survives untouched", csvCell("Dumingag – Niño") === "Dumingag – Niño", csvCell("Dumingag – Niño"));

for (const [label, input] of [
  ["=", "=HYPERLINK(\"http://evil\",\"x\")"],
  ["+", "+63 917 000 0000"],
  ["-", "-2+3"],
  ["@", "@SUM(A1)"],
  ["a tab", "\t=1+1"],
  ["a carriage return", "\r=1+1"],
]) {
  const out = csvCell(input);
  const inner = out.startsWith('"') ? out.slice(1) : out;
  check(`a value starting with ${label} is neutralised with a leading apostrophe`, inner.startsWith("'"), out);
}
check("leading whitespace does not smuggle a formula past the guard",
  (() => { const o = csvCell("  =1+1"); return (o.startsWith('"') ? o.slice(1) : o).startsWith("'"); })(), csvCell("  =1+1"));

console.log("\n── toCsv ──");

const small = toCsv(["A", "B"], [["1", "x,y"], [null, true]]);
check("output starts with a UTF-8 BOM so Excel reads ñ correctly", small.charCodeAt(0) === 0xfeff, small.charCodeAt(0));
check("rows end with CRLF, as RFC 4180 and Excel expect", small === "﻿A,B\r\n1,\"x,y\"\r\n,Yes\r\n", small);

console.log("\n── registrantsCsv ──");

const reg = {
  registration_id: "ZYFC-A1B2-1234", status: "approved", created_at: "2026-09-20T02:30:00Z",
  full_name: "Maria Santos", nickname: "Mars", birthdate: "2008-05-01", age: 18, gender: "Female",
  email: "maria@example.org", phone: "+63 917 000 0000", chapter: "=cmd|' /C calc'!A0", cluster: "Cluster 1",
  parish: "St. Joseph", school: "ZSNHS", emergency_contact: "Ana Santos", emergency_number: "0917 111 2222",
  medical_concerns: "Asthma", food_restrictions: "No pork", shirt_size: "M", transport_needed: true, consent: true,
  qr_token: "3f2b8c1e-9a4d-4e6f-b1a2-7c8d9e0f1a2b", id: "8d7c-internal-uuid", event_id: "event-uuid",
  deleted_at: null, updated_at: "2026-09-20T02:30:00Z",
};
const csv = registrantsCsv([reg]);
const [header, row] = csv.replace(/^﻿/, "").split("\r\n");

check("the header lists every column in order", header === REGISTRANT_COLUMNS.map((c) => csvCell(c.header)).join(","), header);
check("the pass secret (qr_token) is never exported", !csv.includes(reg.qr_token), null);
check("no column is keyed on qr_token", !REGISTRANT_COLUMNS.some((c) => c.key === "qr_token"), REGISTRANT_COLUMNS.map((c) => c.key));
check("internal ids are not exported", !csv.includes(reg.id) && !csv.includes(reg.event_id), null);
check("the registration code is the first column", row.startsWith("ZYFC-A1B2-1234,"), row);
check("a formula typed as a chapter is neutralised", row.includes("'=cmd|"), row);
check("a +63 phone number is kept, not dropped, as text", row.includes("'+63 917 000 0000"), row);
check("the details organizers plan with are present",
  ["Asthma", "No pork", "Ana Santos", "0917 111 2222", ",M,"].every((s) => row.includes(s)), row);
check("an empty list still yields a header row", registrantsCsv([]).replace(/^﻿/, "") === header + "\r\n", registrantsCsv([]));

console.log("\n── Check-in columns ──");

// The organizer's post-event question is "who actually came". Arrived is
// derived from checked_in_at rather than stored, so the two can never disagree.
const cell = (r, h) => {
  const rows = registrantsCsv([r]).replace(/^﻿/, "").split("\r\n");
  const i = rows[0].split(",").indexOf(h);
  return i === -1 ? undefined : rows[1].split(",")[i];
};
const arrived = { ...reg, chapter: "Molave", checked_in_at: "2026-12-01T00:05:00Z", check_in_method: "qr",
  checked_in_by: "a9f1-door-volunteer-uuid" };
const absent = { ...reg, chapter: "Molave", checked_in_at: null, check_in_method: null, checked_in_by: null };
for (const h of ["Arrived", "Checked in at (Manila)", "Check-in method"]) {
  check(`the header carries "${h}"`, header.split(",").includes(h), header);
}
check("a checked-in registrant reads Arrived = Yes", cell(arrived, "Arrived") === "Yes", cell(arrived, "Arrived"));
check("check-in time is in Manila time", cell(arrived, "Checked in at (Manila)") === "2026-12-01 08:05",
  cell(arrived, "Checked in at (Manila)"));
check("a QR check-in reads QR", cell(arrived, "Check-in method") === "QR", cell(arrived, "Check-in method"));
check("a typed-code check-in reads Manual",
  cell({ ...arrived, check_in_method: "manual" }, "Check-in method") === "Manual",
  cell({ ...arrived, check_in_method: "manual" }, "Check-in method"));
check("a registrant who never arrived reads Arrived = No with blank time and method",
  cell(absent, "Arrived") === "No" && cell(absent, "Checked in at (Manila)") === ""
  && cell(absent, "Check-in method") === "", [cell(absent, "Arrived"), cell(absent, "Checked in at (Manila)")]);
// Who scanned the pass is an internal auth id, not something to forward.
check("the door volunteer's user id is never exported",
  !registrantsCsv([arrived]).includes(arrived.checked_in_by)
  && !REGISTRANT_SELECT.split(", ").includes("checked_in_by"), REGISTRANT_SELECT);
check("the select names each column once",
  new Set(REGISTRANT_SELECT.split(", ")).size === REGISTRANT_SELECT.split(", ").length, REGISTRANT_SELECT);
check("the select reads the check-in columns",
  ["checked_in_at", "check_in_method"].every((k) => REGISTRANT_SELECT.split(", ").includes(k)), REGISTRANT_SELECT);

console.log("\n── exportFilename ──");

const fn = exportFilename("Youth Camp: Pagadian / 2026", "2026-12-01");
check("the filename is safe for any OS", /^[a-z0-9-]+\.csv$/.test(fn), fn);
check("the filename carries the event date and name", fn.startsWith("2026-12-01-youth-camp-pagadian-2026"), fn);
check("a name with no ASCII still gets a usable filename",
  /^2026-12-01-registrants\.csv$/.test(exportFilename("—", "2026-12-01")), exportFilename("—", "2026-12-01"));

console.log("\n── The route ──");

const route = code("src/app/admin/events/[id]/export/route.ts");
check("the export route authorizes against the event's cluster", /requireClusterAccess\(/.test(route), null);
check("the registrant read goes through the RLS-bound client", /createServerSupabase\(\)/.test(route), null);
check("the registrant read selects only exported columns, never qr_token",
  /REGISTRANT_SELECT/.test(route) && !/qr_token/.test(route) && !/select\(\s*["']\*["']/.test(route), null);
check("the export is audited", /audit_log/.test(route), null);
check("the response is never cached", /no-store/.test(route), null);
check("the events list offers the export", /\/export/.test(code("src/app/admin/events/_components/events-table.tsx")), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
