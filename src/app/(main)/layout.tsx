import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/impersonate";
import MainLayoutClient from "./MainLayoutClient";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getEffectiveSession();
  const isE2ETestMode = process.env.E2E_TEST_MODE === "true";

  if (!session?.user && !isE2ETestMode) {
    redirect("/login");
  }

  const user = (session?.user ?? {
    id: "e2e-guest-user",
    name: "E2E Guest",
    email: "e2e-guest@example.com",
    image: null,
    role: "STUDENT",
  }) as {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };

  return (
    <MainLayoutClient
      userName={user.name || "User"}
      userEmail={user.email || ""}
      userImage={user.image || undefined}
      userRole={(user.role as "STUDENT" | "TA" | "PROFESSOR" | "ADMIN") || "STUDENT"}
      userId={user.id}
      isImpersonating={session?.isImpersonating}
      realAdminName={session?.realAdmin?.name || undefined}
    >
      {children}
    </MainLayoutClient>
  );
}
