import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN" && userRole !== "PROFESSOR" && userRole !== "TA") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { action } = await req.json();
    const targetUserId = (await params).id;
    const adminId = (session.user as { id: string }).id;

    if (!["ban", "unban", "restrict", "unrestrict"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
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
