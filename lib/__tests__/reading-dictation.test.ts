import { describe, expect, it } from "vitest";
import { parseDictatedReading, parseDictatedDoses, wordsToNumber, hasAnyReading } from "@/lib/reading-dictation";

/**
 * Every value here ends up in a health-department compliance log, so the cases that matter most
 * are the ones where the parser should refuse rather than guess: a misheard number, a field with
 * nothing after it, a number with no field. A blank the technician notices is recoverable. A
 * wrong number they do not notice is not.
 */

describe("wordsToNumber", () => {
  it("reads the numerals a recognizer usually produces", () => {
    expect(wordsToNumber(["7.4"])).toBe(7.4);
    expect(wordsToNumber(["80"])).toBe(80);
  });

  it("reads spoken decimals one digit at a time", () => {
    // "point four five" is .45, not .9 -- digits after a point are spoken individually.
    expect(wordsToNumber(["seven", "point", "four"])).toBe(7.4);
    expect(wordsToNumber(["three", "point", "two", "five"])).toBe(3.25);
    expect(wordsToNumber(["7", "point", "6"])).toBe(7.6);
  });

  it("tells the two compound shapes apart", () => {
    // The whole reason compounds can be parsed without guessing.
    expect(wordsToNumber(["eighty", "two"])).toBe(82); // tens then unit
    expect(wordsToNumber(["two", "fifty"])).toBe(250); // unit then tens: the dropped hundred
    expect(wordsToNumber(["thirty", "two", "hundred"])).toBe(3200);
    expect(wordsToNumber(["one", "hundred"])).toBe(100);
    expect(wordsToNumber(["four", "thousand"])).toBe(4000);
  });

  it("reads zero spoken as oh", () => {
    expect(wordsToNumber(["one", "oh", "five"])).toBe(105);
  });

  it("returns null rather than inventing a number", () => {
    expect(wordsToNumber([])).toBeNull();
    expect(wordsToNumber(["blue"])).toBeNull();
    expect(wordsToNumber(["point"])).toBeNull();
    expect(wordsToNumber(["seven", "point"])).toBeNull();
  });
});

describe("parseDictatedReading", () => {
  it("reads a full set the way a technician would say it", () => {
    const d = parseDictatedReading("free chlorine three point two, pH seven point four, alkalinity eighty, CYA fifty, temp eighty two");
    expect(d.values).toEqual({
      freeChlorinePpm: 3.2,
      ph: 7.4,
      alkalinityPpm: 80,
      cyanuricAcidPpm: 50,
      temperatureF: 82,
    });
    expect(d.suspect).toEqual([]);
    expect(d.unmatched).toEqual([]);
  });

  it("does not read every chlorine as free chlorine", () => {
    // "total chlorine" and "free chlorine" share a word. A shortest-first scan would collapse
    // them, and the two are different readings on a commercial log sheet.
    const d = parseDictatedReading("free chlorine 3.2 total chlorine 3.5");
    expect(d.values).toEqual({ freeChlorinePpm: 3.2, totalChlorinePpm: 3.5 });
  });

  it("accepts the shorthand they actually use", () => {
    const d = parseDictatedReading("FC 2.0 TA 90 CH 250 salt 3200");
    expect(d.values).toEqual({
      freeChlorinePpm: 2,
      alkalinityPpm: 90,
      calciumHardnessPpm: 250,
      saltPpm: 3200,
    });
  });

  it("survives filler and punctuation", () => {
    const d = parseDictatedReading("uh, pH is 7.6 and the free chlorine was 1.5 ppm.");
    expect(d.values).toEqual({ ph: 7.6, freeChlorinePpm: 1.5 });
  });

  it("flags an impossible value instead of correcting it", () => {
    // "pH seventy four" is almost certainly "seven point four" -- and turning it into 7.4 would
    // write a reading nobody gave into a compliance record. Flag, show, let a human decide.
    const d = parseDictatedReading("pH seventy four");
    expect(d.values.ph).toBeUndefined();
    expect(d.suspect).toHaveLength(1);
    expect(d.suspect[0].field).toBe("ph");
    expect(d.suspect[0].value).toBe(74);
  });

  it("leaves an out-of-range but possible reading alone", () => {
    // 8.4 is a bad pool, not a bad transcript. Compliance ranges are lib/compliance.ts's job;
    // confusing the two would have this parser quietly swallowing real problems.
    const d = parseDictatedReading("pH 8.4 free chlorine 0.2");
    expect(d.values).toEqual({ ph: 8.4, freeChlorinePpm: 0.2 });
    expect(d.suspect).toEqual([]);
  });

  it("takes the last value when somebody corrects themselves", () => {
    const d = parseDictatedReading("pH seven point four no pH seven point six");
    expect(d.values.ph).toBe(7.6);
  });

  it("reports a field heard with no number", () => {
    const d = parseDictatedReading("alkalinity");
    expect(d.values).toEqual({});
    expect(d.unmatched).toContain("alkalinity");
  });

  it("reports a number heard with no field", () => {
    // Attaching it to whatever came last would be a guess with a reading's consequences.
    const d = parseDictatedReading("3.2");
    expect(d.values).toEqual({});
    expect(d.unmatched).toContain("3.2");
  });

  it("keeps the readings it understood when one goes wrong", () => {
    // Partial dictation is the normal case -- a technician gives four of fifteen -- and one bad
    // phrase must not cost them the other three.
    const d = parseDictatedReading("free chlorine 3.2 pH banana alkalinity 80");
    expect(d.values).toEqual({ freeChlorinePpm: 3.2, alkalinityPpm: 80 });
    expect(d.unmatched).toContain("ph");
  });

  it("returns nothing from nothing", () => {
    const d = parseDictatedReading("");
    expect(d.values).toEqual({});
    expect(hasAnyReading(d)).toBe(false);
  });

  it("reads the equipment gauges", () => {
    const d = parseDictatedReading("filter pressure 18 pump pressure 22 flow meter 60 vacuum gauge 5");
    expect(d.values).toEqual({
      filterPressurePsi: 18,
      pumpPressurePsi: 22,
      flowMeterGpm: 60,
      vacGaugeReading: 5,
    });
  });

  it("knows it has something worth confirming", () => {
    expect(hasAnyReading(parseDictatedReading("pH 7.4"))).toBe(true);
    // A suspect value still needs the screen -- that is the whole point of showing it.
    expect(hasAnyReading(parseDictatedReading("pH seventy four"))).toBe(true);
    expect(hasAnyReading(parseDictatedReading("hello"))).toBe(false);
  });
});

