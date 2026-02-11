"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function SpecialRelativity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [beta, setBeta] = useState(0.5); // v/c
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);

  // Lorentz factor
  const gamma = 1 / Math.sqrt(1 - beta * beta);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const margin = 40;

    // --- Top: Visual comparison ---
    const visH = H * 0.5;

    // Stationary frame (left)
    const leftX = margin;
    const leftW = (W - margin * 3) / 2;
    const rightX = leftX + leftW + margin;

    // Labels
    ctx.font = "bold 12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Rest Frame (S)", leftX + leftW / 2, 22);
    ctx.fillText(`Moving Frame (S') — v = ${(beta).toFixed(2)}c`, rightX + leftW / 2, 22);

    // Frame backgrounds
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(leftX, 30, leftW, visH - 40, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rightX, 30, leftW, visH - 40, 8);
    ctx.fill();

    // --- Rest frame: normal clock and ruler ---
    const clockCx = leftX + leftW / 2;
    const clockCy = 90;
    const clockR = 35;

    // Clock face
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(clockCx, clockCy, clockR, 0, Math.PI * 2);
    ctx.stroke();

    // Clock ticks
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clockCx + Math.cos(angle) * (clockR - 5), clockCy + Math.sin(angle) * (clockR - 5));
      ctx.lineTo(clockCx + Math.cos(angle) * clockR, clockCy + Math.sin(angle) * clockR);
      ctx.stroke();
    }

    // Clock hand
    const clockAngle = (t * 0.5) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clockCx, clockCy);
    ctx.lineTo(clockCx + Math.cos(clockAngle) * (clockR - 8), clockCy + Math.sin(clockAngle) * (clockR - 8));
    ctx.stroke();

    ctx.fillStyle = "#22c55e";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`t = ${t.toFixed(1)} s`, clockCx, clockCy + clockR + 15);

    // Rest ruler
    const rulerY = visH - 30;
    const rulerW = leftW - 20;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(leftX + 10, rulerY, rulerW, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`L₀ = 1.00 m`, leftX + 10 + rulerW / 2, rulerY + 25);

    // Meter marks
    for (let i = 0; i <= 10; i++) {
      const mx = leftX + 10 + (i / 10) * rulerW;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, rulerY);
      ctx.lineTo(mx, rulerY + (i % 5 === 0 ? 12 : 6));
      ctx.stroke();
    }

    // --- Moving frame: dilated clock and contracted ruler ---
    const clockCx2 = rightX + leftW / 2;

    // Dilated clock
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(clockCx2, clockCy, clockR, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clockCx2 + Math.cos(angle) * (clockR - 5), clockCy + Math.sin(angle) * (clockR - 5));
      ctx.lineTo(clockCx2 + Math.cos(angle) * clockR, clockCy + Math.sin(angle) * clockR);
      ctx.stroke();
    }

    // Dilated hand (runs slower by gamma)
    const dilatedAngle = (t / gamma * 0.5) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clockCx2, clockCy);
    ctx.lineTo(clockCx2 + Math.cos(dilatedAngle) * (clockR - 8), clockCy + Math.sin(dilatedAngle) * (clockR - 8));
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`t' = ${(t / gamma).toFixed(1)} s (slower!)`, clockCx2, clockCy + clockR + 15);

    // Contracted ruler
    const contractedW = rulerW / gamma;
    const rulerStart = rightX + 10 + (rulerW - contractedW) / 2;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(rulerStart, rulerY, contractedW, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`L = ${(1 / gamma).toFixed(3)} m (shorter!)`, rightX + 10 + rulerW / 2, rulerY + 25);

    // --- Bottom: Gamma graph ---
    const graphY = visH + 15;
    const graphH2 = H - graphY - 30;
    const graphW2 = W - margin * 2;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(margin - 10, graphY - 5, graphW2 + 20, graphH2 + 25, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("LORENTZ FACTOR γ vs v/c", margin, graphY + 10);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, graphY + 20);
    ctx.lineTo(margin, graphY + graphH2);
    ctx.lineTo(margin + graphW2, graphY + graphH2);
    ctx.stroke();

    // Plot gamma curve
    const maxGamma = 8;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(168,85,247,0.3)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let px = 0; px <= graphW2; px++) {
      const b = (px / graphW2) * 0.999;
      const g = 1 / Math.sqrt(1 - b * b);
      const py = graphY + graphH2 - (Math.min(g, maxGamma) / maxGamma) * (graphH2 - 25);
      if (px === 0) ctx.moveTo(margin + px, py);
      else ctx.lineTo(margin + px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current point
    const curPx = margin + beta * graphW2;
    const curPy = graphY + graphH2 - (Math.min(gamma, maxGamma) / maxGamma) * (graphH2 - 25);
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(curPx, curPy, 6, 0, Math.PI * 2);
    ctx.fill();

    // Value label
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 12px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText(`γ = ${gamma.toFixed(3)}`, curPx + 10, curPy - 5);

    // Axis labels
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("v/c →", margin + graphW2 / 2, graphY + graphH2 + 15);
    ctx.fillText("0", margin, graphY + graphH2 + 12);
    ctx.fillText("1", margin + graphW2, graphY + graphH2 + 12);

    // Info
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 210, graphY + 10, 198, 80, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("RELATIVITY DATA", W - 198, graphY + 26);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`v = ${beta.toFixed(3)}c`, W - 198, graphY + 44);
    ctx.fillText(`γ = ${gamma.toFixed(4)}`, W - 198, graphY + 60);
    ctx.fillText(`Time dilation: ${gamma.toFixed(2)}×`, W - 198, graphY + 76);
  }, [beta, gamma]);

  const animate = useCallback(() => {
    timeRef.current += 0.016;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.6, 520);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed (v/c)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={0.99} step={0.01} value={beta}
              onChange={(e) => setBeta(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{beta.toFixed(2)}c</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <div>Time dilation: <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{gamma.toFixed(3)}×</span></div>
            <div>Length contraction: <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{(1/gamma).toFixed(3)}×</span></div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Special Relativity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">γ = 1/√(1−v²/c²)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Δt = γΔt₀</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">L = L₀/γ</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E = γmc²</div>
        </div>
      </div>
    </div>
  );
}
