import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    const userId = (session.user as { id: string }).id;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "15")));
    const filterType = searchParams.get("filter"); // "published" | "drafts" | null

    const hasSubmissions = searchParams.get("hasSubmissions") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = userRole === "STUDENT"
      ? { published: true }
      : filterType === "published"
        ? { published: true }
        : filterType === "drafts"
          ? { published: false }
          : {};

    if (hasSubmissions) {
      whereClause.submissions = { some: { isDraft: false } };
    }

    const totalCount = await prisma.assignment.count({ where: whereClause });

    const assignments = await prisma.assignment.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: { select: { name: true } },
        _count: {
          select: {
            submissions: { where: { isDraft: false } },
            questions: true,
          },
        },
        submissions: userRole === "STUDENT"
          ? {
              where: { userId, isDraft: false },
              select: { totalScore: true, submittedAt: true, gradedAt: true },
              take: 1,
            }
          : {
              where: { isDraft: false },
              select: { userId: true, totalScore: true, submittedAt: true, gradedAt: true },
            },
      },
    });

    // Fetch open appeal counts per assignment
    const openAppealCounts = await prisma.gradeAppeal.groupBy({
      by: ["submissionAnswerId"],
      where: {
        status: "OPEN",
        submissionAnswer: {
          submission: {
            assignmentId: { in: assignments.map((a) => a.id) },
          },
        },
      },
    });

    // Map appeal counts to assignment IDs
    const appealsBySubmissionAnswer = await prisma.submissionAnswer.findMany({
      where: {
        id: { in: openAppealCounts.map((c: { submissionAnswerId: string }) => c.submissionAnswerId) },
      },
      select: {
        id: true,
        submission: { select: { assignmentId: true } },
      },
    });

    const appealCountByAssignment: Record<string, number> = {};
    for (const sa of appealsBySubmissionAnswer) {
      const aid = sa.submission.assignmentId;
      appealCountByAssignment[aid] = (appealCountByAssignment[aid] || 0) + 1;
    }

    const formatted = assignments.map((a) => {
      const mySubmission = userRole === "STUDENT"
        ? (a.submissions[0] || null)
        : ((a.submissions as Array<{ userId?: string; totalScore: number | null }>).find((s) => s.userId === userId) || null);
      const ungradedCount = userRole !== "STUDENT"
        ? a.submissions.filter((s) => s.gradedAt === null).length
        : undefined;
      const gradedCount = userRole !== "STUDENT"
        ? a.submissions.filter((s) => s.gradedAt !== null).length
        : undefined;
      return {
        ...a,
        submissions: undefined,
        myScore: mySubmission?.totalScore ?? null,
        mySubmitted: !!mySubmission,
        ungradedCount,
        gradedCount,
        openAppealCount: appealCountByAssignment[a.id] || 0,
      };
    });

    return NextResponse.json({ assignments: formatted, totalCount, page, pageSize });
  } catch (error) {
    console.error("Assignments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    const userId = (session.user as { id: string }).id;
    const { title, description, dueDate, type, totalPoints, questions, pdfUrl, lockAfterSubmit } = await req.json();

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        type,
        totalPoints: totalPoints || 100,
        pdfUrl: pdfUrl || null,
        lockAfterSubmit: lockAfterSubmit || false,
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
    console.error("Create assignment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
