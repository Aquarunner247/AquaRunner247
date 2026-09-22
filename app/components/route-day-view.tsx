"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { PushNotifications } from "@capacitor/push-notifications";
import { getTechnicianInitial, UNASSIGNED_TECHNICIAN_COLOR } from "@/lib/technician-colors";
import { BRAND_PRIMARY } from "@/app/lib/chart-colors";
import { useDragReorder } from "@/lib/client/use-drag-reorder";
import { fetchDrivingRoute, computeOptimizedStopOrder } from "@/lib/routing";
import { toggleAdHocStop, deleteAdHocStop } from "@/app/dashboard/actions";

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
  /// Per-property override of ARRIVAL_RADIUS_METERS (Property.geofenceMeters) -- null/0
  /// means "use the default". Lets an admin widen the radius for a property where GPS is
  /// unreliable (e.g. an indoor pump room, underground garage) instead of that stop simply
  /// never auto-arriving.
  geofenceMeters?: number | null;
  /// Set only for the admin "All Technicians" view — absent for a technician's own view
  /// and for an admin's single-technician view (both single-color, as before).
  technicianId?: string | null;
  technicianLabel?: string | null;
};

/// An "extra stop" (AdHocStop) — an errand, not a real chemistry-reading service visit.
/// Deliberately NOT part of GPS auto-arrival, the map, or "Optimize stop order"'s
/// driving-distance sort (see those functions below) -- it only ever participates in the
/// list itself and its shared position/sequence.
export type AdHocItem = {
  id: string;
  description: string;
  completed: boolean;
  propertyName: string | null;
  technicianId?: string | null;
  technicianLabel?: string | null;
};

/// The list's actual unit of iteration -- a day's stops interleaved regardless of which
/// table backs them. Callers only ever include `kind: "adhoc"` items when the view is a
/// single technician's editable day (see admin-schedule.tsx/page.tsx) -- multi-tech combined
/// mode never receives one, so the isMultiTech-only code paths below never need to handle it.
export type DayItem = ({ kind: "visit" } & RouteStop) | ({ kind: "adhoc" } & AdHocItem);

