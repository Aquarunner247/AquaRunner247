"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { parseChargeAmount } from "@/lib/checklist-charge";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label: string;
  required: boolean;
  billable: boolean;
  chargeAmount: number | null;
};

/**
 * The per-item settings on the residential checklist: required, chargeable, and the price.
 *
 * One form per item rather than one Save for the whole list. The list is 21 items long, and a
 * single Save means an admin who changes the price of a filter clean and then reorders something
 * loses the edit without being told. Per item, a save is the thing you just looked at.
 *
 * The Save button only enables once something actually changed, which is the other half of the
 * same problem: a row that looks editable but has nothing pending is the state where people tick a
 * box, walk away, and assume it took. Dirty is computed against the server's values, so after a
 * successful save the revalidated props match the state and the button goes quiet by itself.
 */
export function ResidentialItemSettings({ action, id, label, required, billable, chargeAmount }: Props) {
  const savedCharge = chargeAmount != null ? chargeAmount.toFixed(2) : "";
  const [nextRequired, setNextRequired] = useState(required);
  const [nextBillable, setNextBillable] = useState(billable);
  const [nextCharge, setNextCharge] = useState(savedCharge);

  const parsedCharge = parseChargeAmount(nextCharge);
  // Only complain about an unparseable price while the item is actually chargeable -- the box is
  // disabled otherwise and its contents are about to be cleared anyway.
  const chargeError = nextBillable && !parsedCharge.ok ? parsedCharge.reason : null;

  const dirty = nextRequired !== required || nextBillable !== billable || (nextBillable && nextCharge !== savedCharge);

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <input type="hidden" name="id" value={id} />

      <label className="flex min-h-[44px] items-center gap-2 text-sm text-brand-ink">
        <input
          type="checkbox"
          name="required"
          checked={nextRequired}
          onChange={(event) => setNextRequired(event.target.checked)}
          className="h-5 w-5 accent-brand-primary"
        />
        <span>
          Required<span className="sr-only"> to complete a stop — {label}</span>
        </span>
      </label>

      <label className="flex min-h-[44px] items-center gap-2 text-sm text-brand-ink">
        <input
          type="checkbox"
          name="billable"
          checked={nextBillable}
          onChange={(event) => setNextBillable(event.target.checked)}
          className="h-5 w-5 accent-brand-primary"
        />
        <span>
          Chargeable<span className="sr-only"> — {label}</span>
        </span>
      </label>

      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={nextBillable ? "text-sm text-brand-ink" : "text-sm text-brand-muted"}>
          $
        </span>
        <input
          name="chargeAmount"
          inputMode="decimal"
          value={nextCharge}
          disabled={!nextBillable}
          onChange={(event) => setNextCharge(event.target.value)}
          aria-label={`Price for ${label}`}
          aria-invalid={chargeError != null}
          placeholder="not set"
          className="app-field-sm w-24 disabled:bg-brand-foam disabled:text-brand-muted"
        />
      </span>

      <SaveButton dirty={dirty} blocked={chargeError != null} />

      {chargeError ? <span className="w-full text-xs text-brand-danger">{chargeError}</span> : null}
    </form>
  );
}

/** Separate component because useFormStatus only reports for a form it is rendered inside. */
function SaveButton({ dirty, blocked }: { dirty: boolean; blocked: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || blocked || !dirty;
  return (
    <button
      type="submit"
      disabled={disabled}
      className={
        disabled
          ? "min-h-[44px] rounded-lg px-3 text-sm font-semibold text-brand-muted"
          : "app-btn-primary-sm min-h-[44px]"
      }
    >
      {pending ? "Saving…" : dirty ? "Save" : "Saved"}
    </button>
  );
}
