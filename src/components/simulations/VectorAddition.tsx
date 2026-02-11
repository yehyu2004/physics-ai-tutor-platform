"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Vec {
  x: number;
  y: number;
  color: string;
  label: string;
}

export default function VectorAddition() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vectors, setVectors] = useState<Vec[]>([
    { x: 120, y: -80, color: "#ef4444", label: "A" },
    { x: 80, y: 60, color: "#3b82f6", label: "B" },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [showComponents, setShowComponents] = useState(true);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const ox = W * 0.3;
    const oy = H * 0.55;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = ox % 40; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = oy % 40; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, oy); ctx.lineTo(W, oy);
    ctx.moveTo(ox, 0); ctx.lineTo(ox, H);
    ctx.stroke();

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.fillText("x", W - 15, oy - 8);
    ctx.fillText("y", ox + 12, 15);

    const drawArrow = (fromX: number, fromY: number, toX: number, toY: number, color: string, label: string, lw: number) => {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // Arrowhead
      const nx = dx / mag;
      const ny = dy / mag;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - nx * 12 - ny * 5, toY - ny * 12 + nx * 5);
      ctx.lineTo(toX - nx * 12 + ny * 5, toY - ny * 12 - nx * 5);
      ctx.closePath();
      ctx.fill();

      // Label
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      ctx.font = "bold 14px system-ui";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX - ny * 18, midY + nx * 18);
    };

    // Components (dashed)
    if (showComponents) {
      vectors.forEach((v) => {
        ctx.strokeStyle = v.color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        // x-component
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + v.x, oy);
        ctx.stroke();
        // y-component
        ctx.beginPath();
        ctx.moveTo(ox + v.x, oy);
        ctx.lineTo(ox + v.x, oy + v.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
    }

    // Draw individual vectors from origin
    vectors.forEach((v) => {
      drawArrow(ox, oy, ox + v.x, oy + v.y, v.color, v.label, 3);

      // Dot at tip
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(ox + v.x, oy + v.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⊙", ox + v.x, oy + v.y);
    });

    // Resultant (tail-to-tip method shown)
    const rx = vectors.reduce((s, v) => s + v.x, 0);
    const ry = vectors.reduce((s, v) => s + v.y, 0);

    // Show tail-to-tip
    ctx.globalAlpha = 0.25;
    let tipX = ox;
    let tipY = oy;
    vectors.forEach((v) => {
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + v.x, tipY + v.y);
      ctx.stroke();
      tipX += v.x;
      tipY += v.y;
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Resultant
    drawArrow(ox, oy, ox + rx, oy + ry, "#a855f7", "R", 3.5);

    // Glow on resultant tip
    const rGlow = ctx.createRadialGradient(ox + rx, oy + ry, 0, ox + rx, oy + ry, 20);
    rGlow.addColorStop(0, "rgba(168,85,247,0.3)");
    rGlow.addColorStop(1, "rgba(168,85,247,0)");
    ctx.fillStyle = rGlow;
    ctx.beginPath();
    ctx.arc(ox + rx, oy + ry, 20, 0, Math.PI * 2);
    ctx.fill();

    // Info panel
    const rMag = Math.sqrt(rx * rx + ry * ry);
    const rAngle = Math.atan2(-ry, rx) * 180 / Math.PI;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 220, 12, 208, 120, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("VECTOR DATA", W - 208, 20);

    ctx.font = "11px ui-monospace";
    vectors.forEach((v, i) => {
      const mag = Math.sqrt(v.x * v.x + v.y * v.y);
      const ang = Math.atan2(-v.y, v.x) * 180 / Math.PI;
      ctx.fillStyle = v.color;
      ctx.fillText(`${v.label}: (${v.x.toFixed(0)}, ${(-v.y).toFixed(0)})  |${v.label}|=${mag.toFixed(0)}  θ=${ang.toFixed(0)}°`, W - 208, 38 + i * 18);
    });
    ctx.fillStyle = "#a855f7";
    ctx.fillText(`R: (${rx.toFixed(0)}, ${(-ry).toFixed(0)})  |R|=${rMag.toFixed(0)}  θ=${rAngle.toFixed(0)}°`, W - 208, 38 + vectors.length * 18);

    // Dot product
    if (vectors.length === 2) {
      const dot = vectors[0].x * vectors[1].x + vectors[0].y * vectors[1].y;
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`A·B = ${dot.toFixed(0)}`, W - 208, 38 + (vectors.length + 1) * 18);
    }

    // Instructions
    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "left";
    ctx.fillText("Drag arrow tips to reposition vectors", 15, 20);
  }, [vectors, showComponents]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ox = canvas.width * 0.3;
    const oy = canvas.height * 0.55;

    for (let i = 0; i < vectors.length; i++) {
      const tipX = ox + vectors[i].x;
      const tipY = oy + vectors[i].y;
      if (Math.sqrt((mx - tipX) ** 2 + (my - tipY) ** 2) < 15) {
        setDragging(i);
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ox = canvas.width * 0.3;
    const oy = canvas.height * 0.55;

    setVectors((prev) =>
      prev.map((v, i) =>
        i === dragging ? { ...v, x: mx - ox, y: my - oy } : v
      )
    );
  };

  const handleMouseUp = () => setDragging(null);

  const addVector = () => {
    const colors = ["#22c55e", "#f59e0b", "#ec4899", "#06b6d4"];
    const labels = ["C", "D", "E", "F"];
    const idx = vectors.length - 2;
    if (idx >= colors.length) return;
    setVectors((prev) => [
      ...prev,
      { x: 60 + Math.random() * 80, y: -40 - Math.random() * 60, color: colors[idx], label: labels[idx] },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowComponents(!showComponents)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showComponents ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}>
          Components {showComponents ? "ON" : "OFF"}
        </button>
        <button onClick={addVector} disabled={vectors.length >= 6}
          className="px-4 h-10 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors">
          + Add Vector
        </button>
        <button onClick={() => setVectors(vectors.slice(0, Math.max(2, vectors.length - 1)))} disabled={vectors.length <= 2}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors disabled:opacity-40">
          Remove Last
        </button>
        <button onClick={() => setVectors([{ x: 120, y: -80, color: "#ef4444", label: "A" }, { x: 80, y: 60, color: "#3b82f6", label: "B" }])}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
          Reset
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Vector Operations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">R = A + B (component-wise)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">|R| = √(Rx² + Ry²)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">A·B = |A||B|cos(θ)</div>
        </div>
      </div>
    </div>
  );
}
