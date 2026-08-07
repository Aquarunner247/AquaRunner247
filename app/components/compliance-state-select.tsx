"use client";

import { US_STATES } from "@/lib/us-states";

type Props = {
  selected: string | null;
  action: (formData: FormData) => void | Promise<void>;
};

/** Auto-submitting state picker for the Compliance page -- lets an admin change the
 * account's compliance state directly from this page, pre-selected with whatever state
 * is currently linked (including right after Settings redirects here). Submits via a
 * dedicated server action that only touches `state`, not the full compliance profile --
 * see updateComplianceState's doc comment in app/dashboard/settings/actions.ts. */
export function ComplianceStateSelect({ selected, action }: Props) {
  return (
    <form action={action} className="flex items-center gap-2">
      <label className="text-sm font-medium text-brand-ink" htmlFor="compliance-state-select">
        State
      </label>
      <select
        id="compliance-state-select"
        name="state"
        defaultValue={selected ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-brand-border bg-white px-2 py-1.5 text-sm text-brand-ink transition focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      >
        <option value="">Not set</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </form>
  );
}
