"use client";

import { useState } from "react";
import { UserRole } from "@/generated/prisma/client";

/** Same UI-only value as CUSTOMER_ROLE_VALUE in app/dashboard/users/actions.ts -- not a
 * real UserRole, kept as a plain string constant here since this is a client component
 * and can't import server-only code. */
const CUSTOMER_ROLE_VALUE = "CUSTOMER";

type CustomerOption = { id: string; name: string };

/**
 * The role-dependent part of the "Add user" form on the Users page. Staff roles
 * (Admin/Office/Technician) get a phone field; choosing Customer swaps it for a picker
 * of the org's existing customers, since a Customer "user" is really a CustomerUser
 * portal login attached to one of them, not a staff User with a role. name/email/
 * password stay in the parent form since both flows need them identically.
 */
export function AddUserFormFields({ customers }: { customers: CustomerOption[] }) {
  const [role, setRole] = useState<string>(UserRole.TECHNICIAN);
  const isCustomer = role === CUSTOMER_ROLE_VALUE;

  return (
    <>
      <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="app-field">
        {Object.values(UserRole).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={CUSTOMER_ROLE_VALUE}>CUSTOMER</option>
      </select>

      {isCustomer ? (
        <select name="customerId" required defaultValue="" className="app-field">
          <option value="" disabled>
            {customers.length ? "Select customer account" : "No customers yet — add one under Customers first"}
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <input name="phone" placeholder="Phone" className="app-field" />
      )}
    </>
  );
}
