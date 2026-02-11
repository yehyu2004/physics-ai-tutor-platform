"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function BiotSavart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState(10);
  const [numWires, setNumWires] = useState(1);
  const [showFieldLines, setShowFieldLines] = useState(true);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const cx = W * 0.5;
    const cy = H * 0.5;
    const wireSpacing = 120;

    // Wire positions
    const wires: { x: number; y: number; dir: number }[] = [];
    if (numWires === 1) {
      wires.push({ x: cx, y: cy, dir: 1 });
    } else {
      wires.push({ x: cx - wireSpacing / 2, y: cy, dir: 1 });
      wires.push({ x: cx + wireSpacing / 2, y: cy, dir: numWires === 2 ? 1 : -1 });
    }

    // B field vectors
    const spacing = 25;
    const mu0I = current * 0.2; // µ₀I/2π scaled

    for (let x = spacing; x < W; x += spacing) {
      for (let y = spacing; y < H; y += spacing) {
        let Bx = 0, By = 0;
        for (const wire of wires) {
          const dx = x - wire.x;
          const dy = y - wire.y;
          const r2 = dx * dx + dy * dy;
          if (r2 < 400) continue;
          const r = Math.sqrt(r2);
          const B = mu0I * wire.dir / r;
          // B direction: perpendicular to r, using right-hand rule
          Bx += -B * dy / r;
          By += B * dx / r;
        }

        const mag = Math.sqrt(Bx * Bx + By * By);
        if (mag < 0.01) continue;

        const maxLen = 12;
        const len = Math.min(mag * 8, maxLen);
        const nx = Bx / mag;
        const ny = By / mag;

        const intensity = Math.min(mag / 2, 1);
        ctx.strokeStyle = `rgba(59, 200, 246, ${0.1 + intensity * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - nx * len / 2, y - ny * len / 2);
        ctx.lineTo(x + nx * len / 2, y + ny * len / 2);
        ctx.stroke();

        // Arrow tip
        const tipX = x + nx * len / 2;
        const tipY = y + ny * len / 2;
        ctx.fillStyle = `rgba(59, 200, 246, ${0.1 + intensity * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - nx * 3 - ny * 1.5, tipY - ny * 3 + nx * 1.5);
        ctx.lineTo(tipX - nx * 3 + ny * 1.5, tipY - ny * 3 - nx * 1.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Field lines (circles around each wire)
    if (showFieldLines) {
      for (const wire of wires) {
        for (let r = 30; r < 250; r += 30) {
          ctx.strokeStyle = `rgba(251, 191, 36, ${0.08 + 0.05 * (30 / r)})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.arc(wire.x, wire.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Draw wires
    for (const wire of wires) {
      // Glow
      const glow = ctx.createRadialGradient(wire.x, wire.y, 0, wire.x, wire.y, 30);
      glow.addColorStop(0, wire.dir > 0 ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(wire.x, wire.y, 30, 0, Math.PI * 2);
      ctx.fill();

      // Wire cross-section
      ctx.fillStyle = "#475569";
      ctx.beginPath();
      ctx.arc(wire.x, wire.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Current direction indicator
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (wire.dir > 0) {
        // Out of page (dot)
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(wire.x, wire.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Into page (cross)
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wire.x - 5, wire.y - 5);
        ctx.lineTo(wire.x + 5, wire.y + 5);
        ctx.moveTo(wire.x + 5, wire.y - 5);
        ctx.lineTo(wire.x - 5, wire.y + 5);
        ctx.stroke();
      }
    }

    // Info panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 200, 12, 188, 75, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("MAGNETIC FIELD", W - 188, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`I = ${current} A`, W - 188, 46);
    ctx.fillText(`B = µ₀I/(2πr)`, W - 188, 62);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("⊙ out of page", W - 188, 78);

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 150, 40, 6);
    ctx.fill();
    ctx.font = "10px system-ui";
    ctx.fillStyle = "rgba(59,200,246,0.8)";
    ctx.textAlign = "left";
    ctx.fillText("— B field vectors", 22, 28);
    ctx.fillStyle = "rgba(251,191,36,0.6)";
    ctx.fillText("--- field lines", 22, 44);
  }, [current, numWires, showFieldLines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 480);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current (A)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={30} value={current}
              onChange={(e) => setCurrent(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{current} A</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Configuration</label>
          <div className="flex gap-2 mt-2">
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setNumWires(n)}
                className={`flex-1 h-9 rounded-lg text-xs font-medium ${
                  numWires === n ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}>
                {n === 1 ? "1 Wire" : n === 2 ? "Parallel" : "Anti-par"}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowFieldLines(!showFieldLines)}
            className={`w-full h-10 rounded-lg text-sm font-medium ${
              showFieldLines ? "bg-amber-500 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Field Lines {showFieldLines ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Key Equations</h4>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
            <div>B = µ₀I/(2πr)</div>
            <div>µ₀ = 4π×10⁻⁷ T·m/A</div>
          </div>
        </div>
      </div>
    </div>
  );
}
