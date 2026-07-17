"use client";

import { useRef, useState, useTransition } from "react";

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
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(defaultValue);

  return (
    <select
      name={name}
      value={value}
      disabled={isPending}
      onChange={(e) => {
        setValue(e.target.value);
        startTransition(() => {
          formRef.current?.requestSubmit();
        });
      }}
      ref={(el) => {
        // Grab the enclosing form once, without needing a separate ref prop threaded
        // through from the parent — this select is always rendered inside its own form.
        if (el) formRef.current = el.form;
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
