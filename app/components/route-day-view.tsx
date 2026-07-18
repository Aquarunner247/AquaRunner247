"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { getTechnicianInitial } from "@/lib/technician-colors";

export type RouteStop = {
  id: string;
  status: string;
  propertyId: string;
  propertyName: string;
  bodyName: string;
  address: string;
  scheduledStart: string;
  startedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  /// Set only for the admin "All Technicians" view — absent for a technician's own view
  /// and for an admin's single-technician view (both single-color, as before).
  technicianId?: string | null;
  technicianLabel?: string | null;
};

type Props = {
  visits: RouteStop[];
  readOnly?: boolean;
  isToday?: boolean;
  /// yyyy-mm-dd for the day being viewed — used to link into the combined stop-capture screen
  dateYmd?: string;
  /// Which parts of this view to show — used by the Schedule tabs (Day = both, List = list
  /// only, Map = map only). Defaults to "both" for existing call sites.
  layout?: "both" | "listOnly" | "mapOnly";
  /// Presence of this prop switches the map/list into "All Technicians" mode: per-technician
  /// marker color/polyline instead of one route, list grouped by technician. Keyed by
  /// RouteStop.technicianId. Omitted entirely for a single technician's route (tech's own
  /// view, or an admin's single-technician selection) — those stay single-color, unchanged.
  technicianColors?: Record<string, string>;
  /// Legend strip shown above the map when technicianColors is set.
  technicianLegend?: { id: string; label: string; color: string }[];
};

const ARRIVAL_RADIUS_METERS = 150;

