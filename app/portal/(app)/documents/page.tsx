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
      <header className="border-b border-brand-border pb-5">
        <p className="text-sm font-medium text-brand-ink">Customer Portal</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Documents</h1>
        <p className="mt-1 text-sm text-brand-muted">Inspection reports, contracts, and other files.</p>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        {documentsWithUrls.length ? (
          <ul className="space-y-1 text-sm text-brand-ink">
            {documentsWithUrls.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-border bg-brand-surface px-2 py-1.5"
              >
                <span>
                  {doc.url ? (
                    <a href={doc.url} target="_blank" rel="noreferrer" className="font-medium text-brand-primary underline">
                      {doc.label}
                    </a>
                  ) : (
                    <span className="font-medium text-brand-ink">{doc.label}</span>
                  )}
                  <span className="ml-2 text-xs text-brand-muted">{doc.createdAt.toLocaleDateString()}</span>
                </span>
                <form action={deleteDocumentAsCustomer}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <ConfirmSubmitButton
                    label="🗑"
                    confirmMessage={`Delete "${doc.label}"?`}
                    className="rounded px-2 py-1 text-base hover:bg-brand-border"
                  />
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-muted">No documents yet.</p>
        )}

        <form action={uploadDocumentAsCustomer} className="mt-3 flex flex-wrap items-end gap-2 rounded border border-brand-border bg-brand-surface p-2">
          <input
            name="label"
            placeholder="Label (e.g. Pool Contract)"
            className="rounded border border-brand-control px-2 py-1.5 text-sm"
          />
          <input type="file" name="file" required className="text-sm" />
          <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Upload
          </button>
        </form>
      </section>
    </main>
  );
}
