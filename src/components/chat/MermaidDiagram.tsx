"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "strict",
  fontFamily: "inherit",
});

let mermaidCounter = 0;

export default function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = `mermaid-${Date.now()}-${mermaidCounter++}`;
    let cancelled = false;

    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(id, chart.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to render diagram");
          console.error("Mermaid render error:", err);
        }
        // Clean up any leftover error element mermaid may have created
        const errorEl = document.getElementById(`d${id}`);
        errorEl?.remove();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="my-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
        <p className="font-medium mb-1">Diagram Error</p>
        <pre className="whitespace-pre-wrap font-mono">{chart.trim()}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 p-4 bg-neutral-50 rounded-lg animate-pulse text-center text-xs text-neutral-400">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-2 p-3 bg-white border border-neutral-200 rounded-lg overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
