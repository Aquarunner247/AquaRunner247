"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CameraCapture } from "@/app/components/camera-capture";

type Dose = {
  id: string;
  productName: string;
  quantity: string;
  unit: string;
};

type Reading = {
  ph: string;
  freeChlorinePpm: string;
  alkalinityPpm: string;
  cyanuricAcidPpm: string;
  temperatureF: string;
  pumpPressurePsi: string;
  vacGaugeReading: string;
  flowMeterGpm: string;
  filterPressurePsi: string;
  filterGaugeReading: string;
};

const defaultReading: Reading = {
  ph: "",
  freeChlorinePpm: "",
  alkalinityPpm: "",
  cyanuricAcidPpm: "",
  temperatureF: "",
  pumpPressurePsi: "",
  vacGaugeReading: "",
  flowMeterGpm: "",
  filterPressurePsi: "",
  filterGaugeReading: "",
};

type FieldConfig = {
  key: keyof Reading;
  label: string;
  unit: string;
  required?: boolean;
  wholeNumber?: boolean;
  placeholder?: string;
};

const CHEMISTRY_FIELDS = (bodyOfWaterType: string, cyaRequired: boolean): FieldConfig[] => [
  {
    key: "freeChlorinePpm",
    label: "Free Chlorine",
    unit: `ppm, min ${bodyOfWaterType === "SPA" ? 3 : 2}, max 10`,
    required: true,
    wholeNumber: true,
  },
  { key: "ph", label: "pH", unit: "", required: true, placeholder: "7" },
  { key: "alkalinityPpm", label: "Total Alkalinity", unit: "ppm", required: true, wholeNumber: true },
  {
    key: "cyanuricAcidPpm",
    label: "Cyanuric Acid",
    unit: cyaRequired ? "ppm" : "ppm, checked in the last 30 days",
    required: cyaRequired,
    wholeNumber: true,
  },
  { key: "temperatureF", label: "Water Temperature", unit: "°F", wholeNumber: true },
];

const EQUIPMENT_FIELDS: FieldConfig[] = [
  { key: "pumpPressurePsi", label: "Pump Pressure", unit: "psi", required: true, wholeNumber: true },
  { key: "vacGaugeReading", label: "Pump Vacuum Gauge", unit: "inHg", required: true, wholeNumber: true },
  { key: "filterPressurePsi", label: "Filter Pressure", unit: "psi", required: true, wholeNumber: true },
  { key: "filterGaugeReading", label: "Filter Gauge", unit: "", wholeNumber: true },
  { key: "flowMeterGpm", label: "Flow Meter", unit: "gpm", required: true, wholeNumber: true },
];

type ChemicalProductOption = { id: string; name: string; unit: string };
type ChecklistItemOption = { id: string; label: string; completed: boolean };
type IssueOption = { id: string; description: string | null; severity: string; createdAt: string };

type Props = {
  visitId: string;
  visitStatus: string;
  bodyOfWaterType: string;
  cyaRequired: boolean;
  chemicalProducts: ChemicalProductOption[];
  checklistItems: ChecklistItemOption[];
  initialIssues: IssueOption[];
  initialReading: Record<string, unknown> | null;
  initialPhotoCount: number;
  initialDoses: Dose[];
};

function toInput(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toTimeInput(v: unknown): string {
  if (!v) return "";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return "";
  return d.toTimeString().slice(0, 5); // "HH:MM"
}

/** lbs dose quantities snap to quarter-pound increments, gallons to half-gallon, everything else whole units. */
function doseStepFor(unit: string): number {
  const u = unit.toLowerCase();
  if (u.includes("lb")) return 0.25;
  if (u.includes("gal")) return 0.5;
  return 1;
}

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value / step) * step;
}

