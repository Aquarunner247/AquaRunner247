export type NavIconKind =
  | "dashboard"
  | "schedule"
  | "customers"
  | "users"
  | "routes"
  | "chemicals"
  | "checklist"
  | "compliance"
  | "settings"
  | "billing"
  | "alerts"
  | "more";

/** Shared stroke-icon set for every staff nav surface (desktop rail, admin/office
 * bottom nav, technician bottom nav) so they stay visually consistent instead of
 * each nav component maintaining its own icon set. */
export function NavIcon({ kind, className = "h-5 w-5" }: { kind: NavIconKind; className?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;

  switch (kind) {
    case "dashboard":
      return (
        <svg {...common} className={className}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
        </svg>
      );
    case "schedule":
      return (
        <svg {...common} className={className}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
          <path d="M3.5 9.5h17M8 3v3M16 3v3" strokeLinecap="round" />
        </svg>
      );
    case "customers":
      return (
        <svg {...common} className={className}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" strokeLinecap="round" />
          <path d="M15.5 5.3a3.2 3.2 0 0 1 0 5.9M18.5 20c0-2.7-1.7-4.7-4-5.3" strokeLinecap="round" />
        </svg>
      );
    case "users":
      return (
        <svg {...common} className={className}>
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M4.5 20c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" strokeLinecap="round" />
        </svg>
      );
    case "routes":
      return (
        <svg {...common} className={className}>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M6 8.2v3.3a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v.3" strokeLinecap="round" strokeDasharray="1 3.2" />
        </svg>
      );
    case "chemicals":
      return (
        <svg {...common} className={className}>
          <path d="M10 3.5h4M10 3.5v5.2l-4.7 8.1a2 2 0 0 0 1.7 3h9.9a2 2 0 0 0 1.7-3L14 8.7V3.5" strokeLinejoin="round" />
          <path d="M7.5 15h9" strokeLinecap="round" />
        </svg>
      );
    case "checklist":
      return (
        <svg {...common} className={className}>
          <rect x="4" y="3.5" width="16" height="17" rx="2" />
          <path d="M7.5 8.5l1.4 1.4L11.5 7M7.5 14.5l1.4 1.4L11.5 13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 8.2h3M14 14.2h3" strokeLinecap="round" />
        </svg>
      );
    case "compliance":
      return (
        <svg {...common} className={className}>
          <path d="M12 3.5l7 2.8v5.4c0 4.6-3 7.9-7 9.3-4-1.4-7-4.7-7-9.3V6.3l7-2.8Z" strokeLinejoin="round" />
          <path d="M8.7 12l2.2 2.2 4.4-4.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} className={className}>
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8L6.3 6.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "billing":
      return (
        <svg {...common} className={className}>
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="M3 9.5h18" />
          <path d="M6 14.5h4" strokeLinecap="round" />
        </svg>
      );
    case "alerts":
      return (
        <svg {...common} className={className}>
          <path
            d="M12 3a5 5 0 0 0-5 5v2.6c0 .6-.2 1.2-.6 1.7L5 14.5c-.7.9-.1 2.2 1 2.2h12c1.1 0 1.7-1.3 1-2.2l-1.4-2.2a2.7 2.7 0 0 1-.6-1.7V8a5 5 0 0 0-5-5Z"
            strokeLinejoin="round"
          />
          <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
        </svg>
      );
    case "more":
      return (
        <svg {...common} className={className}>
          <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
