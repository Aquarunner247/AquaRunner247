"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import styles from "../../landing.module.css";

const TABS = [
  { id: "log", label: "Service log" },
  { id: "route", label: "Today's route" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const READINGS = [
  { label: "Free chlorine", value: "3.0", unit: "ppm", state: "pass" },
  { label: "pH", value: "7.4", unit: null, state: "pass" },
  { label: "Alkalinity", value: "72", unit: "ppm", state: "watch" },
  { label: "Water temp", value: "84", unit: "°F", state: "pass" },
] as const;

/** Mirrors the real technician schedule (app/components/route-day-view.tsx) -- a numbered
 * stop list with property/body name, address, and an "Arrived {time}" line once logged,
 * not a set of Done/Next/Queued/Suggested status tags that don't exist on that screen. */
const STOPS = [
  { n: 1, name: "Sunrise Apartments — Main Pool", address: "412 Desert Bloom Ave, Las Vegas, NV", arrivedAt: "6:42 AM" },
  { n: 2, name: "Cactus Flower HOA — Pool & Spa", address: "88 Cactus Flower Dr, Las Vegas, NV", arrivedAt: "7:15 AM" },
  { n: 3, name: "Harmon Fitness Center — Lap Pool", address: "220 Harmon Ave, Las Vegas, NV", arrivedAt: null },
  { n: 4, name: "Whitmore Residence — Backyard Pool", address: "77 Whitmore Ct, Henderson, NV", arrivedAt: null },
] as const;

export function AppPreview() {
  const [active, setActive] = useState<TabId>("log");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === active);
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className={styles.app}>
      <div className={styles.appBar}>
        <span className={styles.appDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.appTitle}>AquaRunner 24/7</span>
        <span className={styles.appSaved}>Saved</span>
      </div>

      <div className={styles.appTabs} role="tablist" aria-label="App preview">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.appBody}>
        <div
          className={styles.appPanel}
          id="panel-log"
          role="tabpanel"
          aria-labelledby="tab-log"
          tabIndex={0}
          hidden={active !== "log"}
        >
          <div className={styles.logHead}>
            <div>
              <h4>Main Pool — commercial property</h4>
              <span>
                Visit logged <span className={styles.metric}>6:42 AM</span> · Nevada requirement set
              </span>
            </div>
            <span className={styles.qrChip}>From today&rsquo;s route</span>
          </div>

          <dl className={styles.reads}>
            {READINGS.map((reading) => (
              <div key={reading.label}>
                <dt>{reading.label}</dt>
                <dd>
                  <span className={styles.metric}>{reading.value}</span>
                  {reading.unit ? <small>{reading.unit}</small> : null}
                  <span className={reading.state === "pass" ? styles.chipPass : styles.chipWatch}>
                    {reading.state === "pass" ? "Pass" : "Watch"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <div className={styles.required}>
            <strong>Required at this pool — your state&rsquo;s rules</strong>
            <ul>
              <li>
                <b>Done</b> Disinfectant &amp; pH readings
              </li>
              <li>
                <b>Done</b> Flow, skimmer &amp; drain cover check
              </li>
              <li>
                <b>Done</b> Safety equipment on site
              </li>
            </ul>
          </div>

          <div className={styles.proof}>
            <span className={styles.proofThumb}>
              <Image
                src="/marketing/water-texture.jpg"
                alt="Photo attached to this visit: clear pool water surface."
                width={1400}
                height={2100}
                sizes="88px"
              />
            </span>
            <p>Photo taken in the app at this stop. Goes out with the customer&rsquo;s emailed report.</p>
          </div>
        </div>

        <div
          className={styles.appPanel}
          id="panel-route"
          role="tabpanel"
          aria-labelledby="tab-route"
          tabIndex={0}
          hidden={active !== "route"}
        >
          <div className={styles.logHead}>
            <div>
              <h4>Tuesday route — 4 stops</h4>
              <span>2 completed · 2 remaining</span>
            </div>
            <span className={styles.qrChip}>Tap a stop to start</span>
          </div>

          <ul className={styles.route}>
            {STOPS.map((stop) => (
              <li key={stop.n}>
                <span className={styles.stopNum}>{stop.n}</span>
                <span className={styles.stopInfo}>
                  <b>{stop.name}</b>
                  <span>{stop.address}</span>
                  {stop.arrivedAt ? <span className={styles.stopArrived}>Arrived {stop.arrivedAt}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
