import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

const FILTER_CATEGORIES: Record<string, string[]> = {
  chat: ["AI_CHAT"],
  simulation: ["SIMULATION"],
  submission: ["ASSIGNMENT_SUBMIT", "ASSIGNMENT_VIEW"],
};

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter"); // "all" | "chat" | "simulation" | "submission" | "other"

    // Get activities from the past 365 days
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    yearAgo.setHours(0, 0, 0, 0);

    // Build category filter
    const whereCategory: Record<string, unknown> = {};
    if (filter && filter !== "all") {
      if (filter === "other") {
        const excludeCats = Object.values(FILTER_CATEGORIES).flat();
        whereCategory.category = { notIn: excludeCats };
      } else if (FILTER_CATEGORIES[filter]) {
        whereCategory.category = { in: FILTER_CATEGORIES[filter] };
      }
    }

    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        createdAt: { gte: yearAgo },
        ...whereCategory,
      },
      select: { createdAt: true },
    });

    // Aggregate by date
    const countsByDate: Record<string, number> = {};
    for (const a of activities) {
      const key = a.createdAt.toISOString().split("T")[0];
      countsByDate[key] = (countsByDate[key] || 0) + 1;
    }

    // Build full 365-day array
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data: { date: string; count: number }[] = [];

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      data.push({ date: key, count: countsByDate[key] || 0 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Heatmap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
