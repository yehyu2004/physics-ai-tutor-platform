import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate";

// Start impersonating a user
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can impersonate" }, { status: 403 });
    }

    const { userId } = await req.json();

    // Cannot impersonate yourself
    if (userId === (session.user as { id: string }).id) {
      return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const cookieStore = await cookies();
    cookieStore.set(IMPERSONATE_COOKIE, userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    return NextResponse.json({ success: true, user: targetUser });
  } catch (error) {
    console.error("Impersonate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Stop impersonating
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.delete(IMPERSONATE_COOKIE);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stop impersonate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
