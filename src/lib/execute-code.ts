const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  js: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  ts: { language: "typescript", version: "5.0.3" },
};

export interface CodeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  hasImage: boolean;
  imageData?: string;
}

export async function executeCodeViaPiston(
  language: string,
  code: string
): Promise<CodeExecutionResult> {
  const langConfig = LANGUAGE_MAP[language.toLowerCase()];
  if (!langConfig) {
    return {
      success: false,
      output: "",
      error: `Unsupported language: ${language}`,
      hasImage: false,
    };
  }

  try {
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: code }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        output: "",
        error: "Failed to execute code on sandbox",
        hasImage: false,
      };
    }

    const data = await response.json();

    if (!data.run) {
      return { success: false, output: "", error: "No execution result", hasImage: false };
    }

    const stdout = data.run.stdout || "";
    const stderr = data.run.stderr || "";

    if (stderr && !stdout) {
      return { success: false, output: stderr, error: stderr, hasImage: false };
    }

    const output = stdout || stderr || "No output";
    const trimmed = output.trim();

    // Detect image content in output
    const hasImage = trimmed.startsWith("<svg") || trimmed.startsWith("data:image/");
    const imageData = hasImage ? trimmed : undefined;

    return { success: true, output, hasImage, imageData, error: stderr || undefined };
  } catch (err) {
    return {
      success: false,
      output: "",
      error: `Execution error: ${err instanceof Error ? err.message : "Unknown error"}`,
      hasImage: false,
    };
  }
}
