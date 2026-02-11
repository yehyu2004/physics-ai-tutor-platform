import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Map language names to Piston API language identifiers
const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  js: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  ts: { language: "typescript", version: "5.0.3" },
  java: { language: "java", version: "15.0.2" },
  cpp: { language: "c++", version: "10.2.0" },
  c: { language: "c", version: "10.2.0" },
  go: { language: "go", version: "1.16.2" },
  rust: { language: "rust", version: "1.68.2" },
  ruby: { language: "ruby", version: "3.0.1" },
  php: { language: "php", version: "8.2.3" },
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code, language } = await req.json();

    if (!code || !language) {
      return NextResponse.json(
        { error: "Code and language are required" },
        { status: 400 }
      );
    }

    const normalizedLang = language.toLowerCase();
    const langConfig = LANGUAGE_MAP[normalizedLang];

    if (!langConfig) {
      return NextResponse.json(
        { error: `Language "${language}" is not supported for execution` },
        { status: 400 }
      );
    }

    // Use Piston API for safe, sandboxed code execution
    const pistonResponse = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: code }],
      }),
    });

    if (!pistonResponse.ok) {
      return NextResponse.json(
        { error: "Failed to execute code on remote server" },
        { status: 500 }
      );
    }

    const pistonData = await pistonResponse.json();

    if (pistonData.run) {
      const stdout = pistonData.run.stdout || "";
      const stderr = pistonData.run.stderr || "";
      const output = stdout || stderr || "No output";

      if (stderr && !stdout) {
        return NextResponse.json({ error: output });
      }

      return NextResponse.json({ output });
    }

    return NextResponse.json({ error: "Failed to execute code" });
  } catch (error) {
    console.error("Run code error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
