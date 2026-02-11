import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get("assignmentId");

    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
    }

    const submission = await prisma.submission.findFirst({
      where: { assignmentId, userId },
      include: { answers: true },
    });

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Get submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { assignmentId, answers, fileUrl, isDraft } = await req.json();

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

    if (isDraft) {
      // Draft save: upsert without auto-grading
      if (existingSubmission && !existingSubmission.isDraft) {
        return NextResponse.json(
          { error: "Cannot overwrite a final submission with a draft" },
          { status: 409 }
        );
      }

      if (existingSubmission) {
        // Update existing draft: delete old answers, create new ones
        await prisma.submissionAnswer.deleteMany({
          where: { submissionId: existingSubmission.id },
        });
        const submission = await prisma.submission.update({
          where: { id: existingSubmission.id },
          data: {
            fileUrl,
            submittedAt: new Date(),
            answers: {
              create: (answers || []).map((a: { questionId: string; answer: string }) => ({
                questionId: a.questionId,
                answer: a.answer,
                autoGraded: false,
                score: null,
              })),
            },
          },
          include: { answers: true },
        });
        return NextResponse.json({ submission });
      }

      // Create new draft
      const submission = await prisma.submission.create({
        data: {
          assignmentId,
          userId,
          fileUrl,
          isDraft: true,
          answers: {
            create: (answers || []).map((a: { questionId: string; answer: string }) => ({
              questionId: a.questionId,
              answer: a.answer,
              autoGraded: false,
              score: null,
            })),
          },
        },
        include: { answers: true },
      });
      return NextResponse.json({ submission });
    }

    // Final submission (isDraft false or omitted)
    if (existingSubmission && !existingSubmission.isDraft && assignment.lockAfterSubmit) {
      return NextResponse.json(
        { error: "This assignment is locked after submission. You cannot resubmit." },
        { status: 403 }
      );
    }
    if (existingSubmission) {
      await prisma.submission.delete({
        where: { id: existingSubmission.id },
      });
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId,
        userId,
        fileUrl,
        isDraft: false,
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
