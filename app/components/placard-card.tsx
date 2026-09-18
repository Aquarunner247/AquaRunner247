/**
 * The actual placard visual, extracted so the single-body public page
 * (app/p/[publicSlug]/placard/page.tsx) and the admin batch-print view
 * (app/dashboard/customers/placards/print/page.tsx) render an identical placard instead
 * of two copies of the same markup that could drift -- including the print:* overrides
 * that make it black-and-white on paper (see that commit's own reasoning) while keeping
 * the on-screen preview in brand teal.
 */
export function PlacardCard({ propertyName, bodyName, qrDataUrl }: { propertyName: string; bodyName: string; qrDataUrl: string }) {
  return (
    <div className="w-full max-w-sm rounded-sm border-t-[6px] border-brand-anchor bg-white p-6 shadow-softLg print:shadow-none print:border print:border-t-[6px] print:border-black print:border-t-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-2xl font-bold leading-none tracking-tight text-brand-ink print:text-black">{propertyName}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-brand-muted print:text-black">{bodyName}</p>
        </div>
        <span className="whitespace-nowrap border border-brand-border px-2 py-1 text-[0.62rem] font-bold uppercase tracking-widest text-brand-muted print:border-black print:text-black">
          Scan me
        </span>
      </div>
      <div className="mt-4 aspect-square w-full border border-brand-border bg-white p-3 print:border-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR code for ${bodyName} public log`} className="h-full w-full" />
      </div>
      <p className="mt-4 border-t border-brand-border pt-3 text-sm leading-relaxed text-brand-muted print:border-black print:text-black">
        Scan to view the current, complete record for this pool — no login needed.
      </p>
    </div>
  );
}
