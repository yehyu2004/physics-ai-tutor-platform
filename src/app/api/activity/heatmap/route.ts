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

    // Get activities from the past 365 days (use UTC to match toISOString keys)
    const yearAgo = new Date();
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    yearAgo.setUTCHours(0, 0, 0, 0);

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

    const countsByDate: Record<string, number> = {};

    // 1. Count UserActivity records
    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        createdAt: { gte: yearAgo },
        ...whereCategory,
      },
      select: { createdAt: true },
    });
    for (const a of activities) {
      const key = a.createdAt.toISOString().split("T")[0];
      countsByDate[key] = (countsByDate[key] || 0) + 1;
    }

    // 2. Count user Messages (chat interactions) — richer than page-visit tracking
    if (!filter || filter === "all" || filter === "chat") {
      const messages = await prisma.message.findMany({
        where: {
          role: "user",
          conversation: { userId, isDeleted: false },
          createdAt: { gte: yearAgo },
        },
        select: { createdAt: true },
      });
      for (const m of messages) {
        const key = m.createdAt.toISOString().split("T")[0];
        countsByDate[key] = (countsByDate[key] || 0) + 1;
      }
    }

    // 3. Count Submissions
    if (!filter || filter === "all" || filter === "submission") {
      const submissions = await prisma.submission.findMany({
        where: {
          userId,
          submittedAt: { gte: yearAgo },
        },
        select: { submittedAt: true },
      });
      for (const s of submissions) {
        const key = s.submittedAt.toISOString().split("T")[0];
        countsByDate[key] = (countsByDate[key] || 0) + 1;
      }
    }

    // Build full 365-day array (use UTC to match toISOString keys)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
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
