export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1.1" y="1.1" width="29.8" height="29.8" rx="7" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.6 22.1c2.35-2.45 4.05-2.45 6.4 0s4.05 2.45 6.4 0 4.05-2.45 6.4 0" />
        <path d="M11.6 15.6l4.9-4.9-4.9-4.9" />
      </g>
    </svg>
  );
}
