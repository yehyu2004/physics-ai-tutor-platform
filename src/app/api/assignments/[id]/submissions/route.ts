import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: params.id },
      select: { title: true, type: true, totalPoints: true, dueDate: true },
    });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: params.id },
      include: {
        user: { select: { name: true, email: true } },
        gradedBy: { select: { name: true } },
        answers: {
          include: {
            question: {
              select: {
                questionText: true,
                questionType: true,
                points: true,
                correctAnswer: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 200,
    });

    const formattedSubmissions = submissions.map((s) => ({
      id: s.id,
      userName: s.user.name || "Unknown",
      userEmail: s.user.email,
      submittedAt: s.submittedAt.toISOString(),
      totalScore: s.totalScore,
      gradedAt: s.gradedAt?.toISOString() || null,
      gradedByName: s.gradedBy?.name || null,
      fileUrl: s.fileUrl,
      answers: s.answers.map((a) => ({
        id: a.id,
        questionText: a.question.questionText,
        questionType: a.question.questionType,
        answer: a.answer,
        score: a.score,
        feedback: a.feedback,
        autoGraded: a.autoGraded,
        maxPoints: a.question.points,
      })),
    }));

    return NextResponse.json({ assignment, submissions: formattedSubmissions });
  } catch (error) {
    console.error("Submissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
