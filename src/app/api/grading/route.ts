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
    const { submissionId, grades, overallScore, overallFeedback, feedbackFileUrl, feedbackImages, isDraft, ungrade } = await req.json();

    // Ungrade: clear gradedAt and gradedById
    if (ungrade && submissionId) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { totalScore: null, gradedAt: null, gradedById: null },
      });
      return NextResponse.json({ success: true, ungraded: true });
    }

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
        if (grade.answerId.startsWith("blank-")) {
          // Create a SubmissionAnswer for a question the student left blank
          const questionId = grade.answerId.replace("blank-", "");
          await prisma.submissionAnswer.create({
            data: {
              submissionId,
              questionId,
              answer: null,
              score: grade.score,
              feedback: grade.feedback,
              autoGraded: false,
              ...(feedbackImages?.[grade.answerId]?.length && {
                feedbackImageUrls: feedbackImages[grade.answerId],
              }),
            },
          });
        } else {
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
      }
    }

    // Determine total score: use overallScore if provided, otherwise sum per-question scores
    let finalTotalScore: number;
    if (overallScore !== undefined) {
      finalTotalScore = overallScore;
    } else if (grades && grades.length > 0) {
      const updatedAnswers = await prisma.submissionAnswer.findMany({
        where: { submissionId },
      });
      finalTotalScore = updatedAnswers.reduce(
        (sum, ans) => sum + (ans.score || 0),
        0
      );
    } else {
      return NextResponse.json({ error: "No grades provided" }, { status: 400 });
    }

    // Store overall feedback
    if (overallFeedback !== undefined) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { overallFeedback },
      });
    }

    if (isDraft) {
      // Draft grading: save scores but don't mark as graded
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          totalScore: finalTotalScore,
          ...(feedbackFileUrl !== undefined && { fileUrl: feedbackFileUrl }),
        },
      });
      return NextResponse.json({ success: true, totalScore: finalTotalScore, isDraft: true });
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        totalScore: finalTotalScore,
        gradedAt: new Date(),
        gradedById: graderId,
        ...(feedbackFileUrl !== undefined && { fileUrl: feedbackFileUrl }),
      },
    });

    return NextResponse.json({ success: true, totalScore: finalTotalScore });
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageUrls = ((answer as any).answerImageUrls as string[] | null) || [];
    const result = await aiAssistedGrading(
      answer.question.questionText,
      answer.question.correctAnswer || "",
      answer.answer || "",
      rubricDesc || "Grade based on correctness and completeness",
      answer.question.points,
      provider,
      imageUrls.length > 0 ? imageUrls : undefined
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
