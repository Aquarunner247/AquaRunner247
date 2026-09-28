import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { applyServiceMessagePlaceholders } from "@/lib/default-service-messages";
import { createServiceMessage, moveServiceMessage, toggleServiceMessage, updateServiceMessage } from "./actions";

type PageProps = {
  searchParams?: Promise<{ saved?: string; edit?: string }>;
};

export default async function ServiceMessagesPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};

  const [org, messages] = await Promise.all([
    prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { name: true } }),
    prisma.serviceMessageTemplate.findMany({
      where: { organizationId: appUser.organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const orgName = org?.name ?? "your company";
  const activeCount = messages.filter((m) => m.active).length;

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Service messages</h1>
        <p className="app-subhead">
          A technician picks one of these when completing a visit, and it goes out in the customer&rsquo;s service summary
          email. Write <code className="app-code">{"{{orgName}}"}</code> anywhere you want your company name.
        </p>
        <Link href="/dashboard/settings" className="app-link mt-2 inline-block text-sm">
          ← Company settings
        </Link>
      </header>

      {sp.saved ? <p className="mt-4 text-sm text-brand-ok">Saved.</p> : null}

      {activeCount === 0 ? (
        <section className="app-card mt-4 border-l-4 border-l-brand-warn">
          <p className="text-sm font-semibold text-brand-ink">No active messages</p>
          <p className="mt-1 text-sm text-brand-ink">
            With none active, technicians aren&rsquo;t asked to pick one and their service emails go out without a
            message. Completion is never blocked by this — a technician on a jobsite should never be stuck waiting on a
            setting.
          </p>
        </section>
      ) : null}

      <section className="mt-4 space-y-3">
        {messages.map((msg, index) => (
          <div key={msg.id} className={`app-card ${msg.active ? "" : "opacity-70"}`}>
            {sp.edit === msg.id ? (
              <form action={updateServiceMessage} className="space-y-2">
                <input type="hidden" name="id" value={msg.id} />
                <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  Label (technicians see this)
                  <input name="label" defaultValue={msg.label} required maxLength={80} className="app-field mt-1" />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  Message (the customer receives this)
                  <textarea name="body" defaultValue={msg.body} required maxLength={600} rows={4} className="app-field mt-1" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="app-btn-primary-sm">
                    Save changes
                  </button>
                  <Link href="/dashboard/settings/service-messages" className="app-btn-secondary-sm">
                    Cancel
                  </Link>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-ink">
                      {msg.label}
                      {!msg.active ? <span className="app-badge ml-2">Inactive</span> : null}
                    </p>
                    {/* Rendered as the customer will actually see it, placeholders resolved -- a
                        raw {{orgName}} in a preview is how a template ships untested. */}
                    <p className="mt-1 text-sm text-brand-ink">
                      {applyServiceMessagePlaceholders(msg.body, { orgName })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <form action={moveServiceMessage}>
                      <input type="hidden" name="id" value={msg.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" disabled={index === 0} className="app-btn-secondary-sm disabled:opacity-40" aria-label="Move up">
                        ↑
                      </button>
                    </form>
                    <form action={moveServiceMessage}>
                      <input type="hidden" name="id" value={msg.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={index === messages.length - 1}
                        className="app-btn-secondary-sm disabled:opacity-40"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </form>
                    <Link href={`/dashboard/settings/service-messages?edit=${msg.id}`} className="app-btn-secondary-sm">
                      Edit
                    </Link>
                    <form action={toggleServiceMessage}>
                      <input type="hidden" name="id" value={msg.id} />
                      <button type="submit" className="app-btn-secondary-sm">
                        {msg.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      <form action={createServiceMessage} className="app-card mt-4">
        <p className="text-sm font-semibold text-brand-ink">Add a message</p>
        <div className="mt-2 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
            Label (technicians see this)
            <input name="label" required maxLength={80} placeholder="e.g. Heavy debris — extra clearing needed" className="app-field mt-1" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-brand-muted">
            Message (the customer receives this)
            <textarea
              name="body"
              required
              maxLength={600}
              rows={4}
              placeholder={`Service completed. Thank you for trusting {{orgName}}…`}
              className="app-field mt-1"
            />
          </label>
        </div>
        <button type="submit" className="app-btn-primary-sm mt-2">
          Add message
        </button>
      </form>
    </main>
  );
}
