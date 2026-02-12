"use client";

import React, { useEffect, useRef, useState } from "react";

const DESMOS_API_URL = "https://www.desmos.com/api/v1.11/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6";

let desmosLoaded = false;
let desmosLoadPromise: Promise<void> | null = null;

function loadDesmosAPI(): Promise<void> {
  if (desmosLoaded) return Promise.resolve();
  if (desmosLoadPromise) return desmosLoadPromise;

  desmosLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = DESMOS_API_URL;
    script.onload = () => {
      desmosLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Desmos API"));
    document.head.appendChild(script);
  });

  return desmosLoadPromise;
}

const COLORS = [
  "#2d70b3", // blue
  "#c74440", // red
  "#388c46", // green
  "#6042a6", // purple
  "#000000", // black
  "#fa7e19", // orange
];

interface DesmosGraphProps {
  code: string;
}

export default function DesmosGraph({ code }: DesmosGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calculatorRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await loadDesmosAPI();
        if (!mounted || !containerRef.current) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Desmos = (window as any).Desmos;
        if (!Desmos) {
          setError("Desmos API not available");
          return;
        }

        const calculator = Desmos.GraphingCalculator(containerRef.current, {
          expressions: true,
          settingsMenu: false,
          zoomButtons: true,
          expressionsTopbar: false,
          border: false,
          lockViewport: false,
          expressionsCollapsed: true,
        });

        calculatorRef.current = calculator;

        // Parse expressions from code block
        const lines = code
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

        lines.forEach((line, i) => {
          calculator.setExpression({
            id: `expr-${i}`,
            latex: line,
            color: COLORS[i % COLORS.length],
          });
        });

        setLoading(false);
      } catch {
        if (mounted) setError("Failed to load Desmos calculator");
      }
    }

    init();

    return () => {
      mounted = false;
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <pre className="mt-2 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      {loading && (
        <div className="flex items-center justify-center h-[350px] bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading Desmos...
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: loading ? 0 : 350,
          overflow: "hidden",
        }}
      />
    </div>
  );
}
