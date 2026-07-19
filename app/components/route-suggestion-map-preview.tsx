"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";

type StopPin = { propertyId: string; propertyName: string; latitude: number; longitude: number };

type Props = {
  newLocation: { latitude: number; longitude: number };
  stops: StopPin[];
};

/**
 * Small, purpose-built preview map for a single Smart Route Placement suggestion — not
 * a reuse of RouteDayView (that component is tightly coupled to drag-reorder, GPS
 * auto-arrival, and skip-toggle editing, none of which apply to a read-only preview).
 * Just two marker types, no polyline (order isn't being conveyed here).
 */
export function RouteSuggestionMapPreview({ newLocation, stops }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapDivRef.current) return;

      if (!mapRef.current) {
        const map = L.map(mapDivRef.current).setView([newLocation.latitude, newLocation.longitude], 12);
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

      for (const stop of stops) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:#0A5FA4;color:white;border-radius:9999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);">•</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([stop.latitude, stop.longitude], { icon }).addTo(layer).bindPopup(stop.propertyName);
        points.push([stop.latitude, stop.longitude]);
      }

      const newIcon = L.divIcon({
        className: "",
        html: `<div style="background:#FF6B5B;color:white;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);">★</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([newLocation.latitude, newLocation.longitude], { icon: newIcon }).addTo(layer).bindPopup("New customer");
      points.push([newLocation.latitude, newLocation.longitude]);

      if (points.length) {
        mapRef.current!.fitBounds(points, { padding: [30, 30] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newLocation.latitude, newLocation.longitude, stops]);

  return <div ref={mapDivRef} className="h-[280px] w-full rounded-lg border border-[#C9E3EC]" />;
}
