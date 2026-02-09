import { auth } from "./auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireAuth();
  const userRole = (session.user as Record<string, unknown>).role as UserRole;
  if (!roles.includes(userRole)) {
    redirect("/dashboard");
  }
  return session;
}

export function getUserRole(session: { user: Record<string, unknown> }): UserRole {
  return (session.user.role as UserRole) || "STUDENT";
}
