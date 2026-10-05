import { describe, it, expect } from "vitest";
import { photoDownloadFilename } from "@/lib/photo-download-name";

const base = {
  propertyName: "Borgata Condominiums",
  bodyName: "Clubhouse Pool",
  ymd: "2026-10-03",
  index: 1,
  storagePath: "org1/visit1/1759300000000-IMG_4821.jpg",
};

describe("photoDownloadFilename", () => {
  it("names the file after the property, the body and the day", () => {
    expect(photoDownloadFilename(base)).toBe("Borgata-Condominiums-Clubhouse-Pool-2026-10-03.jpg");
  });

  it("numbers only from the second photo onwards", () => {
    expect(photoDownloadFilename({ ...base, index: 1 })).not.toContain("-1.jpg");
    expect(photoDownloadFilename({ ...base, index: 2 })).toBe("Borgata-Condominiums-Clubhouse-Pool-2026-10-03-2.jpg");
  });

  it("keeps the real extension, since that is what decides whether the file opens", () => {
    expect(photoDownloadFilename({ ...base, storagePath: "a/b/c.png" })).toMatch(/\.png$/);
    expect(photoDownloadFilename({ ...base, storagePath: "a/b/c.HEIC" })).toMatch(/\.heic$/);
    expect(photoDownloadFilename({ ...base, storagePath: "a/b/c.webp" })).toMatch(/\.webp$/);
  });

  it("normalizes jpeg to jpg", () => {
    expect(photoDownloadFilename({ ...base, storagePath: "a/b/c.jpeg" })).toMatch(/\.jpg$/);
  });

  /** A name with no extension is the version that does not open on a phone. */
  it("falls back to jpg when the path has no usable extension", () => {
    expect(photoDownloadFilename({ ...base, storagePath: "org1/visit1/1759300000000" })).toMatch(/\.jpg$/);
    expect(photoDownloadFilename({ ...base, storagePath: "org1/visit1/photo." })).toMatch(/\.jpg$/);
  });

  it("strips characters a filesystem or a mail client would mangle", () => {
    const name = photoDownloadFilename({
      ...base,
      propertyName: "Smith's Pool & Spa / #2",
      bodyName: "Pool (North)",
    });
    expect(name).toBe("Smith-s-Pool-Spa-2-Pool-North-2026-10-03.jpg");
    expect(name).not.toMatch(/[^a-zA-Z0-9.-]/);
  });

  it("caps a very long property name rather than producing an unusable filename", () => {
    const name = photoDownloadFilename({ ...base, propertyName: "A".repeat(200) });
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name).toMatch(/\.jpg$/);
    expect(name).not.toContain("-.jpg");
  });

  it("still produces something usable with nothing to name it after", () => {
    expect(photoDownloadFilename({ ...base, propertyName: "", bodyName: "", ymd: "" })).toBe("service-photo.jpg");
  });
});
