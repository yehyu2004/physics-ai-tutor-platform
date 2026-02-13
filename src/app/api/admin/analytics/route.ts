import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    // Daily activity for last 14 days
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalConversations, totalMessages, totalSubmissions, submissions, dailyMessageCounts] = await Promise.all([
      prisma.user.count({ where: { isDeleted: false } }),
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
      prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE_TRUNC('day', "createdAt") as date, COUNT(*)::int as count
        FROM "Message"
        WHERE "createdAt" >= ${twoWeeksAgo}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date
      `,
    ]);

    // Build daily activity map with all 14 days initialized to 0
    const dailyActivity: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyActivity[d.toISOString().split("T")[0]] = 0;
    }
    for (const row of dailyMessageCounts) {
      const key = new Date(row.date).toISOString().split("T")[0];
      if (dailyActivity[key] !== undefined) {
        dailyActivity[key] = row.count;
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
