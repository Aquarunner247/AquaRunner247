"use client";

import { useMemo, useState } from "react";
import { calculateGallons, type VolumeShapeKey } from "@/lib/volume-calculator";
import { saveVolumeCalculation } from "@/app/dashboard/customers/[id]/actions";

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

type Props = {
  bodyId: string;
  customerId: string;
  defaults: VolumeCalculationDefaults;
};

function toStr(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

/**
 * Shape picker -> relevant dimension fields appear -> live-computed gallons preview as the
 * technician types (client-side, via lib/volume-calculator.ts's pure calculateGallons) ->
 * "Save to property" persists both a VolumeCalculation row (so a future visit can correct
 * one dimension instead of re-measuring) and BodyOfWater.volumeGallons itself, which stays
 * the single number every other feature (dosing, compliance) actually reads.
 */
export function VolumeCalculator({ bodyId, customerId, defaults }: Props) {
  const [open, setOpen] = useState(false);
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

  const gallons = useMemo(
    () =>
      calculateGallons({
        shape,
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
      }),
    [
      shape, lengthFt, widthFt, radiusFt, shallowDepthFt, deepDepthFt, freeformA, freeformB,
      shallowSecLengthFt, shallowSecWidthFt, shallowSecDepthFt, deepSecLengthFt, deepSecWidthFt, deepSecDepthFt,
    ],
  );

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

      <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Shape</label>
      <select value={shape} onChange={(e) => setShape(e.target.value as VolumeShapeKey)} className={`mt-1 w-full ${inputClass}`}>
        {(Object.keys(SHAPE_LABELS) as VolumeShapeKey[]).map((key) => (
          <option key={key} value={key}>
            {SHAPE_LABELS[key]}
          </option>
        ))}
      </select>

      {shape === "MULTI_DEPTH" ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-muted">Shallow section</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input value={shallowSecLengthFt} onChange={(e) => setShallowSecLengthFt(e.target.value)} type="number" step="0.1" placeholder="Length ft" className={inputClass} />
            <input value={shallowSecWidthFt} onChange={(e) => setShallowSecWidthFt(e.target.value)} type="number" step="0.1" placeholder="Width ft" className={inputClass} />
            <input value={shallowSecDepthFt} onChange={(e) => setShallowSecDepthFt(e.target.value)} type="number" step="0.1" placeholder="Depth ft" className={inputClass} />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-muted">Deep section</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input value={deepSecLengthFt} onChange={(e) => setDeepSecLengthFt(e.target.value)} type="number" step="0.1" placeholder="Length ft" className={inputClass} />
            <input value={deepSecWidthFt} onChange={(e) => setDeepSecWidthFt(e.target.value)} type="number" step="0.1" placeholder="Width ft" className={inputClass} />
            <input value={deepSecDepthFt} onChange={(e) => setDeepSecDepthFt(e.target.value)} type="number" step="0.1" placeholder="Depth ft" className={inputClass} />
          </div>
        </>
      ) : (
        <>
          {shape === "CIRCLE" ? (
            <div className="mt-2">
              <input value={radiusFt} onChange={(e) => setRadiusFt(e.target.value)} type="number" step="0.1" placeholder="Radius ft" className={`w-full ${inputClass}`} />
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={lengthFt} onChange={(e) => setLengthFt(e.target.value)} type="number" step="0.1" placeholder="Length ft" className={inputClass} />
              <input value={widthFt} onChange={(e) => setWidthFt(e.target.value)} type="number" step="0.1" placeholder="Width ft" className={inputClass} />
            </div>
          )}

          {shape === "KIDNEY_FREEFORM" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={freeformA} onChange={(e) => setFreeformA(e.target.value)} type="number" step="0.1" placeholder="Measurement A ft" className={inputClass} />
              <input value={freeformB} onChange={(e) => setFreeformB(e.target.value)} type="number" step="0.1" placeholder="Measurement B ft" className={inputClass} />
            </div>
          ) : null}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={shallowDepthFt} onChange={(e) => setShallowDepthFt(e.target.value)} type="number" step="0.1" placeholder="Shallow depth ft" className={inputClass} />
            <input value={deepDepthFt} onChange={(e) => setDeepDepthFt(e.target.value)} type="number" step="0.1" placeholder="Deep depth ft" className={inputClass} />
          </div>
        </>
      )}

      <div className="mt-3 rounded border border-brand-border bg-brand-surface p-2">
        <p className="text-xs uppercase tracking-wide text-brand-muted">Calculated volume</p>
        <p className="app-metric text-lg text-brand-ink">{gallons != null ? `${Math.round(gallons).toLocaleString()} gal` : "—"}</p>
      </div>

      <form action={saveVolumeCalculation} className="mt-3">
        <input type="hidden" name="bodyId" value={bodyId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="shape" value={shape} />
        <input type="hidden" name="lengthFt" value={lengthFt} />
        <input type="hidden" name="widthFt" value={widthFt} />
        <input type="hidden" name="radiusFt" value={radiusFt} />
        <input type="hidden" name="shallowDepthFt" value={shallowDepthFt} />
        <input type="hidden" name="deepDepthFt" value={deepDepthFt} />
        <input type="hidden" name="freeformMeasurementA" value={freeformA} />
        <input type="hidden" name="freeformMeasurementB" value={freeformB} />
        <input type="hidden" name="shallowSectionLengthFt" value={shallowSecLengthFt} />
        <input type="hidden" name="shallowSectionWidthFt" value={shallowSecWidthFt} />
        <input type="hidden" name="shallowSectionDepthFt" value={shallowSecDepthFt} />
        <input type="hidden" name="deepSectionLengthFt" value={deepSecLengthFt} />
        <input type="hidden" name="deepSectionWidthFt" value={deepSecWidthFt} />
        <input type="hidden" name="deepSectionDepthFt" value={deepSecDepthFt} />
        <button type="submit" disabled={gallons == null} className="app-btn-primary-sm min-h-[44px] disabled:opacity-50">
          Save to property
        </button>
      </form>
    </div>
  );
}
