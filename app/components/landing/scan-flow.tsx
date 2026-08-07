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
        <b>Techs:</b> scan to log this visit. <b>Inspectors:</b> scan to view the current record.
      </p>
    </div>
  );
}

const ROWS = [
  { label: "Free chlorine", value: "3.0", unit: "ppm" },
  { label: "pH", value: "7.4", unit: null },
  { label: "Cyanuric acid", value: "42", unit: "ppm" },
  { label: "Water temp", value: "84", unit: "°F" },
];

export function InspectorRecord() {
  return (
    <div className={styles.record}>
      <div className={styles.recordBar}>
        <span>Inspector view · Main Pool</span>
        <span className={styles.recordLive}>
          <i aria-hidden="true" />
          Current
        </span>
      </div>
      <div className={styles.recordHead}>
        <h4>
          Logged today · <span className={styles.metric}>6:42 AM</span>
        </h4>
        <span>Commercial property · Nevada requirement set · Complete</span>
      </div>
      <dl className={styles.recordRows}>
        {ROWS.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <span className={styles.metric}>{row.value}</span>
              {row.unit ? <small>{row.unit}</small> : null}
              <span className={styles.chipPass}>Pass</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className={styles.recordFoot}>
        <span className={styles.recordChip}>Photo on file</span>
        <span>Full visit history for this body of water, right on the phone.</span>
      </div>
    </div>
  );
}
