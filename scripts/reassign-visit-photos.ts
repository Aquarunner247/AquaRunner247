/**
 * Moves a photo from the visit it was uploaded under to the visit it actually belongs to.
 *
 * Exists because the combined multi-body capture screen let a technician shoot every body of water
 * through the first card's camera, so photos of one pool or spa were filed against a sibling. The
 * app stays upload-only by design -- no delete or reassign control -- so corrections happen here,
 * deliberately and one list at a time.
 *
 * DRY RUN BY DEFAULT: prints what it would move and changes nothing. Pass --apply to write.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/reassign-visit-photos.ts
 *   node --env-file=.env node_modules/.bin/tsx scripts/reassign-visit-photos.ts --apply
 *
 * Nothing is inferred at run time. Every move is spelled out in MOVES below, because GPS cannot
 * separate bodies of water 6-19 m apart (accuracy across these photos averages 22 m and reaches
 * 78 m) -- only a person looking at the photograph can. Each entry carries the reason it was
 * decided, so a later reader can tell evidence from assumption.
 *
 * Refusals, all of which abort that one move rather than the run:
 *   - photo or target visit not found
 *   - the two visits belong to different organizations
 *   - the two visits belong to different properties
 *   - the two visits are not on the same local day
 *   - the photo is already on the target visit (idempotent, so a re-run is safe)
 *   - the target visit is the same visit it is already on
 *
 * The stored file is NOT copied. Only VisitPhoto.visitId changes, so storagePath keeps the visit id
 * it was uploaded under. Signed URLs are generated from the stored path, so links keep working; the
 * path simply stops matching the visit, which is recorded here rather than papered over. Copying the
 * object instead would mean two files and a delete, i.e. more ways to lose a compliance photo.
 */
import { prisma } from "@/lib/prisma";
import { timeZoneForState, ymdInTimeZone } from "@/lib/timezone";

const APPLY = process.argv.includes("--apply");

type Move = {
  /** VisitPhoto.id, from the triage list. */
  photoId: string;
  /** ServiceVisit.id of the body of water the photo is actually of. */
  toVisitId: string;
  /** Why this was decided -- looked at the photo, GPS was unambiguous, technician recalled it. */
  because: string;
};

/**
 * Empty on purpose. Fill it from the triage list once each photo has been identified, then run
 * without --apply and read the report before applying.
 *
 * The one case GPS settles by itself is left here commented out as a worked example rather than
 * pre-approved: Zoom Apartments 2026-09-10, where the photo filed under South Pool sits 10 m from
 * Garden Pool and 145 m from South Pool, and those two pools are 136 m apart -- far beyond the
 * +/-27 m fix, so the coordinates alone are conclusive.
 */
const MOVES: Move[] = [
  // {
  //   photoId: "cmtw32zg1000304js6bk5sk81",
  //   toVisitId: "cmtvdsgi7000904l6tddhxqv6", // Zoom Apartments, Garden Pool (Middle), 2026-09-10
  //   because: "GPS 10m from Garden Pool vs 145m from South Pool; bodies 136m apart, fix +/-27m",
  // },
];

async function main() {
  if (MOVES.length === 0) {
    console.log(
      "MOVES is empty, so there is nothing to do.\n" +
        "Fill it in from the triage list, then run again without --apply to preview.",
    );
    return;
  }

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} - ${MOVES.length} move${MOVES.length === 1 ? "" : "s"}\n`);

  let moved = 0;
  let refused = 0;

  for (const move of MOVES) {
    const photo = await prisma.visitPhoto.findUnique({
      where: { id: move.photoId },
      select: {
        id: true,
        visitId: true,
        storagePath: true,
        createdAt: true,
        visit: {
          select: {
            id: true,
            propertyId: true,
            organizationId: true,
            scheduledStart: true,
            bodyOfWater: { select: { name: true } },
            property: { select: { name: true } },
            organization: { select: { state: true } },
          },
        },
      },
    });

    if (!photo) {
      console.log(`REFUSED  photo ${move.photoId}: not found`);
      refused++;
      continue;
    }

    const target = await prisma.serviceVisit.findUnique({
      where: { id: move.toVisitId },
      select: {
        id: true,
        propertyId: true,
        organizationId: true,
        scheduledStart: true,
        bodyOfWater: { select: { name: true } },
        property: { select: { name: true } },
      },
    });

    const from = photo.visit;
    const label = `${from.property.name}: ${from.bodyOfWater?.name ?? "?"} -> ${target?.bodyOfWater?.name ?? "?"}`;

    if (!target) {
      console.log(`REFUSED  ${label}: target visit ${move.toVisitId} not found`);
      refused++;
      continue;
    }
    if (target.id === from.id) {
      console.log(`REFUSED  ${label}: photo is already on that visit`);
      refused++;
      continue;
    }
    if (target.organizationId !== from.organizationId) {
      console.log(`REFUSED  ${label}: different organizations`);
      refused++;
      continue;
    }
    if (target.propertyId !== from.propertyId) {
      console.log(`REFUSED  ${label}: different properties - a photo never moves between sites`);
      refused++;
      continue;
    }

    // Same local calendar day, in the org's own zone: a photo belongs to one occasion, and moving it
    // across days would rewrite a different day's compliance record.
    const tz = timeZoneForState(from.organization.state);
    const fromYmd = ymdInTimeZone(from.scheduledStart, tz);
    const targetYmd = ymdInTimeZone(target.scheduledStart, tz);
    if (fromYmd !== targetYmd) {
      console.log(`REFUSED  ${label}: different days (${fromYmd} vs ${targetYmd})`);
      refused++;
      continue;
    }

    console.log(`${APPLY ? "MOVING " : "WOULD  "} ${label}  (${fromYmd})`);
    console.log(`         photo ${photo.id}, uploaded ${photo.createdAt.toISOString()}`);
    console.log(`         because: ${move.because}`);

    if (APPLY) {
      await prisma.visitPhoto.update({ where: { id: photo.id }, data: { visitId: target.id } });
      moved++;
    }
    console.log();
  }

  if (APPLY) {
    console.log(`Moved ${moved}. Refused ${refused}.`);
    if (moved > 0) {
      console.log(
        "Re-check the affected visits: a body that now has no photo cannot be completed, and one\n" +
          "that was already completed keeps its completion - the gate only runs at completion time.",
      );
    }
  } else {
    console.log(`Would move ${MOVES.length - refused}. Refused ${refused}. Nothing was changed.`);
    console.log("Re-run with --apply once the list reads correctly.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
