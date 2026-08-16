"use client";

import { useMemo, useState } from "react";

type CatalogOption = { id: string; name: string; dosingUnit: "OZ" | "FL_OZ" };

const UNIT_LABEL: Record<CatalogOption["dosingUnit"], string> = { OZ: "oz", FL_OZ: "fl oz" };

/**
 * Typing a name that matches a Dosing Product Catalog product (via the datalist) fills in
 * a sensible unit and carries the matched catalog product's id along as a hidden field --
 * the server action links this new billing product to that catalog entry in the same
 * submit, instead of requiring a second trip to the "Billing product" dropdown in the
 * Dosing Product Catalog section below. Typing a name with no match just adds a plain,
 * unlinked billing product exactly as before.
 */
export function AddChemicalProductForm({
  action,
  catalogOptions,
}: {
  action: (formData: FormData) => void;
  catalogOptions: CatalogOption[];
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [catalogProductId, setCatalogProductId] = useState("");

  const byName = useMemo(() => new Map(catalogOptions.map((c) => [c.name, c])), [catalogOptions]);

  function handleNameChange(value: string) {
    setName(value);
    const match = byName.get(value);
    if (match) {
      setCatalogProductId(match.id);
      setUnit(UNIT_LABEL[match.dosingUnit]);
    } else {
      setCatalogProductId("");
    }
  }

  return (
    <form action={action} className="app-card-inset mt-4">
      <p className="text-sm font-medium text-brand-ink">Add chemical product</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <input
          name="name"
          required
          placeholder="Name (e.g. Cal Hypo)"
          list="dosing-catalog-products"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="app-field"
        />
        <input
          name="unit"
          required
          placeholder="Unit (e.g. lb, gal)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="app-field"
        />
        <input name="costPerUnit" type="number" step="0.0001" required placeholder="Your cost/unit ($)" className="app-field" />
        <input name="chargePerUnit" type="number" step="0.0001" required placeholder="Charge/unit ($)" className="app-field" />
      </div>

      <datalist id="dosing-catalog-products">
        {catalogOptions.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      <input type="hidden" name="catalogProductId" value={catalogProductId} />
      {catalogProductId ? (
        <p className="mt-1.5 text-xs text-brand-primary">
          Will link to &ldquo;{name}&rdquo; in the Dosing Product Catalog as its billing product.
        </p>
      ) : null}

      <button className="app-btn-primary-sm mt-2" type="submit">
        Add product
      </button>
    </form>
  );
}
