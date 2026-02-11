"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function ParticleInBox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [n, setN] = useState(1); // quantum number
  const [boxWidth, setBoxWidth] = useState(200);
  const [showProbability, setShowProbability] = useState(true);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);

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

    const margin = 60;
    const wellLeft = margin;
    const wellRight = margin + boxWidth * (W - margin * 2) / 300;
    const wellW = wellRight - wellLeft;
    const midY = H * 0.5;
    const amp = H * 0.3;

    // Potential walls
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fillRect(0, 0, wellLeft, H);
    ctx.fillRect(wellRight, 0, W - wellRight, H);

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wellLeft, 0);
    ctx.lineTo(wellLeft, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wellRight, 0);
    ctx.lineTo(wellRight, H);
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("V = ∞", wellLeft / 2, midY);
    ctx.fillText("V = ∞", (wellRight + W) / 2, midY);

    // V = 0 inside
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.font = "10px system-ui";
    ctx.fillText("V = 0", (wellLeft + wellRight) / 2, H - 15);

    // Zero line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wellLeft, midY);
    ctx.lineTo(wellRight, midY);
    ctx.stroke();

    // Wave function ψ_n(x) = √(2/L) sin(nπx/L)
    const omega = n * n * 2; // angular frequency ∝ n²

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(59,130,246,0.4)";
    ctx.shadowBlur = 10;
    ctx.beginPath();

    for (let px = wellLeft; px <= wellRight; px++) {
      const x = (px - wellLeft) / wellW; // 0 to 1
      const psi = Math.sin(n * Math.PI * x) * Math.cos(omega * t);
      const py = midY - psi * amp;
      if (px === wellLeft) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Probability density |ψ|² (filled)
    if (showProbability) {
      ctx.fillStyle = "rgba(168,85,247,0.15)";
      ctx.beginPath();
      ctx.moveTo(wellLeft, midY);
      for (let px = wellLeft; px <= wellRight; px++) {
        const x = (px - wellLeft) / wellW;
        const psi2 = Math.sin(n * Math.PI * x) ** 2;
        const py = midY - psi2 * amp * 0.8;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(wellRight, midY);
      ctx.closePath();
      ctx.fill();

      // |ψ|² outline
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let px = wellLeft; px <= wellRight; px++) {
        const x = (px - wellLeft) / wellW;
        const psi2 = Math.sin(n * Math.PI * x) ** 2;
        const py = midY - psi2 * amp * 0.8;
        if (px === wellLeft) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Node indicators
    for (let k = 1; k < n; k++) {
      const nodeX = wellLeft + (k / n) * wellW;
      ctx.fillStyle = "rgba(251,191,36,0.5)";
      ctx.beginPath();
      ctx.arc(nodeX, midY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Energy level diagram (right side)
    const elvX = W - 160;
    const elvW = 130;
    const elvY = 30;
    const elvH = H - 60;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(elvX - 10, elvY - 15, elvW + 20, elvH + 30, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("ENERGY LEVELS", elvX + elvW / 2, elvY);

    // E_n = n² × E_1
    const maxN = 5;
    const maxE = maxN * maxN;

    for (let level = 1; level <= maxN; level++) {
      const E = level * level;
      const ly = elvY + elvH - (E / maxE) * (elvH - 30);
      const isActive = level === n;

      ctx.strokeStyle = isActive ? "#fbbf24" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isActive ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(elvX, ly);
      ctx.lineTo(elvX + elvW, ly);
      ctx.stroke();

      ctx.fillStyle = isActive ? "#fbbf24" : "#64748b";
      ctx.font = isActive ? "bold 11px ui-monospace" : "10px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`n=${level}`, elvX + elvW + 5, ly + 4);
      ctx.textAlign = "right";
      ctx.fillText(`${E}E₁`, elvX - 5, ly + 4);
    }

    // Legend
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("— ψ(x,t) wave function", wellLeft + 10, 25);
    if (showProbability) {
      ctx.fillStyle = "#a855f7";
      ctx.fillText("— |ψ|² probability density", wellLeft + 10, 42);
    }
    if (n > 1) {
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`● ${n - 1} node${n > 2 ? "s" : ""}`, wellLeft + 10, showProbability ? 59 : 42);
    }
  }, [n, boxWidth, showProbability]);

  const animate = useCallback(() => {
    timeRef.current += 0.02;
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quantum Number n</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={8} value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{n}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Box Width</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={80} max={280} value={boxWidth}
              onChange={(e) => setBoxWidth(Number(e.target.value))}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{boxWidth}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowProbability(!showProbability)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showProbability ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            |ψ|² {showProbability ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Particle in a Box</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ψ_n = √(2/L) sin(nπx/L)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E_n = n²π²ℏ²/(2mL²)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E_n = n² × E₁</div>
        </div>
      </div>
    </div>
  );
}
