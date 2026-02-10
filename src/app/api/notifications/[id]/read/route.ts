import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { id: notificationId } = await params;

    await prisma.notificationRead.upsert({
      where: {
        notificationId_userId: { notificationId, userId },
      },
      create: { notificationId, userId },
      update: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notification read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
