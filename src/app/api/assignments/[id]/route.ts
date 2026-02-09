import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: params.id },
      include: {
        questions: { orderBy: { order: "asc" } },
        createdBy: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
    });

    if (!assignment) {
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
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
        ...(data.totalPoints !== undefined && { totalPoints: data.totalPoints }),
        ...(data.pdfUrl !== undefined && { pdfUrl: data.pdfUrl || null }),
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.assignment.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete assignment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
