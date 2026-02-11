"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function InclinedPlane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [angle, setAngle] = useState(30);
  const [mass, setMass] = useState(5);
  const [friction, setFriction] = useState(0.3);
  const [showComponents, setShowComponents] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const animRef = useRef<number>(0);
  const posRef = useRef(0);
  const velRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const pxPerMeter = 50;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const g = 9.8;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const rad = (angle * Math.PI) / 180;
    const margin = 60;

    // Ramp geometry
    const rampBaseX = margin;
    const rampBaseY = H - margin;
    const rampLen = Math.min(W * 0.65, H * 0.75 / Math.sin(rad));
    const rampTopX = rampBaseX + rampLen * Math.cos(rad);
    const rampTopY = rampBaseY - rampLen * Math.sin(rad);

    // Ground
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, rampBaseY, W, H - rampBaseY);

    // Ramp surface
    const rampGrad = ctx.createLinearGradient(rampBaseX, rampBaseY, rampTopX, rampTopY);
    rampGrad.addColorStop(0, "#334155");
    rampGrad.addColorStop(1, "#475569");
    ctx.fillStyle = rampGrad;
    ctx.beginPath();
    ctx.moveTo(rampBaseX, rampBaseY);
    ctx.lineTo(rampTopX, rampTopY);
    ctx.lineTo(rampBaseX, rampTopY);
    ctx.lineTo(rampBaseX, rampBaseY);
    ctx.closePath();
    // Actually draw as triangle base
    ctx.beginPath();
    ctx.moveTo(rampBaseX, rampBaseY);
    ctx.lineTo(rampTopX, rampTopY);
    ctx.lineTo(rampTopX, rampBaseY);
    ctx.closePath();
    ctx.fill();

    // Ramp surface line
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rampBaseX, rampBaseY);
    ctx.lineTo(rampTopX, rampTopY);
    ctx.stroke();

    // Angle arc
    ctx.strokeStyle = "rgba(251,191,36,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rampTopX, rampBaseY, 35, Math.PI, Math.PI + rad, false);
    ctx.stroke();
    ctx.font = "13px ui-monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.fillText(`${angle}°`, rampTopX - 48, rampBaseY - 10);

    // Block position on ramp
    const usableRampPx = Math.max(rampLen - 80, 10);
    const blockPosPx = Math.min(Math.max(posRef.current * pxPerMeter, 0), usableRampPx);
    const downUx = Math.cos(rad);
    const downUy = Math.sin(rad);
    const startOffsetPx = 30;
    const bx = rampTopX - downUx * startOffsetPx + downUx * blockPosPx;
    const by = rampTopY + downUy * startOffsetPx + downUy * blockPosPx;

    // Block (rotated)
    const blockSize = 36;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-rad);
    ctx.translate(0, -blockSize / 2);

    // Block shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(-blockSize / 2 + 3, 3, blockSize, blockSize, 4);
    ctx.fill();

    // Block
    const blockGrad = ctx.createLinearGradient(-blockSize / 2, 0, blockSize / 2, blockSize);
    blockGrad.addColorStop(0, "#3b82f6");
    blockGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = blockGrad;
    ctx.beginPath();
    ctx.roundRect(-blockSize / 2, 0, blockSize, blockSize, 4);
    ctx.fill();

    // Mass label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${mass}kg`, 0, blockSize / 2);

    ctx.restore();

    // Force vectors
    if (showComponents) {
      const forceScale = 2;
      const mg = mass * g * forceScale;
      const mgSin = mg * Math.sin(rad);
      const mgCos = mg * Math.cos(rad);
      const fFriction = friction * mass * g * Math.cos(rad) * forceScale;
      const normal = mgCos;

      // Weight (mg) - straight down
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by + mg);
      ctx.stroke();
      drawArrow(ctx, bx, by + mg, 0, 1, "#ef4444");
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("mg", bx + 8, by + mg - 5);

      if (showComponents) {
        // mg sin(θ) - along ramp downward
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + mgSin * Math.cos(rad), by + mgSin * Math.sin(rad));
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(ctx, bx + mgSin * Math.cos(rad), by + mgSin * Math.sin(rad), Math.cos(rad), Math.sin(rad), "#f97316");
        ctx.fillStyle = "#f97316";
        ctx.fillText("mg sinθ", bx + mgSin * Math.cos(rad) + 5, by + mgSin * Math.sin(rad));

        // mg cos(θ) - perpendicular to ramp into surface
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        // Perpendicular component into the ramp
        const perpX = Math.sin(rad);
        const perpY = Math.cos(rad);
        ctx.lineTo(bx + perpX * mgCos, by + perpY * mgCos);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#a855f7";
        ctx.textAlign = "left";
        ctx.fillText("mg cosθ", bx + perpX * mgCos + 6, by + perpY * mgCos);

        // Normal force - perpendicular to ramp away from surface
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - perpX * normal, by - perpY * normal);
        ctx.stroke();
        drawArrow(ctx, bx - perpX * normal, by - perpY * normal, -perpX, -perpY, "#22c55e");
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "right";
        ctx.fillText("N", bx - perpX * normal - 5, by - perpY * normal - 5);

        // Friction force - along ramp upward (opposing motion)
        if (friction > 0) {
          ctx.strokeStyle = "#eab308";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - fFriction * Math.cos(rad), by - fFriction * Math.sin(rad));
          ctx.stroke();
          drawArrow(ctx, bx - fFriction * Math.cos(rad), by - fFriction * Math.sin(rad), -Math.cos(rad), -Math.sin(rad), "#eab308");
          ctx.fillStyle = "#eab308";
          ctx.textAlign = "left";
          ctx.fillText("f", bx - fFriction * Math.cos(rad) - 15, by - fFriction * Math.sin(rad) - 10);
        }
      }
    }

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 200, 12, 188, friction > 0 ? 105 : 85, 8);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const legendItems = [
      { color: "#ef4444", label: "Weight (mg)" },
      { color: "#22c55e", label: "Normal force (N)" },
      { color: "#f97316", label: "mg sin(θ)" },
    ];
    if (friction > 0) legendItems.push({ color: "#eab308", label: `Friction (μ=${friction})` });

    legendItems.forEach((item, i) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(W - 188, 22 + i * 20, 12, 3);
      ctx.fillText(item.label, W - 170, 17 + i * 20);
    });

    // Net acceleration info
    const netAccel = g * (Math.sin(rad) - friction * Math.cos(rad));
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 200, 55, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("NET ACCELERATION", 22, 20);
    ctx.font = "14px ui-monospace";
    ctx.fillStyle = netAccel > 0 ? "#22c55e" : netAccel < 0 ? "#ef4444" : "#fbbf24";
    ctx.fillText(`a = ${netAccel.toFixed(2)} m/s²`, 22, 40);
    ctx.font = "10px system-ui";
    ctx.fillStyle = "#64748b";
    ctx.fillText(netAccel > 0.01 ? "Block slides down" : netAccel < -0.01 ? "Block stays (friction wins)" : "In equilibrium", 22, 55);
  }, [angle, mass, friction, showComponents]);

  function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * 8 - dy * 4, y - dy * 8 + dx * 4);
    ctx.lineTo(x - dx * 8 + dy * 4, y - dy * 8 - dx * 4);
    ctx.closePath();
    ctx.fill();
  }

  const animate = useCallback(() => {
    const g = 9.8;
    const rad = (angle * Math.PI) / 180;
    const driveAccel = g * (Math.sin(rad) - friction * Math.cos(rad));
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    if (driveAccel > 0) {
      velRef.current += driveAccel * dt;
      posRef.current += velRef.current * dt;
    } else {
      velRef.current = 0;
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [angle, friction, draw]);

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

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      draw();
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate, draw]);

  const reset = () => {
    posRef.current = 0;
    velRef.current = 0;
    lastTsRef.current = null;
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ramp Angle</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={5} max={75} value={angle}
              onChange={(e) => { setAngle(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{angle}&deg;</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={20} value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{mass} kg</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Friction (μ)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={1} step={0.05} value={friction}
              onChange={(e) => { setFriction(Number(e.target.value)); reset(); }}
              className="flex-1 accent-yellow-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{friction.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setShowComponents(!showComponents)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showComponents ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Forces
          </button>
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
              reset();
            }
            setIsRunning(!isRunning);
          }}
            className="h-10 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
            {isRunning ? "Stop" : "Slide"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">a = g(sinθ − μcosθ)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">N = mg cosθ</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">f = μN = μmg cosθ</div>
        </div>
      </div>
    </div>
  );
}
