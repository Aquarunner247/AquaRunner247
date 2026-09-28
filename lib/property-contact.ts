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
