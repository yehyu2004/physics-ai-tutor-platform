import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireApiAuth, requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userRole = auth.user.role;
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "15")));
    const filterType = searchParams.get("filter"); // "published" | "drafts" | "scheduled" | null

    const hasSubmissions = searchParams.get("hasSubmissions") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = userRole === "STUDENT"
      ? { published: true, isDeleted: false }
      : filterType === "published"
        ? { published: true, isDeleted: false }
        : filterType === "drafts"
          ? { published: false, scheduledPublishAt: null, isDeleted: false }
          : filterType === "scheduled"
            ? { published: false, scheduledPublishAt: { not: null }, isDeleted: false }
            : { isDeleted: false };

    if (hasSubmissions) {
      whereClause.submissions = { some: { isDraft: false } };
    }

    const search = searchParams.get("search")?.trim();
    if (search) {
      whereClause.title = { contains: search, mode: "insensitive" };
    }

    const totalCount = await prisma.assignment.count({ where: whereClause });

    const assignments = await prisma.assignment.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: { select: { name: true } },
        publishedBy: { select: { name: true } },
        _count: {
          select: {
            submissions: { where: { isDraft: false } },
            questions: true,
          },
        },
        submissions: userRole === "STUDENT"
          ? {
              where: { userId },
              select: { totalScore: true, submittedAt: true, gradedAt: true, isDraft: true, fileUrl: true, _count: { select: { answers: true } } },
              take: 2, // get both draft and final if they exist
            }
          : {
              where: { isDraft: false },
              select: { userId: true, totalScore: true, submittedAt: true, gradedAt: true },
            },
      },
    });

    // Fetch open appeal counts per assignment in a single query
    const assignmentIds = assignments.map((a) => a.id);
    const appealCountByAssignment: Record<string, number> = {};
    if (assignmentIds.length > 0) {
      const appealCounts = await prisma.$queryRaw<Array<{ assignmentId: string; count: bigint }>>`
        SELECT s."assignmentId", COUNT(ga.id) as count
        FROM "GradeAppeal" ga
        JOIN "SubmissionAnswer" sa ON sa.id = ga."submissionAnswerId"
        JOIN "Submission" s ON s.id = sa."submissionId"
        WHERE ga.status = 'OPEN' AND s."assignmentId" = ANY(${assignmentIds})
        GROUP BY s."assignmentId"
      `;
      for (const row of appealCounts) {
        appealCountByAssignment[row.assignmentId] = Number(row.count);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = assignments.map((a: any) => {
      let mySubmission = null;
      let myProgress: { answeredCount: number; totalQuestions: number; status: string } | undefined;

      if (userRole === "STUDENT") {
        const finalSub = a.submissions.find((s: { isDraft: boolean }) => !s.isDraft);
        const draftSub = a.submissions.find((s: { isDraft: boolean }) => s.isDraft);
        mySubmission = finalSub || null;

        if (finalSub) {
          myProgress = { answeredCount: a._count.questions, totalQuestions: a._count.questions, status: "submitted" };
        } else if (draftSub) {
          const answeredCount = draftSub._count?.answers || 0;
          myProgress = { answeredCount, totalQuestions: a._count.questions, status: "in-progress" };
        }

        // FILE_UPLOAD with file attached = done
        if (a.type === "FILE_UPLOAD" && (finalSub?.fileUrl || draftSub?.fileUrl)) {
          myProgress = { answeredCount: a._count.questions, totalQuestions: a._count.questions, status: finalSub ? "submitted" : "in-progress" };
        }
      } else {
        mySubmission = (a.submissions as Array<{ userId?: string; totalScore: number | null }>).find((s) => s.userId === userId) || null;
      }

      const ungradedCount = userRole !== "STUDENT"
        ? a.submissions.filter((s: { gradedAt: Date | null }) => s.gradedAt === null).length
        : undefined;
      const gradedCount = userRole !== "STUDENT"
        ? a.submissions.filter((s: { gradedAt: Date | null }) => s.gradedAt !== null).length
        : undefined;
      return {
        ...a,
        submissions: undefined,
        myScore: mySubmission?.totalScore ?? null,
        mySubmitted: !!mySubmission,
        myGraded: mySubmission?.gradedAt !== null && mySubmission?.gradedAt !== undefined,
        myProgress,
        ungradedCount,
        gradedCount,
        openAppealCount: appealCountByAssignment[a.id] || 0,
      };
    });

    return NextResponse.json({ assignments: formatted, totalCount, page, pageSize });
  } catch (error) {
    logger.error("Assignments GET error", {
      route: "/api/assignments",
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Resource not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;
    const { title, description, dueDate, type, totalPoints, questions, pdfUrl, lockAfterSubmit, scheduledPublishAt, notifyOnPublish } = await req.json();

    // Validate scheduledPublishAt if provided
    if (scheduledPublishAt) {
      const scheduledDate = new Date(scheduledPublishAt);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledPublishAt date" }, { status: 400 });
      }
      if (scheduledDate <= new Date()) {
        return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
      }
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        type,
        totalPoints: totalPoints || 100,
        pdfUrl: pdfUrl || null,
        lockAfterSubmit: lockAfterSubmit || false,
        scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt) : null,
        notifyOnPublish: notifyOnPublish || false,
        createdById: userId,
        questions: {
          create: (questions || []).map((q: { questionText: string; questionType: string; options?: string[]; correctAnswer?: string; points?: number; diagram?: { type: string; content: string }; imageUrl?: string }, i: number) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options || null,
            correctAnswer: q.correctAnswer || null,
            points: q.points || 10,
            order: i,
            diagram: q.diagram || null,
            imageUrl: q.imageUrl || null,
          })),
        },
      },
      include: { questions: true },
    });

    return NextResponse.json({ assignment });
  } catch (error) {
    logger.error("Assignment creation error", {
      route: "/api/assignments",
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Resource not found" }, { status: 404 });
      }
      if (error.code === "P2002") {
        return NextResponse.json({ error: "Duplicate record conflict" }, { status: 409 });
      }
      if (error.code === "P2003") {
        return NextResponse.json({ error: "Referenced record not found" }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
