import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateProblems, type AIProvider } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { topic, difficulty, count, questionType } = await req.json();

    const aiConfig = await prisma.aIConfig.findFirst({
      where: { isActive: true },
    });

    const provider = (aiConfig?.provider as AIProvider) || "openai";

    const result = await generateProblems(
      topic,
      difficulty,
      count,
      questionType,
      provider
    );

    if (!result) {
      return NextResponse.json(
        { error: "Problem generation failed" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(result);
    const problems = parsed.problems || parsed.questions || [parsed];

    return NextResponse.json({ problems });
  } catch (error) {
    console.error("Problem generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
