import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

// GET /api/admin/scheduled-emails - List scheduled emails
export async function GET() {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const scheduledEmails = await prisma.scheduledEmail.findMany({
      orderBy: { scheduledAt: "asc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ scheduledEmails });
  } catch (error) {
    console.error("Scheduled emails GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/scheduled-emails - Create a scheduled email
export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { subject, message, scheduledAt, recipientIds, createNotification, assignmentId } = await req.json();

    if (!subject?.trim() || !message?.trim() || !scheduledAt || !Array.isArray(recipientIds)) {
      return NextResponse.json(
        { error: "subject, message, scheduledAt, and recipientIds are required" },
        { status: 400 }
      );
    }

    // recipientIds can be empty when createNotification is true (notification-only, no email)
    if (recipientIds.length === 0 && !createNotification) {
      return NextResponse.json(
        { error: "recipientIds must be non-empty, or createNotification must be true" },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }
    if (scheduledDate <= new Date()) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
    }

    const MAX_RECIPIENTS = 200;
    if (recipientIds.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients. Maximum is ${MAX_RECIPIENTS}.` },
        { status: 400 }
      );
    }

    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        subject: subject.trim(),
        message: message.trim(),
        scheduledAt: scheduledDate,
        recipientIds,
        createdById: auth.user.id,
        createNotification: createNotification ?? false,
        assignmentId: assignmentId || null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "scheduled_email_created",
        details: {
          scheduledEmailId: scheduledEmail.id,
          subject: subject.trim(),
          scheduledAt: scheduledDate.toISOString(),
          recipientCount: recipientIds.length,
          createNotification: createNotification ?? false,
          assignmentId: assignmentId || null,
        },
      },
    });

    return NextResponse.json({ scheduledEmail }, { status: 201 });
  } catch (error) {
    console.error("Scheduled emails POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
