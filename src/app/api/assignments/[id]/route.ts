import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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

    const assignment = await prisma.assignment.findUnique({
      where: { id: params.id },
      include: {
        questions: { orderBy: { order: "asc" } },
        createdBy: { select: { name: true } },
        publishedBy: { select: { name: true } },
        _count: { select: { submissions: { where: { isDraft: false } } } },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Students can only access published assignments
    if (userRole === "STUDENT" && !assignment.published) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ assignment });
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
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    const userId = (session.user as { id: string }).id;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    const assignment = await prisma.assignment.update({
      where: { id: params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.published !== undefined && { published: data.published }),
        ...(data.published === true && { publishedById: userId }),
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
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    const deleteUserId = (session.user as { id: string }).id;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // TAs can only delete their own assignments
    if (userRole === "TA") {
      const existing = await prisma.assignment.findUnique({
        where: { id: params.id },
        select: { createdById: true },
      });
      if (!existing || existing.createdById !== deleteUserId) {
        return NextResponse.json({ error: "Forbidden: you can only delete your own assignments" }, { status: 403 });
      }
    }

    await prisma.assignment.delete({
      where: { id: params.id },
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
