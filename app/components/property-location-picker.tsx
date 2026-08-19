"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { setPropertyLocation } from "@/app/dashboard/routes/actions";
import { BRAND_CTA } from "@/app/lib/chart-colors";

type Suggestion = { label: string; latitude: number; longitude: number };

type Props = {
  propertyId: string;
  initialLatitude: number;
  initialLongitude: number;
  initialZoom: number;
  /** True only when initialLatitude/Longitude is a real address-level geocode or an
   * existing saved pin -- false when it's just a fallback guess (org centroid or the
   * continental US), so the map doesn't show a marker that looks like a confirmed location. */
  hasConfidentStart: boolean;
};

/** Satellite imagery via Esri World Imagery -- free, no API key, same "no paid mapping
 * account" approach as the OpenStreetMap tiles used elsewhere in this app. Tile URL order
 * is {z}/{y}/{x} (ArcGIS REST convention), not the usual {z}/{x}/{y}. */
const SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export function PropertyLocationPicker({ propertyId, initialLatitude, initialLongitude, initialZoom, hasConfidentStart }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    hasConfidentStart ? { lat: initialLatitude, lng: initialLongitude } : null,
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapDivRef.current || mapRef.current) return;

      const map = L.map(mapDivRef.current).setView([initialLatitude, initialLongitude], initialZoom);
      L.tileLayer(SATELLITE_TILE_URL, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 20 }).addTo(map);
      mapRef.current = map;

      const pinIcon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:${BRAND_CTA};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      const placeMarker = (lat: number, lng: number) => {
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(map);
          markerRef.current.on("dragend", () => {
            const pos = markerRef.current!.getLatLng();
            setPicked({ lat: pos.lat, lng: pos.lng });
          });
        } else {
          markerRef.current.setLatLng([lat, lng]);
        }
        setPicked({ lat, lng });
      };

      if (hasConfidentStart) {
        placeMarker(initialLatitude, initialLongitude);
      }

      map.on("click", (e) => placeMarker(e.latlng.lat, e.latlng.lng));
    })();
    return () => {
      cancelled = true;
    };
    // Only ever initialize once -- re-centering after a search is handled separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSearch() {
    if (query.trim().length < 5) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json()) as { suggestions?: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
    } finally {
      setSearching(false);
    }
  }

  function goToSuggestion(s: Suggestion) {
    setSuggestions([]);
    setQuery(s.label);
    mapRef.current?.setView([s.latitude, s.longitude], 19);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-brand-muted">
          Search an address to jump the map there
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch();
              }
            }}
            placeholder="123 Main St, Las Vegas, NV"
            className="rounded border border-brand-control px-2 py-1.5 text-sm"
          />
        </label>
        <button type="button" onClick={onSearch} disabled={searching} className="rounded border border-brand-control px-3 py-1.5 text-sm font-medium text-brand-ink disabled:opacity-60">
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {suggestions.length > 0 ? (
        <ul className="mt-1 divide-y divide-brand-border rounded border border-brand-border bg-white text-sm">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button type="button" onClick={() => goToSuggestion(s)} className="block w-full px-2 py-1.5 text-left hover:bg-brand-surface">
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-sm text-brand-muted">
        Click the satellite image right on the pool (or drag the pin once placed) to mark its exact location.
      </p>
      <div ref={mapDivRef} className="mt-2 h-[420px] w-full rounded-lg border border-brand-border" />

      <form action={setPropertyLocation} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="latitude" value={picked?.lat ?? ""} />
        <input type="hidden" name="longitude" value={picked?.lng ?? ""} />
        <p className="text-xs text-brand-muted">
          {picked ? `Pin at ${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}` : "Click the map to drop a pin first."}
        </p>
        <button type="submit" disabled={!picked} className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          Save location
        </button>
      </form>
    </div>
  );
}
