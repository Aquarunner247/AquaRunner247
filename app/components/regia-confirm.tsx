"use client";

import { useState } from "react";
import {
  READING_FIELD_LABELS,
  type DictatedDose,
  type DictatedDoses,
  type DictatedReading,
  type ReadingField,
} from "@/lib/reading-dictation";

/**
 * What Regia heard, shown back before anything is saved.
 *
 * This screen is the reason dictation is safe to ship. The parser refuses to guess, but speech
 * recognition still mishears "eighty" as "eighteen" and both are a plausible alkalinity -- so
 * nothing here writes until a human has looked at it. Every value lands in a health-department
 * compliance log, and a wrong number nobody notices is the failure this exists to prevent.
 *
 * Built for the conditions in DESIGN-SYSTEM: a phone, in direct Nevada sun, held by someone
 * with wet hands. So values are large and monospaced (.app-metric gives tabular figures, which
 * is what stops a column of numbers shifting as you read it), every control clears the 44px
 * touch minimum, and small text sits on white rather than on a tinted fill.
 *
 * Suspect values use .app-pill-attention, NOT brand-danger. The status colours mean a water
 * reading result -- ok, warn, danger -- and "the microphone misheard you" is not a chemistry
 * verdict. Dressing a transcription problem as a failed chlorine reading is exactly the
 * competition for attention the design rules forbid.
 */

type Props = {
  reading: DictatedReading;
  /** Omitted when the organization has no chemical catalogue, or nothing was said about doses. */
  doses?: DictatedDoses;
  /** The raw transcript, so a technician can see what it thought it heard. */
  heard?: string;
  onAccept: (values: Partial<Record<ReadingField, number>>, doses: DictatedDose[]) => void;
  /** Throw this away and listen again. */
  onRedo: () => void;
  onCancel: () => void;
};

const FIELD_ORDER: ReadingField[] = [
  "freeChlorinePpm",
  "totalChlorinePpm",
  "brominePpm",
  "ph",
  "alkalinityPpm",
  "cyanuricAcidPpm",
  "calciumHardnessPpm",
  "saltPpm",
  "temperatureF",
  "filterPressurePsi",
  "pumpPressurePsi",
  "filterGaugeReading",
  "vacGaugeReading",
  "flowMeterGpm",
];

