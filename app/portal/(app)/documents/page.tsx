import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CUSTOMER_DOCUMENTS_BUCKET } from "@/lib/customer-documents";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { uploadDocumentAsCustomer, deleteDocumentAsCustomer } from "../../actions";

export default async function PortalDocumentsPage() {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const documents = await prisma.customerDocument.findMany({
    where: { customerId: customerUser.customerId },
    orderBy: { createdAt: "desc" },
  });

  const documentsWithUrls = await (async () => {
    if (!documents.length) return [];
    const supabaseAdmin = createSupabaseAdminClient();
    return Promise.all(
      documents.map(async (doc) => {
        const { data } = await supabaseAdmin.storage.from(CUSTOMER_DOCUMENTS_BUCKET).createSignedUrl(doc.storagePath, 3600);
        return { ...doc, url: data?.signedUrl ?? null };
      }),
    );
  })();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-[#12234A]">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-600">Inspection reports, contracts, and other files.</p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {documentsWithUrls.length ? (
          <ul className="space-y-1 text-sm text-slate-700">
            {documentsWithUrls.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
              >
                <span>
                  {doc.url ? (
                    <a href={doc.url} target="_blank" rel="noreferrer" className="font-medium text-[#0A5FA4] underline">
                      {doc.label}
                    </a>
                  ) : (
                    <span className="font-medium text-slate-900">{doc.label}</span>
                  )}
                  <span className="ml-2 text-xs text-slate-500">{doc.createdAt.toLocaleDateString()}</span>
                </span>
                <form action={deleteDocumentAsCustomer}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <ConfirmSubmitButton
                    label="🗑"
                    confirmMessage={`Delete "${doc.label}"?`}
                    className="rounded px-2 py-1 text-base hover:bg-slate-200"
                  />
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No documents yet.</p>
        )}

        <form action={uploadDocumentAsCustomer} className="mt-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-2">
          <input
            name="label"
            placeholder="Label (e.g. Pool Contract)"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input type="file" name="file" required className="text-sm" />
          <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Upload
          </button>
        </form>
      </section>
    </main>
  );
}
