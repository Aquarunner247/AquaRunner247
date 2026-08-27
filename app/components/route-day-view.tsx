"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { getTechnicianInitial, UNASSIGNED_TECHNICIAN_COLOR } from "@/lib/technician-colors";
import { BRAND_PRIMARY } from "@/app/lib/chart-colors";
import { useDragReorder } from "@/lib/client/use-drag-reorder";
import { fetchDrivingRoute } from "@/lib/routing";

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
  /// Whether THIS device's GPS should drive arrival auto-stamping. Deliberately separate
  /// from readOnly/effectiveReadOnly: those control whether the ROUTE is editable
  /// (reorder/skip/optimize), not whose location it's safe to trust. An admin viewing (and
  /// now, for a single selected technician, editing) a route from the office must never
  /// have their own device's location silently used to auto-stamp a technician's arrival
  /// times -- defaults to true so the technician's own page (the only caller that should
  /// ever watch GPS) doesn't need to opt in explicitly.
  allowGpsAutoArrival?: boolean;
  /// Purely a display filter for the list/map -- GPS auto-arrival eligibility,
  /// drag-reorder, and multi-stop-property grouping all still operate on the FULL
  /// `visits` array regardless of this, so e.g. a technician filtered to "Completed"
  /// while walking toward their next *pending* stop still gets that stop auto-stamped on
  /// arrival even though it isn't currently rendered. Callers are expected to also pass
  /// `readOnly` whenever this isn't "all" -- reordering a filtered subset against the
  /// full day's real underlying sequence isn't coherent (same reasoning as the existing
  /// multi-tech read-only gate).
  statusFilter?: "all" | "completed" | "in_progress" | "pending";
  /// Route optimization is a Pro feature (see lib/plan-tiers.ts) -- defaults to true so
  /// existing call sites that haven't been updated to pass it don't lose the button.
  proAccess?: boolean;
};

