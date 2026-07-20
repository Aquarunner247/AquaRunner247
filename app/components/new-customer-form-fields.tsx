"use client";

import { useState } from "react";
import { BodyOfWaterType, PropertyType } from "@/generated/prisma/enums";
import { FilterTypeFields } from "./filter-type-fields";
import { PropertyContactFields } from "./property-contact-fields";
import { AddressFields } from "./address-fields";

const inputClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";

type ManagementCompany = { id: string; name: string };

/**
 * The entire dynamic body of the "Add customer" form. Property type is asked first, before
 * anything else, and gates two things further down that both need the same state: which
 * contact block shows (Owner vs Manager/Maintenance, via PropertyContactFields) and whether
 * the initial aquatic venue gets the residential-only FilterTypeFields.
 */
export function NewCustomerFormFields({ managementCompanies }: { managementCompanies: ManagementCompany[] }) {
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.COMMERCIAL);

  return (
    <>
      <PropertyContactFields propertyType={propertyType} onPropertyTypeChange={setPropertyType} />

      <div className="mt-3 border-t border-slate-200 pt-3">
        <input name="name" required placeholder="Property/customer name" className={`w-full ${inputClass}`} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select name="managementCompanyId" defaultValue="" className={inputClass}>
          <option value="">No management company</option>
          {managementCompanies.map((mc) => (
            <option key={mc.id} value={mc.id}>
              {mc.name}
            </option>
          ))}
        </select>
        <input name="newManagementCompanyName" placeholder="Or type a new company name" className={inputClass} />
      </div>

      <div className="mt-2">
        <AddressFields />
      </div>

      <textarea name="notes" placeholder="Notes (optional)" className={`mt-2 w-full ${inputClass}`} rows={3} />

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
