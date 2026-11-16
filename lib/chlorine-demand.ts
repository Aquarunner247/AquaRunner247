/**
 * How fast a body of water actually burns through free chlorine, and what that means for the
 * dose a technician should leave behind.
 *
 * WHY THIS EXISTS. The dose in dosing-calculator.ts was computed to put the water at target at
 * the moment of mixing and accounted for nothing afterwards, so a pool dosed to the middle of
 * its band on Monday could be at zero by Friday. Measured on this org's own two years of
 * readings (2026-11-16), that is not hypothetical: across 574 consecutive-visit pairs with a
 * 3-10 day gap, when the calculator DID recommend chlorine the pool came back under 2 ppm
 * 46.4% of the time -- against 13.4% for pools it left alone. The recommendation was the
 * strongest predictor of a failed pool, because it was the only one that reset the clock
 * without covering the interval.
 *
 * THE NUMBERS BELOW ARE MEASURED, NOT ASSUMED. 455 intervals where no chlorine was logged at
 * the opening visit -- pure decay, no dosing to model -- give a median demand of 0.667 ppm/day
 * overall, 0.676 in April-September and 0.513 in October-March, with a warm-season 75th
 * percentile of 1.30 and 90th of 2.00. That spread is the whole argument for measuring each
 * pool instead of picking one constant: a shaded courtyard pool and a hotel pool on the Strip
 * are not the same problem, and the same pool is not the same problem in May as in December.
 *
 * WHAT THIS CANNOT DO, stated here because the calculator relies on it being honest. Holding a
 * 2 ppm floor for 7 days at 1.3 ppm/day needs about 11 ppm left in the water, which is above
 * any sane band and unpleasant to swim in. For those pools there IS no dose -- the answer is a
 * feeder, stabiliser to slow the UV loss, or another visit. projectCarryTarget therefore
 * reports how far the capped dose actually gets, and the caller says so rather than printing a
 * number it knows is short.
 *
 * Deliberately Prisma-free so the arithmetic is unit-testable on its own, the same split
 * dosing-units.ts has against dosing-calculator.ts.
 */

/**
 * Fallback demand for a body with too little history to measure, and the median of this org's
 * own 455 undosed intervals rather than a figure from a manufacturer's chart. Rounded up from
 * 0.667 to leave the fallback slightly on the generous side: under-dosing is the failure this
 * module exists to fix, and the target is clamped to the compliance ceiling regardless.
 */
export const DEFAULT_DEMAND_PPM_PER_DAY = 0.7;

/** Below this many usable intervals the median is noise, so DEFAULT_DEMAND_PPM_PER_DAY stands. */
export const MIN_OBSERVATIONS_FOR_MEASURED_DEMAND = 3;

/**
 * Only intervals this recent are measured, so the estimate tracks the season instead of
 * averaging a Vegas July against the following January. Four months is long enough to collect
 * several intervals on a weekly pool and short enough that a spring ramp-up shows through.
 */
export const DEMAND_LOOKBACK_DAYS = 120;

/** A gap outside this range is not a normal service interval -- a same-day recheck on one side,
 * a pool closed for a month on the other -- and neither describes ordinary demand. */
export const DEMAND_MIN_GAP_DAYS = 2;
export const DEMAND_MAX_GAP_DAYS = 14;

/**
 * Ceiling on a measured estimate. A single mistyped reading (30 instead of 3.0) would otherwise
 * produce a demand that makes the technician-facing note absurd. It cannot cause an unsafe dose
 * -- the target is clamped to the compliance maximum either way -- so this is about the estimate
 * staying believable, not about safety.
 */
export const MAX_CREDIBLE_DEMAND_PPM_PER_DAY = 3;

/** One observed service interval: the free chlorine measured at each end and the days between.
 * The caller supplies only intervals where NO chlorine was added at the opening visit, which is
 * what makes the drop pure decay. */
export type DemandInterval = { startFc: number; endFc: number; gapDays: number };

