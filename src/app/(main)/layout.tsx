import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import MainLayoutClient from "./MainLayoutClient";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as { id: string; name?: string | null; email?: string | null; image?: string | null; role?: string };

  return (
    <MainLayoutClient
      userName={user.name || "User"}
      userEmail={user.email || ""}
      userImage={user.image || undefined}
      userRole={(user.role as "STUDENT" | "TA" | "ADMIN") || "STUDENT"}
    >
      {children}
    </MainLayoutClient>
  );
}
