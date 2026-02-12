import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { checkAndBanSpammer } from "@/lib/spam-guard";

// GET: Fetch appeals for a submission (student sees own, TA/ADMIN sees all)
export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const userRole = (session.user as { role?: string }).role;
    const { searchParams } = new URL(req.url);
    const submissionId = searchParams.get("submissionId");
    const assignmentId = searchParams.get("assignmentId");

    // Staff can fetch all open appeals without params (for dashboard)
    if (!submissionId && !assignmentId) {
      if (userRole === "TA" || userRole === "PROFESSOR" || userRole === "ADMIN") {
        const appeals = await prisma.gradeAppeal.findMany({
          where: { status: "OPEN" },
          include: {
            student: { select: { id: true, name: true } },
            submissionAnswer: {
              select: {
                id: true,
                questionId: true,
                score: true,
                feedback: true,
                question: { select: { questionText: true, points: true, order: true } },
                submission: {
                  select: {
                    assignment: { select: { id: true, title: true } },
                    user: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        return NextResponse.json({ appeals });
      }
      return NextResponse.json({ error: "submissionId or assignmentId required" }, { status: 400 });
    }

    // Fetch appeals for a specific submission
    if (submissionId) {
      const whereClause: Record<string, unknown> = {
        submissionAnswer: { submissionId },
      };

      if (userRole === "STUDENT") {
        whereClause.studentId = userId;
      }

      const appeals = await prisma.gradeAppeal.findMany({
        where: whereClause,
        include: {
          student: { select: { id: true, name: true } },
          submissionAnswer: {
            select: {
              id: true,
              questionId: true,
              score: true,
              feedback: true,
              question: { select: { questionText: true, points: true, order: true } },
            },
          },
          messages: {
            include: {
              user: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ appeals });
    }

    // Fetch appeals per assignment (for TA/ADMIN)
    if (assignmentId) {
      if (userRole === "TA" || userRole === "PROFESSOR" || userRole === "ADMIN") {
        const appeals = await prisma.gradeAppeal.findMany({
          where: {
            submissionAnswer: {
              submission: { assignmentId },
            },
          },
          include: {
            student: { select: { id: true, name: true } },
            submissionAnswer: {
              select: {
                id: true,
                questionId: true,
                score: true,
                feedback: true,
                question: { select: { questionText: true, points: true, order: true } },
                submission: { select: { user: { select: { name: true } } } },
              },
            },
            messages: {
              include: {
                user: { select: { id: true, name: true, role: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ appeals });
      }

      // For students, just return count
      const openCount = await prisma.gradeAppeal.count({
        where: {
          status: "OPEN",
          submissionAnswer: {
            submission: { assignmentId },
          },
        },
      });

      return NextResponse.json({ openCount });
    }

    return NextResponse.json({ appeals: [] });
  } catch (error) {
    console.error("Appeals GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Student creates a new appeal for a specific answer
export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { submissionAnswerId, reason, imageUrls } = await req.json();

    if (!submissionAnswerId || !reason) {
      return NextResponse.json({ error: "submissionAnswerId and reason are required" }, { status: 400 });
    }

    // Verify the answer belongs to this student's submission
    const answer = await prisma.submissionAnswer.findUnique({
      where: { id: submissionAnswerId },
      include: { submission: { select: { userId: true } } },
    });

    if (!answer) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    if (answer.submission.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (answer.score === null) {
      return NextResponse.json({ error: "This question has not been graded yet" }, { status: 400 });
    }

    // Check if appeal already exists
    const existing = await prisma.gradeAppeal.findUnique({
      where: {
        submissionAnswerId_studentId: {
          submissionAnswerId,
          studentId: userId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Appeal already exists for this question" }, { status: 409 });
    }

    const appeal = await prisma.gradeAppeal.create({
      data: {
        submissionAnswerId,
        studentId: userId,
        reason,
        imageUrls: imageUrls || undefined,
      },
      include: {
        student: { select: { id: true, name: true } },
        submissionAnswer: {
          select: {
            id: true,
            questionId: true,
            score: true,
            feedback: true,
            question: { select: { questionText: true, points: true, order: true } },
          },
        },
        messages: true,
      },
    });

    return NextResponse.json({ appeal });
  } catch (error) {
    console.error("Appeals POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: TA/ADMIN updates appeal status (resolve/reject) or adds a message
export async function PATCH(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const userRole = (session.user as { role?: string }).role;
    const { appealId, status, message, newScore, imageUrls: msgImageUrls } = await req.json();

    if (!appealId) {
      return NextResponse.json({ error: "appealId is required" }, { status: 400 });
    }

    const appeal = await prisma.gradeAppeal.findUnique({
      where: { id: appealId },
      include: { submissionAnswer: { include: { submission: true } } },
    });

    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }

    // Students can add messages to their own appeals; TA/ADMIN can do anything
    const isOwner = appeal.studentId === userId;
    const isStaff = userRole === "TA" || userRole === "PROFESSOR" || userRole === "ADMIN";

    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Add a message if provided
    if (message) {
      await prisma.appealMessage.create({
        data: {
          appealId,
          userId,
          content: message,
          imageUrls: msgImageUrls || undefined,
        },
      });

      // Check for appeal spam (30 messages/min auto-ban, non-blocking)
      if (!isStaff) {
        checkAndBanSpammer({ userId, source: "appeal" }).catch(() => {});
      }
    }

    // Only staff can change status or score
    if (isStaff && status) {
      await prisma.gradeAppeal.update({
        where: { id: appealId },
        data: { status },
      });

      // If resolving with a new score, update the submission answer
      if (status === "RESOLVED" && newScore !== undefined) {
        await prisma.submissionAnswer.update({
          where: { id: appeal.submissionAnswerId },
          data: { score: newScore },
        });

        // Recalculate total score
        const allAnswers = await prisma.submissionAnswer.findMany({
          where: { submissionId: appeal.submissionAnswer.submissionId },
        });
        const totalScore = allAnswers.reduce(
          (sum, ans) =>
            sum + (ans.id === appeal.submissionAnswerId ? newScore : ans.score || 0),
          0
        );
        await prisma.submission.update({
          where: { id: appeal.submissionAnswer.submissionId },
          data: { totalScore },
        });
      }
    }

    // Return updated appeal
    const updated = await prisma.gradeAppeal.findUnique({
      where: { id: appealId },
      include: {
        student: { select: { id: true, name: true } },
        submissionAnswer: {
          select: {
            id: true,
            questionId: true,
            score: true,
            feedback: true,
            question: { select: { questionText: true, points: true, order: true } },
          },
        },
        messages: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ appeal: updated });
  } catch (error) {
    console.error("Appeals PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
