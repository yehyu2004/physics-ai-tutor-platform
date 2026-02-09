import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { assignmentId, answers, fileUrl } = await req.json();

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { questions: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const existingSubmission = await prisma.submission.findFirst({
      where: { assignmentId, userId },
    });

    if (existingSubmission) {
      return NextResponse.json({ error: "Already submitted" }, { status: 400 });
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId,
        userId,
        fileUrl,
        answers: {
          create: (answers || []).map((a: { questionId: string; answer: string }) => {
            const question = assignment.questions.find((q) => q.id === a.questionId);
            let autoGraded = false;
            let score: number | null = null;

            if (question && (question.questionType === "MC" || question.questionType === "NUMERIC")) {
              autoGraded = true;
              const studentAnswer = a.answer.trim().toLowerCase();
              const correctAnswer = (question.correctAnswer || "").trim().toLowerCase();
              score = studentAnswer === correctAnswer ? question.points : 0;
            }

            return {
              questionId: a.questionId,
              answer: a.answer,
              autoGraded,
              score,
            };
          }),
        },
      },
      include: { answers: true },
    });

    if (assignment.type === "QUIZ") {
      const totalScore = submission.answers.reduce(
        (sum, ans) => sum + (ans.score || 0),
        0
      );
      const allAutoGraded = submission.answers.every((ans) => ans.autoGraded);

      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          totalScore: allAutoGraded ? totalScore : null,
          gradedAt: allAutoGraded ? new Date() : null,
        },
      });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
