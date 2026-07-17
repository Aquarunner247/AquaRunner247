"use client";

import { useState } from "react";

type Option = { value: string; label: string };

export function InlineAssignSelect({
  name,
  defaultValue,
  options,
  emptyLabel,
}: {
  name: string;
  defaultValue: string;
  options: Option[];
  emptyLabel: string;
}) {
  const [isPending, setIsPending] = useState(false);

  return (
    <select
      // Keying on the server-confirmed value forces a fresh, uncontrolled instance
      // whenever it changes (after the server action + revalidation round-trip) --
      // this avoids drifting out of sync with a leftover controlled React state value.
      key={defaultValue}
      name={name}
      defaultValue={defaultValue}
      disabled={isPending}
      onChange={(e) => {
        setIsPending(true);
        // Read the form straight from the element that just changed, and submit
        // immediately -- no controlled value / transition indirection to race against.
        e.currentTarget.form?.requestSubmit();
      }}
      className="inline-flex rounded-full border-none bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:opacity-60"
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
