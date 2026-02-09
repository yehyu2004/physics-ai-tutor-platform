import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamChat, type ChatMessage, type AIProvider } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { conversationId, message, imageUrl, model } = await req.json();

    let convId = conversationId;

    if (!convId) {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: message.slice(0, 50) || "New Chat",
        },
      });
      convId = conversation.id;
    }

    await prisma.message.create({
      data: {
        conversationId: convId,
        role: "user",
        content: message,
        imageUrl,
      },
    });

    const previousMessages = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "asc" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatMessages: ChatMessage[] = previousMessages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      imageUrl: m.imageUrl || undefined,
    }));

    const provider: AIProvider = model?.startsWith("claude") ? "anthropic" : "openai";

    let fullContent = "";

    try {
      const aiConfig = await prisma.aIConfig.findFirst({
        where: { isActive: true },
      });

      const systemPrompt = aiConfig?.systemPrompt || undefined;

      if (provider === "openai") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await streamChat(chatMessages, "openai", model || "gpt-5-mini", systemPrompt) as any;
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content || "";
          fullContent += delta;
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await streamChat(chatMessages, "anthropic", model, systemPrompt) as any;
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta?.text) {
            fullContent += event.delta.text;
          }
        }
      }
    } catch (aiError) {
      console.error("AI Error:", aiError);
      fullContent = "I'm sorry, I encountered an error while processing your request. Please check that the AI API keys are configured correctly.";
    }

    await prisma.message.create({
      data: {
        conversationId: convId,
        role: "assistant",
        content: fullContent,
        model: model || "gpt-5-mini",
      },
    });

    await prisma.conversation.update({
      where: { id: convId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      conversationId: convId,
      content: fullContent,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
