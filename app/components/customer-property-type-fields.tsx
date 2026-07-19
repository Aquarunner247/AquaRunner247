"use client";

import { useState } from "react";
import { BodyOfWaterType, PropertyType } from "@/generated/prisma/enums";
import { FilterTypeFields } from "./filter-type-fields";

const inputClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";

/**
 * Property type + "initial aquatic venue" fields for customer creation, combined into one
 * client component because propertyType (Property-level) gates whether the venue-level
 * residential fields (FilterTypeFields — filterType, cartridge fields, requires* toggles,
 * all BodyOfWater-level) are shown at all.
 */
export function CustomerPropertyTypeFields() {
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.COMMERCIAL);

  return (
    <>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Property type</label>
        <select
          name="propertyType"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value as PropertyType)}
          className={`mt-1 ${inputClass}`}
        >
          <option value={PropertyType.COMMERCIAL}>Commercial</option>
          <option value={PropertyType.RESIDENTIAL}>Residential</option>
        </select>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-sm font-semibold text-slate-900">Initial aquatic venue</p>
        <input
          name="initialBodyName"
          required
          placeholder="Aquatic venue name (e.g. Main Pool)"
          className={`mt-2 w-full ${inputClass}`}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select name="initialBodyType" className={inputClass}>
            {Object.values(BodyOfWaterType).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input name="initialBodyVolumeGallons" type="number" step="1" placeholder="Volume gallons" className={inputClass} />
        </div>

        {propertyType === PropertyType.RESIDENTIAL ? <FilterTypeFields /> : null}
      </div>
    </>
  );
}
