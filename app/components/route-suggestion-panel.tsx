"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WEEKDAY_LABELS } from "@/lib/service-weekdays";
import { RouteSuggestionMapPreview } from "./route-suggestion-map-preview";
import { assignNewCustomerToRoute } from "@/app/dashboard/customers/[id]/actions";

type Suggestion = {
  routeId: string;
  technicianLabel: string;
  distanceMiles: number;
  currentStopCount: number;
  maxCapacity: number | null;
  dayOfWeek: number | null;
  stops: { propertyId: string; propertyName: string; latitude: number; longitude: number }[];
};

type SuggestResponse =
  | { suggestions: Suggestion[]; newLocation: { latitude: number; longitude: number } }
  | { suggestions: []; reason: "NOT_GEOCODED" };

type Props = {
  customerId: string;
  propertyId: string;
  bodyOfWaterId: string;
};

export function RouteSuggestionPanel({ customerId, propertyId, bodyOfWaterId }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/routes/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SuggestResponse;
        if (cancelled) return;
        setData(json);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const skipLink = (
    <Link href={`/dashboard/customers/${customerId}`} className="app-link">
      Skip — assign manually later
    </Link>
  );

  return (
    <div className="mt-6 rounded-lg border border-brand-primary/30 bg-brand-foam p-4">
      <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-brand-primary">
        Suggested route placement
      </p>

      {state === "loading" ? <p className="mt-3 text-sm text-brand-muted">Finding nearby routes…</p> : null}

      {state === "error" ? (
        <>
          <p className="mt-3 text-sm text-brand-muted">Couldn&rsquo;t load suggestions right now.</p>
          <div className="mt-2">{skipLink}</div>
        </>
      ) : null}

      {state === "ready" && data && "reason" in data ? (
        <>
          <p className="mt-3 text-sm text-brand-muted">Address couldn&rsquo;t be geocoded — assign a route manually from the Routes page.</p>
          <div className="mt-2">{skipLink}</div>
        </>
      ) : null}

      {state === "ready" && data && !("reason" in data) ? (
        data.suggestions.length === 0 ? (
          <>
            <p className="mt-3 text-sm text-brand-muted">No eligible routes found nearby — assign one manually from the Routes page.</p>
            <div className="mt-2">{skipLink}</div>
          </>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {data.suggestions.map((s) => {
                const selected = selectedRouteId === s.routeId;
                return (
                  <button
                    key={s.routeId}
                    type="button"
                    onClick={() => setSelectedRouteId(s.routeId)}
                    className={`rounded-lg border p-3 text-left text-sm transition ${
                      selected ? "border-brand-primary bg-white shadow-sm" : "border-brand-border bg-white/60 hover:bg-white"
                    }`}
                  >
                    <p className="font-semibold text-brand-ink">{s.technicianLabel}</p>
                    <p className="text-xs text-brand-muted">{s.dayOfWeek ? WEEKDAY_LABELS[s.dayOfWeek] : "Unscheduled day"}</p>
                    <p className="mt-1 text-brand-primary">{s.distanceMiles.toFixed(1)} mi from nearest stop</p>
                    <p className="text-xs text-brand-muted">
                      {s.currentStopCount}
                      {s.maxCapacity != null ? `/${s.maxCapacity}` : ""} stops{s.maxCapacity == null ? " (no limit set)" : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedRouteId ? (
              <div className="mt-4">
                <RouteSuggestionMapPreview
                  newLocation={data.newLocation}
                  stops={data.suggestions.find((s) => s.routeId === selectedRouteId)?.stops ?? []}
                />
                <form action={assignNewCustomerToRoute} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="propertyId" value={propertyId} />
                  <input type="hidden" name="bodyOfWaterId" value={bodyOfWaterId} />
                  <input type="hidden" name="routeId" value={selectedRouteId} />
                  <button type="submit" className="app-btn-primary-sm">
                    Assign to this route
                  </button>
                  {skipLink}
                </form>
              </div>
            ) : (
              <div className="mt-3">{skipLink}</div>
            )}
          </>
        )
      ) : null}
    </div>
  );
}
