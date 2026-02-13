import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth, sendBulkEmails, publishAssignment } from "@/lib/services/email-service";

export async function GET(req: Request) {
  try {
    const authError = verifyCronAuth(req);
    if (authError) return authError;

    const now = new Date();

    // Find all pending scheduled emails that are due
    const pendingEmails = await prisma.scheduledEmail.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: now },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignment: { select: { id: true, published: true, title: true, createdById: true } },
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

        // Send emails via shared service
        const result = await sendBulkEmails({
          recipientIds,
          subject: scheduled.subject,
          message: scheduled.message,
          senderName,
        });

        if (result.recipients.length === 0) {
          await prisma.scheduledEmail.update({
            where: { id: scheduled.id },
            data: { status: "FAILED", error: "No valid recipients found" },
          });
          errors.push(`No recipients for "${scheduled.subject}"`);
          continue;
        }

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
            error: result.failedCount > 0
              ? `${result.failedCount} of ${result.recipients.length} emails failed`
              : null,
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
              recipientCount: result.recipients.length,
              sentCount: result.sentCount,
              failedCount: result.failedCount,
              createNotification: scheduled.createNotification,
            },
          },
        });

        // Publish linked assignment after email is sent
        if (scheduled.assignment && !scheduled.assignment.published) {
          try {
            const pubResult = await publishAssignment(
              scheduled.assignment.id,
              scheduled.assignment.createdById
            );

            if (pubResult.published) {
              await prisma.auditLog.create({
                data: {
                  userId: scheduled.assignment.createdById,
                  action: "scheduled_publish",
                  details: {
                    assignmentId: scheduled.assignment.id,
                    assignmentTitle: scheduled.assignment.title,
                    triggeredBy: "scheduled_email",
                    scheduledEmailId: scheduled.id,
                    publishedAt: new Date().toISOString(),
                  },
                },
              });

              console.log(`[cron] Published assignment "${scheduled.assignment.title}" after sending scheduled email`);
            }
          } catch (publishError) {
            console.error(`[cron] Failed to publish assignment ${scheduled.assignment.id} after email:`, publishError);
          }
        }

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
