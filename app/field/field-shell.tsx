"use client";

/**
 * The technician's day, rendered entirely on the device.
 *
 * Phase 1d of NATIVE-REBUILD-PLAN.md, and the piece that makes the three phases before it
 * usable. 1a-1c put the DATA on the phone -- read endpoints, bearer auth, an IndexedDB mirror --
 * and then the "works in airplane mode" test still could not pass, because
 * capacitor.config.ts loads the live site remotely and public/sw.js cached nothing, so with no
 * signal the WebView could not fetch a document to display any of it. Everything was on the
 * phone except the app.
 *
 * WHY THIS IS A SEPARATE SCREEN RATHER THAN /dashboard/schedule MADE OFFLINE. app/layout.tsx
 * renders the signed-in user's name and their organization's name into every document it
 * produces, so caching one and replaying it to whoever picks up a shared handset next would show
 * them the previous technician's identity. This route is the one the layout deliberately renders
 * without any of that (see the isFieldShell branch there), which is what makes it the one
 * document public/sw.js is allowed to keep. Identity is resolved here instead, on the client,
 * from the session already on the device -- which is also the only thing that can work with no
 * network.
 *
 * It reuses RouteDayView and the two visit forms rather than reimplementing them, which is the
 * whole reason Phase 1b was rebuilt to return assembled props: a second copy of this UI would
 * drift, and the drift would be a technician entering readings into a form that asks for the
 * wrong ones. Those components were already client components -- the plan's claim that this
 * meant converting 3,600 lines was wrong, and checking it is what made this phase affordable.
 *
 * THE STOP IS SELECTED WITH THE URL HASH, deliberately, not a query string or a route segment.
 * A hash change never reaches the network and never asks Next's router for a payload, so opening
 * a stop works identically with no signal. A `<Link>` to a real path would try to fetch and a
 * route segment would be a URL the cache has never seen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RouteDayView, type DayItem, type DayViewLinks } from "@/app/components/route-day-view";
import { VisitForm } from "@/app/dashboard/visits/[id]/visit-form";
import { ResidentialVisitForm } from "@/app/dashboard/visits/[id]/residential-visit-form";
import {
  getMirroredDay,
  getMirroredVisit,
  prefetchDay,
  putMirroredDay,
  putMirroredVisit,
} from "@/lib/client/local-store";
import { pointerMatches, readPointer, writePointer } from "@/lib/field-pointer";
import { QUEUE_CHANGED_EVENT, countPending, initOfflineSync } from "@/lib/client/offline-queue";
import type { TechnicianDay } from "@/lib/technician-day";
import type { VisitWire } from "@/lib/field-wire";

/** Hash changes never hit the network, so this is how a stop is opened. See the note above. */
const STOP_HASH = /^#stop=(.+)$/;

const FIELD_LINKS: DayViewLinks = {
  visit: (visitId) => `/field#stop=${encodeURIComponent(visitId)}`,
  // The combined multi-body photo screen is server-rendered and not mirrored, so the prompt is
  // hidden here rather than offered as a link that dead-ends with no signal. Each stop's own
  // form still takes its own photos.
  propertyCapture: null,
};

type DaySource = "network" | "mirror";

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out" }
  /** Nothing mirrored and no network: there is honestly nothing to show. */
  | { kind: "no-data" }
  /** Mirrored data belongs to a different account on this handset. See lib/field-pointer.ts. */
  | { kind: "wrong-account" }
  | { kind: "ready"; day: TechnicianDay; source: DaySource; fetchedAt: number | null };

