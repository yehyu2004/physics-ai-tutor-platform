import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { aiAssistedGrading, type AIProvider } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const graderId = (session.user as { id: string }).id;
    const { submissionId, grades, overallScore, overallFeedback, feedbackFileUrl, feedbackImages, isDraft } = await req.json();

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { answers: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Per-question grading
    if (grades && grades.length > 0) {
      for (const grade of grades) {
        await prisma.submissionAnswer.update({
          where: { id: grade.answerId },
          data: {
            score: grade.score,
            feedback: grade.feedback,
            ...(feedbackImages?.[grade.answerId]?.length && {
              feedbackImageUrls: feedbackImages[grade.answerId],
            }),
          },
        });
      }

      const updatedAnswers = await prisma.submissionAnswer.findMany({
        where: { submissionId },
      });

      const totalScore = updatedAnswers.reduce(
        (sum, ans) => sum + (ans.score || 0),
        0
      );

      if (isDraft) {
        // Draft grading: save scores but don't mark as graded
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            totalScore,
            ...(feedbackFileUrl !== undefined && { fileUrl: feedbackFileUrl }),
          },
        });
        return NextResponse.json({ success: true, totalScore, isDraft: true });
      }

      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          totalScore,
          gradedAt: new Date(),
          gradedById: graderId,
          ...(feedbackFileUrl !== undefined && { fileUrl: feedbackFileUrl }),
        },
      });

      return NextResponse.json({ success: true, totalScore });
    }

    // Overall grading (for FILE_UPLOAD or whole-paper grading)
    if (overallScore !== undefined) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          totalScore: overallScore,
          gradedAt: new Date(),
          gradedById: graderId,
          ...(feedbackFileUrl !== undefined && { fileUrl: feedbackFileUrl }),
        },
      });

      // Store overall feedback in the first answer if exists, or we just use the score
      if (overallFeedback && submission.answers.length > 0) {
        await prisma.submissionAnswer.update({
          where: { id: submission.answers[0].id },
          data: { feedback: overallFeedback, score: overallScore },
        });
      }

      return NextResponse.json({ success: true, totalScore: overallScore });
    }

    return NextResponse.json({ error: "No grades provided" }, { status: 400 });
  } catch (error) {
    console.error("Grading error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { answerId } = await req.json();

    const answer = await prisma.submissionAnswer.findUnique({
      where: { id: answerId },
      include: {
        question: {
          include: { rubrics: true },
        },
      },
    });

    if (!answer) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    const aiConfig = await prisma.aIConfig.findFirst({
      where: { isActive: true },
    });

    const provider = (aiConfig?.provider as AIProvider) || "openai";

    const rubricDesc = answer.question.rubrics
      .map((r) => `${r.description} (${r.points} pts)`)
      .join("\n");

    const result = await aiAssistedGrading(
      answer.question.questionText,
      answer.question.correctAnswer || "",
      answer.answer || "",
      rubricDesc || "Grade based on correctness and completeness",
      answer.question.points,
      provider
    );

    if (!result) {
      return NextResponse.json({ error: "AI grading failed" }, { status: 500 });
    }

    const parsed = JSON.parse(result);

    return NextResponse.json({
      suggestedScore: parsed.score,
      suggestedFeedback: parsed.feedback,
    });
  } catch (error) {
    console.error("AI grading error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
