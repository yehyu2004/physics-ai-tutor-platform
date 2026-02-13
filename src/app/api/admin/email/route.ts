import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { sendBulkEmails } from "@/lib/services/email-service";

export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;
    const senderId = auth.user.id;
    const senderName = auth.user.name || "Staff";
    const { userIds, subject, message } = await req.json();

    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !subject?.trim() ||
      !message?.trim()
    ) {
      return NextResponse.json(
        { error: "userIds (non-empty array), subject, and message are required" },
        { status: 400 }
      );
    }

    // Input size limits
    if (typeof subject !== "string" || subject.length > 500) {
      return NextResponse.json(
        { error: "Subject must be 500 characters or fewer" },
        { status: 400 }
      );
    }
    if (typeof message !== "string" || message.length > 50000) {
      return NextResponse.json(
        { error: "Message must be 50,000 characters or fewer" },
        { status: 400 }
      );
    }

    const MAX_RECIPIENTS = 200;
    if (userIds.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients. Maximum is ${MAX_RECIPIENTS}.` },
        { status: 400 }
      );
    }

    const result = await sendBulkEmails({
      recipientIds: userIds,
      subject: subject.trim(),
      message: message.trim(),
      senderName,
    });

    if (result.recipients.length === 0) {
      return NextResponse.json({ error: "No valid recipients found" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        userId: senderId,
        action: "bulk_email_sent",
        details: {
          performedBy: senderId,
          performedByName: senderName,
          recipientIds: result.recipients.map((u) => u.id),
          recipientCount: result.recipients.length,
          subject: subject.trim(),
          message: message.trim(),
          sentCount: result.sentCount,
          failedCount: result.failedCount,
        },
      },
    });

    return NextResponse.json({
      success: true,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      ...(result.errors.length > 0 && { errors: result.errors }),
    });
  } catch (error) {
    console.error("Bulk email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
