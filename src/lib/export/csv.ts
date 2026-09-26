/**
 * A minimal RFC 4180 writer tuned for the spreadsheets organizers actually use:
 * Excel and Google Sheets.
 */

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Characters that make a spreadsheet treat a cell as a formula (OWASP "CSV
 * injection"). Tab and carriage return are included because some importers
 * strip them and then evaluate what follows.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);

  // Checked against the trimmed value: leading spaces are dropped by some
  // importers, which would otherwise expose the formula underneath.
  let text = value;
  if (FORMULA_START.test(text) || FORMULA_START.test(text.trimStart())) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CRLF rows behind a UTF-8 BOM: without the BOM Excel reads the file as the
 *  system codepage and mangles every ñ and em dash. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
