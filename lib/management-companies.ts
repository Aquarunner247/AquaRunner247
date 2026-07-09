import { prisma } from "@/lib/prisma";

/**
 * Resolves a management company id from either an existing selection or a
 * freshly typed new name. If newName is provided, it's created (or matched
 * to an existing company with the same name) and that id is used. Otherwise
 * the selectedId is validated against the org and used as-is.
 */
export async function resolveManagementCompanyId(
  organizationId: string,
  selectedId: string,
  newName: string,
): Promise<string | null> {
  const trimmedNew = newName.trim();
  if (trimmedNew) {
    const company = await prisma.managementCompany.upsert({
      where: { organizationId_name: { organizationId, name: trimmedNew } },
      create: { organizationId, name: trimmedNew },
      update: {},
      select: { id: true },
    });
    return company.id;
  }

  if (selectedId) {
    const company = await prisma.managementCompany.findFirst({
      where: { id: selectedId, organizationId },
      select: { id: true },
    });
    return company?.id ?? null;
  }

  return null;
}
