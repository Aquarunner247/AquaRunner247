import QRCode from "qrcode";
import { COLOR } from "@/lib/design-tokens";

/**
 * Generates a data-URL PNG QR code for the given absolute URL.
 * Used for body-of-water public log pages (scanned by SNHD inspectors).
 *
 * 512px rather than 320: the placard scales this to the full width of a card that now fills
 * most of a printed page, and an upscaled 320px PNG prints visibly soft. The extra bytes are
 * a few KB per placard, which matters only on the batch page, where sharpness on paper is
 * the entire point.
 */
export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 512,
    color: {
      // Dark navy rather than pure black: it reads as part of the brand on screen and still
      // scans, since the contrast ratio against white is 14.5:1, far past what a reader needs.
      dark: COLOR.ink,
      light: "#FFFFFF",
    },
  });
}

export function publicBodyOfWaterUrl(publicSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/p/${publicSlug}`;
}
