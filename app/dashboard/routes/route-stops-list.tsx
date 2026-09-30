"use client";

import { useEffect, useState } from "react";
import { useDragReorder } from "@/lib/client/use-drag-reorder";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { RouteBuilderMap } from "@/app/components/route-builder-map";
import { computeOptimizedStopOrder } from "@/lib/routing";
import { coalesceBundleMembers } from "@/lib/stop-grouping";
import { removeRouteStop } from "./actions";

export type RouteStopItem = {
  id: string;
  propertyId: string;
  propertyName: string;
  bodyName: string | null;
  /** BodyOfWater.type. Only used to keep a bundle's members adjacent after optimizing -- see
   *  coalesceBundleMembers, and lib/stop-grouping.ts for why a bundle holds one of each kind. */
  bodyType: string | null;
  etaOffsetMinutes: number;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  routeId: string;
  stops: RouteStopItem[];
  /** Where this route's day begins and finishes, already resolved through the route override ->
   *  technician default -> none chain by lib/route-endpoints.ts. Both null reproduces the
   *  original behavior, where the first stop was simply pinned in place. */
  startPoint?: { latitude: number; longitude: number } | null;
  endPoint?: { latitude: number; longitude: number } | null;
};

export function RouteStopsList({ routeId, stops: initialStops, startPoint = null, endPoint = null }: Props) {
  const [stops, setStops] = useState(initialStops);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

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

  /** Reorders the route's default stop sequence (not a single day's actual visits) by real
   * driving duration -- see lib/routing.ts's computeOptimizedStopOrder, which falls back to
   * straight-line distance if OSRM's table service is unreachable. Stops with no property
   * coordinates yet (not geocoded) are left in place at the end, same as before.
   *
   * This used to optimize with no start or end at all, which pinned whichever stop happened to
   * be first and ignored the technician's home entirely -- so the same route ordered differently
   * here than on the day-of schedule, which did pass a start. Both now go through the same
   * resolved endpoints. */
  async function optimizeStops() {
    const withCoords = stops.filter((s) => s.latitude != null && s.longitude != null) as (RouteStopItem & {
      latitude: number;
      longitude: number;
    })[];
    const withoutCoords = stops.filter((s) => s.latitude == null || s.longitude == null);
    if (withCoords.length < 2) return;

    setOptimizing(true);
    try {
      const ordered = await computeOptimizedStopOrder(withCoords, { start: startPoint, end: endPoint });
      // Keeps each property's pool and spa adjacent. The cost function can't see bundles: two
      // bodies at one property are metres apart, so interleaving two nearby properties costs it
      // nothing and nothing prefers the grouped order. This sets the template every generated
      // visit inherits its routeSequence from, so an interleave here repeats every week.
      const grouped = coalesceBundleMembers(
        ordered.map((s) => ({
          id: s.id,
          propertyId: s.propertyId,
          bodyType: s.bodyType,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
      );
      const byId = new Map(ordered.map((s) => [s.id, s]));
      const reordered = grouped.map((g) => byId.get(g.id)!).filter(Boolean);
      await persistOrder([...reordered, ...withoutCoords]);
    } finally {
      setOptimizing(false);
    }
  }

  if (stops.length === 0) {
    return <p className="text-sm text-brand-muted">No stops yet.</p>;
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={optimizeStops} disabled={saving || optimizing} className="app-btn-secondary-sm mb-2">
        {optimizing ? "Optimizing…" : "Optimize stop order"}
      </button>
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
