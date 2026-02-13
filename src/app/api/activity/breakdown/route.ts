import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth, isErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;

    const results = await prisma.userActivity.groupBy({
      by: ["category"],
      where: { userId },
      _count: { id: true },
      _sum: { durationMs: true },
      orderBy: { _count: { id: "desc" } },
    });

    const data = results.map((r: { category: string; _count: { id: number }; _sum: { durationMs: number | null } }) => ({
      category: r.category,
      count: r._count.id,
      totalMs: r._sum.durationMs || 0,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Activity breakdown error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
