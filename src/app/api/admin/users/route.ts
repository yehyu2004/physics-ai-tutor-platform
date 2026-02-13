import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { ROLE_HIERARCHY, isStaff } from "@/lib/constants";

export async function GET() {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        role: true,
        isBanned: true,
        bannedAt: true,
        isRestricted: true,
        isVerified: true,
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
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const userRole = auth.user.role;

    const { userId, action, role } = await req.json();

    // Prevent self-actions
    if (userId === auth.user.id) {
      return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
    }

    // TAs can verify/unverify and ban/unban/restrict/unrestrict
    if (userRole === "TA") {
      const taAllowedActions = ["verify", "unverify", "ban", "unban", "restrict", "unrestrict"];
      if (action && !taAllowedActions.includes(action)) {
        return NextResponse.json({ error: "Forbidden: TAs cannot perform this action" }, { status: 403 });
      }
      if (role) {
        return NextResponse.json({ error: "Forbidden: TAs cannot change roles" }, { status: 403 });
      }
    }

    // Role hierarchy: prevent moderating higher-ranked users
    if (action && ["ban", "unban", "restrict", "unrestrict"].includes(action)) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (targetUser) {
        const targetRole = targetUser.role;
        if (userRole === "TA" && (targetRole === "ADMIN" || targetRole === "PROFESSOR")) {
          return NextResponse.json({ error: "Forbidden: TAs cannot moderate professors or admins" }, { status: 403 });
        }
        if (userRole === "PROFESSOR" && targetRole === "ADMIN") {
          return NextResponse.json({ error: "Forbidden: Professors cannot moderate admins" }, { status: 403 });
        }
      }
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

    if (action === "verify") {
      await prisma.user.update({
        where: { id: userId },
        data: { isVerified: true },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "unverify") {
      await prisma.user.update({
        where: { id: userId },
        data: { isVerified: false },
      });
      return NextResponse.json({ success: true });
    }

    // Role change — requires PROFESSOR or ADMIN
    if (role) {
      if (userRole !== "PROFESSOR" && userRole !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: only professors and admins can change roles" }, { status: 403 });
      }
      if (!["STUDENT", "TA", "PROFESSOR", "ADMIN"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      // Role hierarchy: cannot promote someone to your own level or above
      if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[userRole]) {
        return NextResponse.json(
          { error: "Cannot promote a user to your own role level or above" },
          { status: 403 }
        );
      }
      const data: { role: "STUDENT" | "TA" | "PROFESSOR" | "ADMIN"; isVerified?: boolean } = { role };
      // Auto-verify when promoting to TA, PROFESSOR or ADMIN
      if (isStaff(role)) {
        data.isVerified = true;
      }
      await prisma.user.update({
        where: { id: userId },
        data,
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
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const userRole = auth.user.role;

    const { userId } = await req.json();

    // TAs cannot delete users
    if (userRole === "TA") {
      return NextResponse.json({ error: "Forbidden: TAs cannot delete users" }, { status: 403 });
    }

    // Prevent self-deletion
    if (userId === auth.user.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Role hierarchy enforcement: cannot delete a user with equal or higher role
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[targetUser.role]) {
      return NextResponse.json(
        { error: "Cannot delete a user with equal or higher role" },
        { status: 403 }
      );
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
