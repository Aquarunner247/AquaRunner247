/**
 * Turning a spoken set of water readings into the fields of a VisitWaterReading.
 *
 * The technicians asked for this: they are holding a test kit with wet gloves, in direct sun,
 * and typing six numbers or dragging sliders is the slowest part of a stop. Saying them is
 * faster. "Regia" is the name on the button.
 *
 * WHY THIS IS A GRAMMAR AND NOT A MODEL, which is the whole design decision:
 *
 * The vocabulary is fifteen field names and some numbers. That is small, fixed, and testable,
 * and a parser built from it has three properties a language model cannot offer here:
 *
 *   - It cannot invent a value. Whatever comes out was in the transcript. A reading lands in a
 *     health-department compliance log, so a plausible-looking hallucinated number is the worst
 *     possible failure and the hardest to notice.
 *   - It runs offline. Pump rooms are where technicians stand and where signal is not --
 *     the same places the arrival geofence has to be widened for (Property.geofenceMeters).
 *   - It is free and instant, so it can run on every keystroke of a live transcript.
 *
 * Speech-to-text itself is the operating system's job, on device. Apple's SFSpeechRecognizer
 * defaults to SERVER-side recognition, so whatever wires this up must set
 * requiresOnDeviceRecognition -- otherwise audio leaves the phone, and that is a new category of
 * collected data, a new subprocessor, and a Privacy Policy change, to buy accuracy on fifteen
 * numbers. Same reasoning that kept departure detection to a timestamp.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: correct anybody. "pH seventy four" parses as 74 and is
 * flagged as impossible, not quietly turned into 7.4. Coercing it would be inventing a reading
 * that nobody said, which is the thing a compliance record must never contain. The confirmation
 * screen is where a human fixes it, and it is not optional.
 */

/** The numeric fields of VisitWaterReading that can be dictated. */
export type ReadingField =
  | "ph"
  | "freeChlorinePpm"
  | "totalChlorinePpm"
  | "brominePpm"
  | "alkalinityPpm"
  | "cyanuricAcidPpm"
  | "calciumHardnessPpm"
  | "saltPpm"
  | "temperatureF"
  | "filterPressurePsi"
  | "pumpPressurePsi"
  | "filterGaugeReading"
  | "vacGaugeReading"
  | "flowMeterGpm";

/**
 * How each field is named on screen, and what it is measured in.
 *
 * Here rather than imported from lib/compliance.ts, which has its own copies for its own
 * purposes: that module is server-weight and this has to render in a technician's browser. The
 * strings must match what the visit form shows, or a confirmation screen would name a reading
 * one thing and the field it fills another.
 */
export const READING_FIELD_LABELS: Readonly<Record<ReadingField, { label: string; unit: string }>> = {
  ph: { label: "pH", unit: "" },
  freeChlorinePpm: { label: "Free Chlorine", unit: "ppm" },
  totalChlorinePpm: { label: "Total Chlorine", unit: "ppm" },
  brominePpm: { label: "Bromine", unit: "ppm" },
  alkalinityPpm: { label: "Total Alkalinity", unit: "ppm" },
  cyanuricAcidPpm: { label: "Cyanuric Acid", unit: "ppm" },
  calciumHardnessPpm: { label: "Calcium Hardness", unit: "ppm" },
  saltPpm: { label: "Salt", unit: "ppm" },
  temperatureF: { label: "Water Temperature", unit: "\u00B0F" },
  filterPressurePsi: { label: "Filter Pressure", unit: "psi" },
  pumpPressurePsi: { label: "Pump Pressure", unit: "psi" },
  filterGaugeReading: { label: "Filter Gauge", unit: "" },
  vacGaugeReading: { label: "Vacuum Gauge", unit: "" },
  flowMeterGpm: { label: "Flow Meter", unit: "gpm" },
};

