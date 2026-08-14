"use client";

import { useMemo, useState } from "react";
import { calculateGallons, type VolumeShapeKey } from "@/lib/volume-calculator";
import { saveVolumeCalculation } from "@/app/dashboard/customers/[id]/actions";
import type { DosingResult } from "@/lib/dosing-calculator";

const inputClass = "rounded border border-brand-control px-2 py-1.5 text-sm";

const SHAPE_LABELS: Record<VolumeShapeKey, string> = {
  RECTANGLE: "Rectangle",
  CIRCLE: "Circle",
  OVAL: "Oval",
  KIDNEY_FREEFORM: "Kidney / freeform",
  MULTI_DEPTH: "Multi-depth (two sections)",
};

export type VolumeCalculationDefaults = {
  shape: VolumeShapeKey;
  lengthFt?: number | null;
  widthFt?: number | null;
  radiusFt?: number | null;
  shallowDepthFt?: number | null;
  deepDepthFt?: number | null;
  freeformMeasurementA?: number | null;
  freeformMeasurementB?: number | null;
  shallowSectionLengthFt?: number | null;
  shallowSectionWidthFt?: number | null;
  shallowSectionDepthFt?: number | null;
  deepSectionLengthFt?: number | null;
  deepSectionWidthFt?: number | null;
  deepSectionDepthFt?: number | null;
} | null;

