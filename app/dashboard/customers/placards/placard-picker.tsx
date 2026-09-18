"use client";

import { useState } from "react";

type PropertyGroup = { id: string; name: string; bodiesOfWater: { id: string; name: string }[] };

/**
 * Plain GET form -- submitting navigates to /dashboard/customers/placards/print with every
 * checked body's id as a repeated `ids` query param, so the print page is a real,
 * bookmarkable/reloadable URL rather than needing a server action + redirect round trip.
 * Local state here only drives the "N selected"/select-all UI, not the actual submission.
 */
export function PlacardPicker({ properties }: { properties: PropertyGroup[] }) {
  const allIds = properties.flatMap((p) => p.bodiesOfWater.map((b) => b.id));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }

  return (
    <form action="/dashboard/customers/placards/print" method="GET">
      <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand-border bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium text-brand-ink">
          <input
            type="checkbox"
            checked={allIds.length > 0 && selected.size === allIds.length}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-brand-control"
          />
          Select all ({allIds.length})
        </label>
        <button type="submit" disabled={selected.size === 0} className="app-btn-primary-sm">
          Print {selected.size || ""} placard{selected.size === 1 ? "" : "s"}
        </button>
      </div>

      <div className="space-y-4">
        {properties.map((property) => (
          <div key={property.id} className="rounded-lg border border-brand-border bg-white p-3">
            <p className="text-sm font-semibold text-brand-ink">{property.name}</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {property.bodiesOfWater.map((body) => (
                <label
                  key={body.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-brand-ink hover:bg-brand-surface"
                >
                  <input
                    type="checkbox"
                    name="ids"
                    value={body.id}
                    checked={selected.has(body.id)}
                    onChange={() => toggle(body.id)}
                    className="h-4 w-4 rounded border-brand-control"
                  />
                  {body.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}
