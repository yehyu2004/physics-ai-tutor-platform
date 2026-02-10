import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/impersonate";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await getEffectiveSession();
  if (!session?.user) redirect("/login");

  return <ProfileClient />;
}
