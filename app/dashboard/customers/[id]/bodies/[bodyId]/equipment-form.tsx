"use client";

import { useState } from "react";
import { EquipmentKind } from "@/generated/prisma/enums";
import { createEquipment } from "../../actions";

type Props = {
  customerId: string;
  bodyId: string;
  isSpa: boolean;
};

export const inputClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";

export type EquipmentDefaults = {
  serialNumber?: string;
  pipeSize?: string;
  numberOfPorts?: string;
  lastServicedAt?: string;
  horsepower?: string;
  voltage?: string;
  btu?: string;
  asmeCertified?: boolean;
  vgbaYear?: string;
  manufacturedSump?: boolean;
  flowRateGpm?: string;
  equalizerAbandoned?: boolean;
  filterMedia?: string;
  quantity?: string;
  purpose?: string;
  minFlowGpm?: string;
  maxFlowGpm?: string;
};

const VGBA_YEARS = ["2008", "2017"];

export function EquipmentTopFields({ kind, defaults = {} }: { kind: EquipmentKind; defaults?: EquipmentDefaults }) {
  if (kind === EquipmentKind.FILTER) {
    return (
      <select name="filterMedia" defaultValue={defaults.filterMedia ?? ""} className={inputClass}>
        <option value="">Filter media…</option>
        <option value="SAND">Sand</option>
        <option value="CARTRIDGE">Cartridge</option>
        <option value="DE">DE (Diatomaceous Earth)</option>
      </select>
    );
  }
  if (kind === EquipmentKind.MAIN_DRAIN_COVER) {
    return (
      <input
        name="flowRateGpm"
        type="number"
        step="1"
        placeholder="Max GPM flow rate"
        defaultValue={defaults.flowRateGpm}
        className={inputClass}
      />
    );
  }
  return <input name="serialNumber" placeholder="Serial #" defaultValue={defaults.serialNumber} className={inputClass} />;
}

export function EquipmentKindFields({
  kind,
  isSpa = false,
  defaults = {},
}: {
  kind: EquipmentKind;
  isSpa?: boolean;
  defaults?: EquipmentDefaults;
}) {
  const showPurpose = isSpa && (kind === EquipmentKind.PUMP || kind === EquipmentKind.MAIN_DRAIN_COVER);

  return (
    <>
      {kind === EquipmentKind.PUMP ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input
            name="horsepower"
            type="number"
            step="0.25"
            placeholder="Horsepower"
            defaultValue={defaults.horsepower}
            className={inputClass}
          />
          <input
            name="voltage"
            placeholder="Voltage (e.g. 230V)"
            defaultValue={defaults.voltage}
            className={inputClass}
          />
        </div>
      ) : null}

      {kind === EquipmentKind.FILTER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input
            name="maxFlowGpm"
            type="number"
            step="1"
            placeholder="Max flow (GPM)"
            defaultValue={defaults.maxFlowGpm}
            className={inputClass}
          />
          <input
            name="minFlowGpm"
            type="number"
            step="1"
            placeholder="Min flow (GPM)"
            defaultValue={defaults.minFlowGpm}
            className={inputClass}
          />
        </div>
      ) : null}

      {kind === EquipmentKind.HEATER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="btu" type="number" step="1000" placeholder="BTU" defaultValue={defaults.btu} className={inputClass} />
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="asmeCertified" defaultChecked={defaults.asmeCertified} className="rounded border-slate-300" />
            ASME certified
          </label>
        </div>
      ) : null}

      {kind === EquipmentKind.MAIN_DRAIN_COVER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <select name="vgbaYear" defaultValue={defaults.vgbaYear ?? ""} className={inputClass}>
            <option value="">VGBA year…</option>
            {VGBA_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" defaultValue={defaults.pipeSize} className={inputClass} />
          <input
            name="numberOfPorts"
            type="number"
            step="1"
            placeholder="# of ports"
            defaultValue={defaults.numberOfPorts}
            className={inputClass}
          />
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="manufacturedSump" defaultChecked={defaults.manufacturedSump} className="rounded border-slate-300" />
            Manufactured sump
          </label>
        </div>
      ) : null}

      {kind === EquipmentKind.SKIMMER_COVER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" defaultValue={defaults.pipeSize} className={inputClass} />
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              name="equalizerAbandoned"
              defaultChecked={defaults.equalizerAbandoned}
              className="rounded border-slate-300"
            />
            Equalizer line abandoned
          </label>
        </div>
      ) : null}

      {kind === EquipmentKind.VALVE ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input
            name="quantity"
            type="number"
            step="1"
            placeholder="How many of this valve"
            defaultValue={defaults.quantity}
            className={inputClass}
          />
        </div>
      ) : null}

      {kind === EquipmentKind.FLOW_METER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="pipeSize" placeholder={`Size (e.g. 3")`} defaultValue={defaults.pipeSize} className={inputClass} />
        </div>
      ) : null}

      {kind === EquipmentKind.OTHER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" defaultValue={defaults.pipeSize} className={inputClass} />
          <input
            name="numberOfPorts"
            type="number"
            step="1"
            placeholder="# of ports"
            defaultValue={defaults.numberOfPorts}
            className={inputClass}
          />
        </div>
      ) : null}

      {showPurpose ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <select name="purpose" defaultValue={defaults.purpose ?? ""} className={inputClass}>
            <option value="">Filtration or jets?…</option>
            <option value="FILTRATION">Filtration</option>
            <option value="JETS">Jets</option>
          </select>
        </div>
      ) : null}
    </>
  );
}

export function EquipmentForm({ customerId, bodyId, isSpa }: Props) {
  const [kind, setKind] = useState<EquipmentKind>(EquipmentKind.PUMP);

  return (
    <form action={createEquipment} className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="bodyId" value={bodyId} />

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
        <input name="make" placeholder="Make" className={inputClass} />
        <input name="model" placeholder="Model" className={inputClass} />
        <EquipmentTopFields kind={kind} />
      </div>

      <EquipmentKindFields kind={kind} isSpa={isSpa} />

      <div className="mt-2">
        <label className="block text-xs text-slate-500">Last changed / fixed</label>
        <input name="lastServicedAt" type="date" className={`mt-0.5 w-full max-w-xs ${inputClass}`} />
      </div>

      <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
        Add equipment
      </button>
    </form>
  );
}
