import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

export async function GET(req: Request) {
  try {
    const auth = await requireApiRole(["ADMIN", "PROFESSOR"]);
    if (isErrorResponse(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const params = parsePaginationParams(searchParams, { pageSize: 50 });

    const [totalCount, logs] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        take: params.pageSize,
        skip: params.skip,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      }),
    ]);

    const mapped = logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.name,
      userEmail: l.user.email,
      action: l.action,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
    }));

    return NextResponse.json(paginatedResponse(mapped, totalCount, params));
  } catch (error) {
    console.error("Audit log error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
