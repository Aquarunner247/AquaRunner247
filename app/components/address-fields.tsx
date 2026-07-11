"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  label: string;
  latitude: number;
  longitude: number;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
};

type AddressFieldsProps = {
  initialAddressLine1?: string | null;
  initialAddressLine2?: string | null;
  initialCity?: string | null;
  initialRegion?: string | null;
  initialPostalCode?: string | null;
};

/**
 * Address entry with a live-typing suggestion dropdown (backed by the same free Nominatim
 * geocoder the server already uses for its best-effort geocode-on-save). Picking a suggestion
 * fills the fields below AND stamps hidden lat/lng inputs, so the server action can skip its
 * own geocode lookup and use exact coordinates immediately.
 */
export function AddressFields({
  initialAddressLine1,
  initialAddressLine2,
  initialCity,
  initialRegion,
  initialPostalCode,
}: AddressFieldsProps) {
  const [query, setQuery] = useState(initialAddressLine1 ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const line1Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLInputElement>(null);
  const postalRef = useRef<HTMLInputElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    // Typing again means the previously-picked coordinates (if any) no longer match — let the
    // server's own best-effort geocode run instead of silently keeping stale coordinates.
    if (latRef.current) latRef.current.value = "";
    if (lngRef.current) lngRef.current.value = "";

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (value.trim().length < 5) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(value)}`);
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
        setOpen(data.suggestions.length > 0);
      } catch {
        // Non-critical — admin can still type the address fields below manually.
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function pickSuggestion(s: Suggestion) {
    setQuery(s.addressLine1 || s.label);
    if (line1Ref.current) line1Ref.current.value = s.addressLine1 || s.label;
    if (cityRef.current) cityRef.current.value = s.city;
    if (regionRef.current) regionRef.current.value = s.region;
    if (postalRef.current) postalRef.current.value = s.postalCode;
    if (latRef.current) latRef.current.value = String(s.latitude);
    if (lngRef.current) lngRef.current.value = String(s.longitude);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <input type="hidden" name="latitude" ref={latRef} />
      <input type="hidden" name="longitude" ref={lngRef} />

      <div className="relative">
        <input
          ref={line1Ref}
          name="addressLine1"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setOpen(suggestions.length > 0)}
          placeholder="Start typing an address…"
          autoComplete="off"
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        {loading ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">Searching…</span>
        ) : null}
        {open && suggestions.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full rounded border border-slate-300 bg-white text-sm shadow-lg">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="block w-full px-2 py-1.5 text-left hover:bg-slate-100"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <input
        name="addressLine2"
        defaultValue={initialAddressLine2 ?? ""}
        placeholder="Address line 2 (apt, suite, etc.)"
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          ref={cityRef}
          name="city"
          defaultValue={initialCity ?? ""}
          placeholder="City"
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          ref={regionRef}
          name="region"
          defaultValue={initialRegion ?? ""}
          placeholder="State"
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          ref={postalRef}
          name="postalCode"
          defaultValue={initialPostalCode ?? ""}
          placeholder="ZIP"
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}
