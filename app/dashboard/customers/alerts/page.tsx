import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { timeZoneForState, formatLocalDateTime } from "@/lib/timezone";
import { AlertOutcomeBadge } from "@/app/components/alert-outcome-badge";

const PAGE_SIZE = 25;

/// Query-string value -> the DB filter it applies. "unknown" covers alerts sent before
/// CustomerAlert.sendOutcome existed (see that field's own doc comment) -- there's no enum
/// value for "not tracked yet", so it's a null check instead of an enum equality.
const OUTCOME_FILTERS = {
  all: null,
  sent: "SENT",
  partial: "PARTIAL",
  failed: "FAILED",
  "no-recipients": "NO_RECIPIENTS",
  unknown: "UNSET",
} as const;
type OutcomeFilterKey = keyof typeof OUTCOME_FILTERS;

const FILTER_LABELS: Record<OutcomeFilterKey, string> = {
  all: "All",
  sent: "Delivered",
  partial: "Partially delivered",
  failed: "Failed",
  "no-recipients": "No email on file",
  unknown: "Not tracked",
};

type PageProps = {
  searchParams?: Promise<{ outcome?: string; page?: string; batch?: string }>;
};

export default async function CustomerAlertsHistoryPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const batchId = sp.batch?.trim() || null;
  const outcomeKey: OutcomeFilterKey = sp.outcome && sp.outcome in OUTCOME_FILTERS ? (sp.outcome as OutcomeFilterKey) : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  const filterValue = OUTCOME_FILTERS[outcomeKey];
  const where = {
    customer: { organizationId: appUser.organizationId },
    ...(batchId
      ? { batchId }
      : filterValue === null
        ? {}
        : filterValue === "UNSET"
          ? { sendOutcome: null }
          : { sendOutcome: filterValue }),
  };

  // A bulk send just landed here to answer "which ones failed" -- show every row from that
  // one batch, not a paginated slice, so the count in the summary line always matches what's
  // actually on screen regardless of how many customers were selected.
  const [org, total, alerts] = await Promise.all([
    prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { state: true } }),
    prisma.customerAlert.count({ where }),
    prisma.customerAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(batchId ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      select: {
        id: true,
        subject: true,
        createdAt: true,
        sendOutcome: true,
        recipientCount: true,
        failedRecipientCount: true,
        customer: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
  ]);
  const tz = timeZoneForState(org?.state);
  const totalPages = batchId ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Only meaningful in batch mode -- how many of this specific send actually delivered vs.
  // failed in some way, straight from the rows already fetched above.
  const batchFailedCount = batchId ? alerts.filter((a) => a.sendOutcome === "FAILED" || a.sendOutcome === "NO_RECIPIENTS").length : 0;
  const batchPartialCount = batchId ? alerts.filter((a) => a.sendOutcome === "PARTIAL").length : 0;
  const batchOkCount = alerts.length - batchFailedCount - batchPartialCount;

  const filterHref = (key: OutcomeFilterKey) => `/dashboard/customers/alerts${key === "all" ? "" : `?outcome=${key}`}`;
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (outcomeKey !== "all") params.set("outcome", outcomeKey);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return `/dashboard/customers/alerts${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="app-page-wide">
      <header className="app-page-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-kicker">Admin</p>
          <h1 className="app-h1">{batchId ? "Bulk send results" : "Sent alerts"}</h1>
          {batchId ? (
            <p className="app-subhead">
              {batchOkCount} of {alerts.length} delivered
              {batchPartialCount > 0 ? `, ${batchPartialCount} partially delivered` : ""}
              {batchFailedCount > 0 ? `, ${batchFailedCount} failed or had no email on file` : ""}.
            </p>
          ) : (
            <p className="app-subhead">Every customer alert sent from this account, single or bulk, across all customers.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {batchId ? (
            <Link href="/dashboard/customers/alerts" className="app-link">
              View all sent alerts
            </Link>
          ) : null}
          <Link href="/dashboard/customers" className="app-link">
            Back to customers
          </Link>
        </div>
      </header>

      {!batchId ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {(Object.keys(OUTCOME_FILTERS) as OutcomeFilterKey[]).map((key) => (
            <Link
              key={key}
              href={filterHref(key)}
              className={
                outcomeKey === key
                  ? "rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
              }
            >
              {FILTER_LABELS[key]}
            </Link>
          ))}
        </div>
      ) : null}

      {alerts.length === 0 ? (
        <p className="app-card-inset mt-6 text-sm text-brand-muted">
          {batchId ? "That batch couldn't be found." : outcomeKey === "all" ? "No alerts sent yet." : `No alerts match "${FILTER_LABELS[outcomeKey]}".`}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-brand-border/90 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Sent by</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-brand-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-brand-muted">{formatLocalDateTime(a.createdAt, tz)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/customers/${a.customer.id}?tab=overview`} className="font-medium text-brand-primary underline">
                      {a.customer.name}
                    </Link>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-brand-ink" title={a.subject}>
                    {a.subject}
                  </td>
                  <td className="px-3 py-2">
                    <AlertOutcomeBadge {...a} />
                  </td>
                  <td className="px-3 py-2 text-brand-muted">{a.createdBy?.name ?? a.createdBy?.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none text-brand-muted opacity-40" : "app-link"}
          >
            ← Newer
          </Link>
          <span className="text-brand-muted">
            Page {page} of {totalPages}
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none text-brand-muted opacity-40" : "app-link"}
          >
            Older →
          </Link>
        </div>
      ) : null}
    </main>
  );
}
