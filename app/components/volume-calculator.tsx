"use client";

import { useMemo, useState } from "react";
import { calculateGallons, type VolumeShapeKey } from "@/lib/volume-calculator";

type Props = {
  action: (formData: FormData) => void;
  bodyId: string;
  customerId: string;
  initial?: {
    shape: VolumeShapeKey;
    lengthFt: number | null;
    widthFt: number | null;
    radiusFt: number | null;
    shallowDepthFt: number | null;
    deepDepthFt: number | null;
    freeformMeasurementA: number | null;
    freeformMeasurementB: number | null;
  } | null;
};

const SHAPE_LABELS: Record<VolumeShapeKey, string> = {
  RECTANGLE: "Rectangle",
  CIRCLE: "Circle",
  OVAL: "Oval",
  KIDNEY_FREEFORM: "Kidney / Freeform",
  MULTI_DEPTH: "Multi-depth (sloped)",
};

function toStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

/**
 * "Calculate volume" tool -- dosing-calculator-spec.md Section 1a. Lives next to the
 * existing gallons field on the BodyOfWater edit screen; a one-time (or geometry-changes-
 * only) setup tool, not something used per visit. Live-computes the preview client-side
 * via the same lib/volume-calculator.ts formulas the server action uses to actually save,
 * so what the tech sees before saving matches what gets written.
 */
export function VolumeCalculator({ action, bodyId, customerId, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [shape, setShape] = useState<VolumeShapeKey>(initial?.shape ?? "RECTANGLE");
  const [lengthFt, setLengthFt] = useState(toStr(initial?.lengthFt));
  const [widthFt, setWidthFt] = useState(toStr(initial?.widthFt));
  const [radiusFt, setRadiusFt] = useState(toStr(initial?.radiusFt));
  const [shallowDepthFt, setShallowDepthFt] = useState(toStr(initial?.shallowDepthFt));
  const [deepDepthFt, setDeepDepthFt] = useState(toStr(initial?.deepDepthFt));
  const [freeformA, setFreeformA] = useState(toStr(initial?.freeformMeasurementA));
  const [freeformB, setFreeformB] = useState(toStr(initial?.freeformMeasurementB));

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

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
      }),
    [shape, lengthFt, widthFt, radiusFt, shallowDepthFt, deepDepthFt, freeformA, freeformB],
  );

  const needsLengthWidth = shape === "RECTANGLE" || shape === "OVAL" || shape === "MULTI_DEPTH";
  const needsRadius = shape === "CIRCLE";
  const needsFreeform = shape === "KIDNEY_FREEFORM";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="app-btn-secondary-sm">
        Calculate volume
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-brand-border bg-brand-surface p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-ink">Calculate volume</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-brand-muted underline">
          Close
        </button>
      </div>

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="bodyId" value={bodyId} />
        <input type="hidden" name="customerId" value={customerId} />

        <label className="block text-sm">
          <span className="text-brand-ink">Shape</span>
          <select
            name="shape"
            value={shape}
            onChange={(e) => setShape(e.target.value as VolumeShapeKey)}
            className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm md:w-56"
          >
            {(Object.keys(SHAPE_LABELS) as VolumeShapeKey[]).map((s) => (
              <option key={s} value={s}>
                {SHAPE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {needsLengthWidth ? (
            <>
              <label className="text-xs text-brand-muted">
                Length (ft)
                <input
                  name="lengthFt"
                  type="number"
                  step="0.1"
                  value={lengthFt}
                  onChange={(e) => setLengthFt(e.target.value)}
                  className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-brand-muted">
                Width (ft)
                <input
                  name="widthFt"
                  type="number"
                  step="0.1"
                  value={widthFt}
                  onChange={(e) => setWidthFt(e.target.value)}
                  className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
                />
              </label>
            </>
          ) : null}

          {needsRadius ? (
            <label className="text-xs text-brand-muted">
              Radius (ft)
              <input
                name="radiusFt"
                type="number"
                step="0.1"
                value={radiusFt}
                onChange={(e) => setRadiusFt(e.target.value)}
                className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}

          {needsFreeform ? (
            <>
              <label className="text-xs text-brand-muted">
                Measurement A (ft)
                <input
                  name="freeformMeasurementA"
                  type="number"
                  step="0.1"
                  value={freeformA}
                  onChange={(e) => setFreeformA(e.target.value)}
                  className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-brand-muted">
                Measurement B (ft)
                <input
                  name="freeformMeasurementB"
                  type="number"
                  step="0.1"
                  value={freeformB}
                  onChange={(e) => setFreeformB(e.target.value)}
                  className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-brand-muted">
                Width (ft)
                <input
                  name="widthFt"
                  type="number"
                  step="0.1"
                  value={widthFt}
                  onChange={(e) => setWidthFt(e.target.value)}
                  className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
                />
              </label>
            </>
          ) : null}

          <label className="text-xs text-brand-muted">
            Shallow depth (ft)
            <input
              name="shallowDepthFt"
              type="number"
              step="0.1"
              value={shallowDepthFt}
              onChange={(e) => setShallowDepthFt(e.target.value)}
              className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-brand-muted">
            Deep depth (ft)
            <input
              name="deepDepthFt"
              type="number"
              step="0.1"
              value={deepDepthFt}
              onChange={(e) => setDeepDepthFt(e.target.value)}
              className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center justify-between rounded border border-brand-border bg-white px-3 py-2">
          <span className="text-sm text-brand-ink">Calculated volume</span>
          <span className="app-metric text-sm font-semibold text-brand-ink">
            {gallons != null ? `${Math.round(gallons).toLocaleString()} gal` : "—"}
          </span>
        </div>

        <button type="submit" disabled={gallons == null} className="app-btn-primary-sm disabled:opacity-50">
          Save to property
        </button>
      </form>
    </div>
  );
}
