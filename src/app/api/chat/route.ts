import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamChat, SOCRATIC_SYSTEM_PROMPT, type ChatMessage, type AIProvider } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkContentFlags, handleContentFlag, trackRateLimitAbuse } from "@/lib/abuse-detection";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    // Check if user is banned or restricted from using AI chat
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, isRestricted: true },
    });

    if (user?.isBanned) {
      return Response.json(
        { error: "Your account has been suspended. Please contact an administrator." },
        { status: 403 }
      );
    }

    if (user?.isRestricted) {
      return Response.json(
        { error: "Your account has been restricted from using AI chat. Please contact your instructor." },
        { status: 403 }
      );
    }

    const userName = (session.user as { name?: string }).name || "Unknown";

    const rateCheck = checkRateLimit(userId, user?.isRestricted || false);
    if (!rateCheck.allowed) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: "rate_limit_hit",
          details: { remaining: rateCheck.remaining, resetAt: new Date(rateCheck.resetAt).toISOString() },
        },
      });
      // Fire-and-forget: track rate limit abuse escalation
      trackRateLimitAbuse(userId, userName).catch(() => {});
      return Response.json(
        { error: `Rate limit exceeded. Please wait before sending more messages. Resets at ${new Date(rateCheck.resetAt).toLocaleTimeString()}.` },
        { status: 429 }
      );
    }

    const { conversationId, message, imageUrl, model, mode } = await req.json();

    // Fire-and-forget: check content for jailbreak/prompt injection patterns
    const contentFlags = checkContentFlags(message);
    if (contentFlags.length > 0) {
      handleContentFlag(userId, userName, message, contentFlags).catch(() => {});
    }

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

    // Load last 50 messages for AI context (avoids unbounded query + token limits)
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const previousMessages = recentMessages.reverse();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatMessages: ChatMessage[] = previousMessages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      imageUrl: m.imageUrl || undefined,
    }));

    const provider: AIProvider = model?.startsWith("claude") ? "anthropic" : "openai";

    const aiConfig = await prisma.aIConfig.findFirst({
      where: { isActive: true },
    });

    const systemPrompt = mode === "socratic" ? SOCRATIC_SYSTEM_PROMPT : (aiConfig?.systemPrompt || undefined);

    // Stream response via SSE
    const encoder = new TextEncoder();
    let fullContent = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send conversationId as first event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", conversationId: convId })}\n\n`));

          if (provider === "openai") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = await streamChat(chatMessages, "openai", model || "gpt-5-mini", systemPrompt) as any;
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content || "";
              if (delta) {
                fullContent += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`));
              }
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stream = await streamChat(chatMessages, "anthropic", model, systemPrompt) as any;
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta?.text) {
                fullContent += event.delta.text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content: event.delta.text })}\n\n`));
              }
            }
          }
        } catch (aiError) {
          console.error("AI Error:", aiError);
          fullContent = "I'm sorry, I encountered an error while processing your request. Please check that the AI API keys are configured correctly.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content: fullContent })}\n\n`));
        }

        // Save to DB after stream completes
        try {
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
        } catch (dbError) {
          console.error("DB save error:", dbError);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
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
    console.error("Chat error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
