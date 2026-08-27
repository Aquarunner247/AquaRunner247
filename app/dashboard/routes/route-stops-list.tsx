"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDragReorder } from "@/lib/client/use-drag-reorder";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { RouteBuilderMap } from "@/app/components/route-builder-map";
import { haversineMiles } from "@/lib/geocode";
import { removeRouteStop } from "./actions";

export type RouteStopItem = {
  id: string;
  propertyName: string;
  bodyName: string | null;
  etaOffsetMinutes: number;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  routeId: string;
  stops: RouteStopItem[];
  /// Route optimization is a Pro feature (see lib/plan-tiers.ts) -- defaults to true so any
  /// caller that hasn't been updated to pass it doesn't lose the button.
  proAccess?: boolean;
};

export function RouteStopsList({ routeId, stops: initialStops, proAccess = true }: Props) {
  const [stops, setStops] = useState(initialStops);
  const [saving, setSaving] = useState(false);

  // The server re-sends a fresh `stops` prop after add/remove-stop actions revalidate
  // this page, but React reuses this already-mounted instance rather than remounting it,
  // so the initial useState seed above never sees that update on its own -- without this,
  // a newly added (or removed) stop wouldn't show up until a manual page reload.
  useEffect(() => {
    setStops(initialStops);
  }, [initialStops]);

  async function persistOrder(next: RouteStopItem[]) {
    setStops(next);
    setSaving(true);
    try {
      await fetch(`/api/routes/${routeId}/stops/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopIds: next.map((s) => s.id) }),
      });
    } finally {
      setSaving(false);
    }
  }

  const { draggingIndex, setItemRef, dragHandleProps } = useDragReorder(stops, persistOrder);

  /** Same straight-line nearest-neighbor heuristic as the day-of schedule's "Optimize stop
   * order" (see RouteDayView) -- reorders the route's default stop sequence, not a single
   * day's actual visits. Stops with no property coordinates yet (not geocoded) are left in
   * place at the end, same as there. */
  function optimizeStops() {
    const withCoords = stops.filter((s) => s.latitude != null && s.longitude != null) as (RouteStopItem & {
      latitude: number;
      longitude: number;
    })[];
    const withoutCoords = stops.filter((s) => s.latitude == null || s.longitude == null);
    if (withCoords.length < 2) return;

    const remaining = [...withCoords];
    const ordered: RouteStopItem[] = [remaining.shift()!];
    while (remaining.length) {
      const last = ordered[ordered.length - 1] as RouteStopItem & { latitude: number; longitude: number };
      let bestIdx = 0;
      let bestDist = Infinity;
      remaining.forEach((candidate, idx) => {
        const d = haversineMiles(last, candidate);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    void persistOrder([...ordered, ...withoutCoords]);
  }

  if (stops.length === 0) {
    return <p className="text-sm text-brand-muted">No stops yet.</p>;
  }

  return (
    <div className="mt-3">
      {proAccess ? (
        <button type="button" onClick={optimizeStops} disabled={saving} className="app-btn-secondary-sm mb-2">
          Optimize stop order
        </button>
      ) : (
        <Link href="/dashboard/billing" className="mb-2 block text-xs font-medium text-brand-primary underline">
          Upgrade to Pro to optimize stop order
        </Link>
      )}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_360px]">
        <ol className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {stops.map((stop, idx) => {
            const handleProps = dragHandleProps(idx);
            return (
              <li
                key={stop.id}
                ref={setItemRef(idx)}
                className={`app-card-inset flex flex-wrap items-center justify-between gap-2 text-sm ${
                  draggingIndex === idx ? "opacity-60" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    {...handleProps}
                    aria-label={`Drag to reorder ${stop.propertyName}`}
                    title="Drag to reorder"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-brand-muted cursor-grab select-none active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-brand-primaryHover">{idx + 1}.</span> {stop.propertyName} —{" "}
                    {stop.bodyName ?? "Property-level"}
                    {stop.etaOffsetMinutes ? ` · +${stop.etaOffsetMinutes} min` : ""}
                  </span>
                </span>
                <form action={removeRouteStop}>
                  <input type="hidden" name="stopId" value={stop.id} />
                  <ConfirmSubmitButton
                    label="Remove"
                    confirmMessage="Remove this stop from the route?"
                    className="app-btn-ghost-sm"
                  />
                </form>
              </li>
            );
          })}
          {saving ? <p className="text-xs text-brand-muted">Saving order…</p> : null}
        </ol>
        <RouteBuilderMap
          stops={stops.map((stop) => ({
            id: stop.id,
            label: `${stop.propertyName} — ${stop.bodyName ?? "Property-level"}`,
            latitude: stop.latitude,
            longitude: stop.longitude,
          }))}
        />
      </div>
    </div>
  );
}
