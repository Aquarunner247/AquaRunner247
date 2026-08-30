import styles from "../../landing.module.css";

type CellValue = "yes" | "no" | "partial";

type ComparisonRow = {
  label: string;
  values: [CellValue, CellValue, CellValue, CellValue, CellValue];
  note?: string;
};

const COMPETITORS = ["AquaRunner 24/7", "Skimmer", "PoolBrain", "Pool Founder", "Dip"] as const;

const ROWS: ComparisonRow[] = [
  {
    label: "State-specific compliance rules built in",
    values: ["yes", "no", "no", "no", "no"],
  },
  {
    label: "QR code + scannable record per body of water",
    values: ["yes", "no", "no", "no", "no"],
  },
  {
    label: "Automated chemical dosing recommendations",
    values: ["yes", "yes", "yes", "yes", "partial"],
    note: "Dip logs LSI readings but doesn't surface a specific dose amount.",
  },
  {
    label: "AI phone agent answers missed calls, logs a ticket",
    values: ["yes", "partial", "no", "yes", "no"],
    note: "Skimmer offers this as a paid add-on; Pool Founder includes it in all plans.",
  },
  {
    label: "Tech pay rate set per specific body of water",
    values: ["yes", "no", "yes", "no", "no"],
    note: "Pool Founder tracks payroll by clocked hours, not a rate per pool.",
  },
  {
    label: "Tech sees a live running earnings total",
    values: ["yes", "no", "no", "no", "no"],
  },
  {
    label: "Fully offline — logs, photos, doses sync when back online",
    values: ["yes", "yes", "yes", "yes", "yes"],
  },
];

function Mark({ value }: { value: CellValue }) {
  if (value === "yes") {
    return (
      <span className={styles.cmpYes} aria-label="Yes">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path
            d="M4 10.5 8 14.5 16 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className={styles.cmpPartial} aria-label="Partial">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M10 3 A7 7 0 0 1 10 17 Z" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span className={styles.cmpNo} aria-label="No">
      &ndash;
    </span>
  );
}

export function ComparisonTable() {
  const hasNotes = ROWS.some((row) => row.note);

  return (
    <div className={styles.cmpWrap}>
      <div className={styles.cmpHead}>
        <p className={styles.eyebrow}>How we stack up</p>
        <h3 className={styles.cmpTitle}>Compared to the other pool service apps.</h3>
      </div>

      <div className={styles.cmpTableScroll}>
        <table className={styles.cmpTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.cmpFeatureCol}>
                <span className="sr-only">Feature</span>
              </th>
              {COMPETITORS.map((name, i) => (
                <th
                  key={name}
                  scope="col"
                  className={i === 0 ? `${styles.cmpCol} ${styles.cmpColUs}` : styles.cmpCol}
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className={styles.cmpFeatureCol}>
                  {row.label}
                  {row.note && <span className={styles.cmpNoteMark}>*</span>}
                </th>
                {row.values.map((value, i) => (
                  <td key={COMPETITORS[i]} className={i === 0 ? styles.cmpColUs : undefined}>
                    <Mark value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasNotes && (
        <ul className={styles.cmpNotes}>
          {ROWS.filter((row) => row.note).map((row) => (
            <li key={row.label}>* {row.note}</li>
          ))}
        </ul>
      )}

      <p className={styles.cmpDisclaimer}>
        Based on each provider&rsquo;s public marketing pages and app store listings as of August 2026. Feature
        sets change &mdash; confirm current capabilities directly with each provider before relying on this
        comparison.
      </p>
    </div>
  );
}
