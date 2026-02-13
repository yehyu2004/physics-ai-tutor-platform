import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

// GET /api/admin/scheduled-emails/[id] - Get a single scheduled email
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { id } = await params;

    const scheduledEmail = await prisma.scheduledEmail.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!scheduledEmail) {
      return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });
    }

    return NextResponse.json({ scheduledEmail });
  } catch (error) {
    console.error("Scheduled email GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/admin/scheduled-emails/[id] - Update or cancel a scheduled email
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.scheduledEmail.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cannot modify a scheduled email with status "${existing.status}"` },
        { status: 400 }
      );
    }

    // Cancel action
    if (body.status === "CANCELLED") {
      const updated = await prisma.scheduledEmail.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "scheduled_email_cancelled",
          details: {
            scheduledEmailId: id,
            subject: existing.subject,
          },
        },
      });

      return NextResponse.json({ scheduledEmail: updated });
    }

    // Update fields
    const updateData: Record<string, unknown> = {};

    if (body.subject !== undefined) updateData.subject = body.subject.trim();
    if (body.message !== undefined) updateData.message = body.message.trim();
    if (body.createNotification !== undefined) updateData.createNotification = body.createNotification;
    if (body.recipientIds !== undefined) {
      if (!Array.isArray(body.recipientIds) || body.recipientIds.length === 0) {
        return NextResponse.json({ error: "recipientIds must be a non-empty array" }, { status: 400 });
      }
      updateData.recipientIds = body.recipientIds;
    }
    if (body.scheduledAt !== undefined) {
      const newDate = new Date(body.scheduledAt);
      if (isNaN(newDate.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
      }
      if (newDate <= new Date()) {
        return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
      }
      updateData.scheduledAt = newDate;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.scheduledEmail.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ scheduledEmail: updated });
  } catch (error) {
    console.error("Scheduled email PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/scheduled-emails/[id] - Delete a pending scheduled email
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { id } = await params;

    const existing = await prisma.scheduledEmail.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });
    }

    await prisma.scheduledEmail.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "scheduled_email_deleted",
        details: {
          scheduledEmailId: id,
          subject: existing.subject,
          status: existing.status,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Scheduled email DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
