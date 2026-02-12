import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

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
