import { describe, expect, it } from "vitest";
import {
  FIELD_POINTER_KEY,
  clearPointer,
  pointerMatches,
  readPointer,
  writePointer,
  type PointerStorage,
} from "@/lib/field-pointer";

const NOW = new Date("2026-11-25T14:00:00Z");

function storage(initial: Record<string, string> = {}): PointerStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const VALID = { authUserId: "auth-1", technicianId: "tech-1", ymd: "2026-11-25", savedAt: NOW.getTime() };

describe("writePointer / readPointer", () => {
  it("round-trips the note a prefetch leaves", () => {
    const s = storage();
    writePointer(s, { authUserId: "auth-1", technicianId: "tech-1", ymd: "2026-11-25" }, NOW);
    expect(readPointer(s, NOW)).toEqual(VALID);
  });

  it("stamps savedAt from the clock rather than trusting a caller", () => {
    const s = storage();
    writePointer(s, { authUserId: "a", technicianId: "t", ymd: "2026-11-25" }, NOW);
    expect(JSON.parse(s.data[FIELD_POINTER_KEY]).savedAt).toBe(NOW.getTime());
  });

  it("reads nothing when nothing was stored", () => {
    expect(readPointer(storage(), NOW)).toBeNull();
  });

  it("reads nothing with no storage at all", () => {
    expect(readPointer(null, NOW)).toBeNull();
  });
});

describe("readPointer refuses anything doubtful", () => {
  it("corrupt JSON", () => {
    expect(readPointer(storage({ [FIELD_POINTER_KEY]: "{not json" }), NOW)).toBeNull();
  });

  it("the wrong shape", () => {
    expect(readPointer(storage({ [FIELD_POINTER_KEY]: JSON.stringify({ authUserId: "a" }) }), NOW)).toBeNull();
  });

  it("an empty id, which would key the mirror on nothing", () => {
    const bad = { ...VALID, technicianId: "" };
    expect(readPointer(storage({ [FIELD_POINTER_KEY]: JSON.stringify(bad) }), NOW)).toBeNull();
  });

  it("a malformed date", () => {
    const bad = { ...VALID, ymd: "25/11/2026" };
    expect(readPointer(storage({ [FIELD_POINTER_KEY]: JSON.stringify(bad) }), NOW)).toBeNull();
  });

  /** The mirror keeps MIRROR_RETAIN_DAYS. A note naming an older day points at data already gone. */
  it("a day the mirror has already pruned", () => {
    const old = { ...VALID, ymd: "2026-11-20" };
    expect(readPointer(storage({ [FIELD_POINTER_KEY]: JSON.stringify(old) }), NOW)).toBeNull();
  });

  it("but keeps yesterday, which is still within retention", () => {
    const yesterday = { ...VALID, ymd: "2026-11-24" };
    expect(readPointer(storage({ [FIELD_POINTER_KEY]: JSON.stringify(yesterday) }), NOW)?.ymd).toBe("2026-11-24");
  });

  it("storage that throws", () => {
    const throwing: PointerStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(readPointer(throwing, NOW)).toBeNull();
    // And writing through it must not throw into a caller that was only saving a day.
    expect(() =>
      writePointer(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("full");
          },
          removeItem: () => {},
        },
        { authUserId: "a", technicianId: "t", ymd: "2026-11-25" },
        NOW,
      ),
    ).not.toThrow();
  });
});

/**
 * The shared-phone check. A handset is passed between technicians, and the mirror on it holds one
 * person's customers, addresses and phone numbers. Offline there is no server to ask, so this
 * comparison against the locally-held session is the only thing standing between the two.
 */
describe("pointerMatches", () => {
  it("matches the account the data was saved for", () => {
    expect(pointerMatches(VALID, "auth-1")).toBe(true);
  });

  it("REFUSES a different account on the same device", () => {
    expect(pointerMatches(VALID, "auth-2")).toBe(false);
  });

  it("refuses when nobody is signed in", () => {
    expect(pointerMatches(VALID, null)).toBe(false);
    expect(pointerMatches(VALID, undefined)).toBe(false);
    expect(pointerMatches(VALID, "")).toBe(false);
  });

  it("refuses when there is no note", () => {
    expect(pointerMatches(null, "auth-1")).toBe(false);
  });
});

describe("clearPointer", () => {
  it("removes the note on sign-out", () => {
    const s = storage({ [FIELD_POINTER_KEY]: JSON.stringify(VALID) });
    clearPointer(s);
    expect(readPointer(s, NOW)).toBeNull();
  });

  it("survives storage that throws", () => {
    expect(() =>
      clearPointer({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});
