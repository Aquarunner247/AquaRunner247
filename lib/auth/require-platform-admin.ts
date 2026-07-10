import { redirect } from "next/navigation";
import { getCurrentAppUser } from "./current-app-user";

export async function requirePlatformAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!appUser.isPlatformAdmin) redirect("/dashboard");
  return appUser;
}
