"use client";

import { useEffect, useState } from "react";
import { useDragReorder } from "@/lib/client/use-drag-reorder";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { RouteBuilderMap } from "@/app/components/route-builder-map";
import { computeOptimizedStopOrder } from "@/lib/routing";
import { coalesceBundleMembers, formatSequenceRange, groupNearbyStops } from "@/lib/stop-grouping";
import { removeRouteStop } from "./actions";

export type RouteStopItem = {
  id: string;
  propertyId: string;
  propertyName: string;
  bodyName: string | null;
  /** BodyOfWater.type. Labels a bundled card's members; no longer decides bundling. */
  bodyType: string | null;
  /** BodyOfWater.serviceGroup -- venues declared one walk-up. See lib/stop-grouping.ts. */
  serviceGroup: string | null;
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
  const [orderError, setOrderError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  // The server re-sends a fresh `stops` prop after add/remove-stop actions revalidate
  // this page, but React reuses this already-mounted instance rather than remounting it,
  // so the initial useState seed above never sees that update on its own -- without this,
  // a newly added (or removed) stop wouldn't show up until a manual page reload.
  useEffect(() => {
    setStops(initialStops);
  }, [initialStops]);

  /** Preview only. The save is commitOrder, once, when the finger lifts -- see useDragReorder. */
  function previewOrder(next: RouteStopItem[]) {
    setStops(next);
  }

  /**
   * Writes the new order. Also the path "Optimize stop order" takes, which is a single deliberate
   * save rather than a drag.
   *
   * Worth not firing per crossed row here especially: this endpoint also renumbers every future
   * day the route generates, so a fourteen-step drag meant fourteen whole-day rebuilds racing each
   * other. A failure is shown rather than swallowed -- the list has already moved, and silently
   * keeping the old order on the server is how a reorder appears to work and then isn't there.
   */
  async function commitOrder(next: RouteStopItem[]) {
    setStops(next);
    setSaving(true);
    setOrderError(null);
    try {
      const response = await fetch(`/api/routes/${routeId}/stops/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopIds: next.map((s) => s.id) }),
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setOrderError("Order not saved — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const { isDragging, setItemRef, dragHandleProps } = useDragReorder(stops, previewOrder, false, commitOrder);

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
      await commitOrder([...reordered, ...withoutCoords]);
    } finally {
      setOptimizing(false);
    }
  }

  if (stops.length === 0) {
    return <p className="text-sm text-brand-muted">No stops yet.</p>;
  }

  // Declared walk-ups, drawn as one card each. Same function the schedule uses, so the two screens
  // cannot disagree about what a bundle is.
  const stopGroups = groupNearbyStops(
    stops.map((stop) => ({
      id: stop.id,
      propertyId: stop.propertyId,
      latitude: stop.latitude,
      longitude: stop.longitude,
      bodyType: stop.bodyType,
      serviceGroup: stop.serviceGroup,
    })),
  );
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const indexById = new Map(stops.map((stop, index) => [stop.id, index]));

  return (
    <div className="mt-3">
      {orderError ? (
        <p role="status" className="mb-2 rounded-lg border border-brand-danger bg-brand-dangerFill px-3 py-2 text-sm text-brand-ink">
          {orderError}
        </p>
      ) : null}
      <button type="button" onClick={optimizeStops} disabled={saving || optimizing} className="app-btn-secondary-sm mb-2">
        {optimizing ? "Optimizing…" : "Optimize stop order"}
      </button>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_360px]">
        <ol className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {stopGroups.map((group) => {
            const members = group.memberIds.map((id) => stopById.get(id)!).filter(Boolean);
            const first = members[0];
            const startIdx = indexById.get(first.id) ?? 0;
            const positions = members.map((m) => (indexById.get(m.id) ?? 0) + 1);

            // One venue: the plain row it has always been. A card wrapping a single stop is
            // chrome with nothing in it.
            if (members.length === 1) {
              const handleProps = dragHandleProps(startIdx);
              return (
                <li
                  key={first.id}
                  ref={setItemRef(startIdx)}
                  className={`app-card-inset flex flex-wrap items-center justify-between gap-2 text-sm ${
                    isDragging(startIdx) ? "opacity-60" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      {...handleProps}
                      aria-label={`Drag to reorder ${first.propertyName}`}
                      title="Drag to reorder"
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-brand-muted cursor-grab select-none active:cursor-grabbing"
                    >
                      ⠿
                    </span>
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-brand-primaryHover">{startIdx + 1}.</span> {first.propertyName} —{" "}
                      {first.bodyName ?? "Property-level"}
                      {first.etaOffsetMinutes ? ` · +${first.etaOffsetMinutes} min` : ""}
                    </span>
                  </span>
                  <form action={removeRouteStop}>
                    <input type="hidden" name="stopId" value={first.id} />
                    <ConfirmSubmitButton
                      label="Remove"
                      confirmMessage="Remove this stop from the route?"
                      className="app-btn-ghost-sm"
                    />
                  </form>
                </li>
              );
            }

            // A declared walk-up: one card, one position, with each venue keeping its own row --
            // its own readings, photos and completion all still belong to the venue, not the card.
            return (
              <li key={group.groupId} className="app-card-inset text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {/* The card's grip moves the whole run; each venue keeps its own below. */}
                    <span
                      {...dragHandleProps(startIdx, members.length)}
                      aria-label={`Drag to reorder all ${members.length} venues at ${first.propertyName}`}
                      title="Drag to move this whole walk-up"
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-brand-muted cursor-grab select-none active:cursor-grabbing"
                    >
                      ⠿
                    </span>
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-brand-primaryHover">{formatSequenceRange(positions)}.</span>{" "}
                      {first.propertyName}
                      {first.serviceGroup ? <span className="text-brand-muted"> · {first.serviceGroup}</span> : null}
                    </span>
                  </span>
                  <span className="app-badge shrink-0">{members.length} venues</span>
                </div>

                {/* Each venue registers its OWN drag index, so a stop can still be dropped between
                    two members and a venue can be pulled out of the walk-up deliberately. */}
                <ul className="mt-2 divide-y divide-brand-border border-t border-brand-border">
                  {members.map((member) => {
                    const mIdx = indexById.get(member.id) ?? 0;
                    return (
                      <li
                        key={member.id}
                        ref={setItemRef(mIdx)}
                        className={`flex items-center justify-between gap-2 py-1 ${isDragging(mIdx) ? "opacity-60" : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            {...dragHandleProps(mIdx)}
                            aria-label={`Drag ${member.bodyName ?? member.propertyName} out of this walk-up`}
                            title="Drag this venue on its own"
                            className="flex h-11 w-7 shrink-0 items-center justify-center text-brand-muted cursor-grab select-none active:cursor-grabbing"
                          >
                            ⠿
                          </span>
                          <span className="min-w-0 truncate text-brand-ink">
                            {member.bodyName ?? "Property-level"}
                            {member.etaOffsetMinutes ? ` · +${member.etaOffsetMinutes} min` : ""}
                          </span>
                        </span>
                        <form action={removeRouteStop}>
                          <input type="hidden" name="stopId" value={member.id} />
                          <ConfirmSubmitButton
                            label="Remove"
                            confirmMessage="Remove this stop from the route?"
                            className="app-btn-ghost-sm"
                          />
                        </form>
                      </li>
                    );
                  })}
                </ul>
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
