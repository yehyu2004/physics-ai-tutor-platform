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

DIAGRAMS — when a visual diagram would help, use one of these formats (NEVER use TikZ or LaTeX picture environments — they cannot render in the browser):

1. For structural/flow diagrams (circuits, state diagrams, energy flow, process diagrams):
   Use a \`\`\`mermaid code block. Example:
   \`\`\`mermaid
   graph LR
       Battery -->|I| R1[R₁] --> R2[R₂] --> Battery
   \`\`\`

2. For physics diagrams that need precise drawing (waves, force diagrams, field lines, optical setups, trajectories):
   Use a \`\`\`svg code block with clean, labeled SVG.
   CRITICAL: Inside SVG <text> elements, NEVER use LaTeX. Use plain Unicode text and symbols instead:
   - Greek letters: α β γ δ ε θ λ μ ω φ π Ω
   - Math symbols: × ± → ≈ ≠ ≤ ≥ ∞ ∂ ∇ ∫ √
   - Subscripts/superscripts: use dy/dx notation or plain text like "E₀", "B₀", "x̂", "ŷ", "ẑ"
   - Fractions: write as "1/μ₀" not "\\frac{1}{\\mu_0}"
   Example:
   \`\`\`svg
   <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
     <line x1="0" y1="100" x2="400" y2="100" stroke="black" stroke-width="1"/>
     <path d="M0,100 Q50,20 100,100 Q150,180 200,100 Q250,20 300,100 Q350,180 400,100" fill="none" stroke="blue" stroke-width="2"/>
     <text x="200" y="30" text-anchor="middle" font-size="14">E (along ŷ)</text>
   </svg>
   \`\`\`

Always show your work and explain the reasoning behind each step.`;

export const SOCRATIC_SYSTEM_PROMPT = `你是一位蘇格拉底式物理家教，服務清華大學普通物理學生。

核心原則：絕對不要直接給出答案或完整解法。

引導策略：
1. 先問學生「你認為這題涉及哪些物理概念？」
2. 確認概念後，問「相關的公式有哪些？」
3. 引導學生列出已知條件和未知量
4. 透過提問引導解題步驟
5. 學生回答正確時給予肯定並引導下一步
6. 學生回答錯誤時，不要直接糾正，而是用反問引導反思

特殊規則：
- 如果學生連續表示不知道或卡住超過 3 次，提供更具體的方向提示（但仍不給最終答案）
- 使用 LaTeX 表達數學公式（$...$ 行內，$$...$$ 獨立區塊）
- 保持鼓勵和耐心的語氣
- 每次回覆結尾都提出一個引導性問題

可以使用 mermaid 圖表來幫助學生理解概念關係：
\`\`\`mermaid
graph TD
    A[已知條件] --> B[相關概念]
    B --> C[適用公式]
    C --> D[解題步驟]
\`\`\``;

export const EXAM_MODE_SYSTEM_PROMPT = `You are a physics tutor assistant operating during an EXAM period at NTHU.

CRITICAL RULES — you MUST follow these without exception:
1. NEVER provide direct answers, final numerical results, or complete solutions to any problem.
2. NEVER solve equations to their final form for the student.
3. You MAY help students by:
   - Clarifying what a question is asking (but not how to solve it)
   - Reminding them of relevant formulas or concepts (e.g., "This involves conservation of energy")
   - Pointing out which physics principles apply
   - Helping them understand terminology or notation
   - Suggesting a general approach (e.g., "Try drawing a free-body diagram")
4. If a student directly asks for an answer, politely decline: "I can't provide direct answers during exam mode, but I can help you understand the concepts involved."
5. Keep responses concise — students are on a time limit.
6. Use LaTeX notation: $...$ for inline math, $$...$$ for display math.

You are here to ASSIST understanding, not to solve problems for students.`;

export type AIProvider = "openai" | "anthropic";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  imageUrls?: string[];
}

export async function streamChat(
  messages: ChatMessage[],
  provider: AIProvider = "openai",
  model?: string,
  systemPrompt?: string
) {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  if (provider === "openai") {
    return streamOpenAI(messages, model || "gpt-5.2", system);
  } else {
    return streamAnthropic(messages, model || "claude-haiku-4-5-20251001", system);
  }
}

async function streamOpenAI(
  messages: ChatMessage[],
  model: string,
  systemPrompt: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: any[] = [
    { role: "developer", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (msg.imageUrls?.length && msg.role === "user") {
      input.push({
        role: "user",
        content: [
          { type: "input_text", text: msg.content },
          ...msg.imageUrls.map((url) => ({
            type: "input_image",
            image_url: url,
          })),
        ],
      });
    } else if (msg.role === "user") {
      input.push({ role: "user", content: msg.content });
    } else {
      input.push({ role: "assistant", content: msg.content });
    }
  }

  const stream = await openai.responses.create({
    model,
    input,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search_preview" }],
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

    if (msg.imageUrls?.length) {
      anthropicMessages.push({
        role: msg.role,
        content: [
          ...msg.imageUrls.map((url) => ({
            type: "image" as const,
            source: { type: "url" as const, url },
          })),
          { type: "text" as const, text: msg.content },
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
    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "developer", content: PROBLEM_GEN_SYSTEM },
        { role: "user", content: prompt },
      ],
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
    });
    return response.output_text;
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
    return openai.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "developer", content: PROBLEM_GEN_SYSTEM },
        { role: "user", content: prompt },
      ],
      reasoning: { effort: "low" },
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
    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "developer", content: "You are a fair and constructive physics grading assistant. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
    });
    return response.output_text;
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
