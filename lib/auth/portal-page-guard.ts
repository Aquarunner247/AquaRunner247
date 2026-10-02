import "server-only";
import { redirect } from "next/navigation";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { canOpenPortalPath, portalHomePath } from "@/lib/portal-access";
import type { CustomerUser } from "@/generated/prisma/client";

/**
 * The current portal login, if it is allowed to open this page.
 *
 * Each page passes its own path as a literal, because the gate has to run on the server and a server
 * component cannot read the pathname. The portal layout would be the tidier home for it, but a layout
 * does not know which page it is wrapping either -- and middleware, the usual answer, would mean a
 * database read on every request to resolve the login's role, which this app's connection budget does
 * not have room for (see lib/prisma.ts).
 *
 * So it is one line per page, visible in the page it protects. A page that forgets to call it is open
 * to a maintenance login, which is why lib/portal-access.ts keeps the list of allowed paths in one
 * place and the nav is built from that same list -- a new page is hidden from the nav by default rather
 * than shown by default.
 */
export async function requirePortalPage(pathname: string): Promise<CustomerUser> {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login?error=no-access");
  if (!canOpenPortalPath(customerUser.role, pathname)) redirect(portalHomePath(customerUser.role));
  return customerUser;
}
