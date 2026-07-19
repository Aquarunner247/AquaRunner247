"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CameraCapture } from "@/app/components/camera-capture";
import { uploadVisitPhoto } from "@/lib/client/upload-visit-photo";

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
      <div key={f.key} className="rounded-lg border border-[#C9E3EC] bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[#4A6572]">
            {f.label}
            {f.required ? <span className="text-[#C1483B]"> *</span> : null}
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
              className="w-16 rounded border border-[#C9E3EC] px-1.5 py-0.5 text-right font-[family-name:var(--font-mono)] text-sm text-[#12234A] disabled:bg-[#EAF6FA]"
            />
            {f.unitLabel ? <span className="text-xs text-[#7FA0AC]">{f.unitLabel}</span> : null}
          </span>
        </div>

        <div className="relative mt-3 h-6">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#EAF6FA]" />
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[#12234A] shadow"
            style={{ left: `${markerLeft}%`, background: isSet ? "#0A5FA4" : "#C9E3EC" }}
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
        <div className="mt-1 flex justify-between font-[family-name:var(--font-mono)] text-[10px] text-[#7FA0AC]">
          <span>{f.min}</span>
          <span>{f.max}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      {!isCompleted ? (
        <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
          {startedAt ? (
            <p className="text-sm font-medium text-[#0A5FA4]">
              Arrived at {new Date(startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#12234A]">Not logged as arrived yet</p>
                <p className="text-xs text-[#4A6572]">
                  This usually happens automatically when your phone&apos;s location enters the property. Tap this if
                  location isn&apos;t available or hasn&apos;t caught up yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void markArrived()}
                disabled={arrivalSaving}
                className="shrink-0 rounded bg-[#FF6B5B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {arrivalSaving ? "Logging..." : "I've arrived"}
              </button>
            </div>
          )}
          {arrivalError ? <p className="mt-1 text-sm text-[#C1483B]">{arrivalError}</p> : null}
        </div>
      ) : null}

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

      {chemistryFields.some((f) => f.required) || chemistryFields.length > 0 ? (
        <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">Chemistry</h2>
          <div className="mt-3 space-y-3">{chemistryFields.map(renderSlider)}</div>
        </div>
      ) : null}

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
        {initialPhotos.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {initialPhotos.map((p) =>
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.url}
                  alt="Service visit photo"
                  className="h-20 w-20 rounded border border-[#C9E3EC] object-cover"
                />
              ) : null,
            )}
          </div>
        ) : null}
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
