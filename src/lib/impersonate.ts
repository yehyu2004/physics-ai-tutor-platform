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
  // E2E test mode: build a fake session from the test user cookie
  if (process.env.E2E_TEST_MODE === "true") {
    const cookieStore = await cookies();
    const testEmail = cookieStore.get("e2e-test-user-email")?.value;
    if (testEmail) {
      const testUser = await prisma.user.findUnique({
        where: { email: testEmail },
        select: { id: true, name: true, email: true, role: true, image: true },
      });
      if (testUser) {
        return {
          user: testUser,
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          isImpersonating: false,
          realAdmin: null,
        };
      }
    }
    return null;
  }

  const session = await auth();
  if (!session?.user) return null;

  const cookieStore = await cookies();
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;

  if (!impersonateId) {
    return { ...session, isImpersonating: false, realAdmin: null };
  }

  // Only admins can impersonate
  const realRole = (session.user as { role?: string }).role;
  if (realRole !== "ADMIN" && realRole !== "PROFESSOR") {
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
