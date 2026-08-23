import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { buildComplianceArchive } from "@/lib/compliance-archive";

export const runtime = "nodejs";

/** Self-serve "export my data" -- any admin can download all of their org's compliance
 * records at any time, or narrow to a date range, with no Vercel Blob involved: this is
 * a direct synchronous download, same convention as the CSV export at
 * app/api/qr/[slug]/export/route.ts. */
export async function GET(req: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((fromParam && Number.isNaN(from?.getTime())) || (toParam && Number.isNaN(to?.getTime()))) {
    return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
  }

  const envelope = await buildComplianceArchive({ organizationId: appUser.organizationId, from, to });

  const fileSafeDate = new Date().toISOString().slice(0, 10);
  const rangeLabel = from || to ? `-${fromParam ?? "start"}-to-${toParam ?? "now"}` : "-all-time";

  return new NextResponse(JSON.stringify(envelope, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-export${rangeLabel}-${fileSafeDate}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