/**
 * What a technician might call each field out loud.
 *
 * Longest phrase first within each field, and the whole table is scanned longest-first overall,
 * because "total chlorine" and "free chlorine" both end in "chlorine" and a shortest-first scan
 * would read every one of them as free chlorine. The bare words "chlorine" and "total" are
 * included because people do say them alone -- "chlorine three two" -- and the ordering is what
 * makes that safe.
 */
const FIELD_PHRASES: ReadonlyArray<readonly [ReadingField, readonly string[]]> = [
  ["totalChlorinePpm", ["total chlorine", "combined chlorine", "t c", "tc", "total"]],
  ["freeChlorinePpm", ["free available chlorine", "free chlorine", "f a c", "fac", "f c", "fc", "free", "chlorine"]],
  ["brominePpm", ["bromine", "br"]],
  ["ph", ["ph level", "ph", "p h"]],
  ["alkalinityPpm", ["total alkalinity", "alkalinity", "t a", "ta", "alk"]],
  ["cyanuricAcidPpm", ["cyanuric acid", "cyanuric", "c y a", "cya", "stabilizer", "conditioner"]],
  ["calciumHardnessPpm", ["calcium hardness", "calcium", "hardness", "c h", "ch"]],
  ["saltPpm", ["salinity", "salt"]],
  ["temperatureF", ["water temperature", "water temp", "temperature", "temp"]],
  ["filterPressurePsi", ["filter pressure", "filter psi"]],
  ["pumpPressurePsi", ["pump pressure", "pump psi"]],
  ["filterGaugeReading", ["filter gauge"]],
  ["vacGaugeReading", ["vacuum gauge", "vac gauge", "vacuum"]],
  ["flowMeterGpm", ["flow meter", "flow rate", "flow", "g p m", "gpm"]],
];

/**
 * What each field can physically be -- NOT what is compliant.
 *
 * These exist to catch a misheard number, not a bad pool. "pH 74" is impossible and almost
 * certainly "seven point four"; pH 8.4 is perfectly possible and merely out of range, which is
 * the compliance engine's business (lib/compliance.ts) and not this file's. Bounds are
 * deliberately generous -- shock chlorination really does reach 30ppm, and a commercial salt
 * pool really does run 4000ppm -- because a parser that rejects real readings is worse than one
 * that passes a few odd ones to a human.
 */
const PLAUSIBLE: Readonly<Record<ReadingField, readonly [number, number]>> = {
  ph: [0, 14],
  freeChlorinePpm: [0, 50],
  totalChlorinePpm: [0, 50],
  brominePpm: [0, 50],
  alkalinityPpm: [0, 500],
  cyanuricAcidPpm: [0, 300],
  calciumHardnessPpm: [0, 1500],
  saltPpm: [0, 10000],
  temperatureF: [32, 120],
  filterPressurePsi: [0, 100],
  pumpPressurePsi: [0, 100],
  filterGaugeReading: [0, 100],
  vacGaugeReading: [0, 100],
  flowMeterGpm: [0, 2000],
};

export type SuspectReading = {
  field: ReadingField;
  value: number;
  /** Plain enough to put on the confirmation screen as-is. */
  reason: string;
};

export type DictatedReading = {
  /** Only values that parsed AND are physically possible. */
  values: Partial<Record<ReadingField, number>>;
  /**
   * Parsed, but impossible for that field. Kept rather than dropped so the screen can show
   * "pH 74 — check this" instead of silently losing a reading the technician believes they gave.
   */
  suspect: SuspectReading[];
  /** Field names heard with no number, and numbers heard with no field. */
  unmatched: string[];
};

