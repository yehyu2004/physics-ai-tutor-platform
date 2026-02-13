import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";
import { notificationEmail } from "@/lib/email-templates";

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

    // Limit bulk email recipients to prevent spam
    const MAX_RECIPIENTS = 200;
    if (userIds.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients. Maximum is ${MAX_RECIPIENTS}.` },
        { status: 400 }
      );
    }

    const targetUsers = await prisma.user.findMany({
      where: { id: { in: userIds }, isDeleted: false },
      select: { id: true, name: true, email: true },
    });

    if (targetUsers.length === 0) {
      return NextResponse.json(
        { error: "No valid recipients found" },
        { status: 404 }
      );
    }

    const results = await Promise.allSettled(
      targetUsers.map((user) => {
        const html = notificationEmail({
          userName: user.name || "Student",
          message: message.trim(),
          senderName,
        });
        return sendEmail({
          to: user.email,
          subject: subject.trim(),
          html,
        });
      })
    );

    const sentCount = results.filter((r) => r.status === "fulfilled").length;
    const failedCount = results.filter((r) => r.status === "rejected").length;
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason?.message || r.reason));

    await prisma.auditLog.create({
      data: {
        userId: senderId,
        action: "bulk_email_sent",
        details: {
          performedBy: senderId,
          performedByName: senderName,
          recipientIds: targetUsers.map((u) => u.id),
          recipientCount: targetUsers.length,
          subject: subject.trim(),
          message: message.trim(),
          sentCount,
          failedCount,
        },
      },
    });

    return NextResponse.json({ success: true, sentCount, failedCount, ...(errors.length > 0 && { errors }) });
  } catch (error) {
    console.error("Bulk email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
