import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

export async function GET() {
  try {
    const auth = await requireApiRole(["ADMIN", "PROFESSOR"]);
    if (isErrorResponse(auth)) return auth;

    const config = await prisma.aIConfig.findFirst({
      where: { isActive: true },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["ADMIN", "PROFESSOR"]);
    if (isErrorResponse(auth)) return auth;

    const { provider, model, systemPrompt } = await req.json();

    await prisma.aIConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const config = await prisma.aIConfig.create({
      data: {
        provider,
        model,
        systemPrompt: systemPrompt || null,
        isActive: true,
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Save settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
