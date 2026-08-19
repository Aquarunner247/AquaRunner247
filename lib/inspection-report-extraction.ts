import { generateObject } from "ai";
import { z } from "zod";
import { EquipmentKind } from "@/generated/prisma/enums";

/** Claude Sonnet 5 -- confirmed against the AI Gateway's own model catalog to support
 * both `pdf` and `image` input modalities in one code path, so the same call handles a
 * digital PDF report and a photographed/scanned one without a separate conversion step.
 * Via Vercel AI Gateway (plain "provider/model" string; resolves automatically via
 * Vercel's OIDC token in production, needs AI_GATEWAY_API_KEY for local dev). */
const MODEL = "anthropic/claude-sonnet-5";

const EQUIPMENT_KIND_VALUES = Object.values(EquipmentKind) as [string, ...string[]];

/** Deliberately narrow: kind/make/model/serial only. The many kind-specific Equipment
 * columns (horsepower, vgbaYear, filterMedia, etc.) are out of scope for this pass --
 * asking the model to also classify+extract those would meaningfully raise prompt
 * complexity and error surface for comparatively low value on a first read. */
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
      }),
    )
    .describe("Every distinct piece of equipment mentioned on the report (pumps, filters, heaters, drain covers, etc.), one entry each."),
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
            ].join("\n"),
          },
          { type: "file", data: bytes, mediaType },
        ],
      },
    ],
  });
  return object;
}
