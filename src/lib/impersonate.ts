import { cookies } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./prisma";

export const IMPERSONATE_COOKIE = "impersonate-user-id";

/**
 * Returns the effective session, checking for admin impersonation.
 * If an admin is impersonating another user, the session will reflect
 * the impersonated user's data, with `isImpersonating` and `realAdmin` set.
 */
export async function getEffectiveSession() {
  const session = await auth();
  if (!session?.user) return null;

  const cookieStore = await cookies();
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;

  if (!impersonateId) {
    return { ...session, isImpersonating: false, realAdmin: null };
  }

  // Only admins can impersonate
  const realRole = (session.user as { role?: string }).role;
  if (realRole !== "ADMIN") {
    return { ...session, isImpersonating: false, realAdmin: null };
  }

  const impersonatedUser = await prisma.user.findUnique({
    where: { id: impersonateId },
    select: { id: true, name: true, email: true, role: true, image: true },
  });

  if (!impersonatedUser) {
    return { ...session, isImpersonating: false, realAdmin: null };
  }

  const realAdmin = {
    id: (session.user as { id: string }).id,
    name: session.user.name,
    email: session.user.email,
  };

  return {
    ...session,
    user: {
      ...session.user,
      id: impersonatedUser.id,
      name: impersonatedUser.name,
      email: impersonatedUser.email,
      role: impersonatedUser.role,
      image: impersonatedUser.image,
    },
    isImpersonating: true,
    realAdmin,
  };
}