export type ChlorineDemand = {
  ppmPerDay: number;
  /** "measured" means this pool's own readings; "default" means there were too few to use. */
  source: "measured" | "default";
  /** Usable intervals behind a measured figure -- 0 whenever source is "default". */
  sampleSize: number;
  /** True when at least one interval ended at exactly 0 ppm, so the real demand is at least
   * this and possibly higher: the pool may have hit zero days before the technician arrived.
   * Worth surfacing, because it changes a borderline "this just about holds" into a maybe. */
  floorCensored: boolean;
};

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median demand across a body's recent undosed intervals.
 *
 * Median rather than mean on purpose: one holiday weekend or one algae bloom should not set the
 * standing dose for a pool, and the distribution measured here has a long right tail (median
 * 0.667, 90th percentile 1.75).
 *
 * An interval where chlorine ROSE is dropped rather than counted as zero demand. Chlorine does
 * not appear on its own, so that interval means something was added that was not logged, and
 * averaging it in would understate demand for the pool -- the exact direction of error this
 * module exists to correct.
 */
export function estimateChlorineDemand(intervals: DemandInterval[]): ChlorineDemand {
  const usable = intervals.filter(
    (i) =>
      i.gapDays >= DEMAND_MIN_GAP_DAYS &&
      i.gapDays <= DEMAND_MAX_GAP_DAYS &&
      i.startFc > i.endFc,
  );

  if (usable.length < MIN_OBSERVATIONS_FOR_MEASURED_DEMAND) {
    return {
      ppmPerDay: DEFAULT_DEMAND_PPM_PER_DAY,
      source: "default",
      sampleSize: 0,
      floorCensored: false,
    };
  }

  const rates = usable.map((i) => (i.startFc - i.endFc) / i.gapDays).sort((a, b) => a - b);
  const raw = median(rates);

  return {
    ppmPerDay: Math.min(raw, MAX_CREDIBLE_DEMAND_PPM_PER_DAY),
    source: "measured",
    sampleSize: usable.length,
    floorCensored: usable.some((i) => i.endFc === 0),
  };
}

export type CarryProjection = {
  /** What to dose to. Never below the caller's existing target, never above maxPpm. */
  targetPpm: number;
  /** The target the calculator would have used without any carry projection, kept so the
   * caller can tell whether this changed anything. */
  baselineTargetPpm: number;
  /** Days this target holds the floor at the given demand. */
  daysCovered: number;
  daysUntilNextVisit: number;
  /** False when the capped target cannot hold the floor until the next visit -- the caller must
   * say so rather than present the dose as sufficient. */
  bridges: boolean;
  /** True when the dose needed to bridge was cut down by maxPpm. Distinguishes "this pool needs
   * more chlorine than it is legal to add" from "demand is low and the baseline already won". */
  cappedByMax: boolean;
};

/**
 * The target that carries a pool to its next service day, or as close as the ceiling allows.
 *
 * Three rules, in order:
 *  1. Aim to still be at floorPpm when the technician next arrives: floor + demand x days.
 *  2. Never go below the target the calculator already used, so this can only ever raise a
 *     dose. A change that could quietly lower chlorine on a commercial pool is not one worth
 *     the risk of getting wrong.
 *  3. Never exceed maxPpm, which the caller sets from the compliance maximum and the org's own
 *     band -- whichever is lower. Rule 3 beats rule 1 every time; that is what makes a
 *     shortfall something to report instead of something to dose through.
 */
export function projectCarryTarget(input: {
  baselineTargetPpm: number;
  floorPpm: number;
  maxPpm: number;
  demandPpmPerDay: number;
  daysUntilNextVisit: number;
}): CarryProjection {
  const { baselineTargetPpm, floorPpm, maxPpm, demandPpmPerDay, daysUntilNextVisit } = input;

  const desired = floorPpm + demandPpmPerDay * daysUntilNextVisit;
  // Rounded to 0.1 ppm because the Dosing Card prints this figure straight to the technician,
  // and 6.199999999999999 is what floating point produces for floor 2 + 0.7 x 6. Rounded DOWN
  // on the half so the ceiling can never be exceeded by rounding.
  const rounded = Math.ceil(Math.min(Math.max(baselineTargetPpm, desired), maxPpm) * 10 - 0.5) / 10;
  const targetPpm = Math.min(rounded, maxPpm);

  // A pool with no measurable demand holds indefinitely; reporting Infinity days would be true
  // and useless, so it simply bridges.
  const daysCovered =
    demandPpmPerDay > 0 ? Math.max(0, (targetPpm - floorPpm) / demandPpmPerDay) : daysUntilNextVisit;

  return {
    targetPpm,
    baselineTargetPpm,
    daysCovered,
    daysUntilNextVisit,
    // Rounding tolerance, so 6.999 days against a 7-day gap is not reported as a shortfall.
    bridges: daysCovered + 0.05 >= daysUntilNextVisit,
    cappedByMax: desired > maxPpm,
  };
}

