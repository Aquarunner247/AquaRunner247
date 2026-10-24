/**
 * The actual placard visual, extracted so the single-body public page
 * (app/p/[publicSlug]/placard/page.tsx) and the admin batch-print view
 * (app/dashboard/customers/placards/print/page.tsx) render an identical placard instead
 * of two copies of the same markup that could drift -- including the print:* overrides
 * that make it black-and-white on paper while keeping the on-screen preview in brand color.
 *
 * Read posted at a pool, from a few feet away, by an inspector who needs to confirm they are
 * looking at the right venue's placard before they scan it. So the property and aquatic venue
 * names lead at display size, and what the code is FOR is stated plainly above it rather than
 * left to a small line underneath.
 *
 * Each placard prints on its own page (the batch view puts a break after every card), so the
 * card is sized to use that page rather than to sit politely in a column.
 */
export function PlacardCard({ propertyName, bodyName, qrDataUrl }: { propertyName: string; bodyName: string; qrDataUrl: string }) {
  return (
    <div className="w-full max-w-md rounded-sm border-t-[6px] border-brand-anchor bg-white p-6 shadow-softLg print:shadow-none print:border print:border-t-[6px] print:border-black print:border-t-black">
      {/* The venue identity, at the size the whole placard exists to be read at. `break-words`
          because a property name is free text and "Borgata Condominiums & Spa" must wrap
          rather than push the card wide and clip the QR. */}
      <p className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-brand-ink break-words print:text-black sm:text-[2.75rem]">
        {propertyName}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold leading-tight text-brand-primary break-words print:text-black">
        {bodyName}
      </p>

      <p className="mt-5 border-t border-brand-border pt-4 text-base font-bold uppercase leading-snug tracking-wide text-brand-ink print:border-black print:text-black">
        Scan for state compliance reading logs
      </p>

      <div className="mt-3 aspect-square w-full border border-brand-border bg-white p-3 print:border-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR code for ${bodyName} public log`} className="h-full w-full" />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-brand-muted print:text-black">
        No login needed — opens the current, complete record for this aquatic venue.
      </p>
    </div>
  );
}
