import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { streamGenerateProblems, type AIProvider } from "@/lib/ai";

export async function GET() {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const problemSets = await prisma.problemSet.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        problems: true,
        createdBy: { select: { name: true } },
      },
    });

    return Response.json({
      problemSets: problemSets.map((ps) => ({
        id: ps.id,
        topic: ps.topic,
        difficulty: ps.difficulty,
        questionType: ps.questionType,
        createdBy: ps.createdBy.name,
        createdAt: ps.createdAt.toISOString(),
        problems: ps.problems,
      })),
    });
  } catch (error) {
    console.error("Problem sets fetch error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { topic, difficulty, count, questionType } = await req.json();

    const aiConfig = await prisma.aIConfig.findFirst({
      where: { isActive: true },
    });

    const provider = (aiConfig?.provider as AIProvider) || "openai";

    const encoder = new TextEncoder();
    let fullContent = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          if (provider === "openai") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = await streamGenerateProblems(topic, difficulty, count, questionType, "openai") as any;
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content || "";
              if (delta) {
                fullContent += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`));
              }
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = await streamGenerateProblems(topic, difficulty, count, questionType, "anthropic") as any;
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta?.text) {
                fullContent += event.delta.text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content: event.delta.text })}\n\n`));
              }
            }
          }
        } catch (aiError) {
          console.error("AI Error:", aiError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Problem generation failed" })}\n\n`));
          controller.close();
          return;
        }

        // Parse JSON and persist
        try {
          // Extract JSON from possible markdown code fence
          let jsonStr = fullContent.trim();
          const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) jsonStr = fenceMatch[1].trim();

          const parsed = JSON.parse(jsonStr);
          const problems = parsed.problems || parsed.questions || [parsed];

          const problemSet = await prisma.problemSet.create({
            data: {
              topic,
              difficulty,
              questionType,
              createdById: userId,
              problems: {
                create: problems.map((p: { questionText: string; questionType?: string; options?: string[]; correctAnswer: string; solution?: string; points?: number; diagram?: { type: string; content: string } }) => ({
                  questionText: p.questionText || "",
                  questionType: p.questionType || questionType,
                  options: p.options || null,
                  correctAnswer: p.correctAnswer || "",
                  solution: p.solution || "",
                  points: p.points || 10,
                  diagram: p.diagram || null,
                })),
              },
            },
            include: { problems: true },
          });

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", problemSetId: problemSet.id, problems: problemSet.problems })}\n\n`));
        } catch (parseError) {
          console.error("Parse/save error:", parseError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Failed to parse generated problems" })}\n\n`));
        }

        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Problem generation error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