const SMALL_WORDS: Readonly<Record<string, number>> = {
  zero: 0, oh: 0, o: 0, nought: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS_WORDS: Readonly<Record<string, number>> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Spoken number words to a number, for the forms people actually use.
 *
 * Two compound shapes matter and they are distinguishable, which is the only reason this can be
 * done without guessing:
 *
 *   "eighty two"  -> tens THEN unit  -> 82   (ordinary two-digit number)
 *   "two fifty"   -> unit THEN tens  -> 250  (the hundreds everyone drops in speech)
 *
 * Anything that fits neither shape returns null and becomes an unmatched token rather than a
 * number somebody did not say.
 */
export function wordsToNumber(words: readonly string[]): number | null {
  if (words.length === 0) return null;

  // A bare numeral, possibly already decimal: the recognizer usually produces these.
  if (words.length === 1 && /^\d+(\.\d+)?$/.test(words[0])) return Number(words[0]);

  // "seven point four", and "7 point 4" which recognizers also produce.
  const pointAt = words.indexOf("point");
  if (pointAt > 0 && pointAt < words.length - 1) {
    const whole = wordsToNumber(words.slice(0, pointAt));
    const after = words.slice(pointAt + 1);
    if (whole == null) return null;
    // Digits after the point are spoken one at a time: "point four five" is .45, not .9.
    let decimals = "";
    for (const w of after) {
      if (/^\d+$/.test(w)) decimals += w;
      else if (w in SMALL_WORDS && SMALL_WORDS[w] < 10) decimals += String(SMALL_WORDS[w]);
      else return null;
    }
    if (decimals === "") return null;
    return Number(`${whole}.${decimals}`);
  }

  /**
   * An explicit spoken zero means the digits are being read out one by one -- "one oh five" is
   * 105, never six. "oh" is the tell, and it is a safe one: nobody says "one oh five" meaning
   * anything else. Without an "oh" this is NOT attempted, because "seven four" is genuinely
   * ambiguous between 74 and 7.4 and guessing at a reading is the one thing this must not do.
   */
  if (words.some((w) => w === "oh" || w === "o")) {
    const digits = words.map((w) => (/^\d$/.test(w) ? w : w in SMALL_WORDS && SMALL_WORDS[w] < 10 ? String(SMALL_WORDS[w]) : null));
    if (digits.every((d) => d !== null)) return Number(digits.join(""));
  }

  let total = 0;
  let current = 0;
  let sawAny = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (/^\d+$/.test(w)) {
      current += Number(w);
      sawAny = true;
      continue;
    }
    if (w === "hundred") {
      current = (current === 0 ? 1 : current) * 100;
      sawAny = true;
      continue;
    }
    if (w === "thousand") {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
      sawAny = true;
      continue;
    }
    if (w in TENS_WORDS) {
      // "two fifty": a unit already sitting in `current` with a tens word behind it is the
      // dropped hundred, not an addition. 2 then 50 is 250, never 52 -- nobody says "two fifty"
      // meaning fifty-two.
      if (current > 0 && current < 10) current = current * 100 + TENS_WORDS[w];
      else current += TENS_WORDS[w];
      sawAny = true;
      continue;
    }
    if (w in SMALL_WORDS) {
      current += SMALL_WORDS[w];
      sawAny = true;
      continue;
    }
    return null;
  }

  return sawAny ? total + current : null;
}

/** Noise the recognizer leaves behind that carries no meaning here. */
const FILLER = new Set(["uh", "um", "er", "and", "is", "was", "at", "the", "a", "of", "it", "its", "reading", "ppm", "degrees", "psi"]);

function normalize(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    // A dot is a decimal point ONLY between digits. Everything else -- "7.4." ending a sentence,
    // the stop in "ppm." -- is punctuation. Keeping it attached produced a token like "ppm."
    // that matched no filler word and no number, and then took the reading beside it down with
    // it: "free chlorine 1.5 ppm." parsed as nothing at all.
    .replace(/\.(?!\d)/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !FILLER.has(w));
}

/** Every phrase, longest first, so "total chlorine" is tried before "chlorine". */
const PHRASES_BY_LENGTH: ReadonlyArray<{ field: ReadingField; words: string[] }> = FIELD_PHRASES.flatMap(
  ([field, phrases]) => phrases.map((p) => ({ field, words: p.split(" ") })),
).sort((a, b) => b.words.length - a.words.length);