function haversineMeters(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Infinity;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function haversineMiles(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  return haversineMeters(a, b) / 1609.34;
}

/**
 * Groups visits into contiguous same-property runs (in route-sequence order — the order
 * `visits` is already provided in), then for each property returns only the visit ids in
 * that property's earliest not-yet-fully-completed group. This is what GPS auto-arrival
 * should be allowed to touch: e.g. for a property with a front pool/spa and a separate
 * back pool/spa, back's visits stay ineligible for auto-stamping until front's are all
 * COMPLETED — since front and back share one property-level GPS coordinate, without this
 * gate the phone being anywhere near the property would stamp all four at once.
 */
function computeAutoArrivalEligibleIds(visits: RouteStop[]): Set<string> {
  const groups: { propertyId: string; visitIds: string[] }[] = [];
  let prevPropertyId: string | null = null;
  for (const v of visits) {
    if (v.status === "CANCELLED") continue;
    if (v.propertyId !== prevPropertyId || groups.length === 0) {
      groups.push({ propertyId: v.propertyId, visitIds: [] });
      prevPropertyId = v.propertyId;
    }
    groups[groups.length - 1].visitIds.push(v.id);
  }

  const groupsByProperty = new Map<string, { propertyId: string; visitIds: string[] }[]>();
  for (const g of groups) {
    const arr = groupsByProperty.get(g.propertyId) ?? [];
    arr.push(g);
    groupsByProperty.set(g.propertyId, arr);
  }

  const visitById = new Map(visits.map((v) => [v.id, v]));
  const eligible = new Set<string>();
  for (const propGroups of groupsByProperty.values()) {
    const activeGroup = propGroups.find((g) => g.visitIds.some((id) => visitById.get(id)?.status !== "COMPLETED"));
    if (!activeGroup) continue; // every group at this property is already completed — nothing left to auto-stamp
    for (const id of activeGroup.visitIds) eligible.add(id);
  }
  return eligible;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") {
    return (
      <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-[#16A34A]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Completed
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-[#D97706]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        In Progress
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-[#FF6B5B]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
        </svg>
        Skipped
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-[#94A3B8]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
      </svg>
      Pending
    </span>
  );
}

export function RouteDayView({
  visits: initialVisits,
  readOnly = false,
  isToday = false,
  dateYmd,
  layout = "both",
  technicianColors,
  technicianLegend,
}: Props) {
  const isMultiTech = Boolean(technicianColors);
  // Multi-technician mode is always read-only, regardless of the readOnly prop: reordering
  // or skipping across an interleaved combined route isn't coherent, and GPS auto-arrival
  // only makes sense from the technician's own device. This is defense-in-depth so a caller
  // can't accidentally get an interactive combined view by forgetting to pass readOnly.
  const effectiveReadOnly = readOnly || isMultiTech;
  const [visits, setVisits] = useState<RouteStop[]>(initialVisits);
  const [saving, setSaving] = useState(false);
  const [locationState, setLocationState] = useState<"idle" | "watching" | "denied" | "unsupported">("idle");
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const dragIndex = useRef<number | null>(null);
  const visitsRef = useRef<RouteStop[]>(initialVisits);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setVisits(initialVisits);
  }, [initialVisits]);

  useEffect(() => {
    visitsRef.current = visits;
  }, [visits]);

  async function stampArrival(visitId: string) {
    notifiedRef.current.add(visitId);
    try {
      const res = await fetch(`/api/visits/${visitId}/arrival`, { method: "PATCH" });
      if (!res.ok) return;
      const data = await res.json();
      setVisits((prev) =>
        prev.map((v) => (v.id === visitId ? { ...v, startedAt: data.visit.startedAt ?? v.startedAt, status: data.visit.status ?? v.status } : v)),
      );
    } catch {
      notifiedRef.current.delete(visitId);
    }
  }

  // Watch device location while this is today's route and the tab stays open; auto-stamp
  // arrival time on any stop the tech gets within ARRIVAL_RADIUS_METERS of.
  useEffect(() => {
    if (effectiveReadOnly || !isToday) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }

    setLocationState("watching");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const eligibleIds = computeAutoArrivalEligibleIds(visitsRef.current);
        for (const v of visitsRef.current) {
          if (v.startedAt || v.status === "CANCELLED" || notifiedRef.current.has(v.id)) continue;
          if (!eligibleIds.has(v.id)) continue;
          if (v.latitude == null || v.longitude == null) continue;
          if (haversineMeters(here, v) <= ARRIVAL_RADIUS_METERS) {
            void stampArrival(v.id);
          }
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationState("denied");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [effectiveReadOnly, isToday]);

  // Initialize the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current).setView([36.17, -115.14], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      drawMarkers(L);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawMarkers(L: typeof import("leaflet")) {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const points: [number, number][] = [];
    // Multi-tech mode: one polyline per technician, built from that tech's contiguous
    // subsequence — safe because the "All Technicians" query is pre-ordered by technicianId,
    // so each tech's stops are already a contiguous run in `visits`.
    let currentTechPolyline: [number, number][] = [];
    let currentTechId: string | null | undefined = undefined;
    const flushTechPolyline = () => {
      if (isMultiTech && currentTechPolyline.length > 1 && currentTechId !== undefined) {
        const color = technicianColors?.[currentTechId ?? ""] ?? "#94A3B8";
        L.polyline(currentTechPolyline, { color, weight: 3, opacity: 0.45 }).addTo(layerRef.current!);
      }
      currentTechPolyline = [];
    };

    visits.forEach((v, idx) => {
      if (v.latitude == null || v.longitude == null) return;
      const isSkipped = v.status === "CANCELLED";
      const color = isMultiTech ? technicianColors?.[v.technicianId ?? ""] ?? "#94A3B8" : "#0A5FA4";
      const glyph = isSkipped ? "×" : isMultiTech ? getTechnicianInitial(v.technicianLabel) : String(idx + 1);
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:white;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);">${glyph}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const popupLines = [`<strong>${v.propertyName}</strong>`, v.bodyName];
      if (isMultiTech) popupLines.push(v.technicianLabel ?? "Unassigned");
      L.marker([v.latitude, v.longitude], { icon })
        .addTo(layerRef.current!)
        .bindPopup(popupLines.join("<br/>"));
      points.push([v.latitude, v.longitude]);

      if (isMultiTech) {
        if (v.technicianId !== currentTechId) {
          flushTechPolyline();
          currentTechId = v.technicianId;
        }
        currentTechPolyline.push([v.latitude, v.longitude]);
      }
    });
    flushTechPolyline();

    if (points.length) {
      if (!isMultiTech) {
        L.polyline(points, { color: "#0A5FA4", weight: 3, opacity: 0.6 }).addTo(layerRef.current!);
      }
      mapRef.current.fitBounds(points, { padding: [30, 30] });
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (!cancelled) drawMarkers(L);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits]);

  async function persistOrder(next: RouteStop[]) {
    setVisits(next);
    setSaving(true);
    try {
      await fetch("/api/visits/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitIds: next.map((v) => v.id) }),
      });
    } finally {
      setSaving(false);
    }
  }

  function onDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === index) return;
    const next = [...visits];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    void persistOrder(next);
  }

  async function toggleSkip(visit: RouteStop) {
    const nextStatus = visit.status === "CANCELLED" ? "SCHEDULED" : "CANCELLED";
    setVisits((prev) => prev.map((v) => (v.id === visit.id ? { ...v, status: nextStatus } : v)));
    await fetch(`/api/visits/${visit.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  function optimizeRoute() {
    const withCoords = visits.filter((v) => v.latitude != null && v.longitude != null);
    const withoutCoords = visits.filter((v) => v.latitude == null || v.longitude == null);
    if (withCoords.length < 2) return;

    const remaining = [...withCoords];
    const ordered: RouteStop[] = [remaining.shift()!];
    while (remaining.length) {
      const last = ordered[ordered.length - 1];
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

  const missingCoords = visits.some((v) => v.latitude == null || v.longitude == null);

  const activeVisits = visits.filter((v) => v.status !== "CANCELLED");
  // Group visits into contiguous same-property runs, in actual route-sequence order.
  // A property with a split layout (front pool/spa now, back pool/spa later, with other
  // stops in between) produces two separate groups here, not one combined stop — each
  // occasion only bundles the bodies of water actually visited together. Also breaks on a
  // technician boundary (multi-tech mode only — technicianId is unset elsewhere, so this
  // never fires for the existing single-technician views), so two different technicians'
  // adjacent stops at the same property never get bundled into one capture-photos prompt.
  const groupIdByVisitId = new Map<string, string>();
  const visitIdsByGroupId = new Map<string, string[]>();
  let groupCounter = 0;
  let prevPropertyId: string | null = null;
  let prevTechnicianIdForGrouping: string | null | undefined = undefined;
  let currentGroupId = "";
  for (const v of activeVisits) {
    if (v.propertyId !== prevPropertyId || v.technicianId !== prevTechnicianIdForGrouping) {
      currentGroupId = `g${groupCounter++}`;
      prevPropertyId = v.propertyId;
      prevTechnicianIdForGrouping = v.technicianId;
    }
    groupIdByVisitId.set(v.id, currentGroupId);
    const arr = visitIdsByGroupId.get(currentGroupId) ?? [];
    arr.push(v.id);
    visitIdsByGroupId.set(currentGroupId, arr);
  }
  const capturePromptShown = new Set<string>();

  // Technician sub-headers for the list, multi-tech mode only — keyed by the id of the
  // first visit in each contiguous technician run (visits are pre-ordered by technicianId).
  const technicianGroupStarts = new Map<string, { label: string; color: string; count: number }>();
  if (isMultiTech) {
    let prevTechId: string | null | undefined = undefined;
    let current: { label: string; color: string; count: number } | null = null;
    for (const v of visits) {
      if (v.technicianId !== prevTechId) {
        current = { label: v.technicianLabel ?? "Unassigned", color: technicianColors?.[v.technicianId ?? ""] ?? "#94A3B8", count: 0 };
        technicianGroupStarts.set(v.id, current);
        prevTechId = v.technicianId;
      }
      if (current) current.count++;
    }
  }

  return (
    <div>
      {missingCoords ? (
        <p className="mb-2 text-xs text-[#B5793D]">
          Some stops don&rsquo;t have map coordinates yet — an admin can geocode addresses from the Routes page.
        </p>
      ) : null}
      {locationState === "denied" ? (
        <p className="mb-2 text-xs text-[#B5793D]">
          Location access is off, so arrival times won&rsquo;t log automatically — enable location for this site in your browser
          settings to turn it back on.
        </p>
      ) : null}
      {locationState === "watching" ? (
        <p className="mb-2 text-xs text-[#7FA0AC]">Location on — arrival time logs automatically when you reach a stop.</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={layout === "mapOnly" ? "hidden" : ""}>
          {!effectiveReadOnly ? (
            <button
              type="button"
              onClick={optimizeRoute}
              disabled={saving}
              className="mb-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Optimize route (straight-line)
            </button>
          ) : null}
          <ul className="space-y-2">
            {visits.map((v, idx) => {
              const isSkipped = v.status === "CANCELLED";
              const techGroup = technicianGroupStarts.get(v.id);
              return (
                <Fragment key={v.id}>
                  {techGroup ? (
                    <li className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-[#4A6572] first:pt-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: techGroup.color }} />
                      {techGroup.label} ({techGroup.count} stop{techGroup.count === 1 ? "" : "s"})
                    </li>
                  ) : null}
                  <li
                    draggable={!effectiveReadOnly}
                    onDragStart={() => {
                      dragIndex.current = idx;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(idx)}
                    className={`flex items-center gap-3 rounded border p-2 ${
                      isSkipped ? "border-[#FF6B5B] bg-[#FF6B5B]/10" : "border-[#C9E3EC] bg-white"
                    } ${!effectiveReadOnly ? "cursor-move" : ""}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                        isSkipped ? "bg-[#FF6B5B]" : isMultiTech ? "" : "bg-[#0A5FA4]"
                      }`}
                      style={!isSkipped && isMultiTech ? { backgroundColor: technicianColors?.[v.technicianId ?? ""] ?? "#94A3B8" } : undefined}
                    >
                      {isSkipped ? "Skip" : idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/visits/${v.id}`} className="block truncate text-sm font-medium text-[#12234A] underline">
                        {v.propertyName} — {v.bodyName}
                      </Link>
                      <p className="truncate text-xs text-[#4A6572]">{v.address || "No address on file"}</p>
                      {v.startedAt ? (
                        <p className="text-xs font-medium text-[#0A5FA4]">
                          Arrived {new Date(v.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </p>
                      ) : null}
                      {!isSkipped && (visitIdsByGroupId.get(groupIdByVisitId.get(v.id) ?? "")?.length ?? 0) > 1 &&
                      !capturePromptShown.has(groupIdByVisitId.get(v.id) ?? "")
                        ? (() => {
                            const groupId = groupIdByVisitId.get(v.id) ?? "";
                            capturePromptShown.add(groupId);
                            const groupVisitIds = visitIdsByGroupId.get(groupId) ?? [];
                            const count = groupVisitIds.length;
                            const params = new URLSearchParams();
                            if (dateYmd) params.set("date", dateYmd);
                            params.set("visits", groupVisitIds.join(","));
                            return (
                              <Link
                                href={`/dashboard/stops/${v.propertyId}?${params.toString()}`}
                                className="mt-1 inline-block text-xs font-medium text-[#FF6B5B] underline"
                              >
                                Capture photos for all {count} stops here
                              </Link>
                            );
                          })()
                        : null}
                    </div>
                    {!effectiveReadOnly ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={v.status} />
                        <button
                          type="button"
                          onClick={() => void toggleSkip(v)}
                          className="rounded border border-[#C9E3EC] px-2 py-1 text-xs font-medium text-[#12234A]"
                        >
                          {isSkipped ? "Unskip" : "Skip"}
                        </button>
                      </div>
                    ) : (
                      <StatusBadge status={v.status} />
                    )}
                  </li>
                </Fragment>
              );
            })}
            {visits.length === 0 ? <p className="text-sm text-[#4A6572]">No stops for this day.</p> : null}
          </ul>
        </div>
        <div className={layout === "listOnly" ? "hidden" : ""}>
          {technicianLegend && technicianLegend.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#4A6572]">
              {technicianLegend.map((t) => (
                <span key={t.id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
              ))}
            </div>
          ) : null}
          <div ref={mapDivRef} className={`${layout === "mapOnly" ? "h-[70vh]" : "h-[420px]"} w-full rounded-lg border border-[#C9E3EC]`} />
        </div>
      </div>
    </div>
  );
}
