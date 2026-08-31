import { BodyOfWaterType, PropertyType } from "@/generated/prisma/enums";

/** Column headers the template ships with -- import also accepts them in any order or
 * subset (missing optional columns just mean blank values), matched case-insensitively
 * with surrounding whitespace trimmed, so a customer's own spreadsheet edits (reordering
 * columns, minor header casing) don't break the upload. */
export const CUSTOMER_IMPORT_COLUMNS = [
  "Customer Name",
  "Property Type",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Zip",
  "Manager Name",
  "Manager Business Phone",
  "Manager Mobile Phone",
  "Manager Email",
  "Maintenance Contact Name",
  "Maintenance Cell Phone",
  "Maintenance Email",
  "Owner Name",
  "Owner Mobile Phone",
  "Owner Home Phone",
  "Owner Email",
  "Access Notes",
  "Has Dog",
  "Notes",
  "Body of Water Name",
  "Body of Water Type",
  "Volume (Gallons)",
] as const;

export type CustomerImportRaw = Record<string, string>;

export type ValidatedCustomerImportRow = {
  rowNumber: number;
  errors: string[];
  name: string;
  propertyType: PropertyType;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  managerName: string | null;
  managerBusinessPhone: string | null;
  managerMobilePhone: string | null;
  managerEmail: string | null;
  maintenanceName: string | null;
  maintenanceCellPhone: string | null;
  maintenanceEmail: string | null;
  ownerName: string | null;
  ownerMobilePhone: string | null;
  ownerHomePhone: string | null;
  ownerEmail: string | null;
  accessNotes: string | null;
  hasDog: boolean;
  notes: string | null;
  bodyOfWaterName: string | null;
  bodyOfWaterType: BodyOfWaterType;
  volumeGallons: number | null;
};

function cell(raw: CustomerImportRaw, header: string): string {
  return (raw[header] ?? "").trim();
}

function orNull(value: string): string | null {
  return value || null;
}

function parseBoolean(value: string): boolean {
  return ["true", "yes", "1", "y"].includes(value.trim().toLowerCase());
}

/** A raw row as read straight off the sheet, still keyed by whatever headers that sheet
 * actually has -- not yet mapped onto our own column names. */
type SourceRow = Record<string, string>;

function get(raw: SourceRow, header: string): string {
  return (raw[header] ?? "").trim();
}

/** "FullName" + "LocationAddress" is specific enough to this export shape (a residential
 * pool-route CRM -- FullName/DisplayAsCompany/GateCode/DogsName/LaborCost/MinutesAtStop
 * are its fingerprints) that no legitimate hand-built sheet would coincidentally match it. */
function isRecognizedCrmExport(headers: string[]): boolean {
  return headers.includes("FullName") && headers.includes("LocationAddress");
}

/** Maps a recognized pool-route CRM contacts export onto our own template's column
 * names, so the rest of the pipeline (validateCustomerImportRow, the preview table, the
 * server action) never has to know a second row shape exists.
 *
 * That source format has no per-property "type" concept at all -- DisplayAsCompany (and
 * whether CompanyName is filled in) is the only signal available, so it's used to infer
 * COMMERCIAL vs RESIDENTIAL. It also has no body-of-water fields whatsoever, so rows
 * import as Customer + Property only; the admin adds each pool/spa's own details
 * afterward through the existing UI, same as an address-only customer added by hand.
 * Billing address (if present and different from the service location) and the row's
 * Status are preserved as notes rather than dropped, since nothing else in this schema
 * has a place for either -- see Customer.notes/Property.notes. */
function normalizeRecognizedCrmExportRow(raw: SourceRow): CustomerImportRaw {
  const displayAsCompany = parseBoolean(get(raw, "DisplayAsCompany")) || Boolean(get(raw, "CompanyName"));
  const propertyType = displayAsCompany ? "COMMERCIAL" : "RESIDENTIAL";

  const contactPersonName = get(raw, "FullName") || [get(raw, "FirstName"), get(raw, "LastName")].filter(Boolean).join(" ");
  const name = get(raw, "FullNameOrCompanyDisplay") || get(raw, "CompanyName") || contactPersonName;

  const locationAddress = [get(raw, "LocationAddress"), get(raw, "LocationCity"), get(raw, "LocationState"), get(raw, "LocationZip")]
    .filter(Boolean)
    .join(", ");
  const billingAddress = [get(raw, "BillingAddress"), get(raw, "BillingCity"), get(raw, "BillingState"), get(raw, "BillingZip")]
    .filter(Boolean)
    .join(", ");

  const noteParts = [get(raw, "CustomerNotes")];
  const status = get(raw, "Status");
  if (status) noteParts.push(`Status: ${status}`);
  if (billingAddress && billingAddress !== locationAddress) noteParts.push(`Billing address: ${billingAddress}`);

  const gateCode = get(raw, "GateCode");
  const dogsName = get(raw, "DogsName");
  const accessNoteParts = [gateCode && `Gate code: ${gateCode}`, dogsName && `Dog: ${dogsName}`].filter(Boolean);

  const mapped: CustomerImportRaw = {
    "Customer Name": name,
    "Property Type": propertyType,
    "Address Line 1": get(raw, "LocationAddress"),
    City: get(raw, "LocationCity"),
    State: get(raw, "LocationState"),
    Zip: get(raw, "LocationZip"),
    Notes: [...noteParts, get(raw, "LocationNotes")].filter(Boolean).join(" | "),
  };

  if (propertyType === "COMMERCIAL") {
    mapped["Manager Name"] = contactPersonName;
    mapped["Manager Business Phone"] = get(raw, "WorkPhone");
    mapped["Manager Mobile Phone"] = get(raw, "MobilePhone1");
    mapped["Manager Email"] = get(raw, "Email1");
    if (accessNoteParts.length > 0) mapped.Notes = [mapped.Notes, ...accessNoteParts].filter(Boolean).join(" | ");
  } else {
    mapped["Owner Name"] = name;
    mapped["Owner Mobile Phone"] = get(raw, "MobilePhone1");
    mapped["Owner Home Phone"] = get(raw, "HomePhone");
    mapped["Owner Email"] = get(raw, "Email1");
    mapped["Access Notes"] = accessNoteParts.join(". ");
    mapped["Has Dog"] = dogsName ? "true" : "false";
  }

  return mapped;
}

