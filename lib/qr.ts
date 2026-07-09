import QRCode from "qrcode";

/**
 * Generates a data-URL PNG QR code for the given absolute URL.
 * Used for body-of-water public log pages (scanned by SNHD inspectors).
 */
export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 320,
    color: {
      dark: "#12234A",
      light: "#FFFFFF",
    },
  });
}

export function publicBodyOfWaterUrl(publicSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/p/${publicSlug}`;
}
