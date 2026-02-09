import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DEFAULT_SYSTEM_PROMPT = `You are a helpful physics tutor for university-level General Physics students at NTHU (National Tsing Hua University). 

Your responsibilities:
- Help students understand physics concepts (mechanics, electromagnetism, thermodynamics, optics, modern physics)
- Guide students through problem-solving step by step
- Use LaTeX notation for mathematical expressions. IMPORTANT: use $...$ for inline math and $$...$$ for display math. NEVER use \\[...\\] or \\(...\\) delimiters.
- Provide clear explanations with physical intuition
- When students upload images of problems, analyze them carefully and provide solutions
- Be encouraging but rigorous in your explanations

Always show your work and explain the reasoning behind each step.`;

export type AIProvider = "openai" | "anthropic";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  imageUrl?: string;
}

export async function streamChat(
  messages: ChatMessage[],
  provider: AIProvider = "openai",
  model?: string,
  systemPrompt?: string
) {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  if (provider === "openai") {
    return streamOpenAI(messages, model || "gpt-5-mini", system);
  } else {
    return streamAnthropic(messages, model || "claude-haiku-4-5-20251001", system);
  }
}

async function streamOpenAI(
  messages: ChatMessage[],
  model: string,
  systemPrompt: string
) {
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (msg.imageUrl && msg.role === "user") {
      openaiMessages.push({
        role: "user",
        content: [
          { type: "text", text: msg.content },
          { type: "image_url", image_url: { url: msg.imageUrl } },
        ],
      });
    } else if (msg.role === "user") {
      openaiMessages.push({ role: "user", content: msg.content });
    } else {
      openaiMessages.push({ role: "assistant", content: msg.content });
    }
  }

  const stream = await openai.chat.completions.create({
    model,
    messages: openaiMessages,
    stream: true,
  });

  return stream;
}

async function streamAnthropic(
  messages: ChatMessage[],
  model: string,
  systemPrompt: string
) {
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.imageUrl) {
      anthropicMessages.push({
        role: msg.role,
        content: [
          {
            type: "image",
            source: { type: "url", url: msg.imageUrl },
          },
          { type: "text", text: msg.content },
        ],
      });
    } else {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  const stream = await anthropic.messages.stream({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  return stream;
}

export async function generateProblems(
  topic: string,
  difficulty: number,
  count: number,
  questionType: string,
  provider: AIProvider = "openai"
) {
  const prompt = `Generate ${count} physics problem(s) about "${topic}" at difficulty level ${difficulty}/5.
Question type: ${questionType}

For each problem, provide:
1. The question text (use LaTeX for math: $...$ for inline, $$...$$ for display)
2. ${questionType === "MC" ? "4 options labeled A, B, C, D" : ""}
3. The correct answer
4. A detailed solution/explanation

Format your response as a JSON array with objects having these fields:
- questionText: string
- questionType: "${questionType}"
${questionType === "MC" ? '- options: string[] (array of 4 options)' : ""}
- correctAnswer: string
- solution: string
- points: number (suggest appropriate points, typically 10-25)`;

  if (provider === "openai") {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are a physics problem generator for university-level General Physics. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    return response.choices[0].message.content;
  } else {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: "You are a physics problem generator for university-level General Physics. Always respond with valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : null;
  }
}

export async function aiAssistedGrading(
  questionText: string,
  correctAnswer: string,
  studentAnswer: string,
  rubricDescription: string,
  maxPoints: number,
  provider: AIProvider = "openai"
) {
  const prompt = `Grade the following student answer for a physics problem.

Question: ${questionText}
Correct Answer: ${correctAnswer}
Rubric: ${rubricDescription}
Max Points: ${maxPoints}
Student Answer: ${studentAnswer}

Provide your response as JSON with:
- score: number (0 to ${maxPoints})
- feedback: string (constructive feedback explaining the grade)`;

  if (provider === "openai") {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are a fair and constructive physics grading assistant. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    return response.choices[0].message.content;
  } else {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You are a fair and constructive physics grading assistant. Always respond with valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : null;
  }
}
