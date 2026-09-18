/** Quotes a value only when it actually needs it (contains a comma, quote, or newline) --
 * matches how spreadsheet apps and QuickBooks' own CSV importer expect a field to be
 * escaped, and keeps a typical export mostly unquoted/readable when opened in a text editor. */
function toCsvValue(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Builds a CSV string (CRLF line endings, per RFC 4180) from a header row and data rows. */
export function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(toCsvValue).join(",")];
  for (const row of rows) lines.push(row.map(toCsvValue).join(","));
  return lines.join("\r\n");
}

/** Standard headers for a downloadable CSV Route Handler response. */
export function csvResponseHeaders(filenamePrefix: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv"`,
  };
}
