/**
 * Convert Markdown + LaTeX math text to pure LaTeX.
 * Math regions ($...$ and $$...$$) are preserved as-is.
 * Non-math regions get Markdown→LaTeX conversion.
 */
export function convertToLatex(text: string): string {
  if (!text) return "";

  // Split on math delimiters, preserving them
  // Handle $$ (display) first, then $ (inline)
  const parts: { text: string; isMath: boolean }[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for display math $$
    const ddIdx = remaining.indexOf("$$");
    // Check for inline math $ (not preceded by \)
    let sIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === "$" && (i === 0 || remaining[i - 1] !== "\\")) {
        // Make sure it's not $$
        if (i + 1 < remaining.length && remaining[i + 1] === "$") continue;
        sIdx = i;
        break;
      }
    }

    // Find whichever delimiter comes first
    let firstDelim: "$$" | "$" | null = null;
    let firstIdx = remaining.length;

    if (ddIdx !== -1 && ddIdx < firstIdx) {
      firstDelim = "$$";
      firstIdx = ddIdx;
    }
    if (sIdx !== -1 && sIdx < firstIdx) {
      firstDelim = "$";
      firstIdx = sIdx;
    }

    if (firstDelim === null) {
      // No more math — rest is plain text
      parts.push({ text: remaining, isMath: false });
      break;
    }

    // Push text before delimiter
    if (firstIdx > 0) {
      parts.push({ text: remaining.slice(0, firstIdx), isMath: false });
    }

    // Find closing delimiter
    const delimLen = firstDelim.length;
    const afterOpen = firstIdx + delimLen;
    const closeIdx = remaining.indexOf(firstDelim, afterOpen);

    if (closeIdx === -1) {
      // No closing delimiter — treat rest as plain text
      parts.push({ text: remaining.slice(firstIdx), isMath: false });
      break;
    }

    // Push math content (including delimiters)
    parts.push({
      text: remaining.slice(firstIdx, closeIdx + delimLen),
      isMath: true,
    });
    remaining = remaining.slice(closeIdx + delimLen);
    continue;
  }

  // Convert each part
  return parts
    .map((part) => {
      if (part.isMath) return part.text;
      return convertNonMathToLatex(part.text);
    })
    .join("");
}

function convertNonMathToLatex(text: string): string {
  let result = text;

  // Escape LaTeX special characters (order matters)
  result = result.replace(/\\/g, "\\textbackslash{}");
  result = result.replace(/&/g, "\\&");
  result = result.replace(/%/g, "\\%");
  result = result.replace(/#/g, "\\#");
  result = result.replace(/_/g, "\\_");
  result = result.replace(/\{/g, "\\{");
  result = result.replace(/\}/g, "\\}");
  result = result.replace(/~/g, "\\textasciitilde{}");
  result = result.replace(/\^/g, "\\textasciicircum{}");

  // Convert Markdown bold **text** → \textbf{text}
  result = result.replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}");

  // Convert Markdown italic *text* → \textit{text}
  result = result.replace(/\*(.+?)\*/g, "\\textit{$1}");

  // Convert paragraph breaks
  result = result.replace(/\n\n+/g, "\n\n\\bigskip\n");

  return result;
}

/**
 * Escape a string for use in LaTeX (title, etc.)
 */
export function escapeLatex(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}
