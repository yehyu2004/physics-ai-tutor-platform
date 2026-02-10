import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const latest = await prisma.examMode.findFirst({
      orderBy: { toggledAt: "desc" },
      include: { toggledBy: { select: { name: true } } },
    });

    return NextResponse.json({
      isActive: latest?.isActive ?? false,
      message: latest?.message ?? null,
      toggledByName: latest?.toggledBy?.name ?? null,
      toggledAt: latest?.toggledAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Exam mode GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const toggledById = (session.user as { id: string }).id;
    const { isActive, message } = await req.json();

    const record = await prisma.examMode.create({
      data: {
        isActive: !!isActive,
        message: message || null,
        toggledById,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: toggledById,
        action: isActive ? "exam_mode_on" : "exam_mode_off",
        details: { message: message || null },
      },
    });

    return NextResponse.json({
      isActive: record.isActive,
      message: record.message,
    });
  } catch (error) {
    console.error("Exam mode PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
