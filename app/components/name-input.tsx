"use client";

import { useState } from "react";

/** Capitalizes the first letter of each word as typed, without touching any other
 * character the user enters -- so intentional mixed casing (McDonald, O'Brien) survives. */
function capitalizeWords(value: string): string {
  return value.replace(/(^|\s)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

type Props = {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
  required?: boolean;
};

export function NameInput({ name, defaultValue, placeholder, className, required }: Props) {
  const [value, setValue] = useState(() => capitalizeWords(defaultValue ?? ""));

  return (
    <input
      name={name}
      value={value}
      onChange={(e) => setValue(capitalizeWords(e.target.value))}
      placeholder={placeholder}
      className={className}
      required={required}
    />
  );
}
