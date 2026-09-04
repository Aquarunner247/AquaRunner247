/** Every Property field that can hold a phone number, in the order checked. First match
 * wins -- deterministic, not "most likely correct" (a caller number could coincidentally
 * appear on two properties; this just needs to be stable and testable). */
export const PROPERTY_PHONE_FIELDS = [
  "managerBusinessPhone",
  "managerMobilePhone",
  "managerPhone",
  "maintenanceCellPhone",
  "ownerMobilePhone",
  "ownerHomePhone",
] as const;

export type PropertyPhoneField = (typeof PROPERTY_PHONE_FIELDS)[number];

export type PropertyPhoneCandidate = {
  id: string;
  name: string;
  customerId: string | null;
  customer: { name: string } | null;
} & Record<PropertyPhoneField, string | null>;

export type PhoneMatch = {
  propertyId: string;
  propertyName: string;
  customerId: string | null;
  customerName: string | null;
  matchedField: PropertyPhoneField;
};

/** Strips everything but digits and keeps the last 10 -- matches the US-only,
 * 10-digit-capped convention `formatPhone` already enforces on entry
 * (app/components/phone-input.tsx) and Twilio's E.164 From/To (e.g. "+17025551234").
 * Returns null for anything with fewer than 10 digits left -- can't be a real US number,
 * and null never accidentally matches another null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Pure matcher -- given a caller number and a list of candidate properties (the caller
 * is responsible for scoping candidates to one organization first), returns the first
 * phone-field match. Deliberately dependency-free (no Prisma import in this file) so
 * it's unit-testable without a database -- see findPropertyByCallerNumber in
 * lib/phone-agent-flow.ts for the Prisma-backed caller. */
export function matchCallerToProperty(callerNumber: string, candidates: PropertyPhoneCandidate[]): PhoneMatch | null {
  const normalizedCaller = normalizePhone(callerNumber);
  if (!normalizedCaller) return null;

  for (const property of candidates) {
    for (const field of PROPERTY_PHONE_FIELDS) {
      if (normalizePhone(property[field]) === normalizedCaller) {
        return {
          propertyId: property.id,
          propertyName: property.name,
          customerId: property.customerId,
          customerName: property.customer?.name ?? null,
          matchedField: field,
        };
      }
    }
  }
  return null;
}
