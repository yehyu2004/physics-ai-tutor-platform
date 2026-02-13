import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

/**
 * Check if a user should be auto-banned for spam.
 * Counts records in a table within a time window.
 * If threshold exceeded: bans user, sends email, logs audit.
 *
 * @returns true if user was banned (or already banned)
 */
export async function checkAndBanSpammer({
  userId,
  source,
  threshold = 30,
  windowMs = 60_000,
}: {
  userId: string;
  source: "activity" | "chat" | "appeal";
  threshold?: number;
  windowMs?: number;
}): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMs);

    // Count recent records based on source
    let recentCount: number;
    if (source === "chat") {
      recentCount = await prisma.message.count({
        where: {
          conversation: { userId },
          role: "user",
          createdAt: { gte: since },
        },
      });
    } else if (source === "appeal") {
      recentCount = await prisma.appealMessage.count({
        where: {
          user: { id: userId },
          createdAt: { gte: since },
        },
      });
    } else {
      recentCount = await prisma.userActivity.count({
        where: { userId, createdAt: { gte: since } },
      });
    }

    if (recentCount < threshold) return false;

    // Check if already banned
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, name: true, email: true },
    });
    if (!user || user.isBanned) return user?.isBanned ?? false;

    // Ban the user
    await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, bannedAt: new Date() },
    });

    const sourceLabel = source === "chat" ? "chat messages" : source === "appeal" ? "appeal messages" : "activity requests";
    const reason = `Auto-banned: ${recentCount} ${sourceLabel} in 1 minute (threshold: ${threshold})`;

    // Log ban in audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: "ban",
        details: { performedBy: "system", reason },
      },
    });

    // Send email to banned user
    const name = user.name || "User";
    const email = user.email;
    if (email) {
      const subject = "PhysTutor Account Suspended — Unusual Activity Detected";
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4f46e5; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">PhysTutor — Account Suspended</h2>
          </div>
          <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p>Hi ${name},</p>
            <p>Your PhysTutor account has been <strong>temporarily suspended</strong> due to unusual activity.</p>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
              <strong>Reason:</strong> Our system detected ${recentCount} rapid ${sourceLabel} within 1 minute, which exceeds normal usage patterns.
            </div>
            <p>If you believe this was a mistake, please contact your TA or Professor to have your account reviewed and reinstated.</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">This is an automated message. Please do not reply to this email.</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">— PhysTutor System</p>
          </div>
        </div>
      `;
      await sendEmail({ to: email, subject, html });

      // Log email in audit
      await prisma.auditLog.create({
        data: {
          userId,
          action: "bulk_email_sent",
          details: {
            performedBy: "system",
            performedByName: "PhysTutor System",
            recipientIds: [userId],
            recipientCount: 1,
            subject,
            message: reason,
            sentCount: 1,
            failedCount: 0,
          },
        },
      });

      // Email TAs about the ban
      const tas = await prisma.user.findMany({
        where: { role: { in: ["TA", "PROFESSOR", "ADMIN"] }, isBanned: false, isDeleted: false },
        select: { email: true },
      });
      const taEmails = tas.map((t) => t.email).filter(Boolean) as string[];
      if (taEmails.length > 0) {
        await sendEmail({
          to: taEmails,
          subject: `[PhysTutor] User auto-banned: ${(name || "").replace(/[\r\n]/g, "")} (${(email || "").replace(/[\r\n]/g, "")})`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">User Auto-Banned</h2>
              </div>
              <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p><strong>${name}</strong> (${email}) has been automatically banned.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>Visit <a href="${process.env.NEXTAUTH_URL || ""}/admin/users">User Management</a> to review and unban if needed.</p>
              </div>
            </div>
          `,
        });
      }
    }

    console.warn(`[spam] Auto-banned user ${userId} (${email}): ${reason}`);
    return true;
  } catch (error) {
    console.error("[spam] Error checking/banning spammer:", error);
    return false;
  }
}
