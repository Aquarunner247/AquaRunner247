import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

/**
 * Proxies Nominatim's address search so the browser never calls it directly (avoids CORS
 * issues and keeps the required User-Agent header server-side). Used to power live
 * address-suggestion dropdowns while typing, so admins don't have to separately geocode.
 */
function userAgent(): string {
  return process.env.NOMINATIM_USER_AGENT || "AquaRunner24-7Pro/1.0 (internal route tool)";
}

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    state?: string;
    postcode?: string;
  };
};

export async function GET(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 5) return NextResponse.json({ suggestions: [] });

  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`;

  const response = await fetch(url, { headers: { "User-Agent": userAgent() } });
  if (!response.ok) return NextResponse.json({ suggestions: [] });

  const data = (await response.json()) as NominatimResult[];

  const suggestions = data
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        label: item.display_name,
        latitude,
        longitude,
        addressLine1: [item.address?.house_number, item.address?.road].filter(Boolean).join(" "),
        city: item.address?.city || item.address?.town || item.address?.village || item.address?.hamlet || "",
        region: item.address?.state || "",
        postalCode: item.address?.postcode || "",
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return NextResponse.json({ suggestions });
}
