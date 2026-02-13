import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: params.id },
      select: { title: true, type: true, totalPoints: true, dueDate: true },
    });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: params.id, isDraft: false },
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
            appeals: {
              include: {
                student: { select: { id: true, name: true } },
                messages: {
                  include: {
                    user: { select: { id: true, name: true, role: true } },
                  },
                  orderBy: { createdAt: "asc" as const },
                },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 200,
    });

    const formattedSubmissions = submissions.map((s) => {
      const openAppealCount = s.answers.reduce(
        (count, a) => count + a.appeals.filter((ap) => ap.status === "OPEN").length,
        0
      );
      const totalAppealCount = s.answers.reduce(
        (count, a) => count + a.appeals.length,
        0
      );
      return {
        id: s.id,
        userName: s.user.name || "Unknown",
        userEmail: s.user.email,
        submittedAt: s.submittedAt.toISOString(),
        totalScore: s.totalScore,
        gradedAt: s.gradedAt?.toISOString() || null,
        gradedByName: s.gradedBy?.name || null,
        fileUrl: s.fileUrl,
        openAppealCount,
        totalAppealCount,
        answers: s.answers.map((a) => ({
          id: a.id,
          questionText: a.question.questionText,
          questionType: a.question.questionType,
          answer: a.answer,
          answerImageUrls: a.answerImageUrls,
          score: a.score,
          feedback: a.feedback,
          autoGraded: a.autoGraded,
          maxPoints: a.question.points,
          appeals: a.appeals.map((ap) => ({
            id: ap.id,
            status: ap.status,
            reason: ap.reason,
            imageUrls: ap.imageUrls,
            createdAt: ap.createdAt.toISOString(),
            student: ap.student,
            messages: ap.messages.map((m) => ({
              id: m.id,
              content: m.content,
              imageUrls: m.imageUrls,
              createdAt: m.createdAt.toISOString(),
              user: m.user,
            })),
          })),
        })),
      };
    });

    return NextResponse.json({ assignment, submissions: formattedSubmissions });
  } catch (error) {
    console.error("Submissions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
