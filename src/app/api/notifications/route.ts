import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth, requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { isStaff } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;
    const userRole = auth.user.role;

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

    // For staff users, include scheduled assignments and pending scheduled emails
    let scheduledItems: Array<{
      id: string;
      title: string;
      message: string;
      createdByName: string | null;
      createdAt: string;
      isRead: boolean;
      isScheduled: boolean;
      scheduledAt: string;
      hasEmail: boolean;
    }> = [];

    if (isStaff(userRole)) {
      // Fetch scheduled assignments
      const scheduledAssignments = await prisma.assignment.findMany({
        where: {
          published: false,
          scheduledPublishAt: { not: null },
          isDeleted: false,
        },
        orderBy: { scheduledPublishAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          scheduledPublishAt: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          scheduledEmails: {
            where: { status: "PENDING" },
            select: { id: true },
          },
        },
      });

      scheduledItems = scheduledAssignments.map((a) => ({
        id: `scheduled-assignment-${a.id}`,
        title: `📅 ${a.title}`,
        message: a.description || "Assignment scheduled for publishing",
        createdByName: a.createdBy.name,
        createdAt: a.createdAt.toISOString(),
        isRead: true,
        isScheduled: true,
        scheduledAt: a.scheduledPublishAt!.toISOString(),
        hasEmail: a.scheduledEmails.length > 0,
      }));
    }

    const unreadCount = mapped.filter((n) => !n.isRead).length;

    return NextResponse.json({
      ...paginatedResponse(mapped, totalCount, params),
      unreadCount,
      scheduledItems,
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
    const { title, message, assignmentId } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: { title, message, createdById, ...(assignmentId && { assignmentId }) },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error("Notifications POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
