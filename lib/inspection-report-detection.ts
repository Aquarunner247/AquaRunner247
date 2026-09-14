/**
 * Detects whether a generic customer-document upload is actually a pool/spa inspection
 * report that belongs in the per-body InspectionReport section (see lib/inspection-reports.ts)
 * instead of the flat CustomerDocument list it has no other way to reach today. Kept
 * Prisma-free (like lib/dosing-units.ts) so the matching logic is unit-testable without a
 * live database -- the actual body-of-water lookup lives in lib/customer-documents.ts,
 * which already imports lib/prisma.
 *
 * Motivated by two real files found sitting in the generic list for "Pacific Harbors"
 * (which has a "Pool" and a "Spa" body of water): "Pacific Harbor Pool Inspection
 * 06.26.25_Part1.pdf" and "...Spa Inspection 06.26.25_Part2.pdf" -- both clearly meant for
 * the matching body's inspection section.
 */

/** Deliberately narrow: requires an explicit "inspection" in the label/filename rather than
 * guessing from context (content-type, file extension, etc). A false positive here would
 * silently reroute a contract or W-9 into the wrong section, so precision matters more than
 * recall -- anything that doesn't say "inspection" is left alone. */
export function looksLikeInspectionReport(labelOrFileName: string): boolean {
  return /inspection/i.test(labelOrFileName);
}

export type BodyOfWaterCandidate = { id: string; name: string; propertyName: string };

/**
 * Picks the single body of water an inspection-report-looking upload should attach to, or
 * null when it's genuinely ambiguous. Two cases count as unambiguous:
 *  - the customer has exactly one body of water, full stop -- no name-matching needed.
 *  - exactly one candidate's name appears (case-insensitive) as a substring of the
 *    label/filename, e.g. "Pacific Harbor Spa Inspection..." matching a body named "Spa".
 * Anything else (no bodies at all, or more than one name match -- e.g. "Pool" matching
 * both a body named "Pool" and one named "Pool 2") returns null rather than guessing:
 * misfiling a spa's report under the pool is worse than leaving it in the general
 * documents list for a human to place.
 */
export function pickInspectionReportTarget(
  candidates: BodyOfWaterCandidate[],
  labelOrFileName: string,
): BodyOfWaterCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const lower = labelOrFileName.toLowerCase();
  const nameMatches = candidates.filter((c) => c.name.trim().length > 0 && lower.includes(c.name.trim().toLowerCase()));
  return nameMatches.length === 1 ? nameMatches[0] : null;
}
