"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CameraCapture } from "@/app/components/camera-capture";
import { DosingCard } from "@/app/components/dosing-card";
import { uploadVisitPhoto } from "@/lib/client/upload-visit-photo";
import { queuedSubmitJson } from "@/lib/client/offline-queue";
import { useOfflineSync } from "@/lib/client/use-offline-sync";
import type { ReadingFieldSpec } from "@/lib/compliance";
import type { DosingResult } from "@/lib/dosing-calculator";

type Dose = {
  id: string;
  productName: string;
  quantity: string;
  unit: string;
  pending?: boolean;
};

type Reading = {
  ph: string;
  freeChlorinePpm: string;
  brominePpm: string;
  alkalinityPpm: string;
  cyanuricAcidPpm: string;
  /** Dosing-calculator inputs only -- not required by any state's compliance log. */
  calciumHardnessPpm: string;
  saltPpm: string;
  temperatureF: string;
  pumpPressurePsi: string;
  vacGaugeReading: string;
  flowMeterGpm: string;
  filterPressurePsi: string;
};

type FieldConfig = {
  key: keyof Reading;
  label: string;
  unitLabel: string;
  required?: boolean;
  min: number;
  max: number;
  step: number;
  zoneMin?: number;
  zoneMax?: number;
};

/** Sanity bounds and step size for the numeric slider input -- deliberately NOT
 * state-derived (they're just input guards against absurd values, wide enough to cover
 * every state's actual regulatory range for that parameter), unlike everything else
 * about a chemistry field, which comes from the org's own ComplianceRuleset via
 * activeReadingFields (see lib/compliance.ts) and is passed in as `readingFields`. */
const CHEMISTRY_INPUT_BOUNDS: Record<string, { min: number; max: number; step: number }> = {
  freeChlorinePpm: { min: 0, max: 30, step: 0.5 },
  brominePpm: { min: 0, max: 30, step: 0.5 },
  ph: { min: 6, max: 15, step: 0.1 },
  alkalinityPpm: { min: 0, max: 300, step: 1 },
  cyanuricAcidPpm: { min: 0, max: 150, step: 1 },
  temperatureF: { min: 50, max: 110, step: 1 },
};

/** Optional, dosing-calculator-only fields -- not part of activeReadingFields since no
 * state's compliance log requires them (see dosing-calculator-spec.md). Always shown,
 * never required, so entering them is purely opt-in for orgs that want the Calcium
 * Hardness/Salt recommendations. */
const DOSING_ONLY_FIELDS: FieldConfig[] = [
  { key: "calciumHardnessPpm", label: "Calcium Hardness", unitLabel: "ppm", required: false, min: 0, max: 1000, step: 10 },
  { key: "saltPpm", label: "Salt", unitLabel: "ppm", required: false, min: 0, max: 6000, step: 50 },
];

function toFieldConfig(spec: ReadingFieldSpec): FieldConfig {
  const bounds = CHEMISTRY_INPUT_BOUNDS[spec.key] ?? { min: 0, max: 100, step: 1 };
  return {
    key: spec.key,
    label: spec.label,
    unitLabel: spec.unitLabel,
    required: spec.required,
    min: bounds.min,
    max: bounds.max,
    step: bounds.step,
    zoneMin: spec.zoneMin ?? undefined,
    zoneMax: spec.zoneMax ?? undefined,
  };
}

const EQUIPMENT_FIELDS: FieldConfig[] = [
  { key: "pumpPressurePsi", label: "Pump Pressure", unitLabel: "psi", required: true, min: 0, max: 60, step: 1 },
  { key: "vacGaugeReading", label: "Pump Vacuum", unitLabel: "inHg", required: true, min: -30, max: 0, step: 1 },
  { key: "filterPressurePsi", label: "Filter Pressure", unitLabel: "psi", required: true, min: 0, max: 60, step: 1 },
  { key: "flowMeterGpm", label: "Flow Meter", unitLabel: "gpm", required: true, min: 0, max: 150, step: 1 },
];

function pct(value: number, min: number, max: number) {
  return ((value - min) / (max - min)) * 100;
}

type ChemicalProductOption = { id: string; name: string; unit: string };
type ChecklistItemOption = { id: string; label: string; completed: boolean };
type IssueOption = { id: string; description: string | null; severity: string; createdAt: string };
type PhotoOption = { id: string; url: string | null; takenAt: string | null };

