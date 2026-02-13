import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

function isAuthorized(role?: string): boolean {
  return role === "ADMIN" || role === "PROFESSOR" || role === "TA";
}

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (!isAuthorized(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "15", 10)));

    const where = { action: "bulk_email_sent" as const };

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

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
      totalCount,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Email records error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
