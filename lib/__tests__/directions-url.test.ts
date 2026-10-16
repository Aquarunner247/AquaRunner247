import { describe, it, expect } from "vitest";
import { directionsUrl } from "@/lib/directions-url";

describe("directionsUrl", () => {
  it("builds a driving link to the coordinates", () => {
    const url = directionsUrl({ latitude: 36.1699, longitude: -115.1398 });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=36.1699,-115.1398&travelmode=driving");
  });

  /** A stop that was never geocoded gets no button, rather than one that opens a map of nowhere. */
  it("is null without coordinates", () => {
    expect(directionsUrl({ latitude: null, longitude: null })).toBeNull();
    expect(directionsUrl({ latitude: 36.1699, longitude: null })).toBeNull();
    expect(directionsUrl({ latitude: null, longitude: -115.1398 })).toBeNull();
  });

  /** 0 is a real coordinate -- a null check that used falsiness would drop it. */
  it("accepts zero as a coordinate", () => {
    expect(directionsUrl({ latitude: 0, longitude: 0 })).toContain("destination=0,0");
  });
});
