"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function ConstantAcceleration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [v0, setV0] = useState(5);
  const [accel, setAccel] = useState(2);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; x: number; v: number }[]>([]);

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

    // Current values
    const x = v0 * t + 0.5 * accel * t * t;
    const v = v0 + accel * t;

    // --- Top section: Car animation ---
    const carSection = H * 0.22;
    const roadY = carSection * 0.7;
    const margin = 60;
    const trackW = W - margin * 2;

    // Road
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(margin, roadY - 2, trackW, 20);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(margin, roadY + 8);
    ctx.lineTo(margin + trackW, roadY + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Distance markers
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    const maxDist = 200;
    for (let d = 0; d <= maxDist; d += 25) {
      const px = margin + (d / maxDist) * trackW;
      ctx.fillRect(px, roadY + 18, 1, 5);
      ctx.fillText(`${d}m`, px, roadY + 32);
    }

    // Car position
    const carX = margin + Math.min((x / maxDist), 1) * trackW;

    // Speed-based color
    const speedFrac = Math.min(Math.abs(v) / 30, 1);
    const cr = Math.round(59 + speedFrac * 180);
    const cg = Math.round(130 - speedFrac * 80);
    const cb = Math.round(246 - speedFrac * 200);

    // Car glow
    const carGlow = ctx.createRadialGradient(carX, roadY, 0, carX, roadY, 30);
    carGlow.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
    carGlow.addColorStop(1, "transparent");
    ctx.fillStyle = carGlow;
    ctx.beginPath();
    ctx.arc(carX, roadY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Car body
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.beginPath();
    ctx.roundRect(carX - 18, roadY - 12, 36, 14, 4);
    ctx.fill();
    // Roof
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.7)`;
    ctx.beginPath();
    ctx.roundRect(carX - 10, roadY - 20, 20, 10, 3);
    ctx.fill();
    // Wheels
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(carX - 10, roadY + 2, 4, 0, Math.PI * 2);
    ctx.arc(carX + 10, roadY + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Velocity arrow
    if (Math.abs(v) > 0.3) {
      const arrLen = Math.min(Math.abs(v) * 3, 60) * Math.sign(v);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(carX, roadY - 25);
      ctx.lineTo(carX + arrLen, roadY - 25);
      ctx.stroke();
      const dir = v > 0 ? 1 : -1;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(carX + arrLen, roadY - 25);
      ctx.lineTo(carX + arrLen - dir * 7, roadY - 30);
      ctx.lineTo(carX + arrLen - dir * 7, roadY - 20);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText(`v = ${v.toFixed(1)} m/s`, carX + arrLen / 2, roadY - 32);
    }

    // --- Three graphs side by side ---
    const graphTop = carSection + 20;
    const graphH = H - graphTop - 30;
    const gapX = 15;
    const graphW = (W - margin * 2 - gapX * 2) / 3;
    const history = historyRef.current;
    const maxT = Math.max(t + 1, 6);

    const graphs = [
      {
        title: "Position x(t)",
        color: "#3b82f6",
        glow: "rgba(59,130,246,0.3)",
        getValue: (h: { x: number }) => h.x,
        equation: `x = ${v0}t + ½(${accel})t²`,
      },
      {
        title: "Velocity v(t)",
        color: "#22c55e",
        glow: "rgba(34,197,94,0.3)",
        getValue: (h: { v: number }) => h.v,
        equation: `v = ${v0} + ${accel}t`,
      },
      {
        title: "Acceleration a(t)",
        color: "#f59e0b",
        glow: "rgba(245,158,11,0.3)",
        getValue: () => accel,
        equation: `a = ${accel} m/s²`,
      },
    ];

    graphs.forEach((graph, idx) => {
      const gx = margin + idx * (graphW + gapX);
      const gy = graphTop;

      // Background
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(gx, gy, graphW, graphH, 6);
      ctx.fill();

      // Title
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = graph.color;
      ctx.textAlign = "left";
      ctx.fillText(graph.title, gx + 8, gy + 16);

      // Equation
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.fillText(graph.equation, gx + 8, gy + 28);

      // Axes
      const axMargin = 10;
      const plotX = gx + axMargin;
      const plotW = graphW - axMargin * 2;
      const plotY = gy + 35;
      const plotH = graphH - 50;

      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();

      // Plot data
      if (history.length > 1) {
        const values = history.map((h) => graph.getValue(h));
        const minVal = Math.min(0, ...values);
        const maxVal = Math.max(1, ...values);
        const range = maxVal - minVal || 1;

        // Zero line
        if (minVal < 0 && maxVal > 0) {
          const zeroY = plotY + plotH - ((-minVal) / range) * plotH;
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.beginPath();
          ctx.moveTo(plotX, zeroY);
          ctx.lineTo(plotX + plotW, zeroY);
          ctx.stroke();
        }

        ctx.strokeStyle = graph.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = graph.glow;
        ctx.shadowBlur = 8;
        ctx.beginPath();

        for (let i = 0; i < history.length; i++) {
          const px = plotX + (history[i].t / maxT) * plotW;
          const py = plotY + plotH - ((values[i] - minVal) / range) * plotH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Current value dot
        const lastH = history[history.length - 1];
        const lastVal = graph.getValue(lastH);
        const dotX = plotX + (lastH.t / maxT) * plotW;
        const dotY = plotY + plotH - ((lastVal - minVal) / range) * plotH;
        ctx.fillStyle = graph.color;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Value label
        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "right";
        ctx.fillText(lastVal.toFixed(1), gx + graphW - 8, gy + graphH - 8);
      }
    });

    // Time display
    ctx.font = "bold 12px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(`t = ${t.toFixed(1)} s`, margin, H - 8);
  }, [v0, accel]);

  const animate = useCallback(() => {
    timeRef.current += 0.03;
    const t = timeRef.current;
    const x = v0 * t + 0.5 * accel * t * t;
    const v = v0 + accel * t;
    historyRef.current.push({ t, x, v });
    if (historyRef.current.length > 500) historyRef.current.shift();
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [v0, accel, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.65, 550);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
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
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial Velocity</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={-10} max={20} step={0.5} value={v0}
              onChange={(e) => { setV0(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4.5rem] text-right">{v0} m/s</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acceleration</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={-5} max={10} step={0.5} value={accel}
              onChange={(e) => { setAccel(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">{accel} m/s²</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={() => { reset(); if (!isRunning) draw(); }}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Key Equations</h4>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
            <div>x = x₀ + v₀t + ½at²</div>
            <div>v = v₀ + at</div>
            <div>v² = v₀² + 2a(x − x₀)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
