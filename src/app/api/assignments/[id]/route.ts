import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireApiAuth, requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { isStaff as isStaffRole } from "@/lib/constants";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;
    const userRole = auth.user.role;
    const isStaff = isStaffRole(userRole);

    // Step 1: assignment + user's submission in parallel (fast indexed lookups)
    const [assignment, submission] = await Promise.all([
      prisma.assignment.findFirst({
        where: { id: params.id, isDeleted: false },
        include: {
          questions: { orderBy: { order: "asc" } },
          createdBy: { select: { name: true } },
          publishedBy: { select: { name: true } },
          ...(isStaff && { _count: { select: { submissions: { where: { isDraft: false } } } } }),
        },
      }),
      prisma.submission.findFirst({
        where: { assignmentId: params.id, userId },
        include: { answers: true },
      }),
    ]);

    if (!assignment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (userRole === "STUDENT" && !assignment.published) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Step 2: fetch appeals using direct indexed lookups (avoids slow nested relation filter)
    const appealsInclude = {
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
        orderBy: { createdAt: "asc" as const },
      },
    } as const;

    let appeals: Awaited<ReturnType<typeof prisma.gradeAppeal.findMany>> = [];

    if (!isStaff) {
      // Student: use answer IDs from their submission (no extra query needed)
      if (submission) {
        const answerIds = submission.answers.map((a) => a.id);
        if (answerIds.length > 0) {
          appeals = await prisma.gradeAppeal.findMany({
            where: { submissionAnswerId: { in: answerIds }, studentId: userId },
            include: appealsInclude,
            orderBy: { createdAt: "desc" },
          });
        }
      }
    } else {
      // Staff: direct indexed lookups instead of nested relation filter
      // Step 2a: submission IDs (uses @@index([assignmentId]) on Submission)
      const submissionRows = await prisma.submission.findMany({
        where: { assignmentId: params.id },
        select: { id: true },
      });
      if (submissionRows.length > 0) {
        // Step 2b: answer IDs (uses @@index([submissionId]) on SubmissionAnswer)
        const answerRows = await prisma.submissionAnswer.findMany({
          where: { submissionId: { in: submissionRows.map((s) => s.id) } },
          select: { id: true },
        });
        if (answerRows.length > 0) {
          appeals = await prisma.gradeAppeal.findMany({
            where: { submissionAnswerId: { in: answerRows.map((a) => a.id) } },
            include: appealsInclude,
            orderBy: { createdAt: "desc" },
          });
        }
      }
    }

    // Ensure _count exists for frontend even for students
    const assignmentData = isStaff
      ? assignment
      : { ...assignment, _count: { submissions: 0 } };

    return NextResponse.json({
      assignment: assignmentData,
      submission: submission || null,
      appeals,
    });
  } catch (error) {
    console.error("Assignment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const userRole = auth.user.role;
    const userId = auth.user.id;

    const data = await req.json();

    // If questions are provided, delete existing and re-create
    if (data.questions) {
      await prisma.assignmentQuestion.deleteMany({
        where: { assignmentId: params.id },
      });
      await prisma.assignmentQuestion.createMany({
        data: (data.questions as Array<{ questionText: string; questionType: string; options?: string[]; correctAnswer?: string; points?: number; diagram?: { type: string; content: string }; imageUrl?: string }>).map((q, i) => ({
          assignmentId: params.id,
          questionText: q.questionText,
          questionType: q.questionType as "MC" | "NUMERIC" | "FREE_RESPONSE",
          options: q.options ?? Prisma.JsonNull,
          correctAnswer: q.correctAnswer || null,
          points: q.points || 10,
          order: i,
          diagram: q.diagram ?? Prisma.JsonNull,
          imageUrl: q.imageUrl || null,
        })),
      });
    }

    // Validate scheduledPublishAt if provided
    if (data.scheduledPublishAt !== undefined && data.scheduledPublishAt !== null) {
      const scheduledDate = new Date(data.scheduledPublishAt);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledPublishAt date" }, { status: 400 });
      }
      if (scheduledDate <= new Date()) {
        return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
      }
    }

    // If publishing immediately, ignore any schedule
    const isPublishingNow = data.published === true;

    // Cancel linked PENDING scheduled emails when schedule is cleared
    const isClearingSchedule =
      isPublishingNow ||
      data.published === false ||
      (!isPublishingNow && data.scheduledPublishAt === null);

    if (isClearingSchedule) {
      await prisma.scheduledEmail.updateMany({
        where: { assignmentId: params.id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }

    const assignment = await prisma.assignment.update({
      where: { id: params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.published !== undefined && { published: data.published }),
        ...(data.published === true && { publishedById: userId }),
        // Clear schedule when publishing immediately or unpublishing
        ...(isPublishingNow && { scheduledPublishAt: null }),
        ...(data.published === false && { scheduledPublishAt: null }),
        // Set schedule only when not publishing immediately
        ...(!isPublishingNow && data.scheduledPublishAt !== undefined && {
          scheduledPublishAt: data.scheduledPublishAt ? new Date(data.scheduledPublishAt) : null,
        }),
        ...(data.notifyOnPublish !== undefined && { notifyOnPublish: data.notifyOnPublish }),
        ...(data.totalPoints !== undefined && { totalPoints: data.totalPoints }),
        ...(data.pdfUrl !== undefined && { pdfUrl: data.pdfUrl || null }),
        ...(data.lockAfterSubmit !== undefined && { lockAfterSubmit: data.lockAfterSubmit }),
      },
      include: {
        questions: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json({ assignment });
  } catch (error) {
    console.error("Update assignment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const userRole = auth.user.role;
    const deleteUserId = auth.user.id;

    // TAs can only delete their own assignments
    if (userRole === "TA") {
      const existing = await prisma.assignment.findUnique({
        where: { id: params.id, isDeleted: false },
        select: { createdById: true },
      });
      if (!existing || existing.createdById !== deleteUserId) {
        return NextResponse.json({ error: "Forbidden: you can only delete your own assignments" }, { status: 403 });
      }
    }

    await prisma.assignment.update({
      where: { id: params.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: deleteUserId,
        action: "assignment_deleted",
        details: { assignmentId: params.id },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete assignment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
