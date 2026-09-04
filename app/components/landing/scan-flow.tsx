import styles from "../../landing.module.css";
import { QrGraphic } from "./qr-graphic";

export function QrPlacard() {
  return (
    <div className={styles.placard}>
      <div className={styles.placardTop}>
        <div>
          <p className={styles.placardId}>Sunrise Apartments</p>
          <p className={styles.placardSub}>Main Pool</p>
        </div>
        <span className={styles.placardBadge}>Scan me</span>
      </div>
      <div className={styles.placardQr}>
        <QrGraphic />
      </div>
      <p className={styles.placardFoot}>
        Scan to view the current, complete record for this pool — no login needed.
      </p>
    </div>
  );
}

const LOG_ROWS = [
  { day: 3, cl: "3.2", ph: "7.4", alk: "88", cya: "42", temp: "84", pump: "18", vac: "6", filter: "12", flow: "62" },
  { day: 4, cl: "3.0", ph: "7.5", alk: "90", cya: "40", temp: "85", pump: "19", vac: "6", filter: "13", flow: "60" },
  { day: 5, cl: "2.8", ph: "7.4", alk: "86", cya: "41", temp: "86", pump: "18", vac: "7", filter: "12", flow: "61" },
];

type InspectorRecordProps = {
  stateName?: string;
};

/** Mirrors the real public QR log an inspector actually lands on
 * (app/p/[publicSlug]/page.tsx) -- a month-to-date log with the same full column set
 * that page's table has (chemistry AND equipment gauges), not a single "today's
 * reading" card or a chemistry-only excerpt. */
export function InspectorRecord({ stateName = "Nevada" }: InspectorRecordProps) {
  return (
    <div className={styles.record}>
      <div className={styles.recordBar}>
        <span>Public maintenance log · inspector view</span>
        <span className={styles.recordLive}>
          <i aria-hidden="true" />
          Current
        </span>
      </div>
      <div className={styles.recordHead}>
        <h4>Sunrise Apartments — Main Pool</h4>
        <span>{stateName} · Commercial pool · August 2026 · 22 completed visits</span>
      </div>
      <div className={styles.recordTableWrap}>
        <table className={styles.recordTable}>
          <thead>
            <tr>
              <th>Day</th>
              <th>Cl (ppm)</th>
              <th>pH</th>
              <th>Alk (ppm)</th>
              <th>CYA (ppm)</th>
              <th>Temp (°F)</th>
              <th>Pump (psi)</th>
              <th>Vac (inHg)</th>
              <th>Filter (psi)</th>
              <th>Flow (gpm)</th>
            </tr>
          </thead>
          <tbody>
            {LOG_ROWS.map((row) => (
              <tr key={row.day}>
                <td>{row.day}</td>
                <td>{row.cl}</td>
                <td>{row.ph}</td>
                <td>{row.alk}</td>
                <td>{row.cya}</td>
                <td>{row.temp}</td>
                <td>{row.pump}</td>
                <td>{row.vac}</td>
                <td>{row.filter}</td>
                <td>{row.flow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.recordFoot}>
        <span className={styles.recordChip}>CSV export</span>
        <span>Every day this month, on one scan — not just today&rsquo;s reading.</span>
      </div>
    </div>
  );
}
