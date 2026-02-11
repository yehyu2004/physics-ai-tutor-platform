"use client";

import "katex/dist/katex.min.css";
// @ts-expect-error - react-katex lacks type definitions
import { InlineMath } from "react-katex";

export function SimMath({ math }: { math: string }) {
  return <InlineMath math={math} />;
}
