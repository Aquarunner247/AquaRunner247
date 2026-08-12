"use client";

import { useState } from "react";

/** US numbers only, formatted progressively as digits are typed -- matches this app's
 * customer base (Nevada pool service). */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type Props = {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
  required?: boolean;
};

export function PhoneInput({ name, defaultValue, placeholder, className, required }: Props) {
  const [value, setValue] = useState(() => formatPhone(defaultValue ?? ""));

  return (
    <input
      type="tel"
      name={name}
      value={value}
      onChange={(e) => setValue(formatPhone(e.target.value))}
      placeholder={placeholder}
      className={className}
      required={required}
    />
  );
}
