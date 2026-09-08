"use client";

import { useState } from "react";

type Props = {
  name: string;
  autoComplete?: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Passed straight through to the underlying <input> -- same classes every password
   * field in this app already used before this component existed. `pr-10` is appended
   * automatically so the reveal button never overlaps typed text. */
  className?: string;
};

/** A password <input> with a reveal/hide toggle -- same stroke-icon convention as
 * NavIcon (viewBox 0 0 24 24, stroke currentColor, strokeWidth 1.8) rather than pulling
 * in an icon library this app doesn't otherwise depend on. */
export function PasswordInput({ name, autoComplete, required, value, onChange, className }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={onChange}
        className={`${className ?? ""} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-brand-muted hover:text-brand-ink"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path
              d="M4 4l16 16M9.9 9.9a3 3 0 0 0 4.2 4.2M6.6 6.7C4.3 8.2 2.7 10.2 2 12c1 3 5 7 10 7 1.7 0 3.3-.4 4.7-1.1M10.6 5.1A11 11 0 0 1 12 5c5 0 9 4 10 7-.4 1.2-1.4 2.7-2.7 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
