"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { importCustomers, type ImportCustomersResult } from "./actions";
import {
  normalizeImportRow,
  validateCustomerImportRow,
  type CustomerImportRaw,
  type ValidatedCustomerImportRow,
} from "@/lib/customer-import";

type PreviewRow = ValidatedCustomerImportRow & { raw: CustomerImportRaw };

export function CustomerImportForm() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [detectedCrmExport, setDetectedCrmExport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportCustomersResult | null>(null);

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.length - validCount;

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        setDetectedCrmExport(headers.includes("FullName") && headers.includes("LocationAddress"));
        const parsed = results.data.map((sourceRow, i) => {
          const raw = normalizeImportRow(sourceRow, headers);
          return { ...validateCustomerImportRow(raw, i + 2), raw };
        });
        setRows(parsed);
      },
      error: (err) => {
        setParseError(err.message);
        setRows([]);
      },
    });
    // Reset so choosing the same filename again (after fixing it) still fires onChange.
    e.target.value = "";
  }

  async function handleImport() {
    setImporting(true);
    setResult(null);
    const validRows = rows.filter((r) => r.errors.length === 0).map((r) => ({ rowNumber: r.rowNumber, raw: r.raw }));
    const res = await importCustomers(validRows);
    setImporting(false);
    setResult(res);
    // Drop the rows that actually got created from the preview -- keep client-side error
    // rows and anything the server rejected so the admin can still see + fix what's left.
    setRows((prev) => prev.filter((r) => r.errors.length > 0 || res.failed.some((f) => f.rowNumber === r.rowNumber)));
  }

  return (
    <div className="space-y-6">
      <div className="app-card">
        <h2 className="text-sm font-semibold text-brand-ink">1. Get your CSV ready</h2>
        <p className="app-subhead">
          Fill in one row per customer using our template — only &ldquo;Customer Name&rdquo; is required. Already have a contacts
          export from another pool-route system? Upload it as-is; a recognized export format is detected and mapped
          automatically.
        </p>
        <a href="/templates/customer-import-template.csv" download className="app-btn-secondary-sm mt-3 inline-flex">
          Download CSV template
        </a>
      </div>

      <div className="app-card">
        <h2 className="text-sm font-semibold text-brand-ink">2. Upload your CSV</h2>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="app-field mt-3" />
        {parseError ? <p className="mt-2 text-sm text-brand-danger">{parseError}</p> : null}
        {detectedCrmExport ? (
          <p className="mt-2 text-sm text-brand-muted">
            Recognized a pool-route CRM contacts export — mapped automatically. Property type was inferred from
            whether each row is a company account; body-of-water details weren&rsquo;t in that export, so add each
            pool/spa afterward from the customer&rsquo;s page.
          </p>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="app-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-brand-ink">3. Review &amp; import</h2>
            <p className="text-sm text-brand-muted">
              <span className="font-semibold text-brand-ink">{validCount}</span> ready to import
              {errorCount > 0 ? (
                <>
                  {" "}
                  · <span className="font-semibold text-brand-danger">{errorCount}</span> with errors (skipped)
                </>
              ) : null}
            </p>
          </div>

          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-brand-icon">
                  <th className="py-1 pr-2">Row</th>
                  <th className="py-1 pr-2">Customer</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 pr-2">City/State</th>
                  <th className="py-1 pr-2">Body of water</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowNumber} className="border-t border-brand-border/70">
                    <td className="py-1 pr-2 app-metric">{r.rowNumber}</td>
                    <td className="py-1 pr-2">{r.name || <span className="text-brand-muted">—</span>}</td>
                    <td className="py-1 pr-2">{r.propertyType}</td>
                    <td className="py-1 pr-2">{[r.city, r.region].filter(Boolean).join(", ") || "—"}</td>
                    <td className="py-1 pr-2">{r.bodyOfWaterName ?? "—"}</td>
                    <td className="py-1">
                      {r.errors.length === 0 ? (
                        <span className="app-badge">OK</span>
                      ) : (
                        <span className="text-brand-danger">{r.errors.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={() => void handleImport()} disabled={importing || validCount === 0} className="app-btn-primary mt-4">
            {importing ? "Importing…" : `Import ${validCount} customer${validCount === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="app-card">
          <p className="text-sm font-semibold text-brand-ink">
            {result.createdCount} customer{result.createdCount === 1 ? "" : "s"} imported.
          </p>
          {result.matched.length > 0 ? (
            <p className="mt-1 text-sm text-brand-muted">
              {result.matched.length} row{result.matched.length === 1 ? "" : "s"} matched an existing customer by name —
              blank fields were filled in, nothing already on file was changed, and no duplicates were created.
            </p>
          ) : null}
          {result.failed.length > 0 ? (
            <p className="mt-1 text-sm text-brand-danger">
              {result.failed.length} row{result.failed.length === 1 ? "" : "s"} couldn&rsquo;t be imported — see the table above.
            </p>
          ) : null}
          {result.createdCount > 0 ? (
            <p className="app-subhead mt-2">
              Imported properties aren&rsquo;t geocoded yet — visit{" "}
              <Link href="/dashboard/routes" className="app-link">
                Routes
              </Link>{" "}
              to place them for route planning.
            </p>
          ) : null}
          <Link href="/dashboard/customers" className="app-link mt-3 inline-block">
            Back to customers
          </Link>
        </div>
      ) : null}
    </div>
  );
}
