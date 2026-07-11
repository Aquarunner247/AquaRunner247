"use client";

import { useEffect, useRef, useState } from "react";
import { EquipmentKind } from "@/generated/prisma/enums";
import { deleteEquipment, updateEquipment } from "../../actions";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { EquipmentKindFields, EquipmentTopFields, inputClass } from "./equipment-form";

export type EquipmentRow = {
  id: string;
  kind: EquipmentKind;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  pipeSize: string | null;
  numberOfPorts: number | null;
  lastServicedAt: Date | null;
  horsepower: number | string | null;
  voltage: string | null;
  btu: number | null;
  asmeCertified: boolean | null;
  vgbaYear: number | null;
  manufacturedSump: boolean | null;
  flowRateGpm: number | string | null;
  equalizerAbandoned: boolean | null;
  filterMedia: string | null;
  quantity: number | null;
  purpose: string | null;
};

type Props = {
  customerId: string;
  equipment: EquipmentRow;
  minFlowGpm: number | string | null;
  maxFlowGpm: number | string | null;
  isSpa: boolean;
};

const FILTER_MEDIA_LABELS: Record<string, string> = {
  SAND: "Sand",
  CARTRIDGE: "Cartridge",
  DE: "DE",
};

const PURPOSE_LABELS: Record<string, string> = {
  FILTRATION: "Filtration",
  JETS: "Jets",
};

function toDateInput(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function EquipmentItem({ customerId, equipment: eq, minFlowGpm, maxFlowGpm, isSpa }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<EquipmentKind>(eq.kind);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await updateEquipment(formData);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded border border-[#C9E3EC] bg-white px-2 py-2">
        <form onSubmit={handleSave} className="space-y-2">
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="equipmentId" value={eq.id} />
          <div className="grid gap-2 md:grid-cols-4">
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as EquipmentKind)}
              className={inputClass}
            >
              {Object.values(EquipmentKind).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input name="make" placeholder="Make" defaultValue={eq.make ?? ""} className={inputClass} />
            <input name="model" placeholder="Model" defaultValue={eq.model ?? ""} className={inputClass} />
            <EquipmentTopFields
              kind={kind}
              defaults={{
                serialNumber: eq.serialNumber ?? "",
                filterMedia: eq.filterMedia ?? "",
                flowRateGpm: eq.flowRateGpm?.toString() ?? "",
              }}
            />
          </div>

          <EquipmentKindFields
            kind={kind}
            isSpa={isSpa}
            defaults={{
              pipeSize: eq.pipeSize ?? "",
              numberOfPorts: eq.numberOfPorts?.toString() ?? "",
              horsepower: eq.horsepower?.toString() ?? "",
              voltage: eq.voltage ?? "",
              btu: eq.btu?.toString() ?? "",
              asmeCertified: eq.asmeCertified ?? false,
              vgbaYear: eq.vgbaYear?.toString() ?? "",
              manufacturedSump: eq.manufacturedSump ?? false,
              equalizerAbandoned: eq.equalizerAbandoned ?? false,
              quantity: eq.quantity?.toString() ?? "",
              purpose: eq.purpose ?? "",
              minFlowGpm: minFlowGpm?.toString() ?? "",
              maxFlowGpm: maxFlowGpm?.toString() ?? "",
            }}
          />

          <div>
            <label className="block text-xs text-slate-500">Last changed / fixed</label>
            <input
              name="lastServicedAt"
              type="date"
              defaultValue={toDateInput(eq.lastServicedAt)}
              className={`mt-0.5 w-full max-w-xs ${inputClass}`}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
      <span className="text-sm text-slate-700">
        {eq.kind}
        {eq.make ? ` • ${eq.make}` : ""}
        {eq.model ? ` ${eq.model}` : ""}
        {eq.serialNumber ? ` • SN ${eq.serialNumber}` : ""}
        {eq.horsepower ? ` • ${eq.horsepower} HP` : ""}
        {eq.voltage ? ` • ${eq.voltage}` : ""}
        {eq.btu ? ` • ${eq.btu} BTU` : ""}
        {eq.asmeCertified ? ` • ASME certified` : ""}
        {eq.vgbaYear ? ` • VGBA ${eq.vgbaYear}` : ""}
        {eq.manufacturedSump ? ` • Manufactured sump` : ""}
        {eq.flowRateGpm ? ` • ${eq.flowRateGpm} GPM max` : ""}
        {eq.equalizerAbandoned ? ` • Equalizer abandoned` : ""}
        {eq.filterMedia ? ` • ${FILTER_MEDIA_LABELS[eq.filterMedia] ?? eq.filterMedia}` : ""}
        {eq.quantity ? ` • Qty ${eq.quantity}` : ""}
        {eq.purpose ? ` • ${PURPOSE_LABELS[eq.purpose] ?? eq.purpose}` : ""}
        {eq.pipeSize ? ` • ${eq.kind === "FLOW_METER" ? "Size" : "Pipe"} ${eq.pipeSize}` : ""}
        {eq.numberOfPorts ? ` • ${eq.numberOfPorts} port${eq.numberOfPorts === 1 ? "" : "s"}` : ""}
        {eq.lastServicedAt ? ` • Last serviced ${new Date(eq.lastServicedAt).toLocaleDateString()}` : ""}
      </span>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded px-2 py-1 text-base hover:bg-slate-200"
          aria-label="Equipment actions"
        >
          ⋮
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-10 mt-1 w-32 rounded border border-slate-200 bg-white py-1 shadow-md">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              Edit
            </button>
            <form action={deleteEquipment}>
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="equipmentId" value={eq.id} />
              <ConfirmSubmitButton
                label="Delete"
                confirmMessage="Delete this equipment item?"
                className="block w-full px-3 py-1.5 text-left text-sm text-rose-700 hover:bg-slate-100"
              />
            </form>
          </div>
        ) : null}
      </div>
    </li>
  );
}
