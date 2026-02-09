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

    const submissions = await prisma.submission.findMany({
      where: { userId },
      include: {
        assignment: {
          select: { title: true, type: true, totalPoints: true },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const grades = submissions.map((s) => ({
      id: s.id,
      assignmentTitle: s.assignment.title,
      assignmentType: s.assignment.type,
      totalPoints: s.assignment.totalPoints,
      score: s.totalScore,
      gradedAt: s.gradedAt?.toISOString() || null,
      submittedAt: s.submittedAt.toISOString(),
    }));

    return NextResponse.json({ grades });
  } catch (error) {
    console.error("Grades error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
