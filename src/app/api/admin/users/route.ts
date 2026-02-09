import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAuthorized(role?: string): boolean {
  return role === "ADMIN" || role === "TA";
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (!isAuthorized(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBanned: true,
        bannedAt: true,
        isRestricted: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        bannedAt: u.bannedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (!isAuthorized(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, action, role } = await req.json();

    // Prevent self-actions
    if (userId === (session.user as { id?: string }).id) {
      return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
    }

    if (action === "ban") {
      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: true, bannedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "unban") {
      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: false, bannedAt: null },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "restrict") {
      await prisma.user.update({
        where: { id: userId },
        data: { isRestricted: true },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "unrestrict") {
      await prisma.user.update({
        where: { id: userId },
        data: { isRestricted: false },
      });
      return NextResponse.json({ success: true });
    }

    // Role change (existing functionality)
    if (role) {
      if (!["STUDENT", "TA", "ADMIN"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { role },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (!isAuthorized(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await req.json();

    // Prevent self-deletion
    if (userId === (session.user as { id?: string }).id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Soft delete
    await prisma.user.update({
      where: { id: userId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
