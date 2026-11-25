/**
 * The contract between the read endpoints and whatever renders them -- the offline shell today,
 * a React Native client in Phase 2.
 *
 * Phase 1d of NATIVE-REBUILD-PLAN.md. Types only, and PRISMA-FREE on purpose: a client component
 * that imported lib/visit-form-data.ts would drag the Prisma client into the browser bundle,
 * which is the same constraint that put serializeReading in its own module. Every import below is
 * `import type`, which TypeScript erases entirely, so nothing here reaches the client at runtime.
 *
 * VisitFormBundle IS DERIVED FROM THE FORMS RATHER THAN RESTATED. That is the whole point: the
 * props are declared once, by the components that consume them, and both the server page and the
 * API are checked against the same derivation. A hand-written copy of 21 prop types is a copy
 * that goes out of date the first time somebody adds a reading field -- and "out of date" there
 * means a technician asked for the wrong readings.
 */

import type { ComponentProps } from "react";
import type { VisitForm } from "@/app/dashboard/visits/[id]/visit-form";
import type { ResidentialVisitForm } from "@/app/dashboard/visits/[id]/residential-visit-form";

/**
 * Everything either form needs, as the forms themselves declare it.
 *
 * An intersection rather than a union because one payload has to satisfy whichever form the
 * property type selects, and the caller does not know which until it reads `isResidential`.
 * Optional props on either side stay optional.
 */
export type VisitFormBundle = ComponentProps<typeof VisitForm> & ComponentProps<typeof ResidentialVisitForm>;

/**
 * The visit itself, trimmed to what a technician standing at the gate actually needs: where this
 * is, what water it is, and how to get in.
 *
 * Dates are ISO strings, not Date objects -- this crosses a wire. Decimals are numbers, for the
 * same reason serializeReading exists: JSON.stringify renders a Prisma Decimal as an object, so
 * anything not converted here arrives as a shape the client did not expect and nothing errors.
 */
export type VisitWireVisit = {
  id: string;
  status: string;
  scheduledStart: string;
  startedAt: string | null;
  completedAt: string | null;
  departedAt: string | null;
  technicianId: string | null;
  property: {
    id: string;
    name: string;
    propertyType: string;
    /** Pre-joined, because every caller wants one line of text and none wants four fields. */
    address: string;
    latitude: number | null;
    longitude: number | null;
    geofenceMeters: number | null;
    accessNotes: string | null;
    ownerName: string | null;
    ownerMobilePhone: string | null;
  };
  bodyOfWater: {
    id: string;
    name: string;
    type: string | null;
    disinfectionMethod: string | null;
    volumeGallons: number | null;
  };
};

/** The GET /api/visits/[id] response. */
export type VisitWire = {
  visit: VisitWireVisit;
  /** Which of the two forms to render. Decided server-side from the property type. */
  isResidential: boolean;
  timeZone: string;
  form: VisitFormBundle;
};
