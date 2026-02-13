import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

const FILTER_CATEGORIES: Record<string, string[]> = {
  chat: ["AI_CHAT"],
  simulation: ["SIMULATION"],
  submission: ["ASSIGNMENT_SUBMIT", "ASSIGNMENT_VIEW"],
};

const ALL_CATEGORIES = [
  "AI_CHAT",
  "ASSIGNMENT_VIEW",
  "ASSIGNMENT_SUBMIT",
  "GRADING",
  "SIMULATION",
  "PROBLEM_GEN",
  "ANALYTICS_VIEW",
  "ADMIN_ACTION",
];

const CATEGORY_LABELS: Record<string, string> = {
  AI_CHAT: "AI Chat",
  ASSIGNMENT_VIEW: "View Assignments",
  ASSIGNMENT_SUBMIT: "Submit Work",
  GRADING: "Grading",
  SIMULATION: "Simulations",
  PROBLEM_GEN: "Problem Gen",
  ANALYTICS_VIEW: "Analytics",
  ADMIN_ACTION: "Admin",
};

const CATEGORY_COLORS: Record<string, string> = {
  AI_CHAT: "#6366f1",
  ASSIGNMENT_VIEW: "#8b5cf6",
  ASSIGNMENT_SUBMIT: "#a78bfa",
  GRADING: "#10b981",
  SIMULATION: "#f59e0b",
  PROBLEM_GEN: "#ec4899",
  ANALYTICS_VIEW: "#06b6d4",
  ADMIN_ACTION: "#64748b",
};

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN" && userRole !== "PROFESSOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") || undefined;
    const filter = searchParams.get("filter") || "all";
    const range = searchParams.get("range") || "30";
    const exportCsv = searchParams.get("export") === "csv";

    // Build where clause
    const where: Record<string, unknown> = {};
    if (role) where.user = { role };

    // Date range
    if (range !== "all") {
      const days = parseInt(range, 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      where.createdAt = { gte: startDate };
    }

    // Category filter
    if (filter !== "all") {
      if (filter === "other") {
        const excludeCats = Object.values(FILTER_CATEGORIES).flat();
        where.category = { notIn: excludeCats };
      } else if (FILTER_CATEGORIES[filter]) {
        where.category = { in: FILTER_CATEGORIES[filter] };
      }
    }

    // CSV export — separate path, only fetched on demand
    if (exportCsv) {
      const activities = await prisma.userActivity.findMany({
        where,
        select: {
          id: true,
          category: true,
          detail: true,
          durationMs: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const csvData = activities.map((a) => ({
        id: a.id,
        userName: a.user.name || "Unknown",
        userEmail: a.user.email || "",
        category: a.category,
        detail: a.detail,
        durationMs: a.durationMs,
        createdAt: a.createdAt.toISOString(),
      }));
      return NextResponse.json({ csvData });
    }

    const days = range === "all" ? 365 : parseInt(range, 10);

    // Run queries in parallel
    const [trendActivities, categoryGroups, totalCount, totalDuration, uniqueUsers, recentActivities, topUsersRaw] = await Promise.all([
      // Activities for daily trend (only need category + date)
      prisma.userActivity.findMany({
        where,
        select: {
          category: true,
          createdAt: true,
          user: { select: { role: true } },
          durationMs: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      // Group by category for time breakdown
      prisma.userActivity.groupBy({
        by: ["category"],
        where,
        _count: { id: true },
        _sum: { durationMs: true },
      }),
      // Efficient count via DB
      prisma.userActivity.count({ where }),
      // Efficient sum via DB
      prisma.userActivity.aggregate({ where, _sum: { durationMs: true } }),
      // Efficient distinct user count via DB
      prisma.userActivity.groupBy({ by: ["userId"], where }).then((g) => g.length),
      // Recent activities (last 20) with user info for activity feed
      prisma.userActivity.findMany({
        where,
        select: {
          id: true,
          category: true,
          detail: true,
          durationMs: true,
          createdAt: true,
          user: { select: { name: true, email: true, role: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // Top users by activity count
      prisma.userActivity.groupBy({
        by: ["userId"],
        where,
        _count: { id: true },
        _sum: { durationMs: true },
      }),
    ]);

    // Summary from DB aggregations
    const summary = {
      totalActivities: totalCount,
      uniqueUsers,
      totalTimeMs: totalDuration._sum.durationMs || 0,
      avgDailyActivities: days > 0 ? Math.round(totalCount / days) : totalCount,
    };

    // Daily trend — build date→category→count map
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const trendMap: Record<string, Record<string, number>> = {};

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      trendMap[key] = {};
      for (const cat of ALL_CATEGORIES) trendMap[key][cat] = 0;
    }

    // Also gather role data for the breakdown
    const roleMap: Record<string, { count: number; totalMs: number }> = {};
    for (const a of trendActivities) {
      const key = a.createdAt.toISOString().split("T")[0];
      if (trendMap[key] && trendMap[key][a.category] !== undefined) {
        trendMap[key][a.category]++;
      }
      const r = (a.user as { role?: string }).role || "STUDENT";
      if (!roleMap[r]) roleMap[r] = { count: 0, totalMs: 0 };
      roleMap[r].count++;
      roleMap[r].totalMs += a.durationMs || 0;
    }

    // Determine which categories to include in the trend based on filter
    let trendCategories = ALL_CATEGORIES;
    if (filter !== "all") {
      if (filter === "other") {
        const excludeCats = Object.values(FILTER_CATEGORIES).flat();
        trendCategories = ALL_CATEGORIES.filter((c) => !excludeCats.includes(c));
      } else if (FILTER_CATEGORIES[filter]) {
        trendCategories = FILTER_CATEGORIES[filter];
      }
    }

    const dailyTrend = Object.entries(trendMap).map(([date, cats]) => {
      const entry: Record<string, string | number> = {
        date,
        label: new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
      let total = 0;
      for (const cat of trendCategories) {
        entry[cat] = cats[cat] || 0;
        total += cats[cat] || 0;
      }
      entry.total = total;
      return entry;
    });

    // Time by category
    const timeByCategory = categoryGroups.map((g) => ({
      category: g.category,
      label: CATEGORY_LABELS[g.category] || g.category,
      totalMs: g._sum.durationMs || 0,
      count: g._count.id,
      color: CATEGORY_COLORS[g.category] || "#94a3b8",
    })).sort((a, b) => b.totalMs - a.totalMs);

    // Time by role
    const ROLE_LABELS: Record<string, string> = {
      STUDENT: "Student",
      TA: "TA",
      PROFESSOR: "Professor",
      ADMIN: "Admin",
    };
    const timeByRole = Object.entries(roleMap).map(([r, data]) => ({
      label: ROLE_LABELS[r] || r,
      count: data.count,
      totalMs: data.totalMs,
    })).sort((a, b) => b.totalMs - a.totalMs);

    // Recent activity feed
    const recentActivity = recentActivities.map((a) => ({
      id: a.id,
      category: a.category,
      categoryLabel: CATEGORY_LABELS[a.category] || a.category,
      categoryColor: CATEGORY_COLORS[a.category] || "#94a3b8",
      detail: a.detail,
      durationMs: a.durationMs,
      createdAt: a.createdAt.toISOString(),
      user: {
        name: a.user.name || "Unknown",
        email: a.user.email || "",
        role: (a.user as { role?: string }).role || "STUDENT",
        image: (a.user as { image?: string | null }).image || null,
      },
    }));

    // Top users — resolve user info
    const topUsersSorted = topUsersRaw
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, 10);

    const topUserIds = topUsersSorted.map((u) => u.userId);
    const topUserInfos = topUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, email: true, role: true, image: true },
        })
      : [];
    const userInfoMap = new Map(topUserInfos.map((u) => [u.id, u]));

    const topUsers = topUsersSorted.map((u) => {
      const info = userInfoMap.get(u.userId);
      return {
        name: info?.name || "Unknown",
        email: info?.email || "",
        role: info?.role || "STUDENT",
        image: info?.image || null,
        activityCount: u._count.id,
        totalTimeMs: u._sum.durationMs || 0,
      };
    });

    return NextResponse.json({
      summary,
      dailyTrend,
      trendCategories,
      timeByCategory,
      timeByRole,
      recentActivity,
      topUsers,
    });
  } catch (error) {
    console.error("Admin user-activity error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
