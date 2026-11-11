/**
 * Which email address actually reaches a property's customer.
 *
 * Property carries two contact sets and the schema says so: managerName/managerEmail for a
 * commercial property, and ownerName/ownerEmail which "replaces Manager/Maintenance above for
 * propertyType RESIDENTIAL". Every sender in this app read managerEmail only, so a residential
 * property -- where that field is empty by design -- silently received nothing at all: no service
 * summary on completion, no customer alerts, and a blank email column in the QuickBooks export.
 *
 * Falls back to the other field rather than giving up. The goal is reaching the customer, and an
 * address typed into the "wrong" box is still the customer's address -- refusing to use it would
 * turn a data-entry quirk into silence, which is the failure this function exists to end.
 */
export type PropertyContactFields = {
  propertyType?: string | null;
  managerEmail?: string | null;
  ownerEmail?: string | null;
};

export function propertyContactEmail(property: PropertyContactFields): string | null {
  const owner = property.ownerEmail?.trim() || null;
  const manager = property.managerEmail?.trim() || null;
  return property.propertyType === "RESIDENTIAL" ? (owner ?? manager) : (manager ?? owner);
}

export type PropertyReportFields = PropertyContactFields & {
  reportEmail?: string | null;
};

/**
 * Where a property's service summary and alert actually go.
 *
 * Separate from propertyContactEmail rather than folded into it, because the two questions are
 * genuinely different and one caller wants the other answer: the QuickBooks customer export
 * (app/api/exports/quickbooks/customers/route.ts) builds an accounting record, which wants the
 * customer's own address and not a maintenance supervisor who happens to receive the reports.
 * Folding the override into propertyContactEmail would have silently rewritten that export too.
 *
 * reportEmail wins outright when it is set -- no merging with the contact blocks and no second
 * recipient. An admin who types an address into "send reports here" has named the destination,
 * and adding the manager back in alongside would mail chemistry to someone the admin just
 * chose to route around. Widening to several recipients is a different feature with its own
 * decision to make; see CustomerContact in prisma/schema.prisma.
 */
export function propertyReportEmail(property: PropertyReportFields): string | null {
  return property.reportEmail?.trim() || propertyContactEmail(property);
}
