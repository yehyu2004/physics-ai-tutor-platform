import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date parameter (YYYY-MM-DD)" }, { status: 400 });
    }

    const filter = searchParams.get("filter");

    const FILTER_CATEGORIES: Record<string, string[]> = {
      chat: ["AI_CHAT"],
      simulation: ["SIMULATION"],
      submission: ["ASSIGNMENT_SUBMIT", "ASSIGNMENT_VIEW"],
    };

    const whereCategory: Record<string, unknown> = {};
    if (filter && filter !== "all") {
      if (filter === "other") {
        const excludeCats = Object.values(FILTER_CATEGORIES).flat();
        whereCategory.category = { notIn: excludeCats };
      } else if (FILTER_CATEGORIES[filter]) {
        whereCategory.category = { in: FILTER_CATEGORIES[filter] };
      }
    }

    const startOfDay = new Date(date + "T00:00:00.000Z");
    const endOfDay = new Date(date + "T23:59:59.999Z");

    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        createdAt: { gte: startOfDay, lte: endOfDay },
        ...whereCategory,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        category: true,
        detail: true,
        durationMs: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      date,
      activities: activities.map((a: { id: string; category: string; detail: string | null; durationMs: number | null; createdAt: Date }) => ({
        id: a.id,
        category: a.category,
        detail: a.detail,
        durationMs: a.durationMs,
        time: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Activity detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
