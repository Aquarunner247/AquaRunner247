"use client";

import { useEffect, useState } from "react";
import { useDragReorder } from "@/lib/client/use-drag-reorder";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { removeRouteStop } from "./actions";

export type RouteStopItem = {
  id: string;
  propertyName: string;
  bodyName: string | null;
  etaOffsetMinutes: number;
};

type Props = {
  routeId: string;
  stops: RouteStopItem[];
};

export function RouteStopsList({ routeId, stops: initialStops }: Props) {
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

  if (stops.length === 0) {
    return <p className="text-sm text-brand-muted">No stops yet.</p>;
  }

  return (
    <ol className="mt-3 space-y-2">
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
  );
}
