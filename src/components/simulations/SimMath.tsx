"use client";

import "katex/dist/katex.min.css";
import katex from "katex";

export function SimMath({ math }: { math: string }) {
  const html = katex.renderToString(math, { throwOnError: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
