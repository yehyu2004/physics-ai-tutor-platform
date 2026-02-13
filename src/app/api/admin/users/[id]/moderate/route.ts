import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const userRole = auth.user.role;
    const adminId = auth.user.id;

    const { action } = await req.json();
    const targetUserId = (await params).id;

    if (!["ban", "unban", "restrict", "unrestrict"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Role hierarchy: prevent moderating higher-ranked users
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const targetRole = targetUser.role;
    if (userRole === "TA" && (targetRole === "ADMIN" || targetRole === "PROFESSOR")) {
      return NextResponse.json({ error: "Forbidden: TAs cannot moderate professors or admins" }, { status: 403 });
    }
    if (userRole === "PROFESSOR" && targetRole === "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Professors cannot moderate admins" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (action === "ban") {
      updateData.isBanned = true;
      updateData.bannedAt = new Date();
    } else if (action === "unban") {
      updateData.isBanned = false;
      updateData.bannedAt = null;
    } else if (action === "restrict") {
      updateData.isRestricted = true;
    } else if (action === "unrestrict") {
      updateData.isRestricted = false;
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: targetUserId,
        action,
        details: { performedBy: adminId },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Moderate user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
