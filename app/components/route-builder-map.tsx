"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { BRAND_PRIMARY } from "@/app/lib/chart-colors";

export type RouteMapStop = {
  id: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  stops: RouteMapStop[];
};

/**
 * Live overview map for the route builder -- numbered pins (order matters here, unlike
 * RouteSuggestionMapPreview's plain dots) reflecting the stop list's current order, so
 * dragging/adding/removing a stop updates the map without a page reload. Not a reuse of
 * RouteDayView (GPS auto-arrival, multi-tech grouping, skip/unskip -- none of that applies
 * to a builder that's just showing where stops are).
 */
export function RouteBuilderMap({ stops }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  const located = stops.filter((s): s is RouteMapStop & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null);
  const missingCount = stops.length - located.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (located.length === 0 || !mapDivRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapDivRef.current) return;

      if (!mapRef.current) {
        const map = L.map(mapDivRef.current).setView([located[0].latitude, located[0].longitude], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }
      const layer = layerRef.current!;
      layer.clearLayers();

      const points: [number, number][] = [];

      stops.forEach((stop, idx) => {
        if (stop.latitude == null || stop.longitude == null) return;
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${BRAND_PRIMARY};color:white;border-radius:9999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);">${idx + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([stop.latitude, stop.longitude], { icon }).addTo(layer).bindPopup(`${idx + 1}. ${stop.label}`);
        points.push([stop.latitude, stop.longitude]);
      });

      if (points.length) {
        mapRef.current!.fitBounds(points, { padding: [30, 30] });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (located.length === 0) {
    return (
      <div className="flex h-[360px] w-full items-center justify-center rounded-lg border border-brand-border bg-brand-surface p-4 text-center text-sm text-brand-muted">
        No stops on this route have a map location set yet.
      </div>
    );
  }

  return (
    <div>
      <div ref={mapDivRef} className="h-[360px] w-full rounded-lg border border-brand-border" />
      {missingCount > 0 ? (
        <p className="mt-1.5 text-xs text-brand-muted">
          {missingCount} of {stops.length} stop{stops.length === 1 ? "" : "s"} don&rsquo;t have a location set yet.
        </p>
      ) : null}
    </div>
  );
}
