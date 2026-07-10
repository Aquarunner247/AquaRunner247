"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";

export type RouteStop = {
  id: string;
  status: string;
  propertyName: string;
  bodyName: string;
  address: string;
  scheduledStart: string;
  startedAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  visits: RouteStop[];
  readOnly?: boolean;
  isToday?: boolean;
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

export function RouteDayView({ visits: initialVisits, readOnly = false, isToday = false }: Props) {
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
    if (readOnly || !isToday) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }

    setLocationState("watching");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        for (const v of visitsRef.current) {
          if (v.startedAt || v.status === "CANCELLED" || notifiedRef.current.has(v.id)) continue;
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
  }, [readOnly, isToday]);

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
    visits.forEach((v, idx) => {
      if (v.latitude == null || v.longitude == null) return;
      const isSkipped = v.status === "CANCELLED";
      const color = isSkipped ? "#FF6B5B" : v.status === "COMPLETED" ? "#0A5FA4" : "#0A5FA4";
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:white;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);">${
          isSkipped ? "×" : idx + 1
        }</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([v.latitude, v.longitude], { icon })
        .addTo(layerRef.current!)
        .bindPopup(`<strong>${v.propertyName}</strong><br/>${v.bodyName}`);
      points.push([v.latitude, v.longitude]);
    });
    if (points.length) {
      L.polyline(points, { color: "#0A5FA4", weight: 3, opacity: 0.6 }).addTo(layerRef.current!);
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
        <div>
          {!readOnly ? (
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
              return (
                <li
                  key={v.id}
                  draggable={!readOnly}
                  onDragStart={() => {
                    dragIndex.current = idx;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(idx)}
                  className={`flex items-center gap-3 rounded border p-2 ${
                    isSkipped ? "border-[#FF6B5B] bg-[#FF6B5B]/10" : "border-[#C9E3EC] bg-white"
                  } ${!readOnly ? "cursor-move" : ""}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      isSkipped ? "bg-[#FF6B5B]" : "bg-[#0A5FA4]"
                    }`}
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
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => void toggleSkip(v)}
                      className="shrink-0 rounded border border-[#C9E3EC] px-2 py-1 text-xs font-medium text-[#12234A]"
                    >
                      {isSkipped ? "Unskip" : "Skip"}
                    </button>
                  ) : null}
                </li>
              );
            })}
            {visits.length === 0 ? <p className="text-sm text-[#4A6572]">No stops for this day.</p> : null}
          </ul>
        </div>
        <div ref={mapDivRef} className="h-[420px] w-full rounded-lg border border-[#C9E3EC]" />
      </div>
    </div>
  );
}
