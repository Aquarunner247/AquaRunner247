"use client";

import { useState } from "react";
import { EquipmentKind } from "@/generated/prisma/enums";
import { applyInspectionReportExtraction } from "../../actions";
import type { ExtractedInspectionData } from "@/lib/inspection-report-extraction";

const inputClass = "rounded border border-brand-control px-2 py-1.5 text-sm";

type ReportOption = { id: string; label: string };
type ExistingEquipmentItem = { id: string; kind: string; make: string | null; model: string | null; serialNumber: string | null };

type Props = {
  customerId: string;
  bodyId: string;
  reports: ReportOption[];
  existingEquipment: ExistingEquipmentItem[];
  currentInspectorName: string | null;
  /** yyyy-mm-dd or null */
  currentLastInspectionDate: string | null;
  currentVolumeGallons: number | null;
  currentMaximumOccupancy: number | null;
};

/**
 * Triggers LLM extraction from an already-uploaded report, then shows the result as an
 * editable, per-field/per-equipment-row review form -- nothing is written to the database
 * until the admin submits "Apply selected", which posts to applyInspectionReportExtraction.
 * Results are grouped into three labeled subsections because they write to three different
 * parts of this page: Inspections' own inspectorName/lastInspectionDate, the Details
 * section's volumeGallons/maximumOccupancy, and the separate Equipment list -- not all
 * "inspections data" despite being read off an inspection report.
 */
export function InspectionReportReview({
  customerId,
  bodyId,
  reports,
  existingEquipment,
  currentInspectorName,
  currentLastInspectionDate,
  currentVolumeGallons,
  currentMaximumOccupancy,
}: Props) {
  const [reportId, setReportId] = useState(reports[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "reviewing" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedInspectionData | null>(null);

  async function handleExtract() {
    if (!reportId) return;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/inspection-reports/${reportId}/extract`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; data?: ExtractedInspectionData; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setErrorMessage(body.error || "Something went wrong reading that report.");
        setStatus("error");
        return;
      }
      setExtracted(body.data);
      setStatus("reviewing");
    } catch {
      setErrorMessage("Something went wrong reading that report.");
      setStatus("error");
    }
  }

  if (reports.length === 0) return null;

  return (
    <div className="mt-4 border-t border-brand-border pt-4">
      <p className="text-sm font-medium text-brand-ink">Read a report automatically</p>
      <p className="mt-1 text-xs text-brand-muted">
        Have a report read for inspector info, last inspection date, venue details, and equipment — you&rsquo;ll review and confirm
        everything below before anything is saved.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={reportId} onChange={(e) => setReportId(e.target.value)} className={inputClass}>
          {reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleExtract}
          disabled={status === "loading"}
          className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === "loading" ? "Reading…" : "Extract info"}
        </button>
        {status === "reviewing" ? (
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setExtracted(null);
            }}
            className="text-sm text-brand-muted underline"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {status === "error" && errorMessage ? <p className="mt-2 text-sm text-brand-danger">{errorMessage}</p> : null}

      {status === "reviewing" && extracted ? (
        <form
          action={applyInspectionReportExtraction}
          onSubmit={() => setStatus("idle")}
          className="mt-3 space-y-4 rounded border border-brand-border bg-brand-surface p-3"
        >
          <input type="hidden" name="bodyId" value={bodyId} />
          <input type="hidden" name="customerId" value={customerId} />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Inspection info</p>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="applyInspectorName"
                defaultChecked={extracted.inspectorName != null}
                disabled={extracted.inspectorName == null}
              />
              Inspector name
              <input
                name="inspectorName"
                defaultValue={extracted.inspectorName ?? ""}
                placeholder={currentInspectorName ?? "Not found on report"}
                className={`${inputClass} flex-1`}
              />
            </label>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="applyLastInspectionDate"
                defaultChecked={extracted.inspectionDate != null}
                disabled={extracted.inspectionDate == null}
              />
              Last inspection date
              <input type="date" name="lastInspectionDate" defaultValue={extracted.inspectionDate ?? ""} className={inputClass} />
              {currentLastInspectionDate ? <span className="text-xs text-brand-muted">currently {currentLastInspectionDate}</span> : null}
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Venue details</p>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="applyVolumeGallons"
                defaultChecked={extracted.volumeGallons != null}
                disabled={extracted.volumeGallons == null}
              />
              Volume (gallons)
              <input type="number" name="volumeGallons" defaultValue={extracted.volumeGallons ?? ""} className={inputClass} />
              {currentVolumeGallons != null ? <span className="text-xs text-brand-muted">currently {currentVolumeGallons}</span> : null}
            </label>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="applyMaximumOccupancy"
                defaultChecked={extracted.maximumOccupancy != null}
                disabled={extracted.maximumOccupancy == null}
              />
              Max occupancy
              <input type="number" name="maximumOccupancy" defaultValue={extracted.maximumOccupancy ?? ""} className={inputClass} />
              {currentMaximumOccupancy != null ? (
                <span className="text-xs text-brand-muted">currently {currentMaximumOccupancy}</span>
              ) : null}
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Equipment found</p>
            <input type="hidden" name="equipmentCount" value={extracted.equipment.length} />
            {extracted.equipment.length === 0 ? (
              <p className="mt-1 text-sm text-brand-muted">No equipment found on this report.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {extracted.equipment.map((eq, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded border border-brand-border bg-white p-2 text-sm">
                    <input type="checkbox" name={`equipment_${i}_include`} defaultChecked />
                    <select name={`equipment_${i}_kind`} defaultValue={eq.kind} className={inputClass}>
                      {Object.values(EquipmentKind).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <input name={`equipment_${i}_make`} defaultValue={eq.make ?? ""} placeholder="Make" className={inputClass} />
                    <input name={`equipment_${i}_model`} defaultValue={eq.model ?? ""} placeholder="Model" className={inputClass} />
                    <input
                      name={`equipment_${i}_serialNumber`}
                      defaultValue={eq.serialNumber ?? ""}
                      placeholder="Serial #"
                      className={inputClass}
                    />
                  </li>
                ))}
              </ul>
            )}

            {existingEquipment.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs text-brand-muted">Already on file for this venue — check above for overlap before applying:</p>
                <ul className="mt-1 space-y-0.5 text-xs text-brand-muted">
                  {existingEquipment.map((eq) => (
                    <li key={eq.id}>
                      {eq.kind}
                      {eq.make ? ` — ${eq.make}` : ""}
                      {eq.model ? ` ${eq.model}` : ""}
                      {eq.serialNumber ? ` (#${eq.serialNumber})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <button type="submit" className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white">
            Apply selected
          </button>
        </form>
      ) : null}
    </div>
  );
}
