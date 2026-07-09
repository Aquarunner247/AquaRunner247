"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function resolveIssue(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN" && appUser.role !== "OFFICE") redirect("/dashboard");

  const issueId = String(formData.get("issueId") ?? "").trim();
  if (!issueId) return;

  const issue = await prisma.visitIssueFlag.findFirst({
    where: { id: issueId, visit: { organizationId: appUser.organizationId } },
    select: { id: true },
  });
  if (!issue) return;

  await prisma.visitIssueFlag.update({
    where: { id: issue.id },
    data: { resolved: true, resolvedAt: new Date() },
  });

  revalidatePath("/dashboard");
}
