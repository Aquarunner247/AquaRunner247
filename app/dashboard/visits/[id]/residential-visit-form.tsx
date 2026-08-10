"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CameraCapture } from "@/app/components/camera-capture";
import { DosingCard } from "@/app/components/dosing-card";
import { uploadVisitPhoto } from "@/lib/client/upload-visit-photo";
import type { DosingResult } from "@/lib/dosing-calculator";

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
};

type FieldConfig = {
  key: keyof Reading;
  label: string;
  unitLabel: string;
  required: boolean;
  min: number;
  max: number;
  step: number;
};

/**
 * Residential's simplified chemistry set — no ideal-zone bands (no SNHD closure-risk
 * shading/rules for residential, per spec), each field's required-ness driven by the
 * customer's own per-reading toggles rather than hardcoded.
 */
function chemistryFieldsFor(props: {
  requiresFC: boolean;
  requiresPH: boolean;
  requiresAlkalinity: boolean;
  requiresCYA: boolean;
  cyaRequired: boolean;
}): FieldConfig[] {
  return [
    { key: "freeChlorinePpm", label: "Free Chlorine", unitLabel: "ppm", required: props.requiresFC, min: 0, max: 30, step: 0.5 },
    { key: "ph", label: "pH", unitLabel: "", required: props.requiresPH, min: 6, max: 15, step: 0.1 },
    { key: "alkalinityPpm", label: "Total Alkalinity", unitLabel: "ppm", required: props.requiresAlkalinity, min: 0, max: 300, step: 1 },
    {
      key: "cyanuricAcidPpm",
      label: "Cyanuric Acid",
      unitLabel: props.cyaRequired ? "ppm" : "ppm, checked in the last 30 days",
      required: props.requiresCYA && props.cyaRequired,
      min: 0,
      max: 100,
      step: 1,
    },
  ];
}

function pct(value: number, min: number, max: number) {
  return ((value - min) / (max - min)) * 100;
}

type ChemicalProductOption = { id: string; name: string; unit: string };
type IssueOption = { id: string; description: string | null; severity: string; createdAt: string };
type PhotoOption = { id: string; url: string | null; takenAt: string | null };

type Props = {
  visitId: string;
  visitStatus: string;
  requiresFC: boolean;
  requiresPH: boolean;
  requiresAlkalinity: boolean;
  requiresCYA: boolean;
  cyaRequired: boolean;
  chemicalProducts: ChemicalProductOption[];
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

export function ResidentialVisitForm({
  visitId,
  visitStatus,
  requiresFC,
  requiresPH,
  requiresAlkalinity,
  requiresCYA,
  cyaRequired,
  chemicalProducts,
  initialIssues,
  initialReading,
  initialPhotoCount,
  initialPhotos = [],
  initialDoses,
  initialStartedAt,
  initialDosing,
}: Props) {
  const [startedAt, setStartedAt] = useState<string | null>(initialStartedAt);
  const [arrivalSaving, setArrivalSaving] = useState(false);
  const [arrivalError, setArrivalError] = useState("");
  const [issues, setIssues] = useState<IssueOption[]>(initialIssues);
  const [issueForm, setIssueForm] = useState({ description: "", severity: "MEDIUM" });
  const [reportingIssue, setReportingIssue] = useState(false);
  const [reading, setReading] = useState<Reading>({
    ph: toInput(initialReading?.ph),
    freeChlorinePpm: toInput(initialReading?.freeChlorinePpm),
    alkalinityPpm: toInput(initialReading?.alkalinityPpm),
    cyanuricAcidPpm: toInput(initialReading?.cyanuricAcidPpm),
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [photoCount, setPhotoCount] = useState(initialPhotoCount);
  const [doses, setDoses] = useState<Dose[]>(initialDoses);
  const [doseForm, setDoseForm] = useState({ chemicalProductId: "", quantity: "" });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dosing, setDosing] = useState<DosingResult | null>(initialDosing);
  const timerRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);

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

  const chemistryFields = chemistryFieldsFor({ requiresFC, requiresPH, requiresAlkalinity, requiresCYA, cyaRequired });

  const requiredMissing = useMemo(() => {
    return chemistryFields.some((f) => f.required && !reading[f.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, requiresFC, requiresPH, requiresAlkalinity, requiresCYA]);

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
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      setSaveState("saved");
      setSaveMsg(source === "auto" ? "Autosaved" : "Saved");
      const data = (await response.json().catch(() => null)) as { dosing?: DosingResult | null } | null;
      if (data && "dosing" in data) setDosing(data.dosing ?? null);
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
  }, [reading, isCompleted]);

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
      const result = await uploadVisitPhoto(visitId, file);
      if (!result.ok) throw new Error(result.error);
      setPhotoCount((n) => n + 1);
    } catch (err) {
      setSaveState("error");
      setSaveMsg(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
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
    const fallback = (f.min + f.max) / 2;
    const value = isSet ? Number(reading[f.key]) : fallback;
    const markerLeft = pct(value, f.min, f.max);

    return (
      <div key={f.key} className="rounded-lg border border-brand-border bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-muted">
            {f.label}
            {f.required ? <span className="text-brand-danger"> *</span> : null}
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
          <p className="text-sm font-medium text-brand-ink">
            Save status:{" "}
            <span className="font-semibold">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? saveMsg || "Saved" : saveState === "error" ? saveMsg || "Error" : "Idle"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void saveReading("manual")}
            disabled={isCompleted}
            className="app-btn-secondary-sm disabled:opacity-50"
          >
            Save / Sync now
          </button>
        </div>
      </div>

      {chemistryFields.some((f) => f.required) || chemistryFields.length > 0 ? (
        <div className="app-card">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Chemistry</h2>
          <div className="mt-3 space-y-3">{chemistryFields.map(renderSlider)}</div>
        </div>
      ) : null}

      <DosingCard dosing={dosing} />

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
              {/* Chemicals already dosed on this visit drop out of the picker -- adding
                  the same chemical twice on one visit is normally a mistake, not a
                  second real dose. */}
              {chemicalProducts
                .filter((p) => !doses.some((d) => d.productName === p.name))
                .map((p) => (
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
            <li key={d.id}>
              {d.productName}: {d.quantity} {d.unit}
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
