type BodyQrCodeProps = {
  bodyName: string;
  dataUrl: string;
  publicUrl: string;
};

export function BodyQrCode({ bodyName, dataUrl, publicUrl }: BodyQrCodeProps) {
  const fileSafeName = bodyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 rounded border border-[#C9E3EC] bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR code for ${bodyName} public log`} className="h-24 w-24 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0A5FA4]">Inspector QR code</p>
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block truncate text-sm text-[#12234A] underline decoration-[#C9E3EC] underline-offset-2 hover:decoration-[#0A5FA4]"
        >
          {publicUrl}
        </a>
        <a
          href={dataUrl}
          download={`${fileSafeName}-qr-code.png`}
          className="mt-2 inline-block rounded-md border border-[#0A5FA4] px-3 py-1 text-xs font-semibold text-[#0A5FA4] hover:bg-[#0A5FA4]/5"
        >
          Download QR image
        </a>
      </div>
    </div>
  );
}
