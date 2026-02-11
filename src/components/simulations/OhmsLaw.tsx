"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function OhmsLaw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [voltage, setVoltage] = useState(12); // Volts
  const [resistance, setResistance] = useState(100); // Ohms

  const timeRef = useRef(0);

  const current = voltage / resistance; // Amps
  const power = voltage * current; // Watts

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

    // --- Left: Circuit diagram ---
    const circW = W * 0.5;
    const cx = circW * 0.5;
    const cy = H * 0.5;
    const size = Math.min(circW * 0.32, H * 0.32);

    // Circuit wires
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2.5;

    // Top wire
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.stroke();

    // Right wire
    ctx.beginPath();
    ctx.moveTo(cx + size, cy - size);
    ctx.lineTo(cx + size, cy + size);
    ctx.stroke();

    // Bottom wire
    ctx.beginPath();
    ctx.moveTo(cx + size, cy + size);
    ctx.lineTo(cx - size, cy + size);
    ctx.stroke();

    // Left wire
    ctx.beginPath();
    ctx.moveTo(cx - size, cy + size);
    ctx.lineTo(cx - size, cy - size);
    ctx.stroke();

    // Battery (left side)
    const batY = cy;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(cx - size - 10, batY - 12);
    ctx.lineTo(cx - size + 10, batY - 12);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - size - 15, batY + 2);
    ctx.lineTo(cx - size + 15, batY + 2);
    ctx.stroke();

    // + and -
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("+", cx - size - 25, batY - 8);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("-", cx - size - 25, batY + 8);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillText(`${voltage}V`, cx - size + 30, batY);

    // Resistor (top side - zigzag)
    const rStart = cx - size * 0.4;
    const rEnd = cx + size * 0.4;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rStart, cy - size);
    const segments = 6;
    const segW = (rEnd - rStart) / segments;
    for (let i = 0; i < segments; i++) {
      ctx.lineTo(rStart + segW * (i + 0.25), cy - size - 10);
      ctx.lineTo(rStart + segW * (i + 0.75), cy - size + 10);
    }
    ctx.lineTo(rEnd, cy - size);
    ctx.stroke();

    // Resistor label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`R = ${resistance} ohm`, cx, cy - size - 18);

    // Resistor glow (heat based on power)
    const heatGlow = Math.min(power / 5, 1);
    if (heatGlow > 0.05) {
      const rGlow = ctx.createRadialGradient(cx, cy - size, 0, cx, cy - size, 40);
      rGlow.addColorStop(0, `rgba(239,68,68,${heatGlow * 0.3})`);
      rGlow.addColorStop(1, "transparent");
      ctx.fillStyle = rGlow;
      ctx.beginPath();
      ctx.arc(cx, cy - size, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // Current flow arrows (animated)
    if (current > 0.001) {
      const arrowColor = `rgba(34,197,94,${0.4 + Math.sin(t * 3) * 0.2})`;
      ctx.fillStyle = arrowColor;
      const speed = current * 150 + 50;
      const offset = (t * speed) % 40;

      // Top wire arrows (left to right)
      for (let ax = cx - size + offset + 20; ax < cx + size - 10; ax += 40) {
        if (ax < rStart || ax > rEnd) {
          ctx.beginPath();
          ctx.moveTo(ax + 5, cy - size);
          ctx.lineTo(ax - 3, cy - size - 5);
          ctx.lineTo(ax - 3, cy - size + 5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Right wire arrows (top to bottom)
      for (let ay = cy - size + offset; ay < cy + size; ay += 40) {
        ctx.beginPath();
        ctx.moveTo(cx + size, ay + 5);
        ctx.lineTo(cx + size - 5, ay - 3);
        ctx.lineTo(cx + size + 5, ay - 3);
        ctx.closePath();
        ctx.fill();
      }

      // Bottom wire arrows (right to left)
      for (let ax = cx + size - offset - 20; ax > cx - size + 10; ax -= 40) {
        ctx.beginPath();
        ctx.moveTo(ax - 5, cy + size);
        ctx.lineTo(ax + 3, cy + size - 5);
        ctx.lineTo(ax + 3, cy + size + 5);
        ctx.closePath();
        ctx.fill();
      }

      // Left wire arrows (bottom to top)
      for (let ay = cy + size - offset; ay > cy + 10; ay -= 40) {
        ctx.beginPath();
        ctx.moveTo(cx - size, ay - 5);
        ctx.lineTo(cx - size - 5, ay + 3);
        ctx.lineTo(cx - size + 5, ay + 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Current label on right wire
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`I = ${(current * 1000).toFixed(1)} mA`, cx + size + 45, cy);

    // --- Right: IV Graph and data ---
    const graphX = circW + 30;
    const graphW2 = W - graphX - 25;
    const graphTop = 30;
    const graphH2 = H * 0.55;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphTop - 10, graphW2 + 20, graphH2 + 25, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("V-I CHARACTERISTIC (Ohmic)", graphX, graphTop + 8);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphTop + 20);
    ctx.lineTo(graphX, graphTop + graphH2);
    ctx.lineTo(graphX + graphW2, graphTop + graphH2);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("V (Volts)", graphX + graphW2 / 2, graphTop + graphH2 + 15);
    ctx.save();
    ctx.translate(graphX - 12, graphTop + graphH2 / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("I (mA)", 0, 0);
    ctx.restore();

    // Line: I = V/R
    const maxVGraph = 20;
    const maxIGraph = maxVGraph / resistance * 1000; // mA
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(59,130,246,0.4)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const plotH = graphH2 - 25;
    for (let v = 0; v <= maxVGraph; v += 0.5) {
      const i = v / resistance * 1000;
      const px = graphX + (v / maxVGraph) * graphW2;
      const py = graphTop + graphH2 - (i / maxIGraph) * plotH;
      if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current operating point
    const opX = graphX + (voltage / maxVGraph) * graphW2;
    const opY = graphTop + graphH2 - ((current * 1000) / maxIGraph) * plotH;
    const opGlow = ctx.createRadialGradient(opX, opY, 0, opX, opY, 12);
    opGlow.addColorStop(0, "rgba(251,191,36,0.5)");
    opGlow.addColorStop(1, "transparent");
    ctx.fillStyle = opGlow;
    ctx.beginPath();
    ctx.arc(opX, opY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(opX, opY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Dashed lines to axes from operating point
    ctx.strokeStyle = "rgba(251,191,36,0.3)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(opX, opY);
    ctx.lineTo(opX, graphTop + graphH2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(opX, opY);
    ctx.lineTo(graphX, opY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Slope label
    ctx.fillStyle = "#3b82f6";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`slope = 1/R = ${(1 / resistance * 1000).toFixed(2)} mA/V`, graphX + 10, graphTop + 28);

    // --- Data panel ---
    const dataY = graphTop + graphH2 + 35;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, dataY, graphW2 + 20, H - dataY - 15, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CIRCUIT DATA", graphX, dataY + 18);

    let dy = dataY + 38;
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`V = ${voltage} V`, graphX, dy);
    ctx.fillStyle = "#22c55e";
    ctx.fillText(`I = ${(current * 1000).toFixed(1)} mA`, graphX + graphW2 / 2, dy);
    dy += 22;
    ctx.fillStyle = "#ef4444";
    ctx.fillText(`P = ${(power * 1000).toFixed(1)} mW`, graphX, dy);
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`R = ${resistance} ohm`, graphX + graphW2 / 2, dy);
  }, [voltage, resistance, current, power]);

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
      canvas.height = Math.min(container.clientWidth * 0.5, 440);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Voltage (V)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={20} step={0.5} value={voltage}
              onChange={(e) => setVoltage(Number(e.target.value))}
              className="flex-1 accent-yellow-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{voltage} V</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resistance (ohm)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={1000} step={10} value={resistance}
              onChange={(e) => setResistance(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{resistance}</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">V = IR</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">P = IV</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">P = I^2 R</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">P = V^2 / R</div>
        </div>
      </div>
    </div>
  );
}
