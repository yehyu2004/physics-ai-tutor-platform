import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [submissions, messages, conversations, totalMessages] = await Promise.all([
      prisma.submission.findMany({
        where: { userId },
        include: {
          assignment: { select: { title: true, totalPoints: true, type: true } },
          answers: {
            include: {
              question: { select: { questionType: true, points: true } },
            },
          },
        },
        orderBy: { submittedAt: "desc" },
        take: 100,
      }),
      prisma.message.findMany({
        where: {
          conversation: { userId },
          createdAt: { gte: weekAgo },
        },
        select: { createdAt: true, role: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.conversation.count({ where: { userId } }),
      prisma.message.count({ where: { conversation: { userId } } }),
    ]);

    // Calculate weekly activity (last 7 days)
    const now = new Date();
    const dailyActivity: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      dailyActivity[key] = 0;
    }
    for (const msg of messages) {
      const key = msg.createdAt.toISOString().split("T")[0];
      if (dailyActivity[key] !== undefined) {
        dailyActivity[key]++;
      }
    }

    // Calculate submission scores over time
    const scoreHistory = submissions
      .filter((s) => s.totalScore !== null)
      .map((s) => ({
        title: s.assignment.title,
        score: s.totalScore!,
        totalPoints: s.assignment.totalPoints,
        percent: Math.round((s.totalScore! / s.assignment.totalPoints) * 100),
        date: s.submittedAt.toISOString(),
      }))
      .reverse();

    // Overall stats
    const gradedSubmissions = submissions.filter((s) => s.totalScore !== null);
    const totalEarned = gradedSubmissions.reduce((sum, s) => sum + (s.totalScore || 0), 0);
    const totalPossible = gradedSubmissions.reduce((sum, s) => sum + s.assignment.totalPoints, 0);
    const averagePercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

    const estimatedStudyMinutes = Math.round(totalMessages * 1.5);

    return NextResponse.json({
      overview: {
        averagePercent,
        totalMessages,
        totalConversations: conversations,
        totalSubmissions: submissions.length,
        estimatedStudyMinutes,
      },
      weeklyActivity: Object.entries(dailyActivity).map(([date, count]) => ({
        date,
        day: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
        messages: count,
      })),
      scoreHistory,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