type Props = {
  items: DayItem[];
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
  /// `items` array regardless of this, so e.g. a technician filtered to "Completed"
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

/// An ad-hoc item has no "in progress" state -- it never matches that filter. "completed"/
/// "pending" map onto its own completed flag.
function matchesStatusFilter(item: DayItem, filter: NonNullable<Props["statusFilter"]>): boolean {
  if (filter === "all") return true;
  if (item.kind === "adhoc") {
    if (filter === "in_progress") return false;
    return filter === "completed" ? item.completed : !item.completed;
  }
  if (filter === "completed") return item.status === "COMPLETED";
  if (filter === "in_progress") return item.status === "IN_PROGRESS";
  return item.status === "SCHEDULED"; // "pending"
}

// No JS entrypoint ships from @capacitor-community/background-geolocation (it's types-only
// -- see its package.json) -- this is the documented way to obtain the plugin.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

const ARRIVAL_RADIUS_METERS = 150;

/// A GPS fix's reported accuracy is a radius (68% confidence), not an error bound to
/// ignore -- indoors (pump rooms, garages) it's routinely 50-100m+ even with
/// enableHighAccuracy, so comparing raw distance against a bare 150m radius silently
/// rejects a tech who is genuinely standing at the property. Widening the effective
/// radius by the fix's own accuracy (capped, so a degenerate cell-tower-only fix reporting
/// several hundred meters of accuracy can't stamp arrival from far away) fixes that without
/// touching the base radius for a normal outdoor fix, where accuracy is usually <20m.
const ACCURACY_BUFFER_CAP_METERS = 100;

function haversineMeters(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Infinity;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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
  items: initialItems,
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
  const [items, setItems] = useState<DayItem[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [locationState, setLocationState] = useState<"idle" | "watching" | "denied" | "unsupported" | "unavailable">("idle");
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const itemsRef = useRef<DayItem[]>(initialItems);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  async function stampArrival(visitId: string) {
    notifiedRef.current.add(visitId);
    try {
      const res = await fetch(`/api/visits/${visitId}/arrival`, { method: "PATCH" });
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) =>
        prev.map((v) => (v.kind === "visit" && v.id === visitId ? { ...v, startedAt: data.visit.startedAt ?? v.startedAt, status: data.visit.status ?? v.status } : v)),
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

    // Nothing left to auto-stamp -- skip starting a watcher at all rather than requesting
    // permissions/showing Android's persistent tracking notification for no reason. On
    // native this is also the ongoing check that tears the background watcher down the
    // moment the day's actual route wraps up, so a tech isn't drained/tracked till midnight
    // after their last stop.
    function isDayFullyDone() {
      const visitItems = itemsRef.current.filter((i): i is DayItem & { kind: "visit" } => i.kind === "visit");
      return visitItems.every((v) => v.status === "COMPLETED" || v.status === "CANCELLED");
    }

    // Shared by both the native and web watch below -- given a fresh fix, clear any
    // earlier "signal lost" state (the phone may have recovered since) and check every
    // visit for an auto-arrival stamp. `accuracy` (meters, 68% confidence radius per the
    // Geolocation spec) widens the effective radius rather than gating on it -- a fix is
    // still used even when accuracy is poor, just compared against a more forgiving
    // distance, which is what actually matters for a tech standing in a low-signal pump
    // room rather than genuinely far from the property. Returns whether the day is now
    // fully done, so callers can tear their watcher down immediately after the last stamp
    // rather than waiting for the next fix to notice.
    function handleFix(latitude: number, longitude: number, accuracy: number | null | undefined): boolean {
      setLocationState("watching");
      const here = { latitude, longitude };
      const buffer = accuracy != null && Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 0), ACCURACY_BUFFER_CAP_METERS) : 0;
      // Ad-hoc items were never part of GPS auto-arrival -- filter down to real visits
      // before anything here touches status/latitude/longitude.
      const visitItems = itemsRef.current.filter((i): i is DayItem & { kind: "visit" } => i.kind === "visit");
      const eligibleIds = computeAutoArrivalEligibleIds(visitItems);
      for (const v of visitItems) {
        if (v.startedAt || v.status === "CANCELLED" || notifiedRef.current.has(v.id)) continue;
        if (!eligibleIds.has(v.id)) continue;
        if (v.latitude == null || v.longitude == null) continue;
        const radius = v.geofenceMeters && v.geofenceMeters > 0 ? v.geofenceMeters : ARRIVAL_RADIUS_METERS;
        if (haversineMeters(here, v) <= radius + buffer) {
          void stampArrival(v.id);
        }
      }
      return isDayFullyDone();
    }

    // A denied/unavailable fix has no error code to branch on here (unlike the web
    // GeolocationPositionError below) -- best-effort string match on the message is all
    // the plugin gives us.
    function handleFailureMessage(message: string | undefined) {
      const lower = (message ?? "").toLowerCase();
      setLocationState(lower.includes("deni") || lower.includes("permission") ? "denied" : "unavailable");
    }

    if (Capacitor.isNativePlatform()) {
      if (isDayFullyDone()) return;

      // @capacitor-community/background-geolocation, not @capacitor/geolocation's
      // watchPosition -- the latter stops delivering fixes once the app is backgrounded
      // (no background-location entitlement wired to it), which is exactly the gap that
      // made auto-arrival unreliable for a tech who backgrounds the app to use Maps, or
      // just locks their phone between stops. Setting `backgroundMessage` is what tells
      // this plugin to keep delivering fixes in the background -- on Android that means a
      // persistent "Tracking your route" notification and a foreground service (both
      // required by the OS, not optional); on iOS it escalates the location permission
      // from "While Using" to "Always" and turns on the blue background-location pill.
      let watcherId: string | null = null;
      let torndown = false;

      function teardown() {
        torndown = true;
        if (watcherId) {
          const id = watcherId;
          watcherId = null;
          void BackgroundGeolocation.removeWatcher({ id });
        }
      }

      (async () => {
        // Android 13+ requires this OS permission before it will show the persistent
        // notification the foreground service needs -- without it, Android silently
        // refuses to keep tracking once backgrounded. Reuses the PushNotifications plugin
        // purely for its permission prompt (no push registration happens); deliberately
        // Android-only, since iOS has no equivalent and this would otherwise trigger an
        // unrelated "Would Like to Send You Notifications" prompt for no reason.
        if (Capacitor.getPlatform() === "android") {
          try {
            await PushNotifications.requestPermissions();
          } catch {
            // Best-effort -- addWatcher below still runs; Android may just fail to show
            // the notification (and so may stop delivering background updates) without it.
          }
        }
        if (torndown) return;
        setLocationState("watching");
        try {
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundTitle: "Tracking your route",
              backgroundMessage: "Logs your arrival at each stop automatically. Cancel to stop tracking for today.",
              requestPermissions: true,
              stale: false,
              // 0, not a battery-saving distance, deliberately -- distanceFilter suppresses a
              // fix until the device has moved that many meters from the LAST one delivered.
              // A tech who parks and walks the final stretch to the pool/pump room, then
              // stands there working, stops generating qualifying movement once inside the
              // radius -- so with a nonzero filter, no fix ever lands while he's actually
              // there, and the first one that does is often when he moves again to leave.
              // That's exactly why arrival was only getting logged "at the end of the stop."
              // The plugin's own Android LocationRequest still caps delivery at 1/second
              // (see BackgroundGeolocationService.java), so this doesn't increase raw GPS
              // polling -- it only stops good, in-radius fixes from being silently dropped.
              distanceFilter: 0,
            },
            (location, error) => {
              if (torndown) return;
              if (error) {
                handleFailureMessage(error.code === "NOT_AUTHORIZED" ? "denied" : error.message);
                return;
              }
              if (!location) return;
              if (handleFix(location.latitude, location.longitude, location.accuracy)) {
                setLocationState("idle");
                teardown();
              }
            },
          );
          if (torndown) void BackgroundGeolocation.removeWatcher({ id });
          else watcherId = id;
        } catch (err) {
          handleFailureMessage(err instanceof Error ? err.message : String(err));
        }
      })();

      return teardown;
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }

    if (isDayFullyDone()) return;

    setLocationState("watching");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (handleFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)) {
          setLocationState("idle");
          navigator.geolocation.clearWatch(watchId);
        }
      },
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

    // Plain mobile browsers can't background-track at all (no equivalent of the native
    // plugin above -- the tab is simply suspended), so this is the only mitigation
    // available here: force one fresh fix the moment the tab/PWA regains focus, in case
    // the tech arrived while it was backgrounded and the suspended watch missed it.
    function handleVisible() {
      if (document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (handleFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)) {
            setLocationState("idle");
            navigator.geolocation.clearWatch(watchId);
          }
        },
        () => {
          // Best-effort -- the ongoing watch above is still the source of truth for errors.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
    }
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", handleVisible);
    };
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
    // so each tech's stops are already a contiguous run in `items`.
    type Segment = { techId: string | null | undefined; points: [number, number][]; color: string; opacity: number };
    const segments: Segment[] = [];
    let currentSegment: Segment | null = null;
    const flushSegment = () => {
      if (isMultiTech && currentSegment && currentSegment.points.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = null;
    };

    // Ad-hoc items never get a map marker -- see this module's AdHocItem doc comment.
    const displayedVisitItems = displayedItems.filter((i): i is DayItem & { kind: "visit" } => i.kind === "visit");
    displayedVisitItems.forEach((v) => {
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
  }, [items, statusFilter]);

  async function persistOrder(next: DayItem[]) {
    setItems(next);
    setSaving(true);
    try {
      await fetch("/api/visits/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next.map((v) => ({ kind: v.kind, id: v.id })) }),
      });
    } finally {
      setSaving(false);
    }
  }

  const { draggingIndex, setItemRef, dragHandleProps } = useDragReorder(items, persistOrder, effectiveReadOnly);

  async function toggleSkip(visit: RouteStop) {
    const nextStatus = visit.status === "CANCELLED" ? "SCHEDULED" : "CANCELLED";
    setItems((prev) => prev.map((v) => (v.kind === "visit" && v.id === visit.id ? { ...v, status: nextStatus } : v)));
    await fetch(`/api/visits/${visit.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  // Ad-hoc items were never part of driving-distance optimization -- they get appended
  // after the optimized visits, same treatment visits-without-coordinates already get
  // below. Still fully draggable afterward, just not part of the distance calculation.
  // Real driving duration via lib/routing.ts's computeOptimizedStopOrder, falling back to
  // straight-line distance if OSRM's table service is unreachable.
  async function optimizeRoute() {
    const visitItems = items.filter((i): i is DayItem & { kind: "visit" } => i.kind === "visit");
    const adhocItems = items.filter((i) => i.kind === "adhoc");
    const withCoords = visitItems.filter((v) => v.latitude != null && v.longitude != null) as (DayItem & {
      kind: "visit";
      latitude: number;
      longitude: number;
    })[];
    const withoutCoords = visitItems.filter((v) => v.latitude == null || v.longitude == null);
    if (withCoords.length < 2) return;

    setOptimizing(true);
    try {
      const ordered = await computeOptimizedStopOrder(withCoords);
      await persistOrder([...ordered, ...withoutCoords, ...adhocItems]);
    } finally {
      setOptimizing(false);
    }
  }

  // Ad-hoc items never carry coordinates -- excluded here so their absence never triggers
  // the "some stops don't have map coordinates yet" warning below.
  const missingCoords = items.some((i) => i.kind === "visit" && (i.latitude == null || i.longitude == null));

  // The subset actually rendered in the list/map -- everything else (GPS eligibility,
  // drag-reorder, grouping below) stays keyed off the full `items` array. trueIndexById
  // preserves each stop's real day-sequence position (badge number, marker glyph, drag
  // index) even though displayedItems may skip over some of them.
  const displayedItems = statusFilter === "all" ? items : items.filter((i) => matchesStatusFilter(i, statusFilter));
  const trueIndexById = new Map(items.map((i, idx) => [i.id, idx]));

  const activeVisits = items.filter((i): i is DayItem & { kind: "visit" } => i.kind === "visit" && i.status !== "CANCELLED");
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
  // technicianId). Built from displayedItems, not the full items array, so a status
  // filter that happens to filter out a run's first stop doesn't make that technician's
  // header vanish entirely, and the "(N stops)" count matches what's actually shown.
  // Ad-hoc items never appear here in practice -- isMultiTech callers never include one
  // (see this module's DayItem doc comment) -- but technicianId/technicianLabel are common
  // to both union members, so this reads safely either way.
  const technicianGroupStarts = new Map<string, { label: string; color: string; count: number }>();
  if (isMultiTech) {
    let prevTechId: string | null | undefined = undefined;
    let current: { label: string; color: string; count: number } | null = null;
    for (const v of displayedItems) {
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
              disabled={saving || optimizing}
              className="app-btn-primary-sm mb-2"
            >
              {optimizing ? "Optimizing…" : "Optimize stop order"}
            </button>
          ) : null}
          {!effectiveReadOnly && !proAccess ? (
            <Link href="/dashboard/billing" className="mb-2 block text-xs font-medium text-brand-primary underline">
              Upgrade to Pro to optimize stop order
            </Link>
          ) : null}
          <ul className="space-y-2">
            {displayedItems.map((item) => {
              const idx = trueIndexById.get(item.id) ?? 0;
              const techGroup = technicianGroupStarts.get(item.id);
              const handleProps = dragHandleProps(idx);

              if (item.kind === "adhoc") {
                return (
                  <Fragment key={item.id}>
                    {techGroup ? (
                      <li className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-brand-muted first:pt-0">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: techGroup.color }} />
                        {techGroup.label} ({techGroup.count} stop{techGroup.count === 1 ? "" : "s"})
                      </li>
                    ) : null}
                    <li
                      ref={setItemRef(idx)}
                      data-tour={idx === 0 ? "schedule-first-stop" : undefined}
                      className={`flex items-center gap-3 rounded border border-brand-border bg-white p-2 ${draggingIndex === idx ? "opacity-60" : ""}`}
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
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${item.completed ? "text-brand-muted line-through" : "text-brand-ink"}`}>
                          {item.description}
                          {item.propertyName ? ` — ${item.propertyName}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <form action={toggleAdHocStop}>
                          <input type="hidden" name="stopId" value={item.id} />
                          <button type="submit" className="app-btn-ghost-sm">
                            {item.completed ? "Undo" : "Done"}
                          </button>
                        </form>
                        <form action={deleteAdHocStop}>
                          <input type="hidden" name="stopId" value={item.id} />
                          <button type="submit" className="app-btn-danger-sm">
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  </Fragment>
                );
              }

              const v = item;
              const isSkipped = v.status === "CANCELLED";
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
            {displayedItems.length === 0 ? (
              <p className="text-sm text-brand-muted">
                {items.length === 0
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
