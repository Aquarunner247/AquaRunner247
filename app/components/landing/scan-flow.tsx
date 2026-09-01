import styles from "../../landing.module.css";
import { QrGraphic } from "./qr-graphic";

export function QrPlacard() {
  return (
    <div className={styles.placard}>
      <div className={styles.placardTop}>
        <div>
          <p className={styles.placardId}>Main Pool</p>
          <p className={styles.placardSub}>Body of water 01 · Gate placard</p>
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
  { day: 3, cl: "3.2", ph: "7.4", alk: "88", cya: "42", temp: "84" },
  { day: 4, cl: "3.0", ph: "7.5", alk: "90", cya: "40", temp: "85" },
  { day: 5, cl: "2.8", ph: "7.4", alk: "86", cya: "41", temp: "86" },
];

/** Mirrors the real public QR log an inspector actually lands on
 * (app/p/[publicSlug]/page.tsx) -- a month-to-date chemistry table with the same
 * column set (Day/Cl/pH/Alk/CYA/Temp), not a single "today's reading" card. */
export function InspectorRecord() {
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
        <span>Nevada · Commercial pool · August 2026 · 22 completed visits</span>
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
