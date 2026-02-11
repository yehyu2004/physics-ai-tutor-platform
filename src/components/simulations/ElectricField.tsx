"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Charge {
  x: number;
  y: number;
  q: number; // positive or negative
  id: number;
}

export default function ElectricField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [charges, setCharges] = useState<Charge[]>([
    { x: 0.35, y: 0.5, q: 1, id: 1 },
    { x: 0.65, y: 0.5, q: -1, id: 2 },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [chargeType, setChargeType] = useState<number>(1);
  const [showFieldLines, setShowFieldLines] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const nextId = useRef(3);

  const getField = useCallback((px: number, py: number, chargeList: Charge[], W: number, H: number) => {
    let Ex = 0, Ey = 0;
    const k = 800;
    for (const c of chargeList) {
      const cx = c.x * W;
      const cy = c.y * H;
      const dx = px - cx;
      const dy = py - cy;
      const r2 = dx * dx + dy * dy;
      if (r2 < 100) continue;
      const r = Math.sqrt(r2);
      const E = k * c.q / r2;
      Ex += E * dx / r;
      Ey += E * dy / r;
    }
    return { Ex, Ey };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Field lines
    if (showFieldLines) {
      const positiveCharges = charges.filter((c) => c.q > 0);
      const linesPerCharge = 16;

      for (const charge of positiveCharges) {
        for (let i = 0; i < linesPerCharge; i++) {
          const angle = (i / linesPerCharge) * Math.PI * 2;
          let lx = charge.x * W + Math.cos(angle) * 15;
          let ly = charge.y * H + Math.sin(angle) * 15;

          ctx.strokeStyle = "rgba(251,191,36,0.25)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(lx, ly);

          for (let step = 0; step < 200; step++) {
            const { Ex, Ey } = getField(lx, ly, charges, W, H);
            const mag = Math.sqrt(Ex * Ex + Ey * Ey);
            if (mag < 0.01) break;

            const stepSize = 4;
            lx += (Ex / mag) * stepSize;
            ly += (Ey / mag) * stepSize;

            if (lx < 0 || lx > W || ly < 0 || ly > H) break;

            // Check if we're close to a negative charge
            let hitNeg = false;
            for (const c of charges) {
              if (c.q < 0) {
                const dx = lx - c.x * W;
                const dy = ly - c.y * H;
                if (dx * dx + dy * dy < 200) {
                  hitNeg = true;
                  break;
                }
              }
            }

            ctx.lineTo(lx, ly);
            if (hitNeg) break;
          }
          ctx.stroke();
        }
      }

      // For negative-only charges, draw lines going inward
      if (positiveCharges.length === 0) {
        for (const charge of charges) {
          for (let i = 0; i < linesPerCharge; i++) {
            const angle = (i / linesPerCharge) * Math.PI * 2;
            let lx = charge.x * W + Math.cos(angle) * 200;
            let ly = charge.y * H + Math.sin(angle) * 200;

            ctx.strokeStyle = "rgba(251,191,36,0.25)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(lx, ly);

            for (let step = 0; step < 200; step++) {
              const { Ex, Ey } = getField(lx, ly, charges, W, H);
              const mag = Math.sqrt(Ex * Ex + Ey * Ey);
              if (mag < 0.01) break;

              const stepSize = 4;
              lx += (Ex / mag) * stepSize;
              ly += (Ey / mag) * stepSize;

              if (lx < 0 || lx > W || ly < 0 || ly > H) break;

              const dx = lx - charge.x * W;
              const dy = ly - charge.y * H;
              if (dx * dx + dy * dy < 200) break;

              ctx.lineTo(lx, ly);
            }
            ctx.stroke();
          }
        }
      }
    }

    // Field vectors
    if (showVectors) {
      const spacing = 40;
      for (let x = spacing; x < W; x += spacing) {
        for (let y = spacing; y < H; y += spacing) {
          const { Ex, Ey } = getField(x, y, charges, W, H);
          const mag = Math.sqrt(Ex * Ex + Ey * Ey);
          if (mag < 0.1) continue;

          const maxLen = 18;
          const len = Math.min(mag * 15, maxLen);
          const nx = Ex / mag;
          const ny = Ey / mag;

          const intensity = Math.min(mag / 3, 1);
          ctx.strokeStyle = `rgba(100, 200, 255, ${0.15 + intensity * 0.4})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - nx * len / 2, y - ny * len / 2);
          ctx.lineTo(x + nx * len / 2, y + ny * len / 2);
          ctx.stroke();

          // Arrow tip
          const tipX = x + nx * len / 2;
          const tipY = y + ny * len / 2;
          ctx.fillStyle = `rgba(100, 200, 255, ${0.15 + intensity * 0.4})`;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - nx * 4 - ny * 2, tipY - ny * 4 + nx * 2);
          ctx.lineTo(tipX - nx * 4 + ny * 2, tipY - ny * 4 - nx * 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw charges
    for (const charge of charges) {
      const cx = charge.x * W;
      const cy = charge.y * H;

      // Glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
      if (charge.q > 0) {
        glow.addColorStop(0, "rgba(239, 68, 68, 0.4)");
        glow.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        glow.addColorStop(0, "rgba(59, 130, 246, 0.4)");
        glow.addColorStop(1, "rgba(59, 130, 246, 0)");
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fill();

      // Charge circle
      ctx.fillStyle = charge.q > 0 ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = charge.q > 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Symbol
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(charge.q > 0 ? "+" : "−", cx, cy + 1);
    }

    // Instructions
    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Click to add charges • Drag to move", 15, 15);
  }, [charges, showFieldLines, showVectors, getField]);

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

  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;

    // Check if clicking on existing charge
    for (const charge of charges) {
      const dx = mx - charge.x;
      const dy = my - charge.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.04) {
        setDragging(charge.id);
        return;
      }
    }

    // Add new charge
    const newCharge: Charge = {
      x: mx,
      y: my,
      q: chargeType,
      id: nextId.current++,
    };
    setCharges((prev) => [...prev, newCharge]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setCharges((prev) =>
      prev.map((c) => (c.id === dragging ? { ...c, x: mx, y: my } : c))
    );
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setChargeType(1)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            chargeType === 1
              ? "bg-red-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          + Positive
        </button>
        <button
          onClick={() => setChargeType(-1)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            chargeType === -1
              ? "bg-blue-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          − Negative
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        <button
          onClick={() => setShowFieldLines(!showFieldLines)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showFieldLines
              ? "bg-amber-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Field Lines
        </button>
        <button
          onClick={() => setShowVectors(!showVectors)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showVectors
              ? "bg-cyan-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Vectors
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        <button
          onClick={() => {
            setCharges([]);
            nextId.current = 1;
          }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={() => {
            setCharges([
              { x: 0.35, y: 0.5, q: 1, id: nextId.current++ },
              { x: 0.65, y: 0.5, q: -1, id: nextId.current++ },
            ]);
          }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Dipole
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Coulomb&apos;s Law</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          E = kq/r² &nbsp;&nbsp;|&nbsp;&nbsp; F = kq₁q₂/r² &nbsp;&nbsp;|&nbsp;&nbsp; k = 8.99 × 10⁹ N·m²/C²
        </div>
      </div>
    </div>
  );
}
