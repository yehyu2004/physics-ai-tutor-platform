import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth, requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

export async function GET(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const params = parsePaginationParams(searchParams, { pageSize: 20 });

    const [totalCount, notifications] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.findMany({
        take: params.pageSize,
        skip: params.skip,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { name: true } },
          reads: {
            where: { userId },
            select: { id: true },
          },
        },
      }),
    ]);

    const mapped = notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      createdByName: n.createdBy.name,
      createdAt: n.createdAt.toISOString(),
      isRead: n.reads.length > 0,
    }));

    const unreadCount = mapped.filter((n) => !n.isRead).length;

    return NextResponse.json({
      ...paginatedResponse(mapped, totalCount, params),
      unreadCount,
    });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;

    const unreadNotifications = await prisma.notification.findMany({
      where: {
        reads: { none: { userId } },
      },
      select: { id: true },
    });

    if (unreadNotifications.length > 0) {
      await prisma.notificationRead.createMany({
        data: unreadNotifications.map((n) => ({
          notificationId: n.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const createdById = auth.user.id;
    const { title, message } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: { title, message, createdById },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error("Notifications POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
