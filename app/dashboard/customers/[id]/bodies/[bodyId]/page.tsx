import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BodyOfWaterType, EquipmentKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { BodyQrCode } from "@/app/components/body-qr-code";
import {
  updateBodyOfWater,
  deleteBodyOfWater,
  createEquipment,
  deleteEquipment,
} from "../../actions";

type PageProps = {
  params: Promise<{ id: string; bodyId: string }>;
};

export default async function BodyOfWaterDetailPage({ params }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { id: customerId, bodyId } = await params;

  const body = await prisma.bodyOfWater.findFirst({
    where: {
      id: bodyId,
      property: { organizationId: appUser.organizationId, customerId },
    },
    include: {
      property: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
      equipment: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!body) notFound();

  const publicUrl = publicBodyOfWaterUrl(body.publicSlug);
  const dataUrl = await generateQrDataUrl(publicUrl);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-slate-500">
        <Link href="/dashboard/customers" className="underline">
          Customers
        </Link>
        {" / "}
        <Link href={`/dashboard/customers/${customerId}`} className="underline">
          {body.property.customer?.name ?? body.property.name}
        </Link>
        {" / "}
        <span>{body.name}</span>
      </div>

      <header className="mt-2 border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">{body.property.name}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{body.name}</h1>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <BodyQrCode bodyName={body.name} dataUrl={dataUrl} publicUrl={publicUrl} />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Body details</h2>
        <form action={updateBodyOfWater} className="mt-3 space-y-2">
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <div className="grid gap-2 md:grid-cols-4">
            <input
              name="name"
              defaultValue={body.name}
              required
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <select name="type" defaultValue={body.type} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {Object.values(BodyOfWaterType).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              name="volumeGallons"
              type="number"
              step="1"
              defaultValue={body.volumeGallons?.toString() ?? ""}
              placeholder="Total gallons"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="maximumOccupancy"
              type="number"
              step="1"
              defaultValue={body.maximumOccupancy?.toString() ?? ""}
              placeholder="Max occupancy"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Save body
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Equipment</h2>
        {body.equipment.length ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {body.equipment.map((eq) => (
              <li
                key={eq.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
              >
                <span>
                  {eq.kind}
                  {eq.make ? ` • ${eq.make}` : ""}
                  {eq.model ? ` ${eq.model}` : ""}
                  {eq.serialNumber ? ` • SN ${eq.serialNumber}` : ""}
                  {eq.pipeSize ? ` • Pipe ${eq.pipeSize}` : ""}
                  {eq.numberOfPorts ? ` • ${eq.numberOfPorts} port${eq.numberOfPorts === 1 ? "" : "s"}` : ""}
                  {eq.lastServicedAt ? ` • Last serviced ${new Date(eq.lastServicedAt).toLocaleDateString()}` : ""}
                </span>
                <form action={deleteEquipment}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="equipmentId" value={eq.id} />
                  <ConfirmSubmitButton
                    label="Delete"
                    confirmMessage="Delete this equipment item?"
                    className="rounded bg-rose-700 px-2 py-1 text-xs font-medium text-white"
                  />
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No equipment yet.</p>
        )}

        <form action={createEquipment} className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="bodyId" value={body.id} />
          <div className="grid gap-2 md:grid-cols-4">
            <select name="kind" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {Object.values(EquipmentKind).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input name="make" placeholder="Make" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="model" placeholder="Model" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="serialNumber" placeholder="Serial #" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-4">
            <input name="pipeSize" placeholder="Pipe size (e.g. 2 in)" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input
              name="numberOfPorts"
              type="number"
              step="1"
              placeholder="# of ports"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500">Last changed / fixed</label>
              <input
                name="lastServicedAt"
                type="date"
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Add equipment
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
        <form action={deleteBodyOfWater}>
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <ConfirmSubmitButton
            label="Delete body of water"
            confirmMessage="Delete this body of water and all its equipment/history?"
            className="rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white"
          />
        </form>
      </section>

      <div className="mt-6">
        <Link href={`/dashboard/customers/${customerId}?tab=bodies`} className="text-sm text-[#0A5FA4] underline">
          ← Back to {body.property.customer?.name ?? body.property.name}
        </Link>
      </div>
    </main>
  );
}