export function VisitForm({ visitId, visitStatus, bodyOfWaterType, cyaRequired, chemicalProducts, checklistItems: initialChecklistItems, initialIssues, initialReading, initialPhotoCount, initialDoses }: Props) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItemOption[]>(initialChecklistItems);
  const [issues, setIssues] = useState<IssueOption[]>(initialIssues);
  const [issueForm, setIssueForm] = useState({ description: "", severity: "MEDIUM" });
  const [reportingIssue, setReportingIssue] = useState(false);
  const [reading, setReading] = useState<Reading>({
    ph: toInput(initialReading?.ph),
    freeChlorinePpm: toInput(initialReading?.freeChlorinePpm),
    alkalinityPpm: toInput(initialReading?.alkalinityPpm),
    cyanuricAcidPpm: toInput(initialReading?.cyanuricAcidPpm),
    temperatureF: toInput(initialReading?.temperatureF),
    pumpPressurePsi: toInput(initialReading?.pumpPressurePsi),
    vacGaugeReading: toInput(initialReading?.vacGaugeReading),
    flowMeterGpm: toInput(initialReading?.flowMeterGpm),
    filterPressurePsi: toInput(initialReading?.filterPressurePsi),
    filterGaugeReading: toInput(initialReading?.filterGaugeReading),
  });
  const [backwashPerformed, setBackwashPerformed] = useState<boolean>(Boolean(initialReading?.backwashAt));
  const [backwashTime, setBackwashTime] = useState<string>(toTimeInput(initialReading?.backwashAt));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [photoCount, setPhotoCount] = useState(initialPhotoCount);
  const [doses, setDoses] = useState<Dose[]>(initialDoses);
  const [doseForm, setDoseForm] = useState({ chemicalProductId: "", quantity: "" });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);

  const isCompleted = visitStatus === "COMPLETED";
  const chemistryFields = CHEMISTRY_FIELDS(bodyOfWaterType, cyaRequired);
  const allFields = [...chemistryFields, ...EQUIPMENT_FIELDS];

  const requiredMissing = useMemo(() => {
    return allFields.some((f) => f.required && !reading[f.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

  async function saveReading(source: "auto" | "manual") {
    try {
      setSaveState("saving");
      const response = await fetch(`/api/visits/${visitId}/reading`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ph: reading.ph || null,
          freeChlorinePpm: reading.freeChlorinePpm || null,
          alkalinityPpm: reading.alkalinityPpm || null,
          cyanuricAcidPpm: reading.cyanuricAcidPpm || null,
          temperatureF: reading.temperatureF || null,
          pumpPressurePsi: reading.pumpPressurePsi || null,
          vacGaugeReading: reading.vacGaugeReading || null,
          flowMeterGpm: reading.flowMeterGpm || null,
          filterPressurePsi: reading.filterPressurePsi || null,
          filterGaugeReading: reading.filterGaugeReading || null,
          backwashPerformed,
          backwashAt: backwashPerformed && backwashTime ? `${new Date().toISOString().slice(0, 10)}T${backwashTime}:00` : null,
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      setSaveState("saved");
      setSaveMsg(source === "auto" ? "Autosaved" : "Saved");
    } catch {
      setSaveState("error");
      setSaveMsg("Save failed");
    }
  }

  useEffect(() => {
    if (isCompleted) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void saveReading("auto");
    }, 700);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, backwashPerformed, backwashTime, isCompleted]);

  async function addDose(e: FormEvent) {
    e.preventDefault();
    const response = await fetch(`/api/visits/${visitId}/doses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chemicalProductId: doseForm.chemicalProductId,
        quantity: Number(doseForm.quantity),
      }),
    });
    if (!response.ok) {
      setSaveState("error");
      setSaveMsg("Dose add failed");
      return;
    }
    const data = (await response.json()) as { dose: Dose };
    setDoses((prev) => [data.dose, ...prev]);
    setDoseForm({ chemicalProductId: "", quantity: "" });
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("capturedAt", new Date().toISOString());
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              formData.append("latitude", String(position.coords.latitude));
              formData.append("longitude", String(position.coords.longitude));
              formData.append("accuracyMeters", String(position.coords.accuracy));
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 7000 },
          );
        });
      }
      const response = await fetch(`/api/visits/${visitId}/photos`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Photo upload failed");
      setPhotoCount((n) => n + 1);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    setChecklistItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, completed } : it)));
    try {
      const response = await fetch(`/api/visits/${visitId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklistItemId: itemId, completed }),
      });
      if (!response.ok) throw new Error("Checklist save failed");
    } catch {
      // revert on failure
      setChecklistItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, completed: !completed } : it)));
      setSaveState("error");
      setSaveMsg("Checklist save failed");
    }
  }

  async function reportIssue(e: FormEvent) {
    e.preventDefault();
    if (!issueForm.description.trim()) return;
    setReportingIssue(true);
    try {
      const response = await fetch(`/api/visits/${visitId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: issueForm.description, severity: issueForm.severity }),
      });
      if (!response.ok) throw new Error("Issue report failed");
      const data = (await response.json()) as { issue: IssueOption };
      setIssues((prev) => [data.issue, ...prev]);
      setIssueForm({ description: "", severity: "MEDIUM" });
    } catch {
      setSaveState("error");
      setSaveMsg("Issue report failed");
    } finally {
      setReportingIssue(false);
    }
  }

  async function completeVisit() {
    const response = await fetch(`/api/visits/${visitId}/complete`, { method: "POST" });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const data = (await response.json()) as { error?: string };
    if (data.error === "MISSING_REQUIRED_PHOTO") {
      setSaveState("error");
      setSaveMsg("Need at least 1 photo before completion");
      return;
    }
    if (data.error === "MISSING_REQUIRED_READINGS") {
      setSaveState("error");
      setSaveMsg("Missing required readings");
      return;
    }
    setSaveState("error");
    setSaveMsg("Completion failed");
  }

  function renderField(f: FieldConfig) {
    return (
      <label key={f.key} className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[#4A6572]">
          {f.label}
          {f.required ? <span className="text-[#C1483B]"> *</span> : null}
          {f.unit ? <span className="ml-1 normal-case text-[#7FA0AC]">({f.unit})</span> : null}
        </span>
        <input
          type="number"
          step={f.wholeNumber ? "1" : "0.1"}
          placeholder={f.placeholder}
          value={reading[f.key]}
          disabled={isCompleted}
          onChange={(e) => {
            const raw = e.target.value;
            const value = f.wholeNumber && raw !== "" ? String(Math.round(Number(raw))) : raw;
            setReading((prev) => ({ ...prev, [f.key]: value }));
          }}
          className="rounded border border-[#C9E3EC] px-2 py-1.5 font-[family-name:var(--font-mono)] text-sm text-[#12234A] disabled:bg-[#EAF6FA]"
        />
      </label>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-[#12234A]">
            Save status:{" "}
            <span className="font-semibold">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? saveMsg || "Saved" : saveState === "error" ? saveMsg || "Error" : "Idle"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void saveReading("manual")}
            disabled={isCompleted}
            className="rounded border border-[#C9E3EC] px-3 py-1.5 text-sm font-medium text-[#12234A] disabled:opacity-50"
          >
            Save / Sync now
          </button>
        </div>
      </div>

      {checklistItems.length > 0 ? (
        <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">
            Service Checklist
          </h2>
          <ul className="mt-3 space-y-2">
            {checklistItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={isCompleted}
                  onClick={() => void toggleChecklistItem(item.id, !item.completed)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm font-medium transition disabled:opacity-60 ${
                    item.completed
                      ? "border-[#0A5FA4] bg-[#0A5FA4]/10 text-[#12234A]"
                      : "border-[#C9E3EC] bg-white text-[#12234A] hover:bg-[#EAF6FA]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      item.completed ? "border-[#0A5FA4] bg-[#0A5FA4] text-white" : "border-[#C9E3EC] text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className={item.completed ? "line-through decoration-[#0A5FA4]/60" : ""}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">Chemistry</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">{chemistryFields.map(renderField)}</div>
      </div>

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">Equipment</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">{EQUIPMENT_FIELDS.map(renderField)}</div>
      </div>

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">Backwash</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[#12234A]">
            <input
              type="radio"
              name="backwash"
              checked={!backwashPerformed}
              disabled={isCompleted}
              onChange={() => setBackwashPerformed(false)}
            />
            No
          </label>
          <label className="flex items-center gap-2 text-sm text-[#12234A]">
            <input
              type="radio"
              name="backwash"
              checked={backwashPerformed}
              disabled={isCompleted}
              onChange={() => {
                setBackwashPerformed(true);
                if (!backwashTime) {
                  setBackwashTime(new Date().toTimeString().slice(0, 5));
                }
              }}
            />
            Yes
          </label>
          {backwashPerformed ? (
            <label className="flex items-center gap-2 text-sm text-[#12234A]">
              Time
              <input
                type="time"
                value={backwashTime}
                disabled={isCompleted}
                onChange={(e) => setBackwashTime(e.target.value)}
                className="rounded border border-[#C9E3EC] px-2 py-1 font-[family-name:var(--font-mono)] text-sm"
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">Chemical Doses</h2>
        {chemicalProducts.length === 0 ? (
          <p className="mt-2 text-sm text-[#7FA0AC]">
            No chemical products set up yet. An admin can add them under Chemicals in the sidebar.
          </p>
        ) : (
          <form className="mt-3 grid grid-cols-3 gap-2" onSubmit={addDose}>
            <select
              value={doseForm.chemicalProductId}
              disabled={isCompleted}
              onChange={(e) => setDoseForm((d) => ({ ...d, chemicalProductId: e.target.value }))}
              className="rounded border border-[#C9E3EC] px-2 py-1.5 text-sm disabled:bg-[#EAF6FA]"
            >
              <option value="">Select chemical…</option>
              {chemicalProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
            <input
              placeholder="Qty"
              type="number"
              step={doseStepFor(chemicalProducts.find((p) => p.id === doseForm.chemicalProductId)?.unit ?? "")}
              value={doseForm.quantity}
              disabled={isCompleted}
              onChange={(e) => {
                const raw = e.target.value;
                const unit = chemicalProducts.find((p) => p.id === doseForm.chemicalProductId)?.unit ?? "";
                const step = doseStepFor(unit);
                const value = raw !== "" ? String(roundToStep(Number(raw), step)) : raw;
                setDoseForm((d) => ({ ...d, quantity: value }));
              }}
              className="rounded border border-[#C9E3EC] px-2 py-1.5 text-sm disabled:bg-[#EAF6FA]"
            />
            <button
              type="submit"
              disabled={isCompleted || !doseForm.chemicalProductId || !doseForm.quantity}
              className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Add dose
            </button>
          </form>
        )}
        <ul className="mt-3 space-y-1 text-sm text-[#16324A]">
          {doses.map((d) => (
            <li key={d.id}>
              {d.productName}: {d.quantity} {d.unit}
            </li>
          ))}
          {doses.length === 0 ? <li className="text-[#7FA0AC]">No doses added yet.</li> : null}
        </ul>
      </div>

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">
          Report an Issue
        </h2>
        <p className="mt-1 text-sm text-[#4A6572]">
          Anything wrong or needing repair? Report it here — it shows up on the admin dashboard right away.
        </p>

        {issues.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {issues.map((issue) => (
              <li key={issue.id} className="rounded border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 px-3 py-2 text-sm text-[#12234A]">
                <span className="font-semibold uppercase text-xs text-[#FF6B5B]">{issue.severity}</span> — {issue.description}
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={reportIssue} className="mt-3 space-y-2">
          <textarea
            value={issueForm.description}
            disabled={isCompleted || reportingIssue}
            onChange={(e) => setIssueForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Describe what's wrong or needs repair..."
            rows={2}
            className="w-full rounded border border-[#C9E3EC] px-2 py-1.5 text-sm disabled:bg-[#EAF6FA]"
          />
          <div className="flex items-center gap-2">
            <select
              value={issueForm.severity}
              disabled={isCompleted || reportingIssue}
              onChange={(e) => setIssueForm((f) => ({ ...f, severity: e.target.value }))}
              className="rounded border border-[#C9E3EC] px-2 py-1.5 text-sm disabled:bg-[#EAF6FA]"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High — urgent</option>
            </select>
            <button
              type="submit"
              disabled={isCompleted || reportingIssue || !issueForm.description.trim()}
              className="rounded bg-[#FF6B5B] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {reportingIssue ? "Reporting..." : "Report issue"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">Photo Capture</h2>
        <p className="mt-1 text-sm text-[#4A6572]">
          At least 1 photo is required to complete this visit. Photos must be taken live with the camera — uploading an existing image isn&rsquo;t allowed.
        </p>
        <p className="mt-1 text-sm font-medium text-[#12234A]">Photos on file: {photoCount}</p>
        <CameraCapture onCapture={uploadPhoto} disabled={isCompleted || uploadingPhoto} />
        {uploadingPhoto ? <p className="mt-2 text-sm text-[#4A6572]">Uploading photo...</p> : null}
      </div>

      <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => void completeVisit()}
          disabled={isCompleted || requiredMissing || photoCount < 1}
          className="rounded bg-[#0A5FA4] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#7FA0AC]"
        >
          {isCompleted ? "Visit completed" : "Complete service visit"}
        </button>
        {!isCompleted && (requiredMissing || photoCount < 1) ? (
          <p className="mt-2 text-sm text-[#B5793D]">Completion requires all required (*) readings and at least one photo.</p>
        ) : null}
      </div>
    </section>
  );
}
