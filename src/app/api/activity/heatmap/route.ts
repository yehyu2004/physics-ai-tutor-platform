import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth, isErrorResponse } from "@/lib/api-auth";

const FILTER_CATEGORIES: Record<string, string[]> = {
  chat: ["AI_CHAT"],
  simulation: ["SIMULATION"],
  submission: ["ASSIGNMENT_SUBMIT", "ASSIGNMENT_VIEW"],
};

/** Format a Date as YYYY-MM-DD in a given IANA timezone */
function toDateKey(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

export async function GET(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter"); // "all" | "chat" | "simulation" | "submission" | "other"

    // Validate timezone (fallback to UTC)
    const tzParam = searchParams.get("tz") || "UTC";
    let tz = "UTC";
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tzParam });
      tz = tzParam;
    } catch { /* invalid timezone */ }

    // Get activities from the past ~366 days (extra buffer for timezone edge cases)
    const yearAgo = new Date();
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    yearAgo.setUTCDate(yearAgo.getUTCDate() - 2);
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
      const key = toDateKey(a.createdAt, tz);
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
        const key = toDateKey(m.createdAt, tz);
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
        const key = toDateKey(s.submittedAt, tz);
        countsByDate[key] = (countsByDate[key] || 0) + 1;
      }
    }

    // Build full 365-day array using the user's local timezone
    const todayKey = toDateKey(new Date(), tz);
    const [ty, tm, td] = todayKey.split("-").map(Number);
    const data: { date: string; count: number }[] = [];

    for (let i = 364; i >= 0; i--) {
      // Use noon UTC to avoid DST edge cases when converting to local date
      const d = new Date(Date.UTC(ty, tm - 1, td - i, 12, 0, 0));
      const key = toDateKey(d, tz);
      data.push({ date: key, count: countsByDate[key] || 0 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Heatmap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
