import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: { assignment: { select: { lockAfterSubmit: true } } },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (submission.assignment.lockAfterSubmit && !submission.isDraft) {
      return NextResponse.json(
        { error: "This assignment is locked after submission. You cannot delete or resubmit." },
        { status: 403 }
      );
    }

    await prisma.submission.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
