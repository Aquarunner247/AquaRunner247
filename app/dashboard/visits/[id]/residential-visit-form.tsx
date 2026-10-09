"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ServiceMessageOption } from "./visit-form";
import { createPortal } from "react-dom";
import { ABOVE_MAP_Z_INDEX } from "@/lib/client/overlay-z-index";
import { CameraCapture } from "@/app/components/camera-capture";
import { DosingCard } from "@/app/components/dosing-card";
import { VisitVolumeCalculator } from "@/app/components/volume-calculator";
import { uploadVisitPhoto } from "@/lib/client/upload-visit-photo";
import { getBestEffortLocation } from "@/lib/client/get-geolocation";
import { PhotoThumbnail } from "@/app/components/photo-thumbnail";
import { convertToBillingUnit } from "@/lib/dosing-units";
import type { DosingResult } from "@/lib/dosing-calculator";
import type { DosingUnit } from "@/generated/prisma/enums";
import { READING_BOUNDS } from "@/lib/reading-bounds";

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
    { key: "freeChlorinePpm", label: "Free Chlorine", unitLabel: "ppm", required: props.requiresFC, ...READING_BOUNDS.freeChlorinePpm },
    { key: "ph", label: "pH", unitLabel: "", required: props.requiresPH, ...READING_BOUNDS.ph },
    { key: "alkalinityPpm", label: "Total Alkalinity", unitLabel: "ppm", required: props.requiresAlkalinity, ...READING_BOUNDS.alkalinityPpm },
    {
      key: "cyanuricAcidPpm",
      label: "Cyanuric Acid",
      unitLabel: props.cyaRequired ? "ppm" : "ppm, checked in the last 30 days",
      required: props.requiresCYA && props.cyaRequired,
      ...READING_BOUNDS.cyanuricAcidPpm,
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
  hasVolume: boolean;
  /** True for an ADMIN or OFFICE user. Only used to keep the dose Remove button available after the
   * visit is COMPLETED, matching the rule the DELETE endpoint enforces
   * (app/api/visits/[id]/doses/[doseId]/route.ts): a technician corrects his own mis-tap while the
   * visit is open, and after that a mis-logged chemical is an office correction -- which is the case
   * that actually matters, since a dose is usually only noticed as wrong once someone reads the
   * record. */
  canCorrectCompleted: boolean;
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
  /** Same contract as the commercial form: empty means none configured, so nothing is required. */
  serviceMessages: ServiceMessageOption[];
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
  canCorrectCompleted,
  hasVolume: initialHasVolume,
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
  serviceMessages,
}: Props) {
  const [hasVolume, setHasVolume] = useState(initialHasVolume);
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
  const [dosing, setDosing] = useState<DosingResult | null>(initialDosing);
  const [doseForm, setDoseForm] = useState({ chemicalProductId: "", quantity: "" });
  /** See visit-form.tsx's identical field for the full explanation -- same Dosing Card
   * "Add to visit" fallback mechanism, duplicated here since this form is its own
   * (pre-existing, separately duplicated) component rather than a shared one. */
  const [pendingDoseHint, setPendingDoseHint] = useState<{ rawAmount: number; dosingUnit: DosingUnit } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [completingVisit, setCompletingVisit] = useState(false);
  /** "I did not add chemicals at today's service call" -- the alternative to logging a dose.
   *  Only consulted while the dose list is empty; the server ignores it otherwise. */
  const [noChemicals, setNoChemicals] = useState(false);
  const [removingDoseId, setRemovingDoseId] = useState<string | null>(null);
  const [noPhotoPrompt, setNoPhotoPrompt] = useState(false);
  // Preselected only when there's exactly one option -- see the commercial form for why.
  const [selectedServiceMessageId, setSelectedServiceMessageId] = useState(
    serviceMessages.length === 1 ? serviceMessages[0].id : "",
  );
  const timerRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);
  const doseSectionRef = useRef<HTMLDivElement | null>(null);

  const isCompleted = visitStatus === "COMPLETED";

  /**
   * The Remove button on a logged dose. Everything else on this form is locked once the visit is
   * COMPLETED, and a dose was too -- which hid the button in the exact situation it exists for. A
   * mis-tapped chemical is almost never caught during the visit; it is caught later, by whoever
   * reads the billing line or the log. So an ADMIN or OFFICE user keeps it, which is the same
   * boundary app/api/visits/[id]/doses/[doseId]/route.ts enforces server-side.
   */
  const canRemoveDose = !isCompleted || canCorrectCompleted;

  async function markArrived() {
    setArrivalSaving(true);
    setArrivalError("");
    try {
      // Fires immediately, without waiting on the geolocation prompt -- "Arrived" should
      // confirm instantly. Location (if available) attaches via a background follow-up
      // call below, which the arrival route accepts as a location-only update once
      // startedAt is already set.
      const response = await fetch(`/api/visits/${visitId}/arrival`, { method: "PATCH" });
      if (!response.ok) throw new Error("Couldn't log arrival — try again.");
      const data = (await response.json()) as { visit: { startedAt: string | null } };
      setStartedAt(data.visit.startedAt);
    } catch (err) {
      setArrivalError(err instanceof Error ? err.message : "Couldn't log arrival — try again.");
    } finally {
      setArrivalSaving(false);
    }

    const location = await getBestEffortLocation();
    if (!location) return;
    try {
      await fetch(`/api/visits/${visitId}/arrival`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(location),
      });
    } catch {
      // Best-effort -- a failed location attach shouldn't surface an error to the tech.
    }
  }

  const chemistryFields = chemistryFieldsFor({ requiresFC, requiresPH, requiresAlkalinity, requiresCYA, cyaRequired });

  const requiredMissing = useMemo(() => {
    return chemistryFields.some((f) => f.required && !reading[f.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, requiresFC, requiresPH, requiresAlkalinity, requiresCYA]);

  // A field with a value outside its sane bounds (see lib/reading-bounds.ts -- e.g. "74"
  // typed for pH instead of "7.4") never actually reaches the server (see sanitizeReading
  // below), so it must block completion exactly like a missing required field would.
  const invalidFieldKeys = useMemo(() => {
    const keys = new Set<keyof Reading>();
    for (const f of chemistryFields) {
      if (reading[f.key] === "") continue;
      const n = Number(reading[f.key]);
      if (!Number.isFinite(n) || n < f.min || n > f.max) keys.add(f.key);
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, requiresFC, requiresPH, requiresAlkalinity, requiresCYA]);
  const hasInvalidReading = invalidFieldKeys.size > 0;

  /** Empty string -> null (clears the field, unchanged from before). Out-of-range -> the
   * server never sees the field at all (`undefined` is dropped by JSON.stringify), so an
   * absurd typed value can never overwrite a previously-saved good one -- invalidFieldKeys
   * above is what actually tells the technician why nothing happened. */
  function sanitizeReading(key: keyof Reading): string | null | undefined {
    if (invalidFieldKeys.has(key)) return undefined;
    return reading[key] || null;
  }

  async function saveReading(source: "auto" | "manual") {
    try {
      setSaveState("saving");
      const response = await fetch(`/api/visits/${visitId}/reading`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ph: sanitizeReading("ph"),
          freeChlorinePpm: sanitizeReading("freeChlorinePpm"),
          alkalinityPpm: sanitizeReading("alkalinityPpm"),
          cyanuricAcidPpm: sanitizeReading("cyanuricAcidPpm"),
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

  /** Shared by the manual form submit and the Dosing Card's direct-apply button -- see
   * visit-form.tsx's identical function for the full explanation. */
  async function submitDose(chemicalProductId: string, quantity: number): Promise<boolean> {
    const response = await fetch(`/api/visits/${visitId}/doses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chemicalProductId, quantity }),
    });
    if (!response.ok) {
      setSaveState("error");
      setSaveMsg("Dose add failed");
      return false;
    }
    const data = (await response.json()) as { dose: Dose };
    setDoses((prev) => [data.dose, ...prev]);
    return true;
  }

/** A dose is a billing line and part of what the customer is told, so removing one asks first. Uses
 *  the browser's own confirm deliberately: this runs on a technician's phone in sunlight, where a
 *  native modal is more legible and harder to dismiss by accident than a styled one. */
function confirmRemoveDose(
  dose: { productName: string; quantity: string; unit: string },
  alreadyReported: boolean,
): boolean {
  if (typeof window === "undefined") return false;
  const what = `Remove ${dose.productName} ${dose.quantity} ${dose.unit} from this visit?`;
  // Says plainly what removal does NOT undo. The billing total, the usage report and the compliance
  // log all recalculate from these rows, so they correct themselves -- a summary email already sent
  // named the dose and cannot be taken back, and the person deciding should know that before they do
  // it rather than after.
  return window.confirm(
    alreadyReported
      ? `${what}\n\nThe charge and the service log will be corrected. A summary email already sent to the customer named this dose and will not change.`
      : what,
  );
}

  /**
   * Removes a logged dose. A dose is a billing line and part of what the customer is told, so this
   * confirms first -- but it has to exist at all, because "Add to visit" writes immediately and an
   * accidental press otherwise billed a chemical that was never poured, permanently.
   */
  async function removeDose(dose: Dose) {
    if (!confirmRemoveDose(dose, isCompleted)) return;
    setRemovingDoseId(dose.id);
    try {
      const response = await fetch(`/api/visits/${visitId}/doses/${dose.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setSaveState("error");
        setSaveMsg(
          data?.error === "VISIT_ALREADY_COMPLETED"
            ? "This visit is completed — ask an admin to remove the dose"
            : "Couldn't remove that dose",
        );
        return;
      }
      setDoses((prev) => prev.filter((d) => d.id !== dose.id));
      setSaveState("saved");
      setSaveMsg("Dose removed");
    } catch {
      setSaveState("error");
      setSaveMsg("Connection issue — the dose was not removed");
    } finally {
      setRemovingDoseId(null);
    }
  }

  async function addDose(e: FormEvent) {
    e.preventDefault();
    const ok = await submitDose(doseForm.chemicalProductId, Number(doseForm.quantity));
    if (ok) {
      setDoseForm({ chemicalProductId: "", quantity: "" });
      setPendingDoseHint(null);
    }
  }

  async function applyDoseFromCard(opts: { chemicalProductId: string; quantity: number }): Promise<boolean> {
    return submitDose(opts.chemicalProductId, opts.quantity);
  }

  function prefillDoseForm(opts: { chemicalProductId: string | null; rawAmount: number; dosingUnit: DosingUnit }) {
    setPendingDoseHint({ rawAmount: opts.rawAmount, dosingUnit: opts.dosingUnit });
    const id = opts.chemicalProductId ?? "";
    const product = id ? chemicalProducts.find((p) => p.id === id) : undefined;
    const converted = product ? convertToBillingUnit(opts.rawAmount, opts.dosingUnit, product.unit) : null;
    setDoseForm({ chemicalProductId: id, quantity: converted != null ? String(converted) : "" });
    doseSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const result = await uploadVisitPhoto(visitId, file);
      if (!result.ok) throw new Error(result.error);
      setPhotoCount((n) => n + 1);
      // Same notice the commercial form gives: without it a queued photo looks uploaded, and
      // the tech has no idea it still has to sync.
      if ("queued" in result && result.queued) {
        setSaveState("saved");
        setSaveMsg("Photo saved on this device — it'll upload automatically");
      }
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

  async function completeVisit(opts: { acknowledgedNoPhoto?: boolean } = {}) {
    setCompletingVisit(true);
    try {
      const response = await fetch(`/api/visits/${visitId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceMessageTemplateId: selectedServiceMessageId || null,
          acknowledgedNoPhoto: opts.acknowledgedNoPhoto === true,
          acknowledgedNoChemicals: noChemicals,
        }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (data.error === "MISSING_REQUIRED_PHOTO") {
        // A prompt, not a dead end -- see renderNoPhotoPrompt. Still says plainly that a photo on a
        // sibling body doesn't count, which is the mistake the combined capture screen used to invite.
        setNoPhotoPrompt(true);
        return;
      }
      if (data.error === "MISSING_SERVICE_MESSAGE") {
        setSaveState("error");
        setSaveMsg("Pick a message to the customer before completing");
        return;
      }
      if (data.error === "MISSING_REQUIRED_READINGS") {
        setSaveState("error");
        setSaveMsg("Missing required readings");
        return;
      }
      if (data.error === "MISSING_CHEMICALS_CONFIRMATION") {
        setSaveState("error");
        setSaveMsg("Add the chemicals you used, or tick that you added none");
        doseSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setSaveState("error");
      setSaveMsg("Completion failed");
    } catch {
      // fetch itself can throw (network drop, tab backgrounded) instead of resolving with
      // a non-ok response -- confirmed via Sentry (JAVASCRIPT-NEXTJS-3, Mobile Safari,
      // "TypeError: Load failed") on the sibling commercial form: the POST had already
      // succeeded server-side by the time the connection dropped, so the visit was
      // actually completed even though the technician saw nothing happen. Safe to just
      // retry either way -- /api/visits/[id]/complete is idempotent once COMPLETED.
      setSaveState("error");
      setSaveMsg("Connection issue — tap Complete again to confirm");
    } finally {
      setCompletingVisit(false);
    }
  }

  function renderSlider(f: FieldConfig) {
    const isSet = reading[f.key] !== "";
    const isInvalid = invalidFieldKeys.has(f.key);
    const fallback = (f.min + f.max) / 2;
    const value = isSet && !isInvalid ? Number(reading[f.key]) : fallback;
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
              min={f.min}
              max={f.max}
              value={reading[f.key]}
              disabled={isCompleted}
              placeholder={fallback.toString()}
              onChange={(e) => {
                const raw = e.target.value;
                const val = raw !== "" && Number.isInteger(f.step) ? String(roundToStep(Number(raw), f.step)) : raw;
                setReading((prev) => ({ ...prev, [f.key]: val }));
              }}
              className={`w-16 rounded border px-1.5 py-0.5 text-right font-[family-name:var(--font-mono)] text-sm disabled:bg-brand-foam ${
                isInvalid ? "border-brand-danger text-brand-danger" : "border-brand-control text-brand-ink"
              }`}
            />
            {f.unitLabel ? <span className="text-xs text-brand-muted">{f.unitLabel}</span> : null}
          </span>
        </div>
        {isInvalid ? (
          <p className="mt-1 text-xs text-brand-danger">
            Enter a value between {f.min} and {f.max} — this didn&rsquo;t save.
          </p>
        ) : null}

        <div className="relative mt-3 h-6">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-foam" />
          <div
            className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-brand-ink shadow ${
              isInvalid ? "bg-brand-danger" : isSet ? "bg-brand-primary" : "bg-brand-border"
            }`}
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

  /**
   * Shown when Complete is pressed with no photo for this body of water.
   *
   * Worded as a requirement on purpose, because the photo is what the customer actually sees of the
   * visit -- but it does not block, since the photo is not a compliance record. Blocking used to
   * strand the visit IN_PROGRESS, and getMonthlyReadingRows only counts COMPLETED visits, so the
   * readings never reached the public log at all and the customer's summary for the whole walk-up
   * waited with them.
   *
   * Finishing without one is one deliberate extra tap rather than the easy path, and a completed
   * visit with no photo stays visible to an admin afterwards.
   */
  function renderNoPhotoPrompt() {
    if (!noPhotoPrompt) return null;
    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center bg-brand-ink/70 p-4"
        style={{ zIndex: ABOVE_MAP_Z_INDEX }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-photo-title"
      >
        <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-white p-5 shadow-soft">
          <p className="app-metric text-xs font-semibold uppercase tracking-wide text-brand-warn">Photo required</p>
          <h2 id="no-photo-title" className="mt-1 font-display text-lg font-bold text-brand-ink">
            No photo for this one yet
          </h2>
          <p className="mt-2 text-sm text-brand-ink">
            The photo is what the customer sees of today&rsquo;s visit, and it has to be of this body of water
            &mdash; one taken on another pool or spa here doesn&rsquo;t count.
          </p>
          <p className="mt-2 text-sm text-brand-muted">
            If you genuinely can&rsquo;t take one, you can still finish. Your readings are recorded either way, and
            the summary goes out without a photo for this one.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={() => setNoPhotoPrompt(false)} className="app-btn-primary-sm min-h-[44px]">
              Go back and take it
            </button>
            <button
              type="button"
              onClick={() => {
                setNoPhotoPrompt(false);
                void completeVisit({ acknowledgedNoPhoto: true });
              }}
              className="app-btn-secondary-sm min-h-[44px]"
            >
              Finish without a photo
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <section className="mt-6 space-y-4">
      {renderNoPhotoPrompt()}
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
        <div data-tour="visit-chemistry" className="app-card">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Chemistry</h2>
          <div className="mt-3 space-y-3">{chemistryFields.map(renderSlider)}</div>
        </div>
      ) : null}

      {hasVolume ? (
        <DosingCard
          visitId={visitId}
          dosing={dosing}
          bromineStatus={null}
          onApplyDose={applyDoseFromCard}
          onPrefillDoseForm={prefillDoseForm}
        />
      ) : (
        <div className="app-card">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">
            Recommended Dosing
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            This body of water has no volume set — measure it now to get dosing recommendations.
          </p>
          <div className="mt-3">
            <VisitVolumeCalculator
              visitId={visitId}
              onSaved={(result) => {
                setHasVolume(true);
                if (result.dosing) setDosing(result.dosing);
              }}
            />
          </div>
        </div>
      )}

      <div data-tour="visit-doses" className="app-card" ref={doseSectionRef}>
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
              onChange={(e) => {
                const id = e.target.value;
                if (pendingDoseHint) {
                  const product = chemicalProducts.find((p) => p.id === id);
                  const converted = product ? convertToBillingUnit(pendingDoseHint.rawAmount, pendingDoseHint.dosingUnit, product.unit) : null;
                  setDoseForm({ chemicalProductId: id, quantity: converted != null ? String(converted) : "" });
                } else {
                  setDoseForm((d) => ({ ...d, chemicalProductId: id }));
                }
              }}
              className="app-field-sm"
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
              className="app-field-sm"
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
              {canRemoveDose ? (
                <button
                  type="button"
                  onClick={() => void removeDose(d)}
                  disabled={removingDoseId === d.id}
                  aria-label={`Remove ${d.productName} ${d.quantity} ${d.unit}`}
                  className="app-btn-ghost-sm ml-auto"
                >
                  {removingDoseId === d.id ? "Removing…" : "Remove"}
                </button>
              ) : null}
            </li>
          ))}
          {doses.length === 0 ? <li className="text-brand-muted">No doses added yet.</li> : null}
        </ul>

        {/* The way to close out a stop where nothing was poured. Shown only while the list is
            empty -- once a dose exists the question is answered, and a stale tick alongside real
            doses would be a contradiction in the record. */}
        {doses.length === 0 && !isCompleted ? (
          <label className="mt-3 flex min-h-[44px] items-start gap-3 rounded border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-ink">
            <input
              type="checkbox"
              checked={noChemicals}
              onChange={(e) => setNoChemicals(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span>I did not add chemicals at today&rsquo;s service call.</span>
          </label>
        ) : null}
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
              className="app-field-sm"
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

      <div data-tour="visit-photos" className="app-card">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-brand-ink">Photo Capture</h2>
        <p className="mt-1 text-sm text-brand-muted">
          At least 1 photo is required to complete this visit. Photos must be taken live with the camera — uploading an existing image isn&rsquo;t allowed.
        </p>
        <p className="mt-1 text-sm font-medium text-brand-ink">Photos on file: {photoCount}</p>
        {initialPhotos.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {initialPhotos.map((p) =>
              p.url ? (
                <PhotoThumbnail
                  key={p.id}
                  src={p.url}
                  alt="Service visit photo"
                  size={80}
                  className="h-20 w-20 rounded border border-brand-border object-cover"
                />
              ) : null,
            )}
          </div>
        ) : null}
        <CameraCapture onCapture={uploadPhoto} disabled={isCompleted || uploadingPhoto} />
        {uploadingPhoto ? <p className="mt-2 text-sm text-brand-muted">Uploading photo...</p> : null}
      </div>

      {!isCompleted && serviceMessages.length > 0 ? (
        <div data-tour="visit-service-message" className="app-card mt-4">
          <p className="text-sm font-semibold text-brand-ink">Message to the customer</p>
          <p className="mt-1 text-xs text-brand-ink">
            This goes out in their service summary email. Pick the one that matches what actually
            happened today.
          </p>
          <div className="mt-3 space-y-2">
            {serviceMessages.map((msg) => (
              <label
                key={msg.id}
                className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  selectedServiceMessageId === msg.id ? "border-brand-primary bg-brand-foam" : "border-brand-border bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="serviceMessage"
                  value={msg.id}
                  checked={selectedServiceMessageId === msg.id}
                  onChange={() => setSelectedServiceMessageId(msg.id)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brand-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-brand-ink">{msg.label}</span>
                  <span className="mt-0.5 block text-xs text-brand-ink">{msg.body}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div data-tour="visit-complete" className="app-card">
        <button
          type="button"
          onClick={() => void completeVisit()}
          disabled={
            isCompleted ||
            requiredMissing ||
            hasInvalidReading ||
            photoCount < 1 ||
            completingVisit ||
            (doses.length === 0 && !noChemicals) ||
            (serviceMessages.length > 0 && !selectedServiceMessageId)
          }
          className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primaryHover disabled:cursor-not-allowed disabled:bg-brand-control"
        >
          {isCompleted ? "Visit completed" : completingVisit ? "Completing..." : "Complete service visit"}
        </button>
        {!isCompleted && hasInvalidReading ? (
          <p className="mt-2 text-sm text-brand-danger">Fix the reading(s) marked in red above before completing.</p>
        ) : !isCompleted && (requiredMissing || photoCount < 1) ? (
          <p className="mt-2 text-sm text-brand-warn">Completion requires all required (*) readings and at least one photo.</p>
        ) : !isCompleted && doses.length === 0 && !noChemicals ? (
          <p className="mt-2 text-sm text-brand-warn">
            Add the chemicals you used above, or tick that you added none, before completing.
          </p>
        ) : !isCompleted && serviceMessages.length > 0 && !selectedServiceMessageId ? (
          <p className="mt-2 text-sm text-brand-warn">Pick a message to the customer above before completing.</p>
        ) : null}
      </div>
    </section>
  );
}
