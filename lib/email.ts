import { Resend } from "resend";

type ReadingSummary = {
  ph: number | null;
  freeChlorinePpm: number | null;
  alkalinityPpm: number | null;
  cyanuricAcidPpm: number | null;
  temperatureF: number | null;
  backwashAt: Date | null;
};

type DoseSummary = { productName: string; quantity: number; unit: string };

type ServiceSummaryEmailInput = {
  to: string;
  propertyName: string;
  bodyOfWaterName: string;
  technicianName: string | null;
  completedAt: Date;
  reading: ReadingSummary | null;
  doses: DoseSummary[];
  checklistLabels: string[];
  techNotes: string | null;
};

function fmt(n: number | null, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

export async function sendServiceSummaryEmail(input: ServiceSummaryEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set — email not sent." };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(apiKey);

  const dateStr = input.completedAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const timeStr = input.completedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #12234A;">
      <div style="background:#12234A; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <p style="color:#4FCADC; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">Service Summary</p>
        <h1 style="color:white; font-size:20px; margin:6px 0 0;">${input.propertyName} — ${input.bodyOfWaterName}</h1>
        <p style="color:#A9D3E0; font-size:13px; margin:6px 0 0;">${dateStr} at ${timeStr}</p>
      </div>
      <div style="border:1px solid #C9E3EC; border-top:none; padding: 20px 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size:14px; margin:0 0 12px;">Technician: <strong>${input.technicianName ?? "—"}</strong></p>

        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
          <tr><td style="padding:4px 0; color:#4A6572;">Free Chlorine</td><td style="text-align:right;">${fmt(input.reading?.freeChlorinePpm ?? null)} ppm</td></tr>
          <tr><td style="padding:4px 0; color:#4A6572;">pH</td><td style="text-align:right;">${fmt(input.reading?.ph ?? null)}</td></tr>
          <tr><td style="padding:4px 0; color:#4A6572;">Total Alkalinity</td><td style="text-align:right;">${fmt(input.reading?.alkalinityPpm ?? null, 0)} ppm</td></tr>
          <tr><td style="padding:4px 0; color:#4A6572;">Cyanuric Acid</td><td style="text-align:right;">${fmt(input.reading?.cyanuricAcidPpm ?? null, 0)} ppm</td></tr>
          <tr><td style="padding:4px 0; color:#4A6572;">Water Temperature</td><td style="text-align:right;">${fmt(input.reading?.temperatureF ?? null, 0)}°F</td></tr>
          <tr><td style="padding:4px 0; color:#4A6572;">Backwash</td><td style="text-align:right;">${input.reading?.backwashAt ? "Yes" : "No"}</td></tr>
        </table>

        ${
          input.doses.length
            ? `<p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Chemicals added</p>
               <ul style="font-size:14px; margin:0 0 16px; padding-left:18px;">
                 ${input.doses.map((d) => `<li>${d.productName}: ${d.quantity} ${d.unit}</li>`).join("")}
               </ul>`
            : ""
        }

        ${
          input.checklistLabels.length
            ? `<p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Service checklist completed</p>
               <p style="font-size:14px; margin:0 0 16px;">${input.checklistLabels.join(", ")}</p>`
            : ""
        }

        ${
          input.techNotes
            ? `<p style="font-size:13px; font-weight:bold; margin:0 0 4px;">Notes</p>
               <p style="font-size:14px; margin:0 0 16px; white-space:pre-wrap;">${input.techNotes}</p>`
            : ""
        }

        <p style="font-size:12px; color:#7FA0AC; margin-top:20px; border-top:1px solid #C9E3EC; padding-top:12px;">
          This is an automated summary from AquaRunner 24/7 Pro.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: `Service Summary — ${input.propertyName} — ${input.bodyOfWaterName} — ${dateStr}`,
      html,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}
