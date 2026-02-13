import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { assignmentPublishedEmail } from "@/lib/email-templates";

export async function GET(req: Request) {
  try {
    // Verify cron secret (Vercel sends this as Authorization: Bearer <secret>)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET environment variable is not configured");
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all assignments ready to publish
    const now = new Date();
    const assignments = await prisma.assignment.findMany({
      where: {
        scheduledPublishAt: { lte: now },
        published: false,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (assignments.length === 0) {
      return NextResponse.json({ published: 0, errors: [] });
    }

    const errors: string[] = [];
    let publishedCount = 0;

    for (const assignment of assignments) {
      try {
        // Publish the assignment (use WHERE published=false to prevent double-publish)
        const updated = await prisma.assignment.updateMany({
          where: { id: assignment.id, published: false },
          data: {
            published: true,
            publishedById: assignment.createdById,
            scheduledPublishAt: null,
          },
        });

        if (updated.count === 0) continue; // Already published by another process
        publishedCount++;

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: assignment.createdById,
            action: "scheduled_publish",
            details: {
              assignmentId: assignment.id,
              assignmentTitle: assignment.title,
              scheduledAt: assignment.scheduledPublishAt?.toISOString(),
              publishedAt: now.toISOString(),
            },
          },
        });

        // Send notification emails if flagged
        if (assignment.notifyOnPublish) {
          try {
            const students = await prisma.user.findMany({
              where: { role: "STUDENT", isBanned: false, isDeleted: false },
              select: { id: true, name: true, email: true },
            });

            if (students.length > 0) {
              const dueDateStr = assignment.dueDate
                ? new Date(assignment.dueDate).toLocaleString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "No due date set";

              const senderName = assignment.createdBy.name || "Staff";

              await Promise.allSettled(
                students.map((student) => {
                  const html = assignmentPublishedEmail({
                    studentName: student.name || "Student",
                    assignmentTitle: assignment.title,
                    assignmentDescription: assignment.description,
                    dueDateStr,
                    totalPoints: assignment.totalPoints,
                    senderName,
                  });

                  return sendEmail({
                    to: student.email,
                    subject: `New Assignment: ${assignment.title}`,
                    html,
                  });
                })
              );

              // Create in-app notification
              await prisma.notification.create({
                data: {
                  title: `New Assignment: ${assignment.title}`,
                  message: `A new assignment "${assignment.title}" has been published.${assignment.dueDate ? ` Due: ${dueDateStr}` : ""}`,
                  createdById: assignment.createdById,
                  isGlobal: true,
                },
              });
            }
          } catch (notifyError) {
            console.error(`Failed to send notifications for assignment ${assignment.id}:`, notifyError);
            errors.push(`Notification failed for "${assignment.title}": ${String(notifyError)}`);
            // Don't block — assignment is already published
          }
        }
      } catch (publishError) {
        console.error(`Failed to publish assignment ${assignment.id}:`, publishError);
        errors.push(`Publish failed for "${assignment.title}": ${String(publishError)}`);
      }
    }

    return NextResponse.json({ published: publishedCount, errors });
  } catch (error) {
    console.error("Cron publish-scheduled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
