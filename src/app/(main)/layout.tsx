import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/impersonate";
import MainLayoutClient from "./MainLayoutClient";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getEffectiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as { id: string; name?: string | null; email?: string | null; image?: string | null; role?: string };

  return (
    <MainLayoutClient
      userName={user.name || "User"}
      userEmail={user.email || ""}
      userImage={user.image || undefined}
      userRole={(user.role as "STUDENT" | "TA" | "PROFESSOR" | "ADMIN") || "STUDENT"}
      userId={user.id}
      isImpersonating={session.isImpersonating}
      realAdminName={session.realAdmin?.name || undefined}
    >
      {children}
    </MainLayoutClient>
  );
}
