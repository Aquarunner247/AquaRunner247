import { describe, it, expect } from "vitest";
import { serviceGroupName } from "@/lib/service-group-name";

/** Every name here is a real body of water on this org's properties. */
describe("serviceGroupName", () => {
  it("names Borgata's two walk-ups after their buildings", () => {
    expect(serviceGroupName(["Clubhouse Pool", "Clubhouse (SW) Spa"], 0, 2)).toBe("Clubhouse");
    expect(serviceGroupName(["Gym (NE) Pool", "Gym Spa"], 1, 2)).toBe("Gym");
  });

  it("names The Alcove's two decks", () => {
    expect(serviceGroupName(["Back Pool (East)", "Back Spa"], 0, 2)).toBe("Back");
    expect(serviceGroupName(["Front Pool (West)", "Front Spa"], 1, 2)).toBe("Front");
  });

  it("names Cornerstone's office pair", () => {
    expect(serviceGroupName(["Office Pool", "Office Spa"], 0, 1)).toBe("Office");
  });

  /** The common case: a property whose bodies are just "Pool" and "Spa". */
  it("falls back to Main when the names share nothing", () => {
    expect(serviceGroupName(["Pool", "Spa"], 0, 1)).toBe("Main");
    expect(serviceGroupName(["Main Pool", "Spa"], 0, 1)).toBe("Main");
  });

  it("falls back to Main for Playa Vista's pool and wading pool", () => {
    expect(serviceGroupName(["Pool", "Wading Pool"], 0, 1)).toBe("Main");
  });

  /**
   * A shared prefix that is the whole of one member's name names nothing: San Tropez has "Pool 2"
   * alongside "Main Pool", and OYO has "Pool 1 (North)" and "Pool 2 (South)".
   */
  it("refuses a prefix that is an entire member name", () => {
    expect(serviceGroupName(["Pool", "Pool 2"], 0, 1)).toBe("Main");
  });

  it("names OYO's two pools by their shared word, since neither name is the whole prefix", () => {
    expect(serviceGroupName(["Pool 1 (North)", "Pool 2 (South)"], 0, 1)).toBe("Pool");
  });

  it("numbers the fallback when one property has several unnameable groups", () => {
    expect(serviceGroupName(["Pool", "Spa"], 0, 3)).toBe("Walk-up 1");
    expect(serviceGroupName(["Pool", "Spa"], 2, 3)).toBe("Walk-up 3");
  });

  it("matches case-insensitively", () => {
    expect(serviceGroupName(["CLUBHOUSE Pool", "Clubhouse Spa"], 0, 1)).toBe("CLUBHOUSE");
  });

  it("handles a single member", () => {
    expect(serviceGroupName(["Office Pool"], 0, 1)).toBe("Main");
  });

  it("handles no members at all", () => {
    expect(serviceGroupName([], 0, 1)).toBe("Main");
  });
});
