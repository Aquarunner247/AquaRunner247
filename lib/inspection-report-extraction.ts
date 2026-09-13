import { generateObject } from "ai";
import { z } from "zod";
import { EquipmentKind } from "@/generated/prisma/enums";

/** Same model already used for the phone agent's transcript parsing (lib/phone-agent-intake.ts)
 * -- proven working on this account's Gateway tier. Originally tried anthropic/claude-sonnet-5,
 * which supports pdf/image input too, but is gated behind a paid-credits tier on the Gateway
 * ("Free tier users do not have access to this model", confirmed live in production logs) --
 * gpt-4o-mini also supports both `pdf` and `image` input modalities, so the same call still
 * handles a digital PDF report and a photographed/scanned one without a separate conversion
 * step. Via Vercel AI Gateway (plain "provider/model" string; resolves automatically via
 * Vercel's OIDC token in production, needs AI_GATEWAY_API_KEY for local dev). */
const MODEL = "openai/gpt-4o-mini";

const EQUIPMENT_KIND_VALUES = Object.values(EquipmentKind) as [string, ...string[]];

/** Mostly narrow: kind/make/model/serial, plus three fields common enough on a real report
 * to be worth the extra prompt surface -- quantity (reports routinely list "2x" the same
 * pump/valve instead of two separate line items), and heater BTU/ASME certification (both
 * already their own Equipment columns, and near-universal on a heater's data plate). Every
 * OTHER kind-specific column (horsepower, vgbaYear, filterMedia, etc.) stays out of scope
 * for this pass -- asking the model to also classify+extract those would meaningfully raise
 * prompt complexity and error surface for comparatively low value on a first read. */
const inspectionReportSchema = z.object({
  inspectorName: z.string().nullable().describe("The inspector's name, if stated on the report."),
  inspectionDate: z.string().nullable().describe("The date of this inspection, as an ISO 8601 date (YYYY-MM-DD), if stated."),
  volumeGallons: z.number().nullable().describe("The body of water's total volume in gallons, if stated."),
  maximumOccupancy: z.number().nullable().describe("The maximum bather load / occupancy, if stated."),
  equipment: z
    .array(
      z.object({
        kind: z.enum(EQUIPMENT_KIND_VALUES).describe("Best-fit equipment category -- use OTHER if none of the listed kinds fit."),
        make: z.string().nullable(),
        model: z.string().nullable(),
        serialNumber: z.string().nullable(),
        quantity: z
          .number()
          .int()
          .nullable()
          .describe(
            "How many of this exact same item (same kind, make, and model) the report accounts for. If the report lists an identical item more than once, or states a count like '2 pumps' or 'qty: 3', report it as ONE entry with quantity set to that count -- never repeat an identical item as separate entries. Null (treated as 1) if the report doesn't state a count and only one is implied.",
          ),
        btu: z.number().nullable().describe("Heater BTU rating, if stated. Null for non-heaters or if not stated."),
        asmeCertified: z
          .boolean()
          .nullable()
          .describe("Whether the report notes this is an ASME-certified pressure vessel (heaters). Null if not mentioned."),
      }),
    )
    .describe(
      "Every DISTINCT piece of equipment mentioned on the report (pumps, filters, heaters, drain covers, etc.), one entry each -- " +
        "group identical repeated items into a single entry with `quantity` set instead of listing duplicates.",
    ),
});

export type ExtractedInspectionData = z.infer<typeof inspectionReportSchema>;

/**
 * Reads a pool/spa inspection report (PDF or image, as raw bytes) and extracts inspector
 * name, inspection date, volume, occupancy, and an equipment list. No try/catch here --
 * throws on failure exactly like parseCallTranscript does; the caller (the extract Route
 * Handler) is responsible for catching and returning a client-safe error.
 *
 * `model` defaults to the real AI Gateway model and is only ever overridden in tests (a
 * MockLanguageModel from ai/test), so production call sites never need to pass it.
 */
export async function extractInspectionReportData(
  bytes: Uint8Array,
  mediaType: string,
  model: Parameters<typeof generateObject>[0]["model"] = MODEL,
): Promise<ExtractedInspectionData> {
  const { object } = await generateObject({
    model,
    schema: inspectionReportSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "This is a pool/spa inspection report from a health department or similar regulatory body.",
              "Extract the fields below. If a field genuinely isn't stated on the report, use null rather than guessing or inventing a plausible-sounding value.",
              "List every distinct piece of equipment mentioned (pumps, filters, heaters, chlorinators, drain covers, valves, etc.) as its own entry, even if some details for that item are missing.",
              "If the report lists more than one of the exact same item (same kind, make, and model) -- either as separate repeated lines or as a stated count -- report it as ONE entry with `quantity` set to that count, not as multiple duplicate entries.",
              "For heaters, also extract the BTU rating and whether the report notes it as ASME-certified, if stated.",
            ].join("\n"),
          },
          { type: "file", data: bytes, mediaType },
        ],
      },
    ],
  });
  return object;
}
