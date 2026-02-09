import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamChat, SOCRATIC_SYSTEM_PROMPT, type ChatMessage, type AIProvider } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    // Check if user is banned or restricted from using AI chat
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, isRestricted: true },
    });

    if (user?.isBanned) {
      return NextResponse.json(
        { error: "Your account has been suspended. Please contact an administrator." },
        { status: 403 }
      );
    }

    if (user?.isRestricted) {
      return NextResponse.json(
        { error: "Your account has been restricted from using AI chat. Please contact your instructor." },
        { status: 403 }
      );
    }

    const rateCheck = checkRateLimit(userId, user?.isRestricted || false);
    if (!rateCheck.allowed) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: "rate_limit_hit",
          details: { remaining: rateCheck.remaining, resetAt: new Date(rateCheck.resetAt).toISOString() },
        },
      });
      return NextResponse.json(
        { error: `Rate limit exceeded. Please wait before sending more messages. Resets at ${new Date(rateCheck.resetAt).toLocaleTimeString()}.` },
        { status: 429 }
      );
    }

    const { conversationId, message, imageUrl, model, mode } = await req.json();

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
        mode: mode || "normal",
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

      const systemPrompt = mode === "socratic" ? SOCRATIC_SYSTEM_PROMPT : (aiConfig?.systemPrompt || undefined);

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
        mode: mode || "normal",
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
