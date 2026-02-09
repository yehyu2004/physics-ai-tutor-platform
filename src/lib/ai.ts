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

export const SOCRATIC_SYSTEM_PROMPT = `You are a Socratic physics tutor for university-level General Physics students at NTHU.

Instead of giving direct answers, guide students to discover solutions themselves:
- Ask probing questions that lead toward the answer
- When a student is stuck, give a small hint rather than the full solution
- Encourage them to identify relevant physics principles first
- Use LaTeX notation: $...$ for inline math and $$...$$ for display math. NEVER use \\[...\\] or \\(...\\) delimiters.
- Celebrate when they make progress
- Only reveal the full solution if they explicitly ask after multiple attempts`;

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

const PROBLEM_GEN_SYSTEM = `You are a physics problem generator for university-level General Physics. Always respond with valid JSON.

IMPORTANT formatting rules for ALL text fields (questionText, options, correctAnswer, solution):
- Use proper LaTeX math notation: $...$ for inline math and $$...$$ for display math.
- NEVER output raw LaTeX commands as plain text. Always wrap them in $ or $$ delimiters.
- Use markdown formatting: **bold** for emphasis, line breaks for readability.
- In solutions, use step-by-step markdown formatting with line breaks between steps.
- Example correct: "A pipe of radius $2.0\\ \\mathrm{mm}$ and length $1.00\\ \\mathrm{m}$"
- Example incorrect: "A pipe of radius $2.0\\ \\mathrm{mm}$ and length $1.00\\ \\mathrm{m}$"

DIAGRAM GENERATION:
For problems that benefit from a visual diagram, include a "diagram" field in the JSON with the following structure:
- "type": either "svg" or "mermaid"
- "content": the diagram code

Use "svg" type for physics-specific diagrams (circuits, force/free-body diagrams, optical setups, electromagnetic field lines, current-carrying wires, fluid flow, projectile trajectories, wave diagrams, etc.). Generate clean, well-labeled SVG code with:
  - White background, clear black lines
  - Labeled components (use <text> elements)
  - Appropriate physics symbols and arrows
  - viewBox for proper scaling (e.g., viewBox="0 0 400 300")
  - No external dependencies

Use "mermaid" type for conceptual/process diagrams (energy flow, thermodynamic cycles, state transitions, problem-solving flowcharts). Use valid Mermaid syntax.

If no diagram is needed, omit the "diagram" field entirely.`;

function buildProblemPrompt(topic: string, difficulty: number, count: number, questionType: string, format: "array" | "object"): string {
  const formatInstruction = format === "object"
    ? 'Format your response as a JSON object with a "problems" key containing an array of objects'
    : 'Format your response as a JSON array with objects';

  return `Generate ${count} physics problem(s) about "${topic}" at difficulty level ${difficulty}/5.
Question type: ${questionType}

For each problem, provide:
1. The question text using proper markdown with LaTeX math ($...$ for inline, $$...$$ for display math)
2. ${questionType === "MC" ? "4 options labeled A, B, C, D (each option should also use LaTeX for any math)" : ""}
3. The correct answer (use LaTeX for any math expressions)
4. A detailed step-by-step solution using markdown formatting and LaTeX for all math
5. If the problem benefits from a visual diagram, include a "diagram" object with "type" ("svg" or "mermaid") and "content" (the diagram code)

${formatInstruction} having these fields:
- questionText: string (markdown + LaTeX)
- questionType: "${questionType}"
${questionType === "MC" ? '- options: string[] (array of 4 options, each with LaTeX math as needed)' : ""}
- correctAnswer: string (with LaTeX)
- solution: string (markdown + LaTeX, step-by-step)
- points: number (suggest appropriate points, typically 10-25)
- diagram: { type: "svg" | "mermaid", content: string } (optional, include for problems with physical setups like circuits, force diagrams, EM fields, optics, etc.)`;
}


export async function generateProblems(
  topic: string,
  difficulty: number,
  count: number,
  questionType: string,
  provider: AIProvider = "openai"
) {
  const prompt = buildProblemPrompt(topic, difficulty, count, questionType, "array");

  if (provider === "openai") {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: PROBLEM_GEN_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    return response.choices[0].message.content;
  } else {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: PROBLEM_GEN_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : null;
  }
}

export async function streamGenerateProblems(
  topic: string,
  difficulty: number,
  count: number,
  questionType: string,
  provider: AIProvider = "openai"
) {
  const prompt = buildProblemPrompt(topic, difficulty, count, questionType, "object");

  if (provider === "openai") {
    return openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: PROBLEM_GEN_SYSTEM },
        { role: "user", content: prompt },
      ],
      stream: true,
    });
  } else {
    return anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: PROBLEM_GEN_SYSTEM + " Wrap your JSON response in a ```json code block.",
      messages: [{ role: "user", content: prompt }],
    });
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