function toStr(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

/**
 * All the shape/dimension state + live gallons calculation, shared by both the admin
 * (VolumeCalculator) and in-visit (VisitVolumeCalculator) UIs below -- the only thing that
 * differs between those two callers is how the result gets *saved* (an admin server action
 * form vs. a fetch to a visit-scoped API route), not how dimensions are entered or
 * previewed. Centralizing this here is what keeps that duplication out of both callers.
 */
function useVolumeShapeState(defaults: VolumeCalculationDefaults) {
  const [shape, setShape] = useState<VolumeShapeKey>(defaults?.shape ?? "RECTANGLE");
  const [lengthFt, setLengthFt] = useState(toStr(defaults?.lengthFt));
  const [widthFt, setWidthFt] = useState(toStr(defaults?.widthFt));
  const [radiusFt, setRadiusFt] = useState(toStr(defaults?.radiusFt));
  const [shallowDepthFt, setShallowDepthFt] = useState(toStr(defaults?.shallowDepthFt));
  const [deepDepthFt, setDeepDepthFt] = useState(toStr(defaults?.deepDepthFt));
  const [freeformA, setFreeformA] = useState(toStr(defaults?.freeformMeasurementA));
  const [freeformB, setFreeformB] = useState(toStr(defaults?.freeformMeasurementB));
  const [shallowSecLengthFt, setShallowSecLengthFt] = useState(toStr(defaults?.shallowSectionLengthFt));
  const [shallowSecWidthFt, setShallowSecWidthFt] = useState(toStr(defaults?.shallowSectionWidthFt));
  const [shallowSecDepthFt, setShallowSecDepthFt] = useState(toStr(defaults?.shallowSectionDepthFt));
  const [deepSecLengthFt, setDeepSecLengthFt] = useState(toStr(defaults?.deepSectionLengthFt));
  const [deepSecWidthFt, setDeepSecWidthFt] = useState(toStr(defaults?.deepSectionWidthFt));
  const [deepSecDepthFt, setDeepSecDepthFt] = useState(toStr(defaults?.deepSectionDepthFt));

  const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  const dims = {
    lengthFt: num(lengthFt),
    widthFt: num(widthFt),
    radiusFt: num(radiusFt),
    shallowDepthFt: num(shallowDepthFt),
    deepDepthFt: num(deepDepthFt),
    freeformMeasurementA: num(freeformA),
    freeformMeasurementB: num(freeformB),
    shallowSectionLengthFt: num(shallowSecLengthFt),
    shallowSectionWidthFt: num(shallowSecWidthFt),
    shallowSectionDepthFt: num(shallowSecDepthFt),
    deepSectionLengthFt: num(deepSecLengthFt),
    deepSectionWidthFt: num(deepSecWidthFt),
    deepSectionDepthFt: num(deepSecDepthFt),
  };

  const gallons = useMemo(() => calculateGallons({ shape, ...dims }), [shape, JSON.stringify(dims)]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    shape,
    setShape,
    lengthFt,
    setLengthFt,
    widthFt,
    setWidthFt,
    radiusFt,
    setRadiusFt,
    shallowDepthFt,
    setShallowDepthFt,
    deepDepthFt,
    setDeepDepthFt,
    freeformA,
    setFreeformA,
    freeformB,
    setFreeformB,
    shallowSecLengthFt,
    setShallowSecLengthFt,
    shallowSecWidthFt,
    setShallowSecWidthFt,
    shallowSecDepthFt,
    setShallowSecDepthFt,
    deepSecLengthFt,
    setDeepSecLengthFt,
    deepSecWidthFt,
    setDeepSecWidthFt,
    deepSecDepthFt,
    setDeepSecDepthFt,
    dims,
    gallons,
  };
}

type ShapeState = ReturnType<typeof useVolumeShapeState>;

/** Shape picker + the relevant dimension inputs for that shape + a live gallons preview.
 * No submit control -- each caller owns how the result actually gets saved. */
function VolumeShapeFields({ state }: { state: ShapeState }) {
  return (
    <>
      <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Shape</label>
      <select
        value={state.shape}
        onChange={(e) => state.setShape(e.target.value as VolumeShapeKey)}
        className={`mt-1 w-full ${inputClass}`}
      >
        {(Object.keys(SHAPE_LABELS) as VolumeShapeKey[]).map((key) => (
          <option key={key} value={key}>
            {SHAPE_LABELS[key]}
          </option>
        ))}
      </select>

      {state.shape === "MULTI_DEPTH" ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-muted">Shallow section</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input value={state.shallowSecLengthFt} onChange={(e) => state.setShallowSecLengthFt(e.target.value)} type="number" step="0.1" placeholder="Length ft" className={inputClass} />
            <input value={state.shallowSecWidthFt} onChange={(e) => state.setShallowSecWidthFt(e.target.value)} type="number" step="0.1" placeholder="Width ft" className={inputClass} />
            <input value={state.shallowSecDepthFt} onChange={(e) => state.setShallowSecDepthFt(e.target.value)} type="number" step="0.1" placeholder="Depth ft" className={inputClass} />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-muted">Deep section</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input value={state.deepSecLengthFt} onChange={(e) => state.setDeepSecLengthFt(e.target.value)} type="number" step="0.1" placeholder="Length ft" className={inputClass} />
            <input value={state.deepSecWidthFt} onChange={(e) => state.setDeepSecWidthFt(e.target.value)} type="number" step="0.1" placeholder="Width ft" className={inputClass} />
            <input value={state.deepSecDepthFt} onChange={(e) => state.setDeepSecDepthFt(e.target.value)} type="number" step="0.1" placeholder="Depth ft" className={inputClass} />
          </div>
        </>
      ) : (
        <>
          {state.shape === "CIRCLE" ? (
            <div className="mt-2">
              <input value={state.radiusFt} onChange={(e) => state.setRadiusFt(e.target.value)} type="number" step="0.1" placeholder="Radius ft" className={`w-full ${inputClass}`} />
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={state.lengthFt} onChange={(e) => state.setLengthFt(e.target.value)} type="number" step="0.1" placeholder="Length ft" className={inputClass} />
              <input value={state.widthFt} onChange={(e) => state.setWidthFt(e.target.value)} type="number" step="0.1" placeholder="Width ft" className={inputClass} />
            </div>
          )}

          {state.shape === "KIDNEY_FREEFORM" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={state.freeformA} onChange={(e) => state.setFreeformA(e.target.value)} type="number" step="0.1" placeholder="Measurement A ft" className={inputClass} />
              <input value={state.freeformB} onChange={(e) => state.setFreeformB(e.target.value)} type="number" step="0.1" placeholder="Measurement B ft" className={inputClass} />
            </div>
          ) : null}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={state.shallowDepthFt} onChange={(e) => state.setShallowDepthFt(e.target.value)} type="number" step="0.1" placeholder="Shallow depth ft" className={inputClass} />
            <input value={state.deepDepthFt} onChange={(e) => state.setDeepDepthFt(e.target.value)} type="number" step="0.1" placeholder="Deep depth ft" className={inputClass} />
          </div>
        </>
      )}

      <div className="mt-3 rounded border border-brand-border bg-brand-surface p-2">
        <p className="text-xs uppercase tracking-wide text-brand-muted">Calculated volume</p>
        <p className="app-metric text-lg text-brand-ink">{state.gallons != null ? `${Math.round(state.gallons).toLocaleString()} gal` : "—"}</p>
      </div>
    </>
  );
}