function matchFieldAt(tokens: readonly string[], index: number): { field: ReadingField; length: number } | null {
  for (const { field, words } of PHRASES_BY_LENGTH) {
    if (index + words.length > tokens.length) continue;
    let hit = true;
    for (let k = 0; k < words.length; k++) {
      if (tokens[index + k] !== words[k]) {
        hit = false;
        break;
      }
    }
    if (hit) return { field, length: words.length };
  }
  return null;
}

/**
 * Parse one dictated set of readings.
 *
 * Reads strictly left to right as "field, then its number", which is how people say these:
 * "free chlorine three point two, pH seven four, alk eighty". A number before any field name
 * belongs to nothing and is reported rather than attached to a guess.
 *
 * A field said twice keeps the LAST value. Correcting yourself out loud -- "pH seven four, no,
 * seven six" -- is the one disfluency worth handling, and taking the last one is what the
 * speaker meant.
 */
export function parseDictatedReading(transcript: string): DictatedReading {
  const tokens = normalize(transcript);
  const values: Partial<Record<ReadingField, number>> = {};
  const suspect: SuspectReading[] = [];
  const unmatched: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const match = matchFieldAt(tokens, i);
    if (!match) {
      unmatched.push(tokens[i]);
      i += 1;
      continue;
    }

    // Collect everything up to the next field name; that run is this field's number.
    let j = i + match.length;
    const numberWords: string[] = [];
    while (j < tokens.length && matchFieldAt(tokens, j) == null) {
      numberWords.push(tokens[j]);
      j += 1;
    }

    // Trailing residue -- a stray word the recognizer tacked on -- should cost that word, not
    // the reading in front of it. Trim from the right until what is left parses.
    let numberRun = numberWords;
    let value = wordsToNumber(numberRun);
    const trimmed: string[] = [];
    while (value == null && numberRun.length > 1) {
      trimmed.unshift(numberRun[numberRun.length - 1]);
      numberRun = numberRun.slice(0, -1);
      value = wordsToNumber(numberRun);
    }
    if (value != null) unmatched.push(...trimmed);

    if (value == null) {
      // Heard the field, got nothing usable after it. Say so rather than leave it blank with no
      // explanation -- the technician said the word and will expect to see something.
      unmatched.push(tokens.slice(i, i + match.length).join(" "));
      if (numberWords.length > 0) unmatched.push(...numberWords);
    } else {
      const [min, max] = PLAUSIBLE[match.field];
      if (value < min || value > max) {
        suspect.push({
          field: match.field,
          value,
          reason: `${value} is outside what this reading can be (${min}–${max})`,
        });
        delete values[match.field];
      } else {
        values[match.field] = value;
        const already = suspect.findIndex((s) => s.field === match.field);
        if (already >= 0) suspect.splice(already, 1);
      }
    }

    i = j;
  }

  return { values, suspect, unmatched };
}

/** Whether anything at all came back, for deciding between "Save" and "I didn't catch that". */
export function hasAnyReading(parsed: DictatedReading): boolean {
  return Object.keys(parsed.values).length > 0 || parsed.suspect.length > 0;
}

/* ------------------------------------------------------------------------------------------ *
 * Chemicals added
 * ------------------------------------------------------------------------------------------ */

/**
 * A dose is a different parsing problem from a reading, and harder in one specific way: there is
 * no fixed vocabulary. ChemicalProduct.name is free text owned by the organization -- "Muriatic
 * Acid", "Cal Hypo 73%", "3in Trichlor Tabs" -- so the only honest source of product names is
 * that organization's own catalogue, passed in. Hardcoding a chemical list here would work for
 * Lindley's and quietly fail for the next customer.
 *
 * Getting this wrong costs more than a reading does. VisitChemicalDose carries unitCharge, so a
 * mismatched product bills the customer for something that was never added, and it tells the
 * next technician the wrong thing about what is already in the water. So an ambiguous match is
 * REPORTED, never resolved by picking the best score.
 */