function localStorageOrNull(): Storage | null {
  // Touching this throws outright in a WebView with site data blocked, same as in
  // lib/departure-watch-state.ts.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function FieldShell() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // The hash is the only navigation state. Read once, then on every change -- which is also what
  // makes Android's hardware back button move between the day and a stop, since
  // AndroidBackButton calls window.history.back() and each stop is its own history entry.
  useEffect(() => {
    function read() {
      const match = STOP_HASH.exec(window.location.hash);
      setStopId(match ? decodeURIComponent(match[1]) : null);
    }
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  /** Queued field work waiting for signal. The one number a technician in a dead zone wants. */
  useEffect(() => {
    initOfflineSync();
    function refresh() {
      void countPending().then(setPending);
    }
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
  }, []);

  const loadDay = useCallback(async () => {
    const { data } = await createClient().auth.getSession();
    const session = data.session;
    if (!session) {
      setPhase({ kind: "signed-out" });
      return;
    }
    setAuthUserId(session.user.id);

    // Network first. The live day is always preferable, and fetching it is also what keeps the
    // mirror current -- there is no separate "sync".
    try {
      const day = (await fetchJson("/api/technician/day")) as TechnicianDay;
      const now = new Date();
      await putMirroredDay(day.technicianId, day.date, day, now);
      writePointer(
        localStorageOrNull(),
        { authUserId: session.user.id, technicianId: day.technicianId, ymd: day.date },
        now,
      );
      setPhase({ kind: "ready", day, source: "network", fetchedAt: now.getTime() });
      return;
    } catch {
      // Fall through to the mirror. A failure here is the ordinary case this screen exists for.
    }

    const pointer = readPointer(localStorageOrNull(), new Date());
    if (!pointer) {
      setPhase({ kind: "no-data" });
      return;
    }
    /**
     * The shared-handset check, and the reason the pointer records an auth user id at all. With
     * no server to ask, comparing against the locally-held session is the only thing standing
     * between one technician and another's customer list.
     */
    if (!pointerMatches(pointer, session.user.id)) {
      setPhase({ kind: "wrong-account" });
      return;
    }

    const mirrored = await getMirroredDay<TechnicianDay>(pointer.technicianId, pointer.ymd);
    if (!mirrored) {
      setPhase({ kind: "no-data" });
      return;
    }
    setPhase({ kind: "ready", day: mirrored.payload, source: "mirror", fetchedAt: mirrored.fetchedAt });
  }, []);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  const items = useMemo<DayItem[]>(() => {
    if (phase.kind !== "ready") return [];
    // TechnicianDayStop is shaped as RouteStop deliberately -- see the note on that type. Ad-hoc
    // stops are absent because technicianDay() queries service visits only; they are an office
    // addition to the day's plan and do not exist in the mirror.
    return phase.day.stops.map((stop) => ({ kind: "visit" as const, ...stop }));
  }, [phase]);

  async function saveForOffline() {
    if (phase.kind !== "ready" || !authUserId) return;
    setSaving(true);
    setSaveNote(null);
    const now = new Date();
    const result = await prefetchDay({ technicianId: phase.day.technicianId, ymd: phase.day.date, now });
    writePointer(
      localStorageOrNull(),
      { authUserId, technicianId: phase.day.technicianId, ymd: phase.day.date },
      now,
    );
    setSaving(false);
    setSaveNote(
      result.failed === 0
        ? `Saved ${result.visits} ${result.visits === 1 ? "stop" : "stops"} for offline use.`
        : `Saved ${result.visits} of ${phase.day.stops.length} stops. Try again where the signal is better.`,
    );
  }

  if (phase.kind === "loading") {
    return (
      <Frame>
        <p className="text-sm text-brand-ink">Loading your day…</p>
      </Frame>
    );
  }

  if (phase.kind === "signed-out") {
    return (
      <Frame>
        <h1 className="app-h">Sign in to use field mode</h1>
        <p className="mt-2 text-sm text-brand-ink">
          Field mode works offline, but it still needs to know who you are. Signing in needs a connection, so do
          it before you leave.
        </p>
        <Link href="/login" className="app-btn-primary mt-4 inline-block">
          Sign in
        </Link>
      </Frame>
    );
  }

  if (phase.kind === "wrong-account") {
    return (
      <Frame>
        <h1 className="app-h">Saved for a different account</h1>
        <p className="mt-2 text-sm text-brand-ink">
          This device has a day saved for someone else, so it is not shown here. Reconnect and open field mode
          again to save your own.
        </p>
        <BackToDashboard />
      </Frame>
    );
  }

  if (phase.kind === "no-data") {
    return (
      <Frame>
        <h1 className="app-h">Nothing saved yet</h1>
        <p className="mt-2 text-sm text-brand-ink">
          There is no connection and no day saved on this device. Open field mode once while you have signal and
          tap <span className="font-semibold">Save for offline</span> — after that this screen works without one.
        </p>
        <BackToDashboard />
      </Frame>
    );
  }

  const stop = stopId ? phase.day.stops.find((s) => s.id === stopId) ?? null : null;

  return (
    <Frame>
      <header className="app-page-head">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="app-h">Field mode</h1>
          <Link href="/dashboard/schedule" className="app-link text-sm">
            Full app
          </Link>
        </div>
        {/* brand-ink, not brand-muted: .app-page-head has no background of its own, so this sits
            on the page's brand-foam -- and DESIGN-SYSTEM.md forbids muted text at this size there,
            because the whole point is that it stays readable in direct sun. It is also the line
            that says whether the day on screen is live, which is worth reading. */}
        <p className="mt-1 text-xs text-brand-ink">
          {phase.source === "network" ? (
            "Connected — showing live data."
          ) : (
            <>Offline — showing the day saved {<FetchedAt at={phase.fetchedAt} />}.</>
          )}
          {pending > 0 ? ` ${pending} ${pending === 1 ? "change" : "changes"} waiting to send.` : null}
        </p>
      </header>

      {stopId && !stop ? (
        <div className="app-card">
          <p className="text-sm text-brand-ink">That stop is not on the day this device has.</p>
          <button type="button" onClick={() => (window.location.hash = "")} className="app-btn-secondary-sm mt-3">
            Back to the day
          </button>
        </div>
      ) : stop ? (
        <StopView visitId={stop.id} online={phase.source === "network"} />
      ) : (
        <>
          {phase.source === "network" ? (
            <div className="app-card mb-4">
              <p className="text-sm font-medium text-brand-ink">Going somewhere with no signal?</p>
              <p className="mt-1 text-xs text-brand-muted">
                Saves every stop on today&rsquo;s route to this device so you can open and fill them in without a
                connection. Readings and photos you enter are sent when signal comes back, as they already are.
              </p>
              <button type="button" onClick={() => void saveForOffline()} disabled={saving} className="app-btn-primary mt-3">
                {saving ? "Saving…" : "Save for offline"}
              </button>
              {saveNote ? <p className="mt-2 text-xs text-brand-ink">{saveNote}</p> : null}
            </div>
          ) : null}

          <RouteDayView
            items={items}
            links={FIELD_LINKS}
            isToday
            dateYmd={phase.day.date}
            layout="listOnly"
            showNextStopDirections
            startPoint={phase.day.endpoints.start}
            endPoint={phase.day.endpoints.end}
            // Reordering writes 0..N-1 for the whole day and the mirror is not the authority on
            // the day's plan, so the list is read-only here. Arrival, departure, readings, doses,
            // checklist and photos all still work -- those go through the offline queue.
            readOnly
          />
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="app-page pb-24">{children}</main>;
}

function BackToDashboard() {
  return (
    <Link href="/dashboard" className="app-btn-secondary-sm mt-4 inline-block">
      Back to the app
    </Link>
  );
}

function FetchedAt({ at }: { at: number | null }) {
  if (at == null) return <>earlier</>;
  return <>at {new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>;
}

/**
 * One stop, from the network when there is one and from the mirror when there is not.
 *
 * The forms are handed `{...wire.form}` wholesale. That spread is the point of VisitFormBundle in
 * lib/field-wire.ts: the props are declared once by the components, assembled once by
 * lib/visit-form-data.ts, and this screen and the server page are checked against the same
 * derivation -- so there is no version of this that asks for different readings than the website.
 */
function StopView({ visitId, online }: { visitId: string; online: boolean }) {
  const [wire, setWire] = useState<VisitWire | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      try {
        const fresh = (await fetchJson(`/api/visits/${encodeURIComponent(visitId)}`)) as VisitWire;
        await putMirroredVisit(visitId, fresh);
        if (!cancelled) {
          setWire(fresh);
          setState("ready");
        }
        return;
      } catch {
        // Expected with no signal.
      }
      const mirrored = await getMirroredVisit<VisitWire>(visitId);
      if (cancelled) return;
      if (!mirrored) {
        setState("missing");
        return;
      }
      setWire(mirrored.payload);
      setState("ready");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [visitId]);

  if (state === "loading") return <p className="text-sm text-brand-ink">Opening stop…</p>;

  if (state === "missing" || !wire) {
    return (
      <div className="app-card">
        <p className="text-sm text-brand-ink">
          This stop was not saved to the device, and there is no connection to fetch it.
        </p>
        <button type="button" onClick={() => (window.location.hash = "")} className="app-btn-secondary-sm mt-3">
          Back to the day
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => (window.location.hash = "")} className="app-btn-ghost-sm mb-3">
        ← Back to the day
      </button>
      <div className="app-card mb-4">
        <h2 className="text-base font-semibold text-brand-ink">
          {wire.visit.property.name} — {wire.visit.bodyOfWater.name}
        </h2>
        <p className="mt-1 text-xs text-brand-muted">{wire.visit.property.address || "No address on file"}</p>
        {wire.visit.property.accessNotes ? (
          <p className="mt-2 text-sm text-brand-ink">{wire.visit.property.accessNotes}</p>
        ) : null}
        {!online ? (
          <p className="mt-2 text-xs text-brand-muted">
            Offline. What you enter is saved on the device and sent when signal returns.
          </p>
        ) : null}
      </div>
      {wire.isResidential ? <ResidentialVisitForm {...wire.form} /> : <VisitForm {...wire.form} />}
    </div>
  );
}