function matchesStatusFilter(status: string, filter: NonNullable<Props["statusFilter"]>): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return status === "COMPLETED";
  if (filter === "in_progress") return status === "IN_PROGRESS";
  return status === "SCHEDULED"; // "pending"
}

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
      <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-brand-ok">
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
      <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-brand-ink">
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
      <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-brand-danger">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
        </svg>
        Skipped
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-center text-[11px] font-semibold text-brand-muted">
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
  allowGpsAutoArrival = true,
  statusFilter = "all",
  proAccess = true,
}: Props) {
  const isMultiTech = Boolean(technicianColors);
  // Multi-technician mode is always read-only, regardless of the readOnly prop: reordering
  // or skipping across an interleaved combined route isn't coherent, and GPS auto-arrival
  // only makes sense from the technician's own device. This is defense-in-depth so a caller
  // can't accidentally get an interactive combined view by forgetting to pass readOnly.
  const effectiveReadOnly = readOnly || isMultiTech;
  const [visits, setVisits] = useState<RouteStop[]>(initialVisits);
  const [saving, setSaving] = useState(false);
  const [locationState, setLocationState] = useState<"idle" | "watching" | "denied" | "unsupported" | "unavailable">("idle");
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
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
  // arrival time on any stop the tech gets within ARRIVAL_RADIUS_METERS of. Gated on
  // allowGpsAutoArrival separately from effectiveReadOnly -- see that prop's doc comment.
  useEffect(() => {
    if (effectiveReadOnly || !isToday || !allowGpsAutoArrival) return;

    // Shared by both the native and web watch below -- given a fresh fix, clear any
    // earlier "signal lost" state (the phone may have recovered since) and check every
    // visit for an auto-arrival stamp.
    function handleFix(latitude: number, longitude: number) {
      setLocationState("watching");
      const here = { latitude, longitude };
      const eligibleIds = computeAutoArrivalEligibleIds(visitsRef.current);
      for (const v of visitsRef.current) {
        if (v.startedAt || v.status === "CANCELLED" || notifiedRef.current.has(v.id)) continue;
        if (!eligibleIds.has(v.id)) continue;
        if (v.latitude == null || v.longitude == null) continue;
        if (haversineMeters(here, v) <= ARRIVAL_RADIUS_METERS) {
          void stampArrival(v.id);
        }
      }
    }

    // A denied/unavailable fix has no error code to branch on here (unlike the web
    // GeolocationPositionError below) -- best-effort string match on the message is all
    // the plugin gives us.
    function handleFailureMessage(message: string | undefined) {
      const lower = (message ?? "").toLowerCase();
      setLocationState(lower.includes("deni") || lower.includes("permission") ? "denied" : "unavailable");
    }

    if (Capacitor.isNativePlatform()) {
      // A bare Capacitor WebView doesn't reliably bridge the web geolocation permission
      // prompt to the OS on its own -- the native plugin is needed here, not just used for
      // parity with the camera wiring. watchPosition's setup is itself async (unlike the
      // synchronous browser API below), so the watch id it resolves to has to be captured
      // in a ref-like local rather than returned directly from the effect.
      let watchId: string | null = null;
      let torndown = false;
      setLocationState("watching");
      Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20_000 }, (position, err) => {
        if (torndown) return;
        if (position) {
          handleFix(position.coords.latitude, position.coords.longitude);
        } else {
          handleFailureMessage(err instanceof Error ? err.message : err?.message);
        }
      })
        .then((id) => {
          if (torndown) void Geolocation.clearWatch({ id });
          else watchId = id;
        })
        .catch((err) => handleFailureMessage(err instanceof Error ? err.message : String(err)));

      return () => {
        torndown = true;
        if (watchId) void Geolocation.clearWatch({ id: watchId });
      };
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }

    setLocationState("watching");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => handleFix(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        // Previously only PERMISSION_DENIED was surfaced -- TIMEOUT/POSITION_UNAVAILABLE
        // (a lost GPS fix, common in a parking garage or near tall buildings) were
        // silently swallowed, leaving the "Location on" banner showing while no position
        // updates were actually arriving and nothing was being auto-stamped.
        if (err.code === err.PERMISSION_DENIED) setLocationState("denied");
        else setLocationState("unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [effectiveReadOnly, isToday, allowGpsAutoArrival]);

  // Initialize the map once
  useEffect(() => {
    const state = { cancelled: false };
    (async () => {
      const L = await import("leaflet");
      if (state.cancelled || !mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current).setView([36.17, -115.14], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      await drawMarkers(L, state);
    })();
    return () => {
      state.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function drawMarkers(L: typeof import("leaflet"), state: { cancelled: boolean }) {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const points: [number, number][] = [];
    // Multi-tech mode: one polyline per technician, built from that tech's contiguous
    // subsequence — safe because the "All Technicians" query is pre-ordered by technicianId,
    // so each tech's stops are already a contiguous run in `visits`.
    type Segment = { techId: string | null | undefined; points: [number, number][]; color: string; opacity: number };
    const segments: Segment[] = [];
    let currentSegment: Segment | null = null;
    const flushSegment = () => {
      if (isMultiTech && currentSegment && currentSegment.points.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = null;
    };

    displayedVisits.forEach((v) => {
      if (v.latitude == null || v.longitude == null) return;
      const isSkipped = v.status === "CANCELLED";
      const color = isMultiTech ? technicianColors?.[v.technicianId ?? ""] ?? UNASSIGNED_TECHNICIAN_COLOR : BRAND_PRIMARY;
      const glyph = isSkipped ? "×" : isMultiTech ? getTechnicianInitial(v.technicianLabel) : String((trueIndexById.get(v.id) ?? 0) + 1);
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
        if (!currentSegment || v.technicianId !== currentSegment.techId) {
          flushSegment();
          currentSegment = { techId: v.technicianId, points: [], color, opacity: 0.45 };
        }
        currentSegment.points.push([v.latitude, v.longitude]);
      }
    });
    flushSegment();

    if (!isMultiTech && points.length > 1) {
      segments.push({ techId: undefined, points, color: BRAND_PRIMARY, opacity: 0.6 });
    }

    // Draw a straight line immediately for instant feedback, then try to replace each
    // segment with a real road-following route -- the free routing server this hits can
    // be slow or occasionally rate-limited, so this degrades gracefully back to the
    // straight line on any failure rather than leaving the map blank.
    const straightLayers = segments.map((seg) => L.polyline(seg.points, { color: seg.color, weight: 3, opacity: seg.opacity }).addTo(layerRef.current!));

    if (points.length) {
      mapRef.current.fitBounds(points, { padding: [30, 30] });
    }

    await Promise.all(
      segments.map(async (seg, i) => {
        const road = await fetchDrivingRoute(seg.points.map(([latitude, longitude]) => ({ latitude, longitude })));
        if (state.cancelled || !road || !layerRef.current) return;
        straightLayers[i].remove();
        L.polyline(road, { color: seg.color, weight: 3, opacity: seg.opacity }).addTo(layerRef.current);
      }),
    );
  }

  useEffect(() => {
    const state = { cancelled: false };
    (async () => {
      const L = await import("leaflet");
      if (!state.cancelled) await drawMarkers(L, state);
    })();
    return () => {
      state.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, statusFilter]);

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

  const { draggingIndex, setItemRef, dragHandleProps } = useDragReorder(visits, persistOrder, effectiveReadOnly);

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

  // The subset actually rendered in the list/map -- everything else (GPS eligibility,
  // drag-reorder, grouping below) stays keyed off the full `visits` array. trueIndexById
  // preserves each stop's real day-sequence position (badge number, marker glyph, drag
  // index) even though displayedVisits may skip over some of them.
  const displayedVisits = statusFilter === "all" ? visits : visits.filter((v) => matchesStatusFilter(v.status, statusFilter));
  const trueIndexById = new Map(visits.map((v, i) => [v.id, i]));

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
  // first VISIBLE visit in each contiguous technician run (visits are pre-ordered by
  // technicianId). Built from displayedVisits, not the full visits array, so a status
  // filter that happens to filter out a run's first stop doesn't make that technician's
  // header vanish entirely, and the "(N stops)" count matches what's actually shown.
  const technicianGroupStarts = new Map<string, { label: string; color: string; count: number }>();
  if (isMultiTech) {
    let prevTechId: string | null | undefined = undefined;
    let current: { label: string; color: string; count: number } | null = null;
    for (const v of displayedVisits) {
      if (v.technicianId !== prevTechId) {
        current = { label: v.technicianLabel ?? "Unassigned", color: technicianColors?.[v.technicianId ?? ""] ?? UNASSIGNED_TECHNICIAN_COLOR, count: 0 };
        technicianGroupStarts.set(v.id, current);
        prevTechId = v.technicianId;
      }
      if (current) current.count++;
    }
  }

  return (
    <div>
      {missingCoords ? (
        <p className="mb-2 text-xs text-brand-warn">
          Some stops don&rsquo;t have map coordinates yet — an admin can geocode addresses from the Routes page.
        </p>
      ) : null}
      {locationState === "denied" ? (
        <p className="mb-2 text-xs text-brand-warn">
          Location access is off, so arrival times won&rsquo;t log automatically — enable location for this site in your browser
          settings to turn it back on.
        </p>
      ) : null}
      {locationState === "unavailable" ? (
        <p className="mb-2 text-xs text-brand-warn">
          Location signal lost, so arrival won&rsquo;t log automatically right now — this can happen in parking garages or near
          tall buildings. It&rsquo;ll pick back up once your signal returns, or tap &ldquo;I&rsquo;ve arrived&rdquo; on the stop
          yourself.
        </p>
      ) : null}
      {locationState === "watching" ? (
        <p className="mb-2 text-xs text-brand-muted">Location on — arrival time logs automatically when you reach a stop.</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={layout === "mapOnly" ? "hidden" : ""}>
          {!effectiveReadOnly && proAccess ? (
            <button
              type="button"
              data-tour="schedule-optimize-route"
              onClick={optimizeRoute}
              disabled={saving}
              className="app-btn-primary-sm mb-2"
            >
              Optimize stop order
            </button>
          ) : null}
          {!effectiveReadOnly && !proAccess ? (
            <Link href="/dashboard/billing" className="mb-2 block text-xs font-medium text-brand-primary underline">
              Upgrade to Pro to optimize stop order
            </Link>
          ) : null}
          <ul className="space-y-2">
            {displayedVisits.map((v) => {
              const idx = trueIndexById.get(v.id) ?? 0;
              const isSkipped = v.status === "CANCELLED";
              const techGroup = technicianGroupStarts.get(v.id);
              const handleProps = dragHandleProps(idx);
              return (
                <Fragment key={v.id}>
                  {techGroup ? (
                    <li className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-brand-muted first:pt-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: techGroup.color }} />
                      {techGroup.label} ({techGroup.count} stop{techGroup.count === 1 ? "" : "s"})
                    </li>
                  ) : null}
                  <li
                    ref={setItemRef(idx)}
                    data-tour={idx === 0 ? "schedule-first-stop" : undefined}
                    className={`flex items-center gap-3 rounded border p-2 ${
                      isSkipped ? "border-brand-danger bg-brand-dangerFill" : "border-brand-border bg-white"
                    } ${draggingIndex === idx ? "opacity-60" : ""}`}
                  >
                    {!effectiveReadOnly ? (
                      <span
                        {...handleProps}
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-brand-muted cursor-grab select-none active:cursor-grabbing"
                      >
                        ⠿
                      </span>
                    ) : null}
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                        isSkipped ? "bg-brand-danger" : isMultiTech ? "" : "bg-brand-primary"
                      }`}
                      style={!isSkipped && isMultiTech ? { backgroundColor: technicianColors?.[v.technicianId ?? ""] ?? UNASSIGNED_TECHNICIAN_COLOR } : undefined}
                    >
                      {isSkipped ? "Skip" : idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* RouteDayView is only ever rendered from the Schedule tab (both admin and
                          technician), so the visit page's back-link can safely assume that's
                          where "back" should go -- see VisitPage's `from` searchParam handling. */}
                      <Link href={`/dashboard/visits/${v.id}?from=schedule`} className="block truncate text-sm font-medium text-brand-ink underline">
                        {v.propertyName} — {v.bodyName}
                      </Link>
                      <p className="truncate text-xs text-brand-muted">{v.address || "No address on file"}</p>
                      {v.startedAt ? (
                        <p className="text-xs font-medium text-brand-ok">
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
                                className="mt-1 inline-block text-xs font-medium text-brand-cta underline"
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
                          className="app-btn-ghost-sm"
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
            {displayedVisits.length === 0 ? (
              <p className="text-sm text-brand-muted">
                {visits.length === 0
                  ? "No stops for this day."
                  : statusFilter === "completed"
                    ? "No completed stops yet."
                    : statusFilter === "in_progress"
                      ? "No stops in progress."
                      : "No pending stops."}
              </p>
            ) : null}
          </ul>
        </div>
        <div className={layout === "listOnly" ? "hidden" : ""}>
          {technicianLegend && technicianLegend.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-brand-muted">
              {technicianLegend.map((t) => (
                <span key={t.id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
              ))}
            </div>
          ) : null}
          <div ref={mapDivRef} className={`${layout === "mapOnly" ? "h-[70vh]" : "h-[420px]"} w-full rounded-lg border border-brand-border`} />
        </div>
      </div>
    </div>
  );
}
