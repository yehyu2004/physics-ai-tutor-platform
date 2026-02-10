import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

function isAuthorized(role?: string): boolean {
  return role === "ADMIN" || role === "PROFESSOR" || role === "TA";
}

export async function GET() {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (!isAuthorized(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        action: "bulk_email_sent",
      },
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      records: logs.map((l) => ({
        id: l.id,
        userId: l.userId,
        userName: l.user.name,
        userEmail: l.user.email,
        action: l.action,
        details: l.details,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Email records error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
