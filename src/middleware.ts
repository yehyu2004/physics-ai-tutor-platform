import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  // Skip auth for E2E tests — test user identity is set via cookie
  // SECURITY: Only allow when both E2E_TEST_MODE and E2E_TEST_SECRET are set,
  // and never in production. The two-key requirement prevents accidental bypass
  // on staging environments that only have E2E_TEST_MODE set.
  if (
    process.env.E2E_TEST_MODE === "true" &&
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_TEST_SECRET
  ) {
    return NextResponse.next();
  }

  // CSRF: Reject state-changing requests from foreign origins
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    cookieName: request.nextUrl.protocol === "https:"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  });

  if (!token) {
    // API routes should get a 401 JSON response, not a redirect to login
    const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/chat/:path*",
    "/assignments/:path*",
    "/grades/:path*",
    "/analytics/:path*",
    "/problems/:path*",
    "/grading/:path*",
    "/simulations/:path*",
    "/admin/:path*",
    "/api/((?!auth|cron).*)",
  ],
};
