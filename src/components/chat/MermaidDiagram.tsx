"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

let mermaidCounter = 0;

export default function MermaidDiagram({ chart, content }: { chart?: string; content?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);
  const mermaidCode = (chart || content || "").trim();

  const renderDiagram = useCallback(async () => {
    if (!mermaidCode) return;
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: "default" });
      await mermaid.parse(mermaidCode);
      const id = `mermaid-${Date.now()}-${mermaidCounter++}`;
      const { svg: rendered } = await mermaid.render(id, mermaidCode);
      setSvg(rendered);
    } catch {
      setError(true);
      // Clean up leaked mermaid error elements
      document.querySelectorAll('body > [id*="mermaid"]').forEach((el) => el.remove());
    }
  }, [mermaidCode]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed border border-gray-800">
        <code>{mermaidCode}</code>
      </pre>
    );
  }

  if (!svg) return null;

  return (
    <div
      ref={containerRef}
      className="my-2 p-3 bg-white border border-gray-200 rounded-lg overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
