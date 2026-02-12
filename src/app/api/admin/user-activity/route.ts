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

    const days = range === "all" ? 365 : parseInt(range, 10);

    // Run queries in parallel
    const [activities, categoryGroups] = await Promise.all([
      // Raw activities for daily trend + CSV + timeslot/role aggregation
      prisma.userActivity.findMany({
        where,
        select: {
          id: true,
          userId: true,
          category: true,
          detail: true,
          durationMs: true,
          createdAt: true,
          user: { select: { name: true, email: true, role: true } },
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
    ]);

    // Summary
    const uniqueUserIds = new Set(activities.map((a) => a.userId));
    const totalTimeMs = activities.reduce((sum, a) => sum + (a.durationMs || 0), 0);
    const summary = {
      totalActivities: activities.length,
      uniqueUsers: uniqueUserIds.size,
      totalTimeMs,
      avgDailyActivities: days > 0 ? Math.round(activities.length / days) : activities.length,
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

    for (const a of activities) {
      const key = a.createdAt.toISOString().split("T")[0];
      if (trendMap[key] && trendMap[key][a.category] !== undefined) {
        trendMap[key][a.category]++;
      }
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

    // Time by weekly timeslot
    const weekMap: Record<string, { count: number; totalMs: number; start: Date; end: Date }> = {};
    for (const a of activities) {
      const d = new Date(a.createdAt);
      // Get Monday of that week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const key = monday.toISOString().split("T")[0];
      if (!weekMap[key]) weekMap[key] = { count: 0, totalMs: 0, start: monday, end: sunday };
      weekMap[key].count++;
      weekMap[key].totalMs += a.durationMs || 0;
    }
    const timeByTimeslot = Object.entries(weekMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, data]) => {
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return {
          label: `${fmt(data.start)} – ${fmt(data.end)}`,
          count: data.count,
          totalMs: data.totalMs,
        };
      });

    // Time by role
    const ROLE_LABELS: Record<string, string> = {
      STUDENT: "Student",
      TA: "TA",
      PROFESSOR: "Professor",
      ADMIN: "Admin",
    };
    const roleMap: Record<string, { count: number; totalMs: number }> = {};
    for (const a of activities) {
      const role = (a.user as { role?: string }).role || "STUDENT";
      if (!roleMap[role]) roleMap[role] = { count: 0, totalMs: 0 };
      roleMap[role].count++;
      roleMap[role].totalMs += a.durationMs || 0;
    }
    const timeByRole = Object.entries(roleMap).map(([role, data]) => ({
      label: ROLE_LABELS[role] || role,
      count: data.count,
      totalMs: data.totalMs,
    })).sort((a, b) => b.totalMs - a.totalMs);

    // CSV data
    const csvData = activities.map((a) => ({
      id: a.id,
      userName: a.user.name || "Unknown",
      userEmail: a.user.email || "",
      category: a.category,
      detail: a.detail,
      durationMs: a.durationMs,
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({
      summary,
      dailyTrend,
      trendCategories,
      timeByCategory,
      timeByTimeslot,
      timeByRole,
      csvData,
    });
  } catch (error) {
    console.error("Admin user-activity error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
