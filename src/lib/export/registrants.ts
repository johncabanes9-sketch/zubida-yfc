// Relative, with extensions: prove:export imports this module under plain
// Node, which resolves neither the "@/" alias nor an extensionless specifier.
import { toCsv, type CsvValue } from "./csv.ts";

type Registrant = Record<string, unknown>;

type Column = {
  key: string;
  header: string;
  format?: (value: unknown) => CsvValue;
};

/** Registration time in the province's own clock, not UTC. */
const manilaTime = (value: unknown): CsvValue => {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

/**
 * What an organizer plans an event with. Deliberately NOT here:
 * - qr_token — it is the pass's secret; anyone holding it can present the
 *   pass and open the status page. A spreadsheet gets forwarded.
 * - internal ids (id, event_id) and bookkeeping (updated_at, deleted_at).
 * The route selects exactly these keys (REGISTRANT_SELECT), so an omitted
 * column never even leaves the database.
 */
export const REGISTRANT_COLUMNS: readonly Column[] = [
  { key: "registration_id", header: "Registration code" },
  { key: "status", header: "Status" },
  { key: "created_at", header: "Registered at (Manila)", format: manilaTime },
  { key: "full_name", header: "Full name" },
  { key: "nickname", header: "Nickname" },
  { key: "birthdate", header: "Birthdate" },
  { key: "age", header: "Age" },
  { key: "gender", header: "Gender" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "chapter", header: "Chapter" },
  { key: "cluster", header: "Cluster" },
  { key: "parish", header: "Parish" },
  { key: "school", header: "School" },
  { key: "emergency_contact", header: "Emergency contact" },
  { key: "emergency_number", header: "Emergency number" },
  { key: "medical_concerns", header: "Medical concerns" },
  { key: "food_restrictions", header: "Food restrictions" },
  { key: "shirt_size", header: "Shirt size" },
  { key: "transport_needed", header: "Needs transport" },
  { key: "consent", header: "Consent given" },
];

export const REGISTRANT_SELECT = REGISTRANT_COLUMNS.map((c) => c.key).join(", ");

export function registrantsCsv(rows: readonly Registrant[]): string {
  return toCsv(
    REGISTRANT_COLUMNS.map((c) => c.header),
    rows.map((r) => REGISTRANT_COLUMNS.map((c) => (c.format ? c.format(r[c.key]) : (r[c.key] as CsvValue)))),
  );
}

/** e.g. 2026-12-01-youth-camp-pagadian.csv — safe on every OS. */
export function exportFilename(eventName: string, eventDate: string): string {
  const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "registrants";
  const date = /^\d{4}-\d{2}-\d{2}/.test(eventDate) ? eventDate.slice(0, 10) : "event";
  return `${date}-${slug}.csv`;
}