/** Entry point for turning one parsed sheet row into our own canonical column shape,
 * whatever format the sheet actually arrived in -- called once per row right after
 * parsing, before validateCustomerImportRow ever sees it. `headers` is the sheet's
 * actual header row (papaparse's `meta.fields`), checked once by the caller ideally,
 * but cheap enough to re-check per row too. */
export function normalizeImportRow(raw: SourceRow, headers: string[]): CustomerImportRaw {
  return isRecognizedCrmExport(headers) ? normalizeRecognizedCrmExportRow(raw) : raw;
}

/** Re-run server-side too (see importCustomers) -- client-side validation is a UX
 * convenience, never the trust boundary for what actually gets written. */
export function validateCustomerImportRow(raw: CustomerImportRaw, rowNumber: number): ValidatedCustomerImportRow {
  const errors: string[] = [];

  const name = cell(raw, "Customer Name");
  if (!name) errors.push("Customer Name is required");

  const propertyTypeRaw = cell(raw, "Property Type").toUpperCase();
  const propertyType = propertyTypeRaw
    ? ((Object.values(PropertyType) as string[]).includes(propertyTypeRaw) ? (propertyTypeRaw as PropertyType) : null)
    : PropertyType.COMMERCIAL;
  if (propertyType === null) errors.push(`Property Type "${propertyTypeRaw}" must be COMMERCIAL or RESIDENTIAL`);

  const bodyOfWaterName = cell(raw, "Body of Water Name");
  const bodyOfWaterTypeRaw = cell(raw, "Body of Water Type").toUpperCase().replace(/\s+/g, "_");
  const bodyOfWaterType = bodyOfWaterTypeRaw
    ? ((Object.values(BodyOfWaterType) as string[]).includes(bodyOfWaterTypeRaw) ? (bodyOfWaterTypeRaw as BodyOfWaterType) : null)
    : BodyOfWaterType.POOL;
  if (bodyOfWaterType === null) {
    errors.push(`Body of Water Type "${bodyOfWaterTypeRaw}" must be one of ${Object.values(BodyOfWaterType).join(", ")}`);
  }

  const volumeRaw = cell(raw, "Volume (Gallons)");
  let volumeGallons: number | null = null;
  if (volumeRaw) {
    const parsed = Number(volumeRaw.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`Volume (Gallons) "${volumeRaw}" must be a positive number`);
    } else {
      volumeGallons = parsed;
    }
  }

  return {
    rowNumber,
    errors,
    name,
    propertyType: propertyType ?? PropertyType.COMMERCIAL,
    addressLine1: orNull(cell(raw, "Address Line 1")),
    addressLine2: orNull(cell(raw, "Address Line 2")),
    city: orNull(cell(raw, "City")),
    region: orNull(cell(raw, "State")),
    postalCode: orNull(cell(raw, "Zip")),
    managerName: orNull(cell(raw, "Manager Name")),
    managerBusinessPhone: orNull(cell(raw, "Manager Business Phone")),
    managerMobilePhone: orNull(cell(raw, "Manager Mobile Phone")),
    managerEmail: orNull(cell(raw, "Manager Email")),
    maintenanceName: orNull(cell(raw, "Maintenance Contact Name")),
    maintenanceCellPhone: orNull(cell(raw, "Maintenance Cell Phone")),
    maintenanceEmail: orNull(cell(raw, "Maintenance Email")),
    ownerName: orNull(cell(raw, "Owner Name")),
    ownerMobilePhone: orNull(cell(raw, "Owner Mobile Phone")),
    ownerHomePhone: orNull(cell(raw, "Owner Home Phone")),
    ownerEmail: orNull(cell(raw, "Owner Email")),
    accessNotes: orNull(cell(raw, "Access Notes")),
    hasDog: parseBoolean(cell(raw, "Has Dog")),
    notes: orNull(cell(raw, "Notes")),
    bodyOfWaterName: orNull(bodyOfWaterName),
    bodyOfWaterType: bodyOfWaterType ?? BodyOfWaterType.POOL,
    volumeGallons,
  };
}
