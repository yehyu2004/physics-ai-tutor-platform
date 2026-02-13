import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";

export type UserRole = "STUDENT" | "TA" | "PROFESSOR" | "ADMIN";

export interface ApiUser {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  image?: string | null;
}

export interface AuthResult {
  user: ApiUser;
  session: Awaited<ReturnType<typeof getEffectiveSession>>;
}

/**
 * Require an authenticated user. Returns 401 JSON if not authenticated.
 */
export async function requireApiAuth(): Promise<AuthResult | NextResponse> {
  const session = await getEffectiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as ApiUser;
  return { user, session };
}

/**
 * Require an authenticated user with one of the given roles.
 * Returns 401 if not authenticated, 403 if wrong role.
 */
export async function requireApiRole(
  roles: UserRole[]
): Promise<AuthResult | NextResponse> {
  const result = await requireApiAuth();
  if (result instanceof NextResponse) return result;
  if (!roles.includes(result.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

/** Type guard to check if the result is an error response */
export function isErrorResponse(
  result: AuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
