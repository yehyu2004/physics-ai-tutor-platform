import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { notificationEmail } from "@/lib/email-templates";

export async function GET(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET environment variable is not configured");
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Find all pending scheduled emails that are due
    const pendingEmails = await prisma.scheduledEmail.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: now },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (pendingEmails.length === 0) {
      return NextResponse.json({ processed: 0, errors: [] });
    }

    const errors: string[] = [];
    let processedCount = 0;

    for (const scheduled of pendingEmails) {
      try {
        const recipientIds = scheduled.recipientIds as string[];
        const senderName = scheduled.createdBy.name || "Staff";

        // Fetch recipient users
        const recipients = await prisma.user.findMany({
          where: { id: { in: recipientIds }, isDeleted: false },
          select: { id: true, name: true, email: true },
        });

        if (recipients.length === 0) {
          await prisma.scheduledEmail.update({
            where: { id: scheduled.id },
            data: { status: "FAILED", error: "No valid recipients found" },
          });
          errors.push(`No recipients for "${scheduled.subject}"`);
          continue;
        }

        // Send emails
        const results = await Promise.allSettled(
          recipients.map((user) => {
            const html = notificationEmail({
              userName: user.name || "Student",
              message: scheduled.message,
              senderName,
            });
            return sendEmail({
              to: user.email,
              subject: scheduled.subject,
              html,
            });
          })
        );

        const sentCount = results.filter((r) => r.status === "fulfilled").length;
        const failedCount = results.filter((r) => r.status === "rejected").length;

        // Create in-app notification if flagged
        if (scheduled.createNotification) {
          await prisma.notification.create({
            data: {
              title: scheduled.subject,
              message: scheduled.message,
              createdById: scheduled.createdById,
              isGlobal: true,
            },
          });
        }

        // Mark as sent
        await prisma.scheduledEmail.update({
          where: { id: scheduled.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            error: failedCount > 0 ? `${failedCount} of ${recipients.length} emails failed` : null,
          },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: scheduled.createdById,
            action: "scheduled_email_sent",
            details: {
              scheduledEmailId: scheduled.id,
              subject: scheduled.subject,
              recipientCount: recipients.length,
              sentCount,
              failedCount,
              createNotification: scheduled.createNotification,
            },
          },
        });

        processedCount++;
      } catch (sendError) {
        console.error(`Failed to process scheduled email ${scheduled.id}:`, sendError);
        errors.push(`Failed for "${scheduled.subject}": ${String(sendError)}`);

        await prisma.scheduledEmail.update({
          where: { id: scheduled.id },
          data: { status: "FAILED", error: String(sendError) },
        }).catch((err) => console.error("[email] Failed to update scheduled email status:", err));
      }
    }

    return NextResponse.json({ processed: processedCount, errors });
  } catch (error) {
    console.error("Cron send-scheduled-emails error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
