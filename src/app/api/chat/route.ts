import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { streamChat, SOCRATIC_SYSTEM_PROMPT, EXAM_MODE_SYSTEM_PROMPT, EXECUTE_CODE_TOOL_ANTHROPIC, openai, anthropic, type ChatMessage, type AIProvider } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkContentFlags, handleContentFlag, trackRateLimitAbuse } from "@/lib/abuse-detection";
import { executeCodeViaPiston } from "@/lib/execute-code";

const MAX_TOOL_ITERATIONS = 3;

interface ToolCallData {
  language: string;
  code: string;
  output?: string;
  error?: string;
  hasImage?: boolean;
  imageData?: string;
}

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: Record<string, unknown>) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    // Check if user is banned or restricted from using AI chat
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, isRestricted: true },
    });

    if (!user) {
      return Response.json(
        { error: "User not found. Please sign out and sign back in." },
        { status: 401 }
      );
    }

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

    const { conversationId, message, imageUrls, model, mode } = await req.json();

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
        imageUrls: imageUrls || [],
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
      imageUrls: m.imageUrls?.length ? m.imageUrls : undefined,
    }));

    const provider: AIProvider = model?.startsWith("claude") ? "anthropic" : "openai";

    const aiConfig = await prisma.aIConfig.findFirst({
      where: { isActive: true },
    });

    // Check exam mode — enforced server-side for students
    const userRole = (session.user as { role?: string }).role;
    let systemPrompt: string | undefined;

    if (userRole === "STUDENT") {
      const examMode = await prisma.examMode.findFirst({
        orderBy: { toggledAt: "desc" },
        select: { isActive: true },
      });
      if (examMode?.isActive) {
        systemPrompt = EXAM_MODE_SYSTEM_PROMPT;
      }
    }

    if (!systemPrompt) {
      systemPrompt = mode === "socratic" ? SOCRATIC_SYSTEM_PROMPT : (aiConfig?.systemPrompt || undefined);
    }

    // Stream response via SSE
    const encoder = new TextEncoder();
    let fullContent = "";
    const collectedToolCalls: ToolCallData[] = [];

    // --- OpenAI tool call loop ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleOpenAIStream = async (ctrl: ReadableStreamDefaultController, enc: TextEncoder, msgs: ChatMessage[], mdl: string, sysPrompt: string | undefined) => {
      let stream = await streamChat(msgs, "openai", mdl, sysPrompt) as any;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const pendingToolCalls: Array<{ call_id: string; name: string; arguments: string }> = [];
        let completedResponseId: string | undefined;

        for await (const event of stream) {
          if (event.type === "response.reasoning_summary_text.delta") {
            if (event.delta) emit(ctrl, enc, { type: "thinking", content: event.delta });
          } else if (event.type === "response.output_text.delta") {
            if (event.delta) {
              fullContent += event.delta;
              emit(ctrl, enc, { type: "delta", content: event.delta });
            }
          } else if (event.type === "response.function_call_arguments.done") {
            pendingToolCalls.push({ call_id: event.call_id || event.item_id || "", name: event.name, arguments: event.arguments });
          } else if (event.type === "response.completed") {
            completedResponseId = event.response?.id;
            for (const item of (event.response?.output || [])) {
              if (item.type === "function_call" && item.name === "execute_code") {
                const existing = pendingToolCalls.find((tc: { call_id: string; name: string }) => tc.name === item.name && (!tc.call_id || tc.call_id === item.id));
                if (existing) existing.call_id = item.call_id;
              }
            }
          }
        }

        if (pendingToolCalls.length === 0) break;

        const toolOutputInputs: any[] = [];
        for (const tc of pendingToolCalls) {
          if (tc.name !== "execute_code") continue;
          try {
            const args = JSON.parse(tc.arguments);
            emit(ctrl, enc, { type: "tool_call", language: args.language, code: args.code });
            const result = await executeCodeViaPiston(args.language, args.code);
            collectedToolCalls.push({ language: args.language, code: args.code, output: result.output, error: result.error, hasImage: result.hasImage, imageData: result.imageData });
            emit(ctrl, enc, { type: "tool_result", output: result.output, error: result.error, hasImage: result.hasImage, imageData: result.imageData });
            toolOutputInputs.push({ type: "function_call_output", call_id: tc.call_id, output: result.output.slice(0, 50000) });
          } catch (err) {
            console.error("Tool execution error:", err);
            toolOutputInputs.push({ type: "function_call_output", call_id: tc.call_id, output: `Error: ${err instanceof Error ? err.message : "Unknown error"}` });
          }
        }

        if (toolOutputInputs.length === 0) break;
        stream = await openai.responses.create({ model: mdl, input: toolOutputInputs, previous_response_id: completedResponseId, stream: true });
      }
    };

    // --- Anthropic tool call loop ---
    const handleAnthropicStream = async (ctrl: ReadableStreamDefaultController, enc: TextEncoder, msgs: ChatMessage[], mdl: string | undefined, sysPrompt: string | undefined) => {
      const anthropicModel = mdl || "claude-haiku-4-5-20251001";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anthropicMessages: any[] = msgs.map(msg => {
        if (msg.imageUrls?.length) {
          return {
            role: msg.role,
            content: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...msg.imageUrls.map((url): any => {
                const dataMatch = url.match(/^data:(.+?);base64,(.+)$/);
                if (dataMatch) return { type: "image", source: { type: "base64", media_type: dataMatch[1], data: dataMatch[2] } };
                return { type: "image", source: { type: "url", url } };
              }),
              { type: "text", text: msg.content },
            ],
          };
        }
        return { role: msg.role, content: msg.content };
      });

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const stream = anthropic.messages.stream({ model: anthropicModel, max_tokens: 4096, system: sysPrompt || "", messages: anthropicMessages, tools: [EXECUTE_CODE_TOOL_ANTHROPIC] });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assistantBlocks: any[] = [];
        let currentToolUseId = "";
        let currentToolName = "";
        let toolInputJson = "";
        let stopReason = "";

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const block = (event as any).content_block;
            if (block?.type === "tool_use") { currentToolUseId = block.id; currentToolName = block.name; toolInputJson = ""; }
          } else if (event.type === "content_block_delta") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const delta = (event as any).delta;
            if (delta?.type === "text_delta" && delta.text) { fullContent += delta.text; emit(ctrl, enc, { type: "delta", content: delta.text }); }
            else if (delta?.type === "input_json_delta" && delta.partial_json) { toolInputJson += delta.partial_json; }
          } else if (event.type === "content_block_stop") {
            if (currentToolUseId) {
              assistantBlocks.push({ type: "tool_use", id: currentToolUseId, name: currentToolName, input: JSON.parse(toolInputJson || "{}") });
              currentToolUseId = "";
            }
          } else if (event.type === "message_delta") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stopReason = (event as any).delta?.stop_reason || "";
          }
        }

        if (stopReason !== "tool_use") break;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assistantContent: any[] = [];
        if (fullContent) assistantContent.push({ type: "text", text: fullContent });
        for (const block of assistantBlocks) { if (block.type === "tool_use") assistantContent.push(block); }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolResults: any[] = [];
        for (const block of assistantBlocks) {
          if (block.type !== "tool_use" || block.name !== "execute_code") continue;
          const args = block.input as { language: string; code: string };
          emit(ctrl, enc, { type: "tool_call", language: args.language, code: args.code });
          const result = await executeCodeViaPiston(args.language, args.code);
          collectedToolCalls.push({ language: args.language, code: args.code, output: result.output, error: result.error, hasImage: result.hasImage, imageData: result.imageData });
          emit(ctrl, enc, { type: "tool_result", output: result.output, error: result.error, hasImage: result.hasImage, imageData: result.imageData });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.output.slice(0, 50000) });
        }

        if (toolResults.length === 0) break;
        anthropicMessages.push({ role: "assistant", content: assistantContent });
        anthropicMessages.push({ role: "user", content: toolResults });
      }
    };

    const readable = new ReadableStream({
      async start(controller) {
        try {
          emit(controller, encoder, { type: "meta", conversationId: convId });

          if (provider === "openai") {
            await handleOpenAIStream(controller, encoder, chatMessages, model || "gpt-5.2", systemPrompt);
          } else {
            await handleAnthropicStream(controller, encoder, chatMessages, model, systemPrompt);
          }
        } catch (aiError) {
          console.error("AI Error:", aiError);
          fullContent = "I'm sorry, I encountered an error while processing your request. Please check that the AI API keys are configured correctly.";
          emit(controller, encoder, { type: "delta", content: fullContent });
        }

        // Save to DB after stream completes
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const messageData: any = {
            conversationId: convId,
            role: "assistant",
            content: fullContent,
            model: model || "gpt-5.2",
            mode: mode || "normal",
          };
          if (collectedToolCalls.length > 0) {
            messageData.toolCalls = collectedToolCalls;
          }
          await prisma.message.create({ data: messageData });

          await prisma.conversation.update({
            where: { id: convId },
            data: { updatedAt: new Date() },
          });

          // Generate AI title for new conversations
          if (!conversationId && fullContent) {
            try {
              const titleResponse = await anthropic.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 50,
                messages: [{
                  role: "user",
                  content: `Generate a concise title (max 6 words) for this physics conversation. The title should primarily reflect the student's question. Use the AI answer only for minor clarification if the question alone is ambiguous. Reply with ONLY the title, no quotes.\n\nStudent question: ${message}\n\nAI answer (for context only): ${fullContent.slice(0, 100)}`,
                }],
              });
              const titleBlock = titleResponse.content[0];
              const generatedTitle = titleBlock.type === "text" ? titleBlock.text.trim() : null;
              if (generatedTitle) {
                await prisma.conversation.update({
                  where: { id: convId },
                  data: { title: generatedTitle },
                });
                emit(controller, encoder, { type: "title", title: generatedTitle, conversationId: convId });
              }
            } catch (titleError) {
              console.error("Title generation error:", titleError);
            }
          }
        } catch (dbError) {
          console.error("DB save error:", dbError);
        }

        emit(controller, encoder, { type: "done" });
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
