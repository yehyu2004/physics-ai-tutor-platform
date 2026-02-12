import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const VALID_CATEGORIES = [
  "AI_CHAT",
  "ASSIGNMENT_VIEW",
  "ASSIGNMENT_SUBMIT",
  "GRADING",
  "SIMULATION",
  "PROBLEM_GEN",
  "ANALYTICS_VIEW",
  "ADMIN_ACTION",
] as const;

// Probabilistic cleanup: delete records older than 1 year (~1% of requests)
async function maybeCleanupOldRecords() {
  if (Math.random() > 0.01) return;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  await prisma.userActivity.deleteMany({
    where: { createdAt: { lt: oneYearAgo } },
  }).catch(() => {}); // silently ignore errors
}

// Spam threshold: 30+ activity records in 1 minute triggers auto-ban
const SPAM_THRESHOLD = 30;
const SPAM_WINDOW_MS = 60 * 1000;

async function checkAndBanSpammer(userId: string) {
  try {
    const recentCount = await prisma.userActivity.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - SPAM_WINDOW_MS) },
      },
    });

    if (recentCount < SPAM_THRESHOLD) return false;

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

    // Log in audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: "ban",
        details: {
          performedBy: "system",
          reason: `Auto-banned: ${recentCount} activity requests in 1 minute (threshold: ${SPAM_THRESHOLD})`,
        },
      },
    });

    // Send email notification
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
            <p>Your PhysTutor account has been <strong>temporarily suspended</strong> due to unusual activity detected on your account.</p>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
              <strong>Reason:</strong> Our system detected ${recentCount} rapid requests within 1 minute, which exceeds normal usage patterns. This may indicate automated scripting or a compromised account.
            </div>
            <p>If you believe this was a mistake, please contact your TA or Professor to have your account reviewed and reinstated.</p>
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
            message: `Auto-ban notification: ${recentCount} rapid requests in 1 minute`,
            sentCount: 1,
            failedCount: 0,
          },
        },
      });
    }

    console.warn(`[spam] Auto-banned user ${userId} (${email}): ${recentCount} requests in 1 minute`);
    return true;
  } catch (error) {
    console.error("[spam] Error checking/banning spammer:", error);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    // Check if user is banned
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true },
    });
    if (currentUser?.isBanned) {
      return NextResponse.json({ error: "Account suspended" }, { status: 403 });
    }

    const body = await req.json();
    const { category, detail, id, durationMs } = body;

    // Duration update (used by sendBeacon which can only POST)
    if (id && typeof durationMs === "number") {
      const cappedDuration = Math.min(Math.max(durationMs, 0), 2 * 60 * 60 * 1000);
      await prisma.userActivity.updateMany({
        where: { id, userId },
        data: { durationMs: cappedDuration },
      });
      return NextResponse.json({ ok: true });
    }

    // New activity creation
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Rate limit: skip if same user+category was created in last 3 seconds
    const recentDuplicate = await prisma.userActivity.findFirst({
      where: {
        userId,
        category,
        createdAt: { gte: new Date(Date.now() - 3000) },
      },
      select: { id: true },
    });
    if (recentDuplicate) {
      return NextResponse.json({ ok: true, id: recentDuplicate.id });
    }

    const activity = await prisma.userActivity.create({
      data: {
        userId,
        category,
        detail: detail || null,
      },
    });

    // Trigger cleanup in background (non-blocking)
    maybeCleanupOldRecords();

    // Check for spam and auto-ban if threshold exceeded (non-blocking)
    checkAndBanSpammer(userId);

    return NextResponse.json({ ok: true, id: activity.id });
  } catch (error) {
    console.error("Activity tracking error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await req.json();
    const { id, durationMs } = body;

    if (!id || typeof durationMs !== "number" || durationMs < 0) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // Cap at 2 hours to prevent runaway tabs
    const cappedDuration = Math.min(durationMs, 2 * 60 * 60 * 1000);

    await prisma.userActivity.updateMany({
      where: { id, userId },
      data: { durationMs: cappedDuration },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Activity duration update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
