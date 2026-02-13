/**
 * Extract diagram content from various formats (Prisma JSON, raw SVG string, etc.)
 */
export function getDiagramContent(
  diagram: unknown
): { type: string; content: string } | null {
  if (!diagram) return null;
  if (typeof diagram === "object" && diagram !== null) {
    const d = diagram as Record<string, unknown>;
    if (d.content && typeof d.content === "string") {
      return { type: String(d.type || "svg").toLowerCase(), content: d.content };
    }
    if (d.svg && typeof d.svg === "string") return { type: "svg", content: d.svg };
    if (d.mermaid && typeof d.mermaid === "string") return { type: "mermaid", content: d.mermaid };
    if (d.code && typeof d.code === "string") return { type: String(d.type || "svg").toLowerCase(), content: d.code };
  }
  if (typeof diagram === "string" && diagram.trim().startsWith("<svg")) {
    return { type: "svg", content: diagram.trim() };
  }
  return null;
}