/**
 * Smallest ppm increase worth putting on a technician's screen. Below this the dose is a
 * splash, the measurement error on a test kit exceeds the correction, and asking somebody to
 * stop and pour it costs more than it buys.
 */
export const MIN_USEFUL_TOP_UP_PPM = 0.5;

/**
 * Whether a reading that is currently WITHIN range still needs chlorine to reach the next visit.
 *
 * This is the case the old calculator was blindest to, and the one that accounts for most of the
 * failures: of the pools that came back under 2 ppm, 64 were in range when the technician last
 * stood over them and were told nothing, against 32 that got a dose. "Compliant right now" and
 * "compliant on Friday" are different questions, and only the second one is useful to somebody
 * who will not be back for a week.
 */
export function needsCarryTopUp(input: {
  currentPpm: number;
  floorPpm: number;
  demandPpmPerDay: number;
  daysUntilNextVisit: number;
  maxPpm: number;
}): boolean {
  const { currentPpm, floorPpm, demandPpmPerDay, daysUntilNextVisit, maxPpm } = input;

  // Already above anything we would dose to -- adding more is wrong regardless of the gap.
  if (currentPpm >= maxPpm) return false;

  const projectedAtNextVisit = currentPpm - demandPpmPerDay * daysUntilNextVisit;
  if (projectedAtNextVisit >= floorPpm) return false;

  const target = Math.min(floorPpm + demandPpmPerDay * daysUntilNextVisit, maxPpm);
  return target - currentPpm >= MIN_USEFUL_TOP_UP_PPM;
}

/**
 * The one sentence the operator asked for on 2026-11-16: the dose cannot know about a pool
 * party, a dust storm or a heat spike, so the technician's own read of the water still decides.
 * Exported as a constant because it belongs on a tablet recommendation too, and the same words
 * in two places that drift apart is how a caveat stops being believed.
 */
/**
 * What to actually change on a tablet-fed body that is not holding its chlorine, in the right
 * order: an empty or jammed feeder is the common and trivial cause, and it must be ruled out
 * before anybody is told that tablets are not the lever. Only once the feeder is known to be
 * stocked is the dissolve rate the thing to adjust.
 *
 * One constant, used both by the shortfall branch below and by the in-range advisory the
 * calculator raises for a feeder pool, so the two cannot drift into contradicting each other.
 */
export const TABLET_FEEDER_CARRY_ACTION =
  "Check the feeder is stocked and not jammed first; if it is already full, its dissolve rate is the lever -- turn it up and check the pump's run time and flow, because adding pucks to a full feeder changes nothing.";

export const DEMAND_STEADINESS_CAVEAT =
  "This assumes demand holds steady; a heat spike, a storm or a heavy weekend burns it faster, so use your own read of the pool.";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dayWord(n: number): string {
  return n === 1 ? "day" : "days";
}

/**
 * The technician-facing explanation of a carry-aware chlorine dose.
 *
 * Written to be read by somebody standing in the sun with a test kit in one hand, so it leads
 * with what the dose is sized for and only then qualifies it. Every number it quotes comes from
 * the projection rather than being restated as a constant, because the one thing worse than no
 * disclaimer is one that contradicts the figure above it.
 *
 * The "use your own read" sentence is deliberately last and deliberately short. It is the part
 * the operator asked for -- the dose cannot know about a pool party or a dust storm -- but a
 * caveat printed before the reasoning trains people to skip the reasoning.
 */
