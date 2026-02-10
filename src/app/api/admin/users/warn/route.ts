import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

function isAuthorized(role?: string): boolean {
  return role === "ADMIN" || role === "TA";
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
    const { userId, subject, message } = await req.json();

    if (!userId || !subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "userId, subject, and message are required" },
        { status: 400 }
      );
    }

    if (userId === senderId) {
      return NextResponse.json(
        { error: "Cannot send a warning to yourself" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const html = buildWarningEmailHtml({
      userName: targetUser.name || "Student",
      message: message.trim(),
      senderName,
    });

    await sendEmail({
      to: targetUser.email,
      subject: subject.trim(),
      html,
    });

    await prisma.auditLog.create({
      data: {
        userId: targetUser.id,
        action: "warning_sent",
        details: {
          performedBy: senderId,
          performedByName: senderName,
          subject: subject.trim(),
          message: message.trim(),
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send warning error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function buildWarningEmailHtml({
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
            <td style="background-color: #f59e0b; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">&#9888; PhysTutor Warning</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #111827; font-size: 16px;">Dear ${esc(userName)},</p>
              <p style="margin: 0 0 16px; color: #374151; font-size: 14px; line-height: 1.6;">You are receiving this warning from the PhysTutor course staff regarding your account activity.</p>
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 8px; color: #92400e; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Warning Details</p>
                <p style="margin: 0; color: #451a03; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${esc(message)}</p>
              </div>
              <p style="margin: 24px 0 16px; color: #374151; font-size: 14px; line-height: 1.6;">Please take this warning seriously. Continued violations may result in further action, including restriction of platform access.</p>
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