type Props = {
  bodyId: string;
  customerId: string;
  defaults: VolumeCalculationDefaults;
};

/**
 * Admin body-of-water edit page tool: shape picker -> dimension fields -> live gallons
 * preview -> "Save to property" persists both a VolumeCalculation row (so a future visit
 * can correct one dimension instead of re-measuring) and BodyOfWater.volumeGallons itself,
 * which stays the single number every other feature (dosing, compliance) actually reads.
 * Unchanged behavior from before this file was split -- see VisitVolumeCalculator below
 * for the in-visit counterpart, which shares this same field UI via VolumeShapeFields but
 * saves through a different, technician-permission-scoped path.
 */
export function VolumeCalculator({ bodyId, customerId, defaults }: Props) {
  const [open, setOpen] = useState(false);
  const state = useVolumeShapeState(defaults);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="app-btn-primary-sm min-h-[44px]">
        Calculate volume
      </button>
    );
  }

  return (
    <div className="app-card-inset mt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-ink">Calculate volume</p>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-brand-muted underline">
          Close
        </button>
      </div>

      <VolumeShapeFields state={state} />

      <form action={saveVolumeCalculation} className="mt-3">
        <input type="hidden" name="bodyId" value={bodyId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="shape" value={state.shape} />
        <input type="hidden" name="lengthFt" value={state.lengthFt} />
        <input type="hidden" name="widthFt" value={state.widthFt} />
        <input type="hidden" name="radiusFt" value={state.radiusFt} />
        <input type="hidden" name="shallowDepthFt" value={state.shallowDepthFt} />
        <input type="hidden" name="deepDepthFt" value={state.deepDepthFt} />
        <input type="hidden" name="freeformMeasurementA" value={state.freeformA} />
        <input type="hidden" name="freeformMeasurementB" value={state.freeformB} />
        <input type="hidden" name="shallowSectionLengthFt" value={state.shallowSecLengthFt} />
        <input type="hidden" name="shallowSectionWidthFt" value={state.shallowSecWidthFt} />
        <input type="hidden" name="shallowSectionDepthFt" value={state.shallowSecDepthFt} />
        <input type="hidden" name="deepSectionLengthFt" value={state.deepSecLengthFt} />
        <input type="hidden" name="deepSectionWidthFt" value={state.deepSecWidthFt} />
        <input type="hidden" name="deepSectionDepthFt" value={state.deepSecDepthFt} />
        <button type="submit" disabled={state.gallons == null} className="app-btn-primary-sm min-h-[44px] disabled:opacity-50">
          Save to property
        </button>
      </form>
    </div>
  );
}

type VisitVolumeCalculatorProps = {
  visitId: string;
  onSaved: (result: { calculatedGallons: number; dosing: DosingResult | null }) => void;
};

/**
 * In-visit counterpart to VolumeCalculator -- for when no admin has set a body of water's
 * gallons ahead of time, the technician can measure and save it right there instead of the
 * Dosing Card just having nothing to show. Same field UI (VolumeShapeFields), but saves via
 * POST to /api/visits/[id]/volume (technician-permission-scoped to their own visit) rather
 * than the admin-only saveVolumeCalculation server action. No `defaults` -- this only
 * appears when nothing has been calculated for this body of water yet.
 */
export function VisitVolumeCalculator({ visitId, onSaved }: VisitVolumeCalculatorProps) {
  const state = useVolumeShapeState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/visits/${visitId}/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape: state.shape, ...state.dims }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "INVALID_DIMENSIONS" ? "Fill in every measurement for this shape." : "Couldn't save volume — try again.");
        return;
      }
      onSaved({ calculatedGallons: data.calculatedGallons, dosing: data.dosing ?? null });
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <VolumeShapeFields state={state} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={state.gallons == null || saving}
        className="app-btn-primary-sm mt-3 min-h-[44px] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save volume"}
      </button>
      {error ? <p className="mt-2 text-sm text-brand-danger">{error}</p> : null}
    </div>
  );
}
