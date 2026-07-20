"use client";

import { useState } from "react";
import { PropertyType } from "@/generated/prisma/enums";

const inputClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";

export type PropertyContactDefaults = {
  managerName?: string | null;
  managerBusinessPhone?: string | null;
  managerMobilePhone?: string | null;
  managerEmail?: string | null;
  maintenanceName?: string | null;
  maintenanceCellPhone?: string | null;
  maintenanceEmail?: string | null;
  ownerName?: string | null;
  ownerMobilePhone?: string | null;
  ownerHomePhone?: string | null;
  ownerEmail?: string | null;
  accessNotes?: string | null;
  hasDog?: boolean | null;
};

type Props = {
  /** Pass both to share propertyType with a sibling (e.g. the new-customer form's venue
   * section); omit both to let this manage its own state (standalone edit forms). */
  propertyType?: PropertyType;
  onPropertyTypeChange?: (type: PropertyType) => void;
  initialPropertyType?: PropertyType;
  defaults?: PropertyContactDefaults;
};

/**
 * Property type selector plus the contact block it gates: Commercial gets a Manager and a
 * separate on-site Maintenance contact; Residential gets a single Owner contact, directions
 * for finding the pool, and a dog-on-property flag -- Manager/Maintenance don't apply to a
 * homeowner and are omitted entirely rather than just left blank.
 */
export function PropertyContactFields({
  propertyType: controlledType,
  onPropertyTypeChange,
  initialPropertyType = PropertyType.COMMERCIAL,
  defaults = {},
}: Props) {
  const [internalType, setInternalType] = useState<PropertyType>(initialPropertyType);
  const propertyType = controlledType ?? internalType;
  const setPropertyType = onPropertyTypeChange ?? setInternalType;

  return (
    <>
      <div>
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

      {propertyType === PropertyType.RESIDENTIAL ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</p>
          <input
            name="ownerName"
            defaultValue={defaults.ownerName ?? ""}
            placeholder="Owner name"
            className={`mt-2 w-full ${inputClass}`}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              name="ownerMobilePhone"
              defaultValue={defaults.ownerMobilePhone ?? ""}
              placeholder="Mobile phone"
              className={inputClass}
            />
            <input
              name="ownerHomePhone"
              defaultValue={defaults.ownerHomePhone ?? ""}
              placeholder="Home phone"
              className={inputClass}
            />
          </div>
          <input
            name="ownerEmail"
            type="email"
            defaultValue={defaults.ownerEmail ?? ""}
            placeholder="Owner email"
            className={`mt-2 w-full ${inputClass}`}
          />
          <textarea
            name="accessNotes"
            defaultValue={defaults.accessNotes ?? ""}
            placeholder="How to find/access the pool -- gate code, parking, side yard, etc."
            rows={2}
            className={`mt-2 w-full ${inputClass}`}
          />
          <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              name="hasDog"
              defaultChecked={defaults.hasDog ?? false}
              className="rounded border-slate-300"
            />
            Dog on property
          </label>
        </div>
      ) : (
        <>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manager</p>
            <input
              name="managerName"
              defaultValue={defaults.managerName ?? ""}
              placeholder="Manager name"
              className={`mt-2 w-full ${inputClass}`}
            />
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                name="managerBusinessPhone"
                defaultValue={defaults.managerBusinessPhone ?? ""}
                placeholder="Manager business phone"
                className={inputClass}
              />
              <input
                name="managerMobilePhone"
                defaultValue={defaults.managerMobilePhone ?? ""}
                placeholder="Manager mobile phone"
                className={inputClass}
              />
            </div>
            <input
              name="managerEmail"
              type="email"
              defaultValue={defaults.managerEmail ?? ""}
              placeholder="Manager email"
              className={`mt-2 w-full ${inputClass}`}
            />
          </div>

          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance contact</p>
            <input
              name="maintenanceName"
              defaultValue={defaults.maintenanceName ?? ""}
              placeholder="Maintenance name"
              className={`mt-2 w-full ${inputClass}`}
            />
            <input
              name="maintenanceCellPhone"
              defaultValue={defaults.maintenanceCellPhone ?? ""}
              placeholder="Maintenance cell phone"
              className={`mt-2 w-full ${inputClass}`}
            />
            <input
              name="maintenanceEmail"
              type="email"
              defaultValue={defaults.maintenanceEmail ?? ""}
              placeholder="Maintenance email"
              className={`mt-2 w-full ${inputClass}`}
            />
          </div>
        </>
      )}
    </>
  );
}
