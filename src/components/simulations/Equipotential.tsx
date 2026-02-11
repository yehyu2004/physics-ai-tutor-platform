"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Charge {
  x: number; // fraction 0-1
  y: number;
  q: number; // in units of e (positive or negative)
}

export default function Equipotential() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [charges, setCharges] = useState<Charge[]>([
    { x: 0.35, y: 0.5, q: 1 },
    { x: 0.65, y: 0.5, q: -1 },
  ]);
  const [showField, setShowField] = useState(true);
  const [contourCount, setContourCount] = useState(12);
  const draggingRef = useRef<number | null>(null);

  const k = 8.99e9; // Coulomb's constant (for display, we'll use normalized)

  const computeV = useCallback((px: number, py: number, W: number, H: number, chargeList: Charge[]): number => {
    let V = 0;
    for (const c of chargeList) {
      const dx = px - c.x * W;
      const dy = py - c.y * H;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 5) continue;
      V += (c.q * k) / (r * 2); // scaled
    }
    return V;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Compute potential field
    const step = 6;
    const cols = Math.ceil(W / step);
    const rows = Math.ceil(H / step);
    const field: number[][] = [];

    let minV = Infinity, maxV = -Infinity;
    for (let j = 0; j < rows; j++) {
      field[j] = [];
      for (let i = 0; i < cols; i++) {
        const v = computeV(i * step, j * step, W, H, charges);
        field[j][i] = v;
        if (Math.abs(v) < 1e12) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
    }

    // Draw colored potential map (subtle background)
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const v = field[j][i];
        if (Math.abs(v) > 1e12) continue;
        const norm = (v - minV) / (maxV - minV + 1e-10);
        const r = Math.floor(norm * 100);
        const g = Math.floor(20 + (1 - Math.abs(norm - 0.5) * 2) * 30);
        const b = Math.floor((1 - norm) * 100);
        ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
        ctx.fillRect(i * step, j * step, step, step);
      }
    }

    // Draw equipotential contours using marching squares-like approach
    const contourRange = maxV - minV;
    if (contourRange > 0) {
      for (let c = 1; c <= contourCount; c++) {
        const targetV = minV + (contourRange * c) / (contourCount + 1);
        const isPositive = targetV > (minV + maxV) / 2;

        ctx.strokeStyle = isPositive
          ? `rgba(239,68,68,${0.4 + c * 0.03})`
          : `rgba(59,130,246,${0.4 + (contourCount - c) * 0.03})`;
        ctx.lineWidth = 1.5;

        // Simple contour: scan for crossings
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const v00 = field[j][i];
            const v10 = field[j][i + 1];
            const v01 = field[j + 1][i];

            // Horizontal crossing
            if ((v00 - targetV) * (v10 - targetV) < 0 && Math.abs(v00) < 1e12 && Math.abs(v10) < 1e12) {
              const frac = (targetV - v00) / (v10 - v00);
              const cx = (i + frac) * step;
              const cy = j * step;
              ctx.beginPath();
              ctx.arc(cx, cy, 1, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Vertical crossing
            if ((v00 - targetV) * (v01 - targetV) < 0 && Math.abs(v00) < 1e12 && Math.abs(v01) < 1e12) {
              const frac = (targetV - v00) / (v01 - v00);
              const cx = i * step;
              const cy = (j + frac) * step;
              ctx.beginPath();
              ctx.arc(cx, cy, 1, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }
    }

    // Draw electric field vectors
    if (showField) {
      const arrowStep = 40;
      for (let y = arrowStep; y < H; y += arrowStep) {
        for (let x = arrowStep; x < W; x += arrowStep) {
          let Ex = 0, Ey = 0;
          let tooClose = false;
          for (const c of charges) {
            const dx = x - c.x * W;
            const dy = y - c.y * H;
            const r2 = dx * dx + dy * dy;
            if (r2 < 600) { tooClose = true; break; }
            const r = Math.sqrt(r2);
            const E = c.q / r2;
            Ex += E * dx / r;
            Ey += E * dy / r;
          }
          if (tooClose) continue;

          const mag = Math.sqrt(Ex * Ex + Ey * Ey);
          if (mag < 1e-10) continue;
          const len = Math.min(mag * 5e5, 16);
          const nx = Ex / mag;
          const ny = Ey / mag;

          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + nx * len, y + ny * len);
          ctx.stroke();

          // Arrowhead
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.beginPath();
          ctx.moveTo(x + nx * (len + 3), y + ny * (len + 3));
          ctx.lineTo(x + nx * len - ny * 2, y + ny * len + nx * 2);
          ctx.lineTo(x + nx * len + ny * 2, y + ny * len - nx * 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw charges
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const cx = c.x * W;
      const cy = c.y * H;

      // Glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
      glow.addColorStop(0, c.q > 0 ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fill();

      // Charge circle
      ctx.fillStyle = c.q > 0 ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.q > 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.q > 0 ? "+" : "-", cx, cy + 1);
      ctx.textBaseline = "alphabetic";

      // q value
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`q=${c.q > 0 ? "+" : ""}${c.q}`, cx, cy + 28);
    }

    // Info panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 200, 50, 6);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("EQUIPOTENTIAL LINES", 20, 28);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("Drag charges to reposition", 20, 45);
  }, [charges, showField, contourCount, computeV]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 500);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  // Mouse interaction for dragging charges
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    };

    const onDown = (e: MouseEvent) => {
      const pos = getPos(e);
      for (let i = 0; i < charges.length; i++) {
        const dx = pos.x - charges[i].x;
        const dy = pos.y - charges[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.05) {
          draggingRef.current = i;
          break;
        }
      }
    };

    const onMove = (e: MouseEvent) => {
      if (draggingRef.current === null) return;
      const pos = getPos(e);
      setCharges(prev => {
        const next = [...prev];
        next[draggingRef.current!] = { ...next[draggingRef.current!], x: pos.x, y: pos.y };
        return next;
      });
    };

    const onUp = () => { draggingRef.current = null; };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onUp);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onUp);
    };
  }, [charges]);

  const addCharge = (q: number) => {
    setCharges(prev => [...prev, { x: 0.5, y: 0.3 + Math.random() * 0.4, q }]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-grab active:cursor-grabbing" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => addCharge(1)}
            className="w-full h-9 rounded-lg bg-red-600 text-white text-xs font-medium">+ Charge</button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => addCharge(-1)}
            className="w-full h-9 rounded-lg bg-blue-600 text-white text-xs font-medium">- Charge</button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contours</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={4} max={24} value={contourCount}
              onChange={(e) => setContourCount(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{contourCount}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => setShowField(!showField)}
            className={`w-full h-9 rounded-lg text-xs font-medium transition-colors ${
              showField ? "bg-emerald-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            {showField ? "E-field ON" : "E-field OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => setCharges([{ x: 0.35, y: 0.5, q: 1 }, { x: 0.65, y: 0.5, q: -1 }])}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">V = kq/r</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E = -dV/dr</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">V_total = Sum(kq_i/r_i)</div>
        </div>
      </div>
    </div>
  );
}
