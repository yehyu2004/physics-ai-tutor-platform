import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { id } = await params;
    const { title, message } = await req.json();

    if (!title && !message) {
      return NextResponse.json({ error: "Title or message required" }, { status: 400 });
    }

    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(message && { message }),
      },
    });

    return NextResponse.json({ notification });
  } catch (error) {
    console.error("Notification PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { id } = await params;

    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.notification.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notification DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