type Props = {
  visitId: string;
  visitStatus: string;
  readingFields: ReadingFieldSpec[];
  chemicalProducts: ChemicalProductOption[];
  checklistItems: ChecklistItemOption[];
  initialIssues: IssueOption[];
  initialReading: Record<string, unknown> | null;
  initialPhotoCount: number;
  initialPhotos?: PhotoOption[];
  initialDoses: Dose[];
  initialStartedAt: string | null;
  initialDosing: DosingResult | null;
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

export function VisitForm({ visitId, visitStatus, readingFields, chemicalProducts, checklistItems: initialChecklistItems, initialIssues, initialReading, initialPhotoCount, initialPhotos = [], initialDoses, initialStartedAt, initialDosing }: Props) {
  const [startedAt, setStartedAt] = useState<string | null>(initialStartedAt);
  const [arrivalSaving, setArrivalSaving] = useState(false);
  const [arrivalError, setArrivalError] = useState("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItemOption[]>(initialChecklistItems);
  const [issues, setIssues] = useState<IssueOption[]>(initialIssues);
  const [issueForm, setIssueForm] = useState({ description: "", severity: "MEDIUM" });
  const [reportingIssue, setReportingIssue] = useState(false);
  const [reading, setReading] = useState<Reading>({
    ph: toInput(initialReading?.ph),
    freeChlorinePpm: toInput(initialReading?.freeChlorinePpm),
    brominePpm: toInput(initialReading?.brominePpm),
    alkalinityPpm: toInput(initialReading?.alkalinityPpm),
    cyanuricAcidPpm: toInput(initialReading?.cyanuricAcidPpm),
    calciumHardnessPpm: toInput(initialReading?.calciumHardnessPpm),
    saltPpm: toInput(initialReading?.saltPpm),
    temperatureF: toInput(initialReading?.temperatureF),
    pumpPressurePsi: toInput(initialReading?.pumpPressurePsi),
    vacGaugeReading: toInput(initialReading?.vacGaugeReading),
    flowMeterGpm: toInput(initialReading?.flowMeterGpm),
    filterPressurePsi: toInput(initialReading?.filterPressurePsi),
  });
  const [backwashPerformed, setBackwashPerformed] = useState<boolean>(Boolean(initialReading?.backwashAt));
  const [backwashTime, setBackwashTime] = useState<string>(toTimeInput(initialReading?.backwashAt));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [photoCount, setPhotoCount] = useState(initialPhotoCount);
  const [doses, setDoses] = useState<Dose[]>(initialDoses);
  const [dosing, setDosing] = useState<DosingResult | null>(initialDosing);
  const [doseForm, setDoseForm] = useState({ chemicalProductId: "", quantity: "" });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);
  const { pendingCount, syncNow } = useOfflineSync();

  const isCompleted = visitStatus === "COMPLETED";

  async function markArrived() {
    setArrivalSaving(true);
    setArrivalError("");
    try {
      const response = await fetch(`/api/visits/${visitId}/arrival`, { method: "PATCH" });
      if (!response.ok) throw new Error("Couldn't log arrival — try again.");
      const data = (await response.json()) as { visit: { startedAt: string | null } };
      setStartedAt(data.visit.startedAt);
    } catch (err) {
      setArrivalError(err instanceof Error ? err.message : "Couldn't log arrival — try again.");
    } finally {
      setArrivalSaving(false);
    }
  }
  const chemistryFields = useMemo(() => readingFields.map(toFieldConfig), [readingFields]);
  const allFields = [...chemistryFields, ...EQUIPMENT_FIELDS];

  const requiredMissing = useMemo(() => {
    return allFields.some((f) => f.required && !reading[f.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

  async function saveReading(source: "auto" | "manual") {
    setSaveState("saving");
    const result = await queuedSubmitJson({
      url: `/api/visits/${visitId}/reading`,
      method: "PATCH",
      label: "Water reading",
      visitId,
      body: {
        ph: reading.ph || null,
        freeChlorinePpm: reading.freeChlorinePpm || null,
        brominePpm: reading.brominePpm || null,
        alkalinityPpm: reading.alkalinityPpm || null,
        cyanuricAcidPpm: reading.cyanuricAcidPpm || null,
        calciumHardnessPpm: reading.calciumHardnessPpm || null,
        saltPpm: reading.saltPpm || null,
        temperatureF: reading.temperatureF || null,
        pumpPressurePsi: reading.pumpPressurePsi || null,
        vacGaugeReading: reading.vacGaugeReading || null,
        flowMeterGpm: reading.flowMeterGpm || null,
        filterPressurePsi: reading.filterPressurePsi || null,
        backwashPerformed,
        backwashAt: backwashPerformed && backwashTime ? `${new Date().toISOString().slice(0, 10)}T${backwashTime}:00` : null,
      },
    });
    if (result.status === "queued") {
      setSaveState("saved");
      setSaveMsg("Saved offline — will sync");
    } else if (result.status === "sent") {
      setSaveState("saved");
      setSaveMsg(source === "auto" ? "Autosaved" : "Saved");
      const data = (await result.response.json().catch(() => null)) as { dosing?: DosingResult | null } | null;
      if (data && "dosing" in data) setDosing(data.dosing ?? null);
    } else {
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
    const result = await queuedSubmitJson({
      url: `/api/visits/${visitId}/doses`,
      method: "POST",
      label: "Chemical dose",
      visitId,
      body: {
        chemicalProductId: doseForm.chemicalProductId,
        quantity: Number(doseForm.quantity),
      },
    });
    if (result.status === "failed") {
      setSaveState("error");
      setSaveMsg("Dose add failed");
      return;
    }
    if (result.status === "queued") {
      const product = chemicalProducts.find((p) => p.id === doseForm.chemicalProductId);
      setDoses((prev) => [
        { id: `pending-${Date.now()}`, productName: product?.name ?? "Chemical", quantity: doseForm.quantity, unit: product?.unit ?? "", pending: true },
        ...prev,
      ]);
      setSaveState("saved");
      setSaveMsg("Saved offline — will sync");
      setDoseForm({ chemicalProductId: "", quantity: "" });
      return;
    }
    const data = (await result.response.json()) as { dose: Dose };
    setDoses((prev) => [data.dose, ...prev]);
    setDoseForm({ chemicalProductId: "", quantity: "" });
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const result = await uploadVisitPhoto(visitId, file);
      if (!result.ok) throw new Error(result.error);
      setPhotoCount((n) => n + 1);
      if ("queued" in result && result.queued) {
        setSaveState("saved");
        setSaveMsg("Photo saved offline — will upload when back online");
      }
    } catch (err) {
      setSaveState("error");
      setSaveMsg(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    setChecklistItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, completed } : it)));
    const result = await queuedSubmitJson({
      url: `/api/visits/${visitId}/checklist`,
      method: "PATCH",
      label: "Checklist item",
      visitId,
      body: { checklistItemId: itemId, completed },
    });
    if (result.status === "queued") {
      setSaveState("saved");
      setSaveMsg("Saved offline — will sync");
      return;
    }
    if (result.status === "failed") {
      // revert on a real (non-network) failure — the server rejected it, not just offline
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

  function renderSlider(f: FieldConfig) {
    const isSet = reading[f.key] !== "";
    const fallback = f.zoneMin !== undefined && f.zoneMax !== undefined ? (f.zoneMin + f.zoneMax) / 2 : (f.min + f.max) / 2;
    const value = isSet ? Number(reading[f.key]) : fallback;
    const zoneLeft = f.zoneMin !== undefined ? pct(f.zoneMin, f.min, f.max) : null;
    const zoneWidth = f.zoneMin !== undefined && f.zoneMax !== undefined ? pct(f.zoneMax, f.min, f.max) - zoneLeft! : null;
    const markerLeft = pct(value, f.min, f.max);

    return (
      <div key={f.key} className="rounded-lg border border-brand-border bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-muted">
            {f.label}
            {f.required ? <span className="text-brand-danger"> *</span> : null}
            {f.zoneMin !== undefined && f.zoneMax !== undefined ? (
              <span className="ml-2 normal-case text-brand-muted">
                Ideal {f.zoneMin}–{f.zoneMax}
                {f.unitLabel ? ` ${f.unitLabel}` : ""}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              step={f.step}
              value={reading[f.key]}
              disabled={isCompleted}
              placeholder={fallback.toString()}
              onChange={(e) => {
                const raw = e.target.value;
                const val = raw !== "" && Number.isInteger(f.step) ? String(roundToStep(Number(raw), f.step)) : raw;
                setReading((prev) => ({ ...prev, [f.key]: val }));
              }}
              className="w-16 rounded border border-brand-control px-1.5 py-0.5 text-right font-[family-name:var(--font-mono)] text-sm text-brand-ink disabled:bg-brand-foam"
            />
            {f.unitLabel ? <span className="text-xs text-brand-muted">{f.unitLabel}</span> : null}
          </span>
        </div>

        <div className="relative mt-3 h-6">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-foam" />
          {zoneLeft !== null && zoneWidth !== null ? (
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-primary/25"
              style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }}
            />
          ) : null}
          <div
            className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-brand-ink shadow ${isSet ? "bg-brand-primary" : "bg-brand-border"}`}
            style={{ left: `${markerLeft}%` }}
          />
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={value}
            disabled={isCompleted}
            onPointerDown={() => {
              // The slider starts parked at a plausible reading (the ideal-zone midpoint), so a
              // user who drags to that exact same value never fires a native change event —
              // committing on interaction-start guarantees the field still gets marked as read.
              if (!isSet) setReading((prev) => ({ ...prev, [f.key]: String(roundToStep(fallback, f.step)) }));
            }}
            onChange={(e) => setReading((prev) => ({ ...prev, [f.key]: e.target.value }))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
        <div className="mt-1 flex justify-between font-[family-name:var(--font-mono)] text-[10px] text-brand-muted">
          <span>{f.min}</span>
          <span>{f.max}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      {!isCompleted ? (
        <div className="app-card">
          {startedAt ? (
            <p className="text-sm font-medium text-brand-primary">
              Arrived at {new Date(startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-brand-ink">Not logged as arrived yet</p>
                <p className="text-xs text-brand-muted">
                  This usually happens automatically when your phone&apos;s location enters the property. Tap this if
                  location isn&apos;t available or hasn&apos;t caught up yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void markArrived()}
                disabled={arrivalSaving}
                className="app-btn-accent-sm shrink-0"
              >
                {arrivalSaving ? "Logging..." : "I've arrived"}
              </button>
            </div>
          )}
          {arrivalError ? <p className="mt-1 text-sm text-brand-danger">{arrivalError}</p> : null}
        </div>
      ) : null}

      <div className="app-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-ink">
              Save status:{" "}
              <span className="font-semibold">
                {saveState === "saving" ? "Saving..." : saveState === "saved" ? saveMsg || "Saved" : saveState === "error" ? saveMsg || "Error" : "Idle"}
              </span>
            </p>
            {pendingCount > 0 ? (
              <p className="mt-1 text-xs font-medium text-brand-warn">
                {pendingCount} {pendingCount === 1 ? "item" : "items"} saved offline, waiting to sync
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              void saveReading("manual");
              void syncNow();
            }}
            disabled={isCompleted}
            className="app-btn-secondary-sm disabled:opacity-50"
          >
            {pendingCount > 0 ? `Sync now (${pendingCount})` : "Save / Sync now"}
          </button>
        </div>
      </div>

      {checklistItems.length > 0 ? (
        <div className="app-card">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">
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
                      ? "border-brand-primary bg-brand-primary/10 text-brand-ink"
                      : "border-brand-border bg-white text-brand-ink hover:bg-brand-foam"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      item.completed ? "border-brand-primary bg-brand-primary text-white" : "border-brand-control text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className={item.completed ? "line-through decoration-brand-primary/60" : ""}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Chemistry</h2>
        <div className="mt-3 space-y-3">{chemistryFields.map(renderSlider)}</div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-brand-muted">Optional — for dosing recommendations</p>
        <div className="mt-2 space-y-3">{DOSING_ONLY_FIELDS.map(renderSlider)}</div>
      </div>

      <DosingCard dosing={dosing} />

      <div className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Gauges</h2>
        <div className="mt-3 space-y-3">{EQUIPMENT_FIELDS.map(renderSlider)}</div>
      </div>

      <div className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Backwash</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-brand-ink">
            <input
              type="radio"
              name="backwash"
              checked={!backwashPerformed}
              disabled={isCompleted}
              onChange={() => setBackwashPerformed(false)}
            />
            No
          </label>
          <label className="flex items-center gap-2 text-sm text-brand-ink">
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
            <label className="flex items-center gap-2 text-sm text-brand-ink">
              Time
              <input
                type="time"
                value={backwashTime}
                disabled={isCompleted}
                onChange={(e) => setBackwashTime(e.target.value)}
                className="rounded border border-brand-control px-2 py-1 font-[family-name:var(--font-mono)] text-sm"
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Chemical Doses</h2>
        {chemicalProducts.length === 0 ? (
          <p className="mt-2 text-sm text-brand-muted">
            No chemical products set up yet. An admin can add them under Chemicals in the sidebar.
          </p>
        ) : (
          <form className="mt-3 grid grid-cols-3 gap-2" onSubmit={addDose}>
            <select
              value={doseForm.chemicalProductId}
              disabled={isCompleted}
              onChange={(e) => setDoseForm((d) => ({ ...d, chemicalProductId: e.target.value }))}
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-foam"
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
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-foam"
            />
            <button
              type="submit"
              disabled={isCompleted || !doseForm.chemicalProductId || !doseForm.quantity}
              className="app-btn-primary-sm"
            >
              Add dose
            </button>
          </form>
        )}
        <ul className="mt-3 space-y-1 text-sm text-brand-ink">
          {doses.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <span>
                {d.productName}: {d.quantity} {d.unit}
              </span>
              {d.pending ? <span className="app-pill-attention">Pending sync</span> : null}
            </li>
          ))}
          {doses.length === 0 ? <li className="text-brand-muted">No doses added yet.</li> : null}
        </ul>
      </div>

      <div className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">
          Report an Issue
        </h2>
        <p className="mt-1 text-sm text-brand-muted">
          Anything wrong or needing repair? Report it here — it shows up on the admin dashboard right away.
        </p>

        {issues.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {issues.map((issue) => (
              <li key={issue.id} className="rounded border border-brand-danger/40 bg-brand-dangerFill px-3 py-2 text-sm text-brand-ink">
                <span className="font-semibold uppercase text-xs text-brand-danger">{issue.severity}</span> — {issue.description}
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
            className="app-field"
          />
          <div className="flex items-center gap-2">
            <select
              value={issueForm.severity}
              disabled={isCompleted || reportingIssue}
              onChange={(e) => setIssueForm((f) => ({ ...f, severity: e.target.value }))}
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-foam"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High — urgent</option>
            </select>
            <button
              type="submit"
              disabled={isCompleted || reportingIssue || !issueForm.description.trim()}
              className="app-btn-accent-sm"
            >
              {reportingIssue ? "Reporting..." : "Report issue"}
            </button>
          </div>
        </form>
      </div>

      <div className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Photo Capture</h2>
        <p className="mt-1 text-sm text-brand-muted">
          At least 1 photo is required to complete this visit. Photos must be taken live with the camera — uploading an existing image isn&rsquo;t allowed.
        </p>
        <p className="mt-1 text-sm font-medium text-brand-ink">Photos on file: {photoCount}</p>
        {initialPhotos.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {initialPhotos.map((p) =>
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.url}
                  alt="Service visit photo"
                  className="h-20 w-20 rounded border border-brand-border object-cover"
                />
              ) : null,
            )}
          </div>
        ) : null}
        <CameraCapture onCapture={uploadPhoto} disabled={isCompleted || uploadingPhoto} />
        {uploadingPhoto ? <p className="mt-2 text-sm text-brand-muted">Uploading photo...</p> : null}
      </div>

      <div className="app-card">
        <button
          type="button"
          onClick={() => void completeVisit()}
          disabled={isCompleted || requiredMissing || photoCount < 1}
          className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primaryHover disabled:cursor-not-allowed disabled:bg-brand-control"
        >
          {isCompleted ? "Visit completed" : "Complete service visit"}
        </button>
        {!isCompleted && (requiredMissing || photoCount < 1) ? (
          <p className="mt-2 text-sm text-brand-warn">Completion requires all required (*) readings and at least one photo.</p>
        ) : null}
      </div>
    </section>
  );
}
