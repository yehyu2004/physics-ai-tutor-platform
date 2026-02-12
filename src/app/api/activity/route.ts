import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

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

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
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

    const activity = await prisma.userActivity.create({
      data: {
        userId,
        category,
        detail: detail || null,
      },
    });

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
