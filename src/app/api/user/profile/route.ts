import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth, isErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;

    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        role: true,
        image: true,
        createdAt: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;
    const body = await req.json();
    const { name, studentId } = body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check studentId uniqueness if being updated
    if (studentId !== undefined && studentId !== user.studentId) {
      if (studentId && studentId.trim()) {
        const existing = await prisma.user.findUnique({
          where: { studentId: studentId.trim() },
        });
        if (existing && existing.id !== user.id) {
          return NextResponse.json(
            { error: "Student ID already in use" },
            { status: 400 }
          );
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name: name.trim() || null }),
        ...(studentId !== undefined && {
          studentId: studentId.trim() || null,
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        role: true,
        image: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
