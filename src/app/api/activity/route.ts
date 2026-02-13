import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAndBanSpammer } from "@/lib/spam-guard";
import { requireApiAuth, isErrorResponse } from "@/lib/api-auth";

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

// Deterministic cleanup: delete records older than 1 year, at most once per hour
let lastCleanup = 0;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

function maybeCleanupOldRecords() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Fire and forget — don't block the request
  prisma.userActivity.deleteMany({
    where: { createdAt: { lt: oneYearAgo } },
  }).catch(err => console.error("[cleanup] Failed to prune old activity records:", err));
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;

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
    checkAndBanSpammer({ userId, source: "activity" });

    return NextResponse.json({ ok: true, id: activity.id });
  } catch (error) {
    console.error("Activity tracking error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;
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
