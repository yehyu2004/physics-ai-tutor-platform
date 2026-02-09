import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
