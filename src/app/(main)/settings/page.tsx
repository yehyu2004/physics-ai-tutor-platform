import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/impersonate";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const session = await getEffectiveSession();
  if (!session?.user) redirect("/login");

  return (
    <SettingsClient
      userName={session.user.name || "User"}
      userEmail={session.user.email || ""}
      userRole={(session.user as { role?: string }).role || "STUDENT"}
    />
  );
}