export type DictatableProduct = {
  id: string;
  /** ChemicalProduct.name, as the organization wrote it. */
  name: string;
  /** ChemicalProduct.unit -- arbitrary text: "gal", "lb", "tablet". */
  unit: string;
};

export type DictatedDose = {
  productId: string;
  productName: string;
  quantity: number;
  /** Always the product's own unit, never the spoken one. See parseDictatedDoses. */
  unit: string;
  /** Set when the spoken unit disagreed with the product's, which usually means a mis-hear. */
  spokenUnitConflict?: string;
};

export type DictatedDoses = {
  doses: DictatedDose[];
  /**
   * A quantity whose product matched more than one catalogue entry equally well.
   *
   * Candidates carry their ids, not just names: whatever asks the technician to choose has to
   * turn that choice back into a VisitChemicalDose, and a name alone cannot do it -- two
   * organizations can stock products with the same name, and the dose is costed from the id.
   */
  ambiguous: { quantity: number; heard: string; candidates: { id: string; name: string; unit: string }[] }[];
  /** A quantity with no recognisable product, or words that matched nothing. */
  unmatched: string[];
};

/** Quantity words that are not numbers. "a gallon" is one gallon. */
const QUANTITY_WORDS: Readonly<Record<string, number>> = { a: 1, an: 1, half: 0.5, quarter: 0.25 };

const FRACTION_WORDS: Readonly<Record<string, number>> = { half: 0.5, quarter: 0.25 };

/**
 * A spoken quantity, including the shapes a bare number parser cannot take.
 *
 * "half a gallon" puts an article in the middle of the quantity, and "two and a half" puts a
 * fraction on the end -- both are how acid actually gets dosed, and both used to parse as
 * nothing, which silently dropped a chemical that went into the water.
 */
function parseQuantityWords(words: readonly string[]): number | null {
  // The article is grammar, not quantity, once anything else is present: "half a gallon" is 0.5.
  const w = words.length > 1 ? words.filter((x) => x !== "a" && x !== "an") : [...words];
  if (w.length === 0) return words.length > 0 ? 1 : null;
  if (w.length === 1 && w[0] in QUANTITY_WORDS) return QUANTITY_WORDS[w[0]];

  const last = w[w.length - 1];
  if (last in FRACTION_WORDS) {
    const rest = w.slice(0, -1);
    if (rest.length === 0) return FRACTION_WORDS[last];
    const base = wordsToNumber(rest);
    return base == null ? null : base + FRACTION_WORDS[last];
  }
  return wordsToNumber(w);
}

/** Spoken unit words, mapped to the shape ChemicalProduct.unit tends to take. */
const UNIT_WORDS: Readonly<Record<string, string>> = {
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  ounce: "oz", ounces: "oz", oz: "oz",
  gallon: "gal", gallons: "gal", gal: "gal",
  quart: "qt", quarts: "qt", qt: "qt",
  pint: "pt", pints: "pt",
  tablet: "tablet", tablets: "tablet", tab: "tablet", tabs: "tablet",
  bag: "bag", bags: "bag", scoop: "scoop", scoops: "scoop",
  liter: "l", liters: "l", litre: "l", litres: "l",
};

/** Words to drop from a dose phrase. Deliberately NOT "a"/"an" -- those are quantities here. */
const DOSE_FILLER = new Set(["uh", "um", "er", "and", "of", "added", "add", "put", "in", "the", "then", "also", "some", "i", "we"]);

function normalizeDose(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !DOSE_FILLER.has(w));
}

/** Product name to comparable tokens: "Cal Hypo 73%" -> ["cal","hypo","73"]. */
function productTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * How well a spoken phrase names a product, as the count of the product's own words it contains.
 *
 * Counting the PRODUCT's words rather than the spoken ones is what makes shorthand work: a
 * technician says "acid" for "Muriatic Acid" and "cal hypo" for "Cal Hypo 73%", and neither says
 * the whole name. A score of zero means no connection at all.
 */