export function RegiaConfirm({ reading, doses, heard, onAccept, onRedo, onCancel }: Props) {
  /** Editable copies: a single misheard number must not cost the whole dictation. */
  const [values, setValues] = useState<Partial<Record<ReadingField, string>>>(() => {
    const seed: Partial<Record<ReadingField, string>> = {};
    for (const [field, value] of Object.entries(reading.values)) seed[field as ReadingField] = String(value);
    return seed;
  });
  /** Suspect values start in the same editable map, pre-filled with what was heard. */
  const [suspectFixes, setSuspectFixes] = useState<Partial<Record<ReadingField, string>>>(() => {
    const seed: Partial<Record<ReadingField, string>> = {};
    for (const s of reading.suspect) seed[s.field] = String(s.value);
    return seed;
  });
  /** index of the ambiguous dose -> the product id the technician picked. */
  const [chosen, setChosen] = useState<Record<number, string>>({});

  const parsedSuspects = reading.suspect.map((s) => {
    const raw = suspectFixes[s.field] ?? "";
    const n = Number(raw);
    return { ...s, raw, fixed: raw.trim() !== "" && Number.isFinite(n) ? n : null };
  });

  /**
   * An impossible value must be corrected or cleared before anything saves. Letting it through
   * because the technician tapped past it would put a number in the compliance log that the app
   * already knows cannot be real.
   */
  const unresolved = parsedSuspects.filter((s) => s.fixed == null && s.raw.trim() !== "");

  function accept() {
    const out: Partial<Record<ReadingField, number>> = {};
    for (const [field, raw] of Object.entries(values)) {
      const n = Number(raw);
      if (raw != null && raw.trim() !== "" && Number.isFinite(n)) out[field as ReadingField] = n;
    }
    for (const s of parsedSuspects) if (s.fixed != null) out[s.field] = s.fixed;

    const acceptedDoses = (doses?.doses ?? []).slice();
    (doses?.ambiguous ?? []).forEach((a, idx) => {
      // Unresolved stays unsaved. A dose is costed and billed, so "they probably meant the first
      // one" is not an assumption this is allowed to make on a customer's behalf.
      const picked = a.candidates.find((c) => c.id === chosen[idx]);
      if (!picked) return;
      acceptedDoses.push({
        productId: picked.id,
        productName: picked.name,
        quantity: a.quantity,
        unit: picked.unit,
      });
    });

    onAccept(out, acceptedDoses);
  }

  const nothingHeard = Object.keys(values).length === 0 && parsedSuspects.length === 0 && (doses?.doses.length ?? 0) === 0;

  return (
    <div className="app-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-kicker">Regia heard</p>
          <h2 className="font-display text-lg font-semibold text-brand-ink">Check before saving</h2>
        </div>
        <button type="button" onClick={onCancel} className="app-btn-ghost-sm min-h-11 px-3">
          Cancel
        </button>
      </div>

      {heard ? <p className="mt-2 text-sm text-brand-muted">&ldquo;{heard}&rdquo;</p> : null}

      {nothingHeard ? (
        <p className="mt-4 text-sm text-brand-ink">
          Nothing came through that looked like a reading. Try again, closer to the mic.
        </p>
      ) : null}

      {/* Readings that parsed cleanly. Editable, because correcting one number is faster than
          saying all six again -- and a technician who has to redo the lot will stop using this. */}
      {FIELD_ORDER.filter((f) => values[f] !== undefined).map((field) => (
        <div key={field} className="mt-3 flex items-center justify-between gap-3 border-t border-brand-border pt-3">
          <label htmlFor={`regia-${field}`} className="text-sm font-medium text-brand-ink">
            {READING_FIELD_LABELS[field].label}
          </label>
          <span className="flex items-center gap-2">
            <input
              id={`regia-${field}`}
              // Numeric keypad rather than a full keyboard: this is tapped with wet gloves.
              inputMode="decimal"
              value={values[field] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              className="app-metric app-field h-11 w-24 text-right text-lg"
            />
            <span className="w-10 text-sm text-brand-muted">{READING_FIELD_LABELS[field].unit}</span>
          </span>
        </div>
      ))}

      {/* Heard, but impossible for that field. Shown with what was said, so the technician can
          see WHY it is being questioned rather than just being told to retype something. */}
      {parsedSuspects.map((s) => (
        <div key={s.field} className="mt-3 border-t border-brand-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`regia-fix-${s.field}`} className="text-sm font-medium text-brand-ink">
              {READING_FIELD_LABELS[s.field].label}
            </label>
            <span className="flex items-center gap-2">
              <input
                id={`regia-fix-${s.field}`}
                inputMode="decimal"
                value={suspectFixes[s.field] ?? ""}
                onChange={(e) => setSuspectFixes((v) => ({ ...v, [s.field]: e.target.value }))}
                className="app-metric app-field h-11 w-24 text-right text-lg"
              />
              <span className="w-10 text-sm text-brand-muted">{READING_FIELD_LABELS[s.field].unit}</span>
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-ink">
            <span className="app-pill app-pill-attention">Check this</span>
            {s.reason}
          </p>
        </div>
      ))}

      {/* Chemicals. A dose is costed and billed, so an unresolved product is never assumed. */}
      {doses && doses.doses.length > 0 ? (
        <div className="mt-4 border-t border-brand-border pt-3">
          <p className="app-kicker">Chemicals added</p>
          <ul className="mt-2 space-y-1">
            {doses.doses.map((d, i) => (
              <li key={`${d.productId}-${i}`} className="flex items-center justify-between gap-3 text-sm text-brand-ink">
                <span>{d.productName}</span>
                <span className="app-metric">
                  {d.quantity} {d.unit}
                </span>
              </li>
            ))}
          </ul>
          {doses.doses.some((d) => d.spokenUnitConflict) ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-brand-ink">
              <span className="app-pill app-pill-attention">Check this</span>
              You said a different unit than the one this product is stocked in.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Two products named equally well. Asking is the whole point -- picking the better score
          would bill a customer for a chemical nobody added. */}
      {(doses?.ambiguous ?? []).map((a, idx) => (
        <div key={`${a.heard}-${idx}`} className="mt-3 border-t border-brand-border pt-3">
          <p className="text-sm text-brand-ink">
            Which did you add <span className="app-metric">{a.quantity}</span> of?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {a.candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setChosen((c) => ({ ...c, [idx]: candidate.id }))}
                className={
                  chosen[idx] === candidate.id ? "app-pill app-pill-active min-h-11 px-4" : "app-pill min-h-11 px-4"
                }
              >
                {candidate.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Said, understood as neither a reading nor a dose. Listed rather than dropped: the
          technician said it and will look for it. */}
      {reading.unmatched.length > 0 || (doses?.unmatched.length ?? 0) > 0 ? (
        <p className="mt-4 border-t border-brand-border pt-3 text-sm text-brand-muted">
          Not understood: {[...reading.unmatched, ...(doses?.unmatched ?? [])].join(", ")}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={nothingHeard || unresolved.length > 0}
          className="app-btn-primary min-h-11 flex-1 disabled:opacity-50"
        >
          Save these readings
        </button>
        <button type="button" onClick={onRedo} className="app-btn-secondary-sm min-h-11 px-4">
          Say again
        </button>
      </div>
    </div>
  );
}
