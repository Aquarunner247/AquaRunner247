"use client";

import { useRef, useState } from "react";

/** Same UI-only value as CUSTOMER_ROLE_VALUE in app/dashboard/users/actions.ts. A customer
 * portal login is a CustomerUser row, not a staff seat, so it is never billable. */
const CUSTOMER_ROLE_VALUE = "CUSTOMER";

type Props = {
  /** True when the next active staff user added would be charged for. */
  nextSeatIsBillable: boolean;
  /** Staff seats the plan already covers -- used only to explain the charge. */
  includedSeats: number;
  /** Dollars per month per extra seat. */
  seatPriceUsd: number;
  /** Active staff today, so the dialog can name which seat this is. */
  activeStaffCount: number;
};

/**
 * Submit button for the "Add user" form, which interrupts with a confirmation when the user
 * being added is a staff seat the org will be charged for.
 *
 * The role is read off the live form at click time rather than mirrored into state here. The
 * role <select> lives in AddUserFormFields, and threading state between two sibling client
 * components through the server component that renders them would be a lot of machinery to
 * answer a question the DOM already knows the answer to at the only moment it matters.
 *
 * Nothing here is a security boundary. createStaffUserForOrg re-checks the acknowledgement
 * server-side and refuses a billable seat without it, so a client that skips this dialog gets
 * an error rather than a silent charge.
 */
export function AddUserSeatSubmit({ nextSeatIsBillable, includedSeats, seatPriceUsd, activeStaffCount }: Props) {
  const [confirming, setConfirming] = useState(false);
  const acknowledgedRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function formOf(): HTMLFormElement | null {
    return buttonRef.current?.form ?? null;
  }

  function handleClick() {
    const form = formOf();
    if (!form) return;

    // The browser normally does this as part of submitting; because this button intercepts the
    // submit, an invalid form would otherwise open the charge dialog before the person has even
    // been told the email field is empty.
    if (!form.reportValidity()) return;

    const role = (form.elements.namedItem("role") as HTMLSelectElement | null)?.value;
    if (!nextSeatIsBillable || role === CUSTOMER_ROLE_VALUE) {
      form.requestSubmit();
      return;
    }
    setConfirming(true);
  }

  function confirmAndSubmit() {
    if (acknowledgedRef.current) acknowledgedRef.current.value = "true";
    setConfirming(false);
    formOf()?.requestSubmit();
  }

  return (
    <>
      <input ref={acknowledgedRef} type="hidden" name="acknowledgedSeatCharge" defaultValue="" />

      <button ref={buttonRef} className="app-btn-primary-sm mt-2" type="button" onClick={handleClick}>
        Add user
      </button>

      {confirming ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="seat-charge-title"
          className="mt-3 rounded-lg border border-brand-cta bg-white p-4"
        >
          <p id="seat-charge-title" className="text-sm font-semibold text-brand-ink">
            This adds a paid seat
          </p>
          <p className="mt-1 text-sm text-brand-ink">
            Your plan includes {includedSeats} staff {includedSeats === 1 ? "login" : "logins"} and you are using all
            of them. This would be staff login number {activeStaffCount + 1}, which adds{" "}
            <strong>${seatPriceUsd}/month</strong>, prorated on your next invoice. Removing the person later removes
            the charge.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="app-btn-primary-sm" onClick={confirmAndSubmit}>
              Add and accept ${seatPriceUsd}/month
            </button>
            <button type="button" className="app-btn-secondary-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