function productScore(spoken: readonly string[], product: DictatableProduct): number {
  const tokens = productTokens(product.name);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const t of tokens) if (spoken.includes(t)) hits += 1;
  return hits;
}

/**
 * Parse "added two pounds of cal hypo and a gallon of acid" against an organization's catalogue.
 *
 * Reads quantity-first, which is how doses are said: a number (or "a"/"half"), an optional unit,
 * then the product, up to the next quantity. The product's OWN unit is always what gets stored --
 * the catalogue is the authority on whether something is sold by the pound or the gallon, and a
 * technician saying "two gallons" of a powder is a mis-hear worth surfacing rather than a reason
 * to invent a unit the organization does not use.
 */
export function parseDictatedDoses(transcript: string, products: readonly DictatableProduct[]): DictatedDoses {
  const tokens = normalizeDose(transcript);
  const doses: DictatedDose[] = [];
  const ambiguous: DictatedDoses["ambiguous"] = [];
  const unmatched: string[] = [];

  const isQuantityStart = (w: string) => /^\d/.test(w) || w in QUANTITY_WORDS || w in SMALL_WORDS || w in TENS_WORDS;

  let i = 0;
  while (i < tokens.length) {
    if (!isQuantityStart(tokens[i])) {
      unmatched.push(tokens[i]);
      i += 1;
      continue;
    }

    // The quantity runs until a unit word or a word that cannot be part of a number.
    const qtyWords: string[] = [];
    while (i < tokens.length && isQuantityStart(tokens[i]) && !(tokens[i] in UNIT_WORDS)) {
      qtyWords.push(tokens[i]);
      i += 1;
    }
    const quantity = parseQuantityWords(qtyWords);

    let spokenUnit: string | null = null;
    let spokenUnitWord: string | null = null;
    if (i < tokens.length && tokens[i] in UNIT_WORDS) {
      spokenUnitWord = tokens[i];
      spokenUnit = UNIT_WORDS[tokens[i]];
      i += 1;
    }

    // Everything up to the next quantity names the product.
    const nameWords: string[] = [];
    while (i < tokens.length && !isQuantityStart(tokens[i])) {
      nameWords.push(tokens[i]);
      i += 1;
    }

    // "three tabs" names the product WITH the unit word and nothing else. Tablets, bags and
    // scoops are all said that way, so a unit left holding no product is tried as the name
    // rather than thrown away with the dose attached to it.
    if (nameWords.length === 0 && spokenUnitWord != null) {
      nameWords.push(spokenUnitWord);
      spokenUnit = null;
    }

    if (quantity == null || nameWords.length === 0) {
      unmatched.push(...qtyWords, ...(spokenUnit ? [spokenUnit] : []), ...nameWords);
      continue;
    }

    const scored = products
      .map((p) => ({ product: p, score: productScore(nameWords, p) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unmatched.push(...qtyWords, ...nameWords);
      continue;
    }

    const best = scored[0].score;
    const tied = scored.filter((s) => s.score === best);
    if (tied.length > 1) {
      // Two products named equally well. Picking one would bill a customer for a chemical
      // nobody added; the screen asks instead.
      ambiguous.push({
        quantity,
        heard: nameWords.join(" "),
        candidates: tied.map((t) => ({ id: t.product.id, name: t.product.name, unit: t.product.unit })),
      });
      continue;
    }

    const product = tied[0].product;
    const dose: DictatedDose = { productId: product.id, productName: product.name, quantity, unit: product.unit };
    if (spokenUnit && spokenUnit.toLowerCase() !== product.unit.toLowerCase()) {
      dose.spokenUnitConflict = spokenUnit;
    }
    doses.push(dose);
  }

  return { doses, ambiguous, unmatched };
}
