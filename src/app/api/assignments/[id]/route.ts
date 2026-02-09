import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const assignment = await prisma.assignment.update({
      where: { id: params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.published !== undefined && { published: data.published }),
        ...(data.totalPoints !== undefined && { totalPoints: data.totalPoints }),
      },
    });

    return NextResponse.json({ assignment });
  } catch (error) {
    console.error("Update assignment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
