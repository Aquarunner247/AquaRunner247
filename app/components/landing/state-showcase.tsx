"use client";

import { useState } from "react";
import styles from "../../landing.module.css";

type StateInfo = {
  code: string;
  label: string;
  headline: string;
  facts: string[];
};

// Real figures pulled from each state's live ComplianceRuleset (chemistry thresholds +
// event/closure protocols already built and in use) -- not placeholder copy. These five are
// a sample: 49 of 51 states (all but Idaho and Mississippi, which have no state-level pool
// code to build against at all) are already built out the same way.
const STATE_INFO: StateInfo[] = [
  {
    code: "NV",
    label: "Nevada · SNHD",
    headline: "Nevada — regulated by the Southern Nevada Health District, Clark County",
    facts: [
      "5 required chemistry readings, 1 closure/incident protocol — already built in.",
      "The state we service every day, and where this app was built.",
    ],
  },
  {
    code: "AZ",
    label: "Arizona",
    headline: "Arizona — regulated by Maricopa County Environmental Health",
    facts: [
      "9 chemistry readings, 2 closure/incident protocols — already built in.",
      "12-month operating-log retention, tracked automatically.",
    ],
  },
  {
    code: "CA",
    label: "California",
    headline: "California — state rules, distributed through Sacramento County's own log form",
    facts: [
      "9 chemistry readings, 5 event protocols — already built in.",
      "24-month operating-log retention, tracked automatically.",
    ],
  },
  {
    code: "TX",
    label: "Texas",
    headline: "Texas — set statewide by the Department of State Health Services",
    facts: [
      "12 chemistry readings, 5 event protocols — already built in.",
      "36-month operating-log retention, tracked automatically.",
    ],
  },
  {
    code: "FL",
    label: "Florida",
    headline: "Florida — set statewide by the Florida Department of Health",
    facts: [
      "15 chemistry readings, 12 event/closure protocols — the most detailed ruleset we've built.",
      "24-month operating-log retention, tracked automatically.",
    ],
  },
];

export function StateShowcase() {
  const [selected, setSelected] = useState(STATE_INFO[0].code);
  const active = STATE_INFO.find((s) => s.code === selected) ?? STATE_INFO[0];

  return (
    <>
      <div className={styles.states} role="tablist" aria-label="Configured per state">
        {STATE_INFO.map((s) => (
          <button
            key={s.code}
            type="button"
            role="tab"
            aria-selected={s.code === selected}
            onClick={() => setSelected(s.code)}
            className={s.code === selected ? styles.stateOn : undefined}
          >
            {s.label}
          </button>
        ))}
        <span className={styles.stateMore}>+ 44 more states already built</span>
      </div>

      <ul className={styles.checks} role="tabpanel" aria-live="polite">
        <li>
          <strong>{active.headline}.</strong>
        </li>
        {active.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </>
  );
}
