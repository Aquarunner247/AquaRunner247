"use client";

import { useState } from "react";
import { FilterMedia } from "@/generated/prisma/enums";

const inputClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";

export type FilterTypeDefaults = {
  filterType?: string | null;
  cartridgeCleaningIncluded?: boolean | null;
  cartridgeCleaningFrequencyPerMonth?: number | null;
  requiresFC?: boolean;
  requiresPH?: boolean;
  requiresAlkalinity?: boolean;
  requiresCYA?: boolean;
};

/**
 * Residential-only aquatic venue fields: filter type + cartridge-conditional cleaning
 * fields + the four required-reading toggles. Shared by the create and edit body-of-water
 * forms — the parent server-renders this only when property.propertyType === "RESIDENTIAL",
 * this component just owns the CARTRIDGE-conditional client reactivity.
 */
export function FilterTypeFields({ defaults = {} }: { defaults?: FilterTypeDefaults }) {
  const [filterType, setFilterType] = useState(defaults.filterType ?? "");

  return (
    <div className="mt-3 rounded border border-slate-200 bg-white p-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Residential venue settings</p>

      <select
        name="filterType"
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
        className={`mt-2 ${inputClass}`}
      >
        <option value="">Filter type…</option>
        <option value={FilterMedia.SAND}>Sand</option>
        <option value={FilterMedia.CARTRIDGE}>Cartridge</option>
        <option value={FilterMedia.DE}>DE (Diatomaceous Earth)</option>
      </select>

      {filterType === FilterMedia.CARTRIDGE ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            name="cartridgeCleaningIncluded"
            defaultValue={defaults.cartridgeCleaningIncluded === false ? "false" : "true"}
            className={inputClass}
          >
            <option value="true">Cleaning included in service</option>
            <option value="false">Cleaning billed extra</option>
          </select>
          <input
            name="cartridgeCleaningFrequencyPerMonth"
            type="number"
            step="1"
            min={0}
            placeholder="Cleanings per month"
            defaultValue={defaults.cartridgeCleaningFrequencyPerMonth ?? ""}
            className={inputClass}
          />
        </div>
      ) : null}

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Required readings</p>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" name="requiresFC" defaultChecked={defaults.requiresFC ?? true} className="rounded border-slate-300" />
          Free Chlorine
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" name="requiresPH" defaultChecked={defaults.requiresPH ?? true} className="rounded border-slate-300" />
          pH
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            name="requiresAlkalinity"
            defaultChecked={defaults.requiresAlkalinity ?? true}
            className="rounded border-slate-300"
          />
          Alkalinity
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" name="requiresCYA" defaultChecked={defaults.requiresCYA ?? true} className="rounded border-slate-300" />
          Cyanuric Acid (monthly)
        </label>
      </div>
    </div>
  );
}
