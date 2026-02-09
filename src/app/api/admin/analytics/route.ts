import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN" && userRole !== "TA") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [totalUsers, totalConversations, totalMessages, totalSubmissions, submissions, recentMessages] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.submission.count(),
      prisma.submission.findMany({
        where: { totalScore: { not: null } },
        include: {
          assignment: { select: { title: true, totalPoints: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: 100,
      }),
      prisma.message.findMany({
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
    ]);

    // Daily activity for last 14 days
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const dailyActivity: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyActivity[d.toISOString().split("T")[0]] = 0;
    }
    for (const msg of recentMessages) {
      if (msg.createdAt >= twoWeeksAgo) {
        const key = msg.createdAt.toISOString().split("T")[0];
        if (dailyActivity[key] !== undefined) {
          dailyActivity[key]++;
        }
      }
    }

    // Score distribution
    const gradedSubmissions = submissions.filter((s) => s.totalScore !== null);
    const scoreDistribution = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
    for (const s of gradedSubmissions) {
      const pct = (s.totalScore! / s.assignment.totalPoints) * 100;
      const bucket = Math.min(Math.floor(pct / 20), 4);
      scoreDistribution[bucket]++;
    }

    // Top struggling assignments
    const assignmentScores: Record<string, { title: string; scores: number[]; total: number }> = {};
    for (const s of gradedSubmissions) {
      if (!assignmentScores[s.assignmentId]) {
        assignmentScores[s.assignmentId] = { title: s.assignment.title, scores: [], total: s.assignment.totalPoints };
      }
      assignmentScores[s.assignmentId].scores.push(s.totalScore!);
    }

    const assignmentAvgs = Object.values(assignmentScores).map((a) => ({
      title: a.title,
      avgPercent: Math.round((a.scores.reduce((s, v) => s + v, 0) / a.scores.length / a.total) * 100),
      submissions: a.scores.length,
    })).sort((a, b) => a.avgPercent - b.avgPercent);

    return NextResponse.json({
      overview: { totalUsers, totalConversations, totalMessages, totalSubmissions },
      dailyActivity: Object.entries(dailyActivity).map(([date, count]) => ({
        date,
        day: new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        messages: count,
      })),
      scoreDistribution: [
        { range: "0-20%", count: scoreDistribution[0] },
        { range: "20-40%", count: scoreDistribution[1] },
        { range: "40-60%", count: scoreDistribution[2] },
        { range: "60-80%", count: scoreDistribution[3] },
        { range: "80-100%", count: scoreDistribution[4] },
      ],
      assignmentAvgs: assignmentAvgs.slice(0, 10),
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
