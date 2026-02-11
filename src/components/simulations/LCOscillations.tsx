"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function LCOscillations() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [inductance, setInductance] = useState(100); // mH
  const [capacitance, setCapacitance] = useState(100); // µF
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; q: number; i: number }[]>([]);

  // ω = 1/√(LC)
  const L = inductance / 1000; // H
  const C = capacitance / 1000000; // F
  const omega = 1 / Math.sqrt(L * C);
  const period = (2 * Math.PI) / omega;

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

    const Q0 = 1; // max charge
    const q = Q0 * Math.cos(omega * t);
    const i = -Q0 * omega * Math.sin(omega * t);

    // Energy
    const UE = 0.5 * q * q / C; // capacitor energy
    const UB = 0.5 * L * i * i; // inductor energy
    const UTotal = 0.5 * Q0 * Q0 / C;

    // --- Top: Circuit with animated charge/current ---
    const circY = H * 0.3;
    const circX = W * 0.25;
    const circW2 = W * 0.2;
    const circH2 = H * 0.15;

    // Capacitor (left)
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    // Top wire
    ctx.beginPath();
    ctx.moveTo(circX - circW2, circY - circH2);
    ctx.lineTo(circX + circW2, circY - circH2);
    ctx.stroke();
    // Bottom wire
    ctx.beginPath();
    ctx.moveTo(circX - circW2, circY + circH2);
    ctx.lineTo(circX + circW2, circY + circH2);
    ctx.stroke();
    // Left side
    ctx.beginPath();
    ctx.moveTo(circX - circW2, circY - circH2);
    ctx.lineTo(circX - circW2, circY + circH2);
    ctx.stroke();
    // Right side
    ctx.beginPath();
    ctx.moveTo(circX + circW2, circY - circH2);
    ctx.lineTo(circX + circW2, circY + circH2);
    ctx.stroke();

    // Capacitor symbol (left side)
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#3b82f6";
    ctx.beginPath();
    ctx.moveTo(circX - circW2 - 2, circY - 15);
    ctx.lineTo(circX - circW2 - 2, circY + 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(circX - circW2 + 8, circY - 15);
    ctx.lineTo(circX - circW2 + 8, circY + 15);
    ctx.stroke();

    // Capacitor charge visualization
    const chargeFrac = Math.abs(q) / Q0;
    ctx.fillStyle = `rgba(59,130,246,${chargeFrac * 0.4})`;
    ctx.fillRect(circX - circW2 - 10, circY - 12, 8, 24);

    ctx.fillStyle = "#3b82f6";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("C", circX - circW2 + 3, circY + 30);
    ctx.fillText(`q=${q.toFixed(2)}`, circX - circW2 + 3, circY + 42);

    // Inductor symbol (right side) - coil
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    const coilX = circX + circW2;
    const coilTop = circY - circH2;
    const coilBot = circY + circH2;
    const coilH = coilBot - coilTop;
    for (let j = 0; j < 4; j++) {
      const y1 = coilTop + (j / 4) * coilH;
      const y2 = coilTop + ((j + 1) / 4) * coilH;
      ctx.beginPath();
      ctx.arc(coilX, (y1 + y2) / 2, (y2 - y1) / 2, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#f59e0b";
    ctx.font = "10px ui-monospace";
    ctx.fillText("L", coilX + 18, circY);

    // Current arrows
    const iScale = Math.abs(i) / (Q0 * omega);
    if (iScale > 0.05) {
      ctx.fillStyle = `rgba(34,197,94,${0.3 + iScale * 0.5})`;
      const dir = i > 0 ? 1 : -1;
      // Top wire arrows
      for (let ax = circX - circW2 + 20; ax < circX + circW2 - 10; ax += 25) {
        ctx.beginPath();
        ctx.moveTo(ax + dir * 5, circY - circH2);
        ctx.lineTo(ax - dir * 3, circY - circH2 - 4);
        ctx.lineTo(ax - dir * 3, circY - circH2 + 4);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Energy bars
    const barX = circX - circW2;
    const barW2 = circW2 * 2;
    const barY = circY + circH2 + 55;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(barX - 10, barY - 20, barW2 + 20, 65, 6);
    ctx.fill();

    ctx.font = "bold 9px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY", barX, barY - 6);

    // UE bar
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(barX, barY, (UE / UTotal) * barW2, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`UE = ½q²/C`, barX, barY + 24);

    // UB bar
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.roundRect(barX, barY + 15, (UB / UTotal) * barW2, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#fcd34d";
    ctx.fillText(`UB = ½Li²`, barX + barW2 / 2, barY + 24);

    // --- Right: Graph ---
    const graphX = W * 0.55;
    const graphW = W - graphX - 20;
    const graphY = 25;
    const graphH = H - 50;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphY - 10, graphW + 20, graphH + 20, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CHARGE & CURRENT vs TIME", graphX, graphY + 5);

    // Zero line
    const midGraphY = graphY + graphH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, midGraphY);
    ctx.lineTo(graphX + graphW, midGraphY);
    ctx.stroke();

    const history = historyRef.current;
    if (history.length > 1) {
      const maxT2 = Math.max(t, period * 2);
      const plotH = graphH / 2 - 20;

      // Plot charge
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.3)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let j = 0; j < history.length; j++) {
        const px = graphX + (history[j].t / maxT2) * graphW;
        const py = midGraphY - (history[j].q / Q0) * plotH;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Plot current
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.3)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let j = 0; j < history.length; j++) {
        const px = graphX + (history[j].t / maxT2) * graphW;
        const py = midGraphY - (history[j].i / (Q0 * omega)) * plotH;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Legend
    ctx.font = "10px system-ui";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("— q(t)", graphX + graphW - 80, graphY + 5);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("— i(t)", graphX + graphW - 40, graphY + 5);

    // Info
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(graphX, graphY + graphH - 40, graphW, 35, 4);
    ctx.fill();
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.fillText(`ω = ${omega.toFixed(1)} rad/s  |  T = ${(period * 1000).toFixed(1)} ms  |  f = ${(1 / period).toFixed(1)} Hz`, graphX + graphW / 2, graphY + graphH - 18);
  }, [inductance, capacitance, omega, period, L, C]);

  const animate = useCallback(() => {
    timeRef.current += 0.0005;
    const t = timeRef.current;
    const Q0 = 1;
    const q = Q0 * Math.cos(omega * t);
    const i = -Q0 * omega * Math.sin(omega * t);

    historyRef.current.push({ t, q, i });
    if (historyRef.current.length > 800) historyRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [omega, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.5, 420);
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

  const reset = () => {
    timeRef.current = 0;
    historyRef.current = [];
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">L (mH)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={500} step={10} value={inductance}
              onChange={(e) => { setInductance(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{inductance}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">C (µF)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={500} step={10} value={capacitance}
              onChange={(e) => { setCapacitance(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{capacitance}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">LC Oscillations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ω = 1/√(LC)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">q(t) = Q₀cos(ωt)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">UE + UB = const</div>
        </div>
      </div>
    </div>
  );
}