export function buildCarryNote(input: {
  carry: CarryProjection;
  demand: ChlorineDemand;
  floorPpm: number;
  currentlyInRange: boolean;
  /** Changes the advice when the pool cannot be carried, because on a tablet-fed body the
   * number of tablets is not the lever -- see the shortfall branch below. */
  tabletFed?: boolean;
  /** ppm of cyanuric acid still available below this body's maximum, when known. Trichlor
   * carries CYA in with it, so this decides whether "add more stabiliser" is advice or the
   * opposite of advice. */
  cyaHeadroomPpm?: number | null;
}): string {
  const { carry, demand, floorPpm, currentlyInRange, tabletFed = false, cyaHeadroomPpm = null } = input;
  const parts: string[] = [];

  const rate = round1(demand.ppmPerDay);
  const gapLabel = `${carry.daysUntilNextVisit} ${dayWord(carry.daysUntilNextVisit)}`;

  // Its own sentence, rather than a clause inside the one above it. Spliced in mid-sentence the
  // em-dash version read as "...at a 0.7 ppm/day default -- not enough history at this pool to
  // measure its own demand yet it drops below 2 ppm...", which is not English.
  const basis =
    demand.source === "measured"
      ? `Demand measured at ${rate} ppm/day from this pool's own history (median of ${demand.sampleSize} recent service ${demand.sampleSize === 1 ? "interval" : "intervals"}).`
      : `Demand estimated at ${rate} ppm/day -- the default, until this pool has enough history of its own to measure.`;

  parts.push(
    currentlyInRange
      ? `Free chlorine is in range now, but it falls below ${floorPpm} ppm before the next visit in ${gapLabel}.`
      : `Sized to still be at ${floorPpm} ppm in ${gapLabel}.`,
  );
  parts.push(basis);

  if (!carry.bridges) {
    const covered = round1(carry.daysCovered);
    const shortfall =
      `This only holds that floor for about ${covered} of the ${carry.daysUntilNextVisit} ${dayWord(carry.daysUntilNextVisit)}` +
      (carry.cappedByMax ? ` -- bridging the full gap would need more chlorine than the ${carry.targetPpm} ppm ceiling allows.` : ".");

    if (tabletFed) {
      // Filling the feeder fuller does not raise the dose once it is already stocked -- how fast
      // the pucks dissolve does, and that is the dial, the run time and the flow. Said in that
      // order by TABLET_FEEDER_CARRY_ACTION, because an empty feeder is the likelier cause and
      // the easier fix.
      parts.push(
        shortfall + " " + TABLET_FEEDER_CARRY_ACTION + " A liquid top-up today covers the gap in the meantime.",
      );
    } else {
      parts.push(
        shortfall +
          " One dose cannot carry this pool: a tablet feeder or floater, more stabiliser so UV stops burning it off, or a mid-week stop are the real fixes.",
      );
    }
  }

  // Said whenever stabiliser is nearly maxed out, bridging or not: on a trichlor body it is the
  // reason the pool will keep needing more chlorine for the same effect, and the reason the
  // usual "raise CYA to slow UV loss" advice does not apply here.
  if (cyaHeadroomPpm != null && cyaHeadroomPpm <= 10) {
    parts.push(
      cyaHeadroomPpm <= 0
        ? "Cyanuric acid is already at or above its maximum, which both locks up the chlorine already in the water and rules out adding stabiliser -- a partial drain and refill is what actually resets this."
        : tabletFed
          ? `Only about ${round1(cyaHeadroomPpm)} ppm of cyanuric acid headroom is left, and every puck adds more -- watch it.`
          : `Only about ${round1(cyaHeadroomPpm)} ppm of cyanuric acid headroom is left, so there is little room to add stabiliser to slow the UV loss.`,
    );
  }

  if (demand.floorCensored) {
    parts.push(
      "At least one recent interval ended at 0 ppm, so the real demand may be higher than measured -- the water may have run out of chlorine days before anyone arrived.",
    );
  }

  parts.push(DEMAND_STEADINESS_CAVEAT);

  return parts.join(" ");
}