describe("parseDictatedDoses", () => {
  /**
   * A realistic catalogue: free text, inconsistent casing, a percentage in one name, and two
   * entries that both contain "chlorine" -- which is the ambiguity that matters.
   */
  const CATALOG = [
    { id: "p1", name: "Muriatic Acid", unit: "gal" },
    { id: "p2", name: "Cal Hypo 73%", unit: "lb" },
    { id: "p3", name: "3in Trichlor Tabs", unit: "tablet" },
    { id: "p4", name: "Liquid Chlorine", unit: "gal" },
    { id: "p5", name: "Sodium Bicarb", unit: "lb" },
  ];

  it("reads the way a technician reports what they put in", () => {
    const d = parseDictatedDoses("added two pounds of cal hypo and a gallon of muriatic acid", CATALOG);
    expect(d.doses).toEqual([
      { productId: "p2", productName: "Cal Hypo 73%", quantity: 2, unit: "lb" },
      { productId: "p1", productName: "Muriatic Acid", quantity: 1, unit: "gal" },
    ]);
    expect(d.ambiguous).toEqual([]);
  });

  it("matches the shorthand nobody says in full", () => {
    // "acid" is one word of "Muriatic Acid"; "tabs" is one word of "3in Trichlor Tabs". Scoring
    // the PRODUCT's words is what makes partial names work.
    const d = parseDictatedDoses("one gallon acid three tabs", CATALOG);
    expect(d.doses.map((x) => [x.productName, x.quantity])).toEqual([
      ["Muriatic Acid", 1],
      ["3in Trichlor Tabs", 3],
    ]);
  });

  it("stores the catalogue's unit, not the spoken one, and says when they disagree", () => {
    // Cal Hypo is sold by the pound. "Two gallons" is a mis-hear or the wrong product, and
    // inventing a unit the organization does not use would make the dose uncostable.
    const d = parseDictatedDoses("two gallons of cal hypo", CATALOG);
    expect(d.doses[0].unit).toBe("lb");
    expect(d.doses[0].spokenUnitConflict).toBe("gal");
  });

  it("refuses to choose between two products named equally well", () => {
    // "chlorine" alone fits Liquid Chlorine and nothing else here by word count -- but add a
    // catalogue where it ties, and the parser must ask rather than bill someone for a guess.
    const tie = [
      { id: "a", name: "Chlorine Granular", unit: "lb" },
      { id: "b", name: "Chlorine Liquid", unit: "gal" },
    ];
    const d = parseDictatedDoses("two of chlorine", tie);
    expect(d.doses).toEqual([]);
    expect(d.ambiguous).toHaveLength(1);
    // Ids come back too, or the screen cannot turn the technician's choice into a costed dose.
    expect(d.ambiguous[0].candidates).toEqual([
      { id: "a", name: "Chlorine Granular", unit: "lb" },
      { id: "b", name: "Chlorine Liquid", unit: "gal" },
    ]);
    expect(d.ambiguous[0].quantity).toBe(2);
  });

  it("handles halves, which is how acid is actually dosed", () => {
    const d = parseDictatedDoses("half a gallon of acid", CATALOG);
    expect(d.doses[0]).toMatchObject({ productName: "Muriatic Acid", quantity: 0.5, unit: "gal" });
  });

  it("reports a product that is not in this organization's catalogue", () => {
    // Said clearly, matches nothing they stock. Silently dropping it would lose a chemical that
    // went into the water.
    const d = parseDictatedDoses("four pounds of borate", CATALOG);
    expect(d.doses).toEqual([]);
    expect(d.unmatched).toContain("borate");
  });

  it("keeps the doses it understood when one goes wrong", () => {
    const d = parseDictatedDoses("two pounds cal hypo five pounds unobtainium", CATALOG);
    expect(d.doses).toHaveLength(1);
    expect(d.doses[0].productName).toBe("Cal Hypo 73%");
    expect(d.unmatched).toContain("unobtainium");
  });

  it("returns nothing from an empty catalogue rather than failing", () => {
    const d = parseDictatedDoses("two pounds of cal hypo", []);
    expect(d.doses).toEqual([]);
    expect(d.unmatched.length).toBeGreaterThan(0);
  });
});
