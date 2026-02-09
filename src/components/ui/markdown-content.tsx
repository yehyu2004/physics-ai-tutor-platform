"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function normalizeLatex(content: string): string {
  // Convert \[...\] to $$...$$ and \(...\) to $...$
  content = content.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$${math}$$`);
  content = content.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
  // Fix orphaned display math: a line starting with LaTeX commands ending with $$
  // but missing the opening $$  (e.g. "=\frac{...}.$$" should be "$$=\frac{...}.$$")
  content = content.replace(/^([ \t]*)(\\[a-zA-Z{].*?\$\$)$/gm, (_, indent, math) => {
    if (!math.startsWith("$$")) {
      return `${indent}$$${math}`;
    }
    return _;
  });
  return content;
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
          code: ({ className, children, ...props }) => {
            const code = String(children).replace(/\n$/, "");
            if (className?.includes("language-svg")) {
              const trimmed = code.trim();
              if (trimmed.startsWith("<svg")) {
                return (
                  <div
                    className="rounded-lg border border-gray-200 bg-white p-4 overflow-auto max-w-full my-3 flex justify-center"
                    dangerouslySetInnerHTML={{ __html: trimmed }}
                  />
                );
              }
            }
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed border border-gray-800">
                  <code className={className} {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt || ""}
              className="rounded-lg max-w-full my-3 border border-gray-200"
            />
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gray-300 pl-4 italic text-gray-500 my-2 py-1">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-gray-200" />,
        }}
      >
        {normalizeLatex(content)}
      </ReactMarkdown>
    </div>
  );
}
