import { NextResponse } from "next/server";
import QRCode from "qrcode";

type RouteCtx = {
  params: Promise<{ slug: string }>;
};

export async function GET(_req: Request, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const target = `${appUrl}/p/${encodeURIComponent(slug)}`;

  const svg = await QRCode.toString(target, {
    type: "svg",
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
