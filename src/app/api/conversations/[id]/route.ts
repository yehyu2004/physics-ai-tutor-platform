import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAuth, isErrorResponse } from "@/lib/api-auth";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;
    const userId = auth.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
    });

    if (!conversation || conversation.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.conversation.update({
      where: { id: params.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
