import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN" && userRole !== "TA") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    const conversations = await prisma.conversation.findMany({
      where: userId ? { userId } : {},
      include: {
        user: { select: { name: true, email: true, isVerified: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        userName: c.user.name || "Unknown",
        userEmail: c.user.email,
        userVerified: c.user.isVerified,
        messageCount: c._count.messages,
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("QA history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
