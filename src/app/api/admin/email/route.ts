import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

function isAuthorized(role?: string): boolean {
  return role === "ADMIN" || role === "PROFESSOR" || role === "TA";
}

function buildEmailHtml({
  userName,
  message,
  senderName,
}: {
  userName: string;
  message: string;
  senderName: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #4f46e5; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">PhysTutor Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #111827; font-size: 16px;">Dear ${esc(userName)},</p>
              <div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0; color: #1e1b4b; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${esc(message)}</p>
              </div>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">&mdash; ${esc(senderName)}, PhysTutor Staff</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">This is an automated message from PhysTutor. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (!isAuthorized(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const senderId = (session.user as { id: string }).id;
    const senderName = (session.user as { name?: string }).name || "Staff";
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
        const html = buildEmailHtml({
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
