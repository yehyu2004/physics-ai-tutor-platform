import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;

    const assignments = await prisma.assignment.findMany({
      where: userRole === "STUDENT" ? { published: true } : {},
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { submissions: true, questions: true } },
      },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Assignments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = (session.user as { id: string }).id;
    const { title, description, dueDate, type, totalPoints, questions } = await req.json();

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        type,
        totalPoints: totalPoints || 100,
        createdById: userId,
        questions: {
          create: (questions || []).map((q: { questionText: string; questionType: string; options?: string[]; correctAnswer?: string; points?: number }, i: number) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options || null,
            correctAnswer: q.correctAnswer || null,
            points: q.points || 10,
            order: i,
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
