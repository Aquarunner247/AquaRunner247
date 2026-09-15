"use client";

import Link from "next/link";
import { useState } from "react";

type Customer = {
  id: string;
  name: string;
  relationshipEndedAt: Date | null;
  properties: {
    id: string;
    city: string | null;
    region: string | null;
    managementCompany: { name: string } | null;
    bodiesOfWater: { id: string }[];
  }[];
};

type Group = { letter: string; customers: Customer[] };

/**
 * The customers list, plus an opt-in "bulk email" mode: a toggle reveals a checkbox next
 * to every active customer, and once at least one is checked, a compose panel lets an admin
 * send one subject/message to all of them -- but as individual emails (sendBulkCustomerAlert
 * -> sendAlertToCustomer per customer), never as one message with everyone in To/Cc. Ended
 * relationships get a disabled checkbox, matching that they can't receive alerts at all
 * (same restriction the single-customer "Send alert" form already enforces).
 */
export function CustomerBulkList({
  groups,
  sendBulkCustomerAlert,
}: {
  groups: Group[];
  sendBulkCustomerAlert: (formData: FormData) => void;
}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  function handleCheckboxChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedCount((c) => (e.target.checked ? c + 1 : c - 1));
  }

  function exitBulkMode() {
    setBulkMode(false);
    setSelectedCount(0);
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {bulkMode ? (
          <button type="button" onClick={exitBulkMode} className="app-btn-secondary-sm">
            Cancel
          </button>
        ) : (
          <button type="button" onClick={() => setBulkMode(true)} className="app-btn-secondary-sm">
            Email selected customers
          </button>
        )}
      </div>

      <form action={sendBulkCustomerAlert} className="space-y-6">
        {groups.map((group) => (
          <div key={group.letter}>
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">{group.letter}</p>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              {group.customers.map((customer) => {
                const isEnded = !!customer.relationshipEndedAt;
                const property = customer.properties[0];
                const venueCount = customer.properties.reduce((sum, p) => sum + p.bodiesOfWater.length, 0);
                return (
                  <div key={customer.id} className="flex items-center gap-2">
                    {bulkMode ? (
                      <input
                        type="checkbox"
                        name="customerIds"
                        value={customer.id}
                        disabled={isEnded}
                        onChange={handleCheckboxChange}
                        aria-label={isEnded ? `${customer.name} — relationship ended, can't email` : `Select ${customer.name}`}
                        title={isEnded ? "Relationship ended — can't send alerts" : undefined}
                        className="h-5 w-5 shrink-0 rounded border-brand-control disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    ) : null}
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-brand-border/90 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-soft"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-foam font-[family-name:var(--font-display)] text-sm font-bold text-brand-primary">
                        {customer.name.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-brand-ink group-hover:text-brand-ink">{customer.name}</p>
                        <p className="mt-0.5 truncate text-xs text-brand-muted">
                          {property?.managementCompany ? `${property.managementCompany.name} · ` : ""}
                          {[property?.city, property?.region].filter(Boolean).join(", ") || "No address on file"}
                        </p>
                      </div>
                      {isEnded ? (
                        <span className="app-badge shrink-0 bg-brand-border text-brand-muted">Ended</span>
                      ) : (
                        <span className="app-badge shrink-0">
                          {venueCount} venue{venueCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {bulkMode ? (
          <div className="sticky bottom-4 rounded-xl border border-brand-border bg-white p-4 shadow-soft">
            <p className="text-sm font-semibold text-brand-ink">
              {selectedCount} customer{selectedCount === 1 ? "" : "s"} selected
            </p>
            <p className="mt-1 text-xs text-brand-muted">
              Sends the same message to each customer individually — everyone gets their own email, not one message with
              every recipient included.
            </p>
            <div className="mt-3 grid gap-2">
              <input name="subject" required placeholder="Subject" className="app-field" />
              <textarea name="message" required rows={3} placeholder="Message" className="app-field" />
            </div>
            <button type="submit" disabled={selectedCount === 0} className="app-btn-primary-sm mt-3">
              Send to {selectedCount || "0"} customer{selectedCount === 1 ? "" : "s"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
