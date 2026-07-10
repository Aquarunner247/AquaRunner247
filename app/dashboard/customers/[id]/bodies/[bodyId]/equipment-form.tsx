"use client";

import { useState } from "react";
import { EquipmentKind } from "@/generated/prisma/enums";
import { createEquipment } from "../../actions";

type Props = {
  customerId: string;
  bodyId: string;
};

const inputClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";

export function EquipmentForm({ customerId, bodyId }: Props) {
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
        <input name="serialNumber" placeholder="Serial #" className={inputClass} />
      </div>

      {kind === EquipmentKind.PUMP ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="horsepower" type="number" step="0.25" placeholder="Horsepower" className={inputClass} />
          <input name="voltage" placeholder="Voltage (e.g. 230V)" className={inputClass} />
        </div>
      ) : null}

      {kind === EquipmentKind.FILTER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="maxFlowGpm" type="number" step="1" placeholder="Max flow (GPM)" className={inputClass} />
          <input name="minFlowGpm" type="number" step="1" placeholder="Min flow (GPM)" className={inputClass} />
        </div>
      ) : null}

      {kind === EquipmentKind.HEATER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="btu" type="number" step="1000" placeholder="BTU" className={inputClass} />
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="asmeCertified" className="rounded border-slate-300" />
            ASME certified
          </label>
        </div>
      ) : null}

      {kind === EquipmentKind.MAIN_DRAIN_COVER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="vgbaYear" type="number" step="1" placeholder="VGBA year" className={inputClass} />
          <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" className={inputClass} />
          <input name="numberOfPorts" type="number" step="1" placeholder="# of ports" className={inputClass} />
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="manufacturedSump" className="rounded border-slate-300" />
            Manufactured sump
          </label>
        </div>
      ) : null}

      {kind === EquipmentKind.SKIMMER_COVER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" className={inputClass} />
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="equalizerAbandoned" className="rounded border-slate-300" />
            Equalizer line abandoned
          </label>
        </div>
      ) : null}

      {kind === EquipmentKind.OTHER ? (
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" className={inputClass} />
          <input name="numberOfPorts" type="number" step="1" placeholder="# of ports" className={inputClass} />
        </div>
      ) : null}

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
