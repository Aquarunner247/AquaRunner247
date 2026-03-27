"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Dose = {
  id: string;
  productName: string;
  quantity: string;
  unit: string;
};

type Reading = {
  ph: string;
  freeChlorinePpm: string;
  totalChlorinePpm: string;
  alkalinityPpm: string;
  cyanuricAcidPpm: string;
  pumpPressurePsi: string;
  vacGaugeReading: string;
  flowMeterGpm: string;
  filterPressurePsi: string;
  filterGaugeReading: string;
};

const defaultReading: Reading = {
  ph: "",
  freeChlorinePpm: "",
  totalChlorinePpm: "",
  alkalinityPpm: "",
  cyanuricAcidPpm: "",
  pumpPressurePsi: "",
  vacGaugeReading: "",
  flowMeterGpm: "",
  filterPressurePsi: "",
  filterGaugeReading: "",
};

type Props = {
  visitId: string;
  visitStatus: string;
  initialReading: Record<string, unknown> | null;
  initialPhotoCount: number;
  initialDoses: Dose[];
};

function toInput(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function VisitForm({ visitId, visitStatus, initialReading, initialPhotoCount, initialDoses }: Props) {
  const [reading, setReading] = useState<Reading>({
    ph: toInput(initialReading?.ph),
    freeChlorinePpm: toInput(initialReading?.freeChlorinePpm),
    totalChlorinePpm: toInput(initialReading?.totalChlorinePpm),
    alkalinityPpm: toInput(initialReading?.alkalinityPpm),
    cyanuricAcidPpm: toInput(initialReading?.cyanuricAcidPpm),
    pumpPressurePsi: toInput(initialReading?.pumpPressurePsi),
    vacGaugeReading: toInput(initialReading?.vacGaugeReading),
    flowMeterGpm: toInput(initialReading?.flowMeterGpm),
    filterPressurePsi: toInput(initialReading?.filterPressurePsi),
    filterGaugeReading: toInput(initialReading?.filterGaugeReading),
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [photoCount, setPhotoCount] = useState(initialPhotoCount);
  const [doses, setDoses] = useState<Dose[]>(initialDoses);
  const [doseForm, setDoseForm] = useState({ productName: "", quantity: "", unit: "" });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const timerRef = useRef<number | null>(null);

  const isCompleted = visitStatus === "COMPLETED";

  const requiredMissing = useMemo(() => {
    const required = [
      reading.ph,
      reading.freeChlorinePpm,
      reading.alkalinityPpm,
      reading.cyanuricAcidPpm,
      reading.pumpPressurePsi,
      reading.vacGaugeReading,
      reading.flowMeterGpm,
      reading.filterPressurePsi,
    ];
    return required.some((v) => !v);
  }, [reading]);

  async function saveReading(source: "auto" | "manual") {
    try {
      setSaveState("saving");
      const response = await fetch(`/api/visits/${visitId}/reading`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reading,
          ph: reading.ph || null,
          freeChlorinePpm: reading.freeChlorinePpm || null,
          totalChlorinePpm: reading.totalChlorinePpm || null,
          alkalinityPpm: reading.alkalinityPpm || null,
          cyanuricAcidPpm: reading.cyanuricAcidPpm || null,
          pumpPressurePsi: reading.pumpPressurePsi || null,
          vacGaugeReading: reading.vacGaugeReading || null,
          flowMeterGpm: reading.flowMeterGpm || null,
          filterPressurePsi: reading.filterPressurePsi || null,
          filterGaugeReading: reading.filterGaugeReading || null,
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      setSaveState("saved");
      setSaveMsg(source === "auto" ? "Autosaved" : "Saved");
    } catch {
      setSaveState("error");
      setSaveMsg("Save failed");
    }
  }

  useEffect(() => {
    if (isCompleted) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void saveReading("auto");
    }, 700);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, isCompleted]);

  async function addDose(e: FormEvent) {
    e.preventDefault();
    const response = await fetch(`/api/visits/${visitId}/doses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: doseForm.productName,
        quantity: Number(doseForm.quantity),
        unit: doseForm.unit,
      }),
    });
    if (!response.ok) {
      setSaveState("error");
      setSaveMsg("Dose add failed");
      return;
    }
    const data = (await response.json()) as { dose: Dose };
    setDoses((prev) => [data.dose, ...prev]);
    setDoseForm({ productName: "", quantity: "", unit: "" });
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("capturedAt", new Date().toISOString());
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              formData.append("latitude", String(position.coords.latitude));
              formData.append("longitude", String(position.coords.longitude));
              formData.append("accuracyMeters", String(position.coords.accuracy));
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 7000 },
          );
        });
      }
      const response = await fetch(`/api/visits/${visitId}/photos`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Photo upload failed");
      setPhotoCount((n) => n + 1);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function completeVisit() {
    const response = await fetch(`/api/visits/${visitId}/complete`, { method: "POST" });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const data = (await response.json()) as { error?: string };
    if (data.error === "MISSING_REQUIRED_PHOTO") {
      setSaveState("error");
      setSaveMsg("Need at least 1 photo before completion");
      return;
    }
    if (data.error === "MISSING_REQUIRED_READINGS") {
      setSaveState("error");
      setSaveMsg("Missing required readings");
      return;
    }
    setSaveState("error");
    setSaveMsg("Completion failed");
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-900">
            Save status:{" "}
            <span className="font-semibold">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? saveMsg || "Saved" : saveState === "error" ? saveMsg || "Error" : "Idle"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void saveReading("manual")}
            disabled={isCompleted}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Save / Sync now
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Water readings</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          {Object.entries(defaultReading).map(([key]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-slate-600">{key}</span>
              <input
                type="number"
                step="0.01"
                value={reading[key as keyof Reading]}
                disabled={isCompleted}
                onChange={(e) => setReading((prev) => ({ ...prev, [key]: e.target.value }))}
                className="rounded border border-slate-300 px-2 py-1.5 text-slate-900 disabled:bg-slate-100"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Chemical doses</h2>
        <form className="mt-3 grid grid-cols-4 gap-2" onSubmit={addDose}>
          <input
            placeholder="Product"
            value={doseForm.productName}
            disabled={isCompleted}
            onChange={(e) => setDoseForm((d) => ({ ...d, productName: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
          <input
            placeholder="Qty"
            type="number"
            step="0.01"
            value={doseForm.quantity}
            disabled={isCompleted}
            onChange={(e) => setDoseForm((d) => ({ ...d, quantity: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
          <input
            placeholder="Unit"
            value={doseForm.unit}
            disabled={isCompleted}
            onChange={(e) => setDoseForm((d) => ({ ...d, unit: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
          <button type="submit" disabled={isCompleted} className="rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            Add dose
          </button>
        </form>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {doses.map((d) => (
            <li key={d.id}>
              {d.productName}: {d.quantity} {d.unit}
            </li>
          ))}
          {doses.length === 0 ? <li className="text-slate-500">No doses added yet.</li> : null}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Photo capture</h2>
        <p className="mt-1 text-sm text-slate-600">At least 1 photo is required to complete this visit.</p>
        <p className="mt-1 text-sm font-medium text-slate-900">Photos on file: {photoCount}</p>
        <input
          className="mt-3 block text-sm"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={isCompleted || uploadingPhoto}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPhoto(file);
          }}
        />
        {uploadingPhoto ? <p className="mt-2 text-sm text-slate-600">Uploading photo...</p> : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => void completeVisit()}
          disabled={isCompleted || requiredMissing || photoCount < 1}
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isCompleted ? "Visit completed" : "Complete service visit"}
        </button>
        {!isCompleted && (requiredMissing || photoCount < 1) ? (
          <p className="mt-2 text-sm text-amber-700">
            Completion requires all required readings and at least one photo.
          </p>
        ) : null}
      </div>
    </section>
  );
}
