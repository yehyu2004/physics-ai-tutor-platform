"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function PendulumSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [length, setLength] = useState(200);
  const [gravity, setGravity] = useState(9.8);
  const [initAngle, setInitAngle] = useState(30);
  const [isRunning, setIsRunning] = useState(true);

  const angleRef = useRef((initAngle * Math.PI) / 180);
  const angVelRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

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

    const pivotX = W * 0.5;
    const pivotY = H * 0.15;
    const scale = Math.min(1, (H * 0.7) / length);
    const L = length * scale;

    const theta = angleRef.current;
    const bobX = pivotX + L * Math.sin(theta);
    const bobY = pivotY + L * Math.cos(theta);

    // Trail
    const trail = trailRef.current;
    if (trail.length > 1) {
      ctx.strokeStyle = "rgba(168, 85, 247, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // Equilibrium line (dashed)
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + L + 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arc showing angle
    if (Math.abs(theta) > 0.02) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const arcR = 40;
      const startAngle = Math.PI / 2 - Math.abs(theta);
      const endAngle = Math.PI / 2;
      if (theta > 0) {
        ctx.arc(pivotX, pivotY, arcR, startAngle, endAngle);
      } else {
        ctx.arc(pivotX, pivotY, arcR, endAngle, endAngle + Math.abs(theta));
      }
      ctx.stroke();

      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      const labelAngle = Math.PI / 2 - theta / 2;
      ctx.fillText(
        `${((theta * 180) / Math.PI).toFixed(1)}°`,
        pivotX + 55 * Math.cos(labelAngle) * (theta > 0 ? 1 : 1),
        pivotY + 55 * Math.sin(labelAngle)
      );
    }

    // String
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // Pivot
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#475569";
    ctx.fillRect(pivotX - 30, pivotY - 8, 60, 8);

    // Bob glow
    const glow = ctx.createRadialGradient(bobX, bobY, 0, bobX, bobY, 35);
    glow.addColorStop(0, "rgba(59, 130, 246, 0.4)");
    glow.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bobX, bobY, 35, 0, Math.PI * 2);
    ctx.fill();

    // Bob
    const bobGrad = ctx.createRadialGradient(bobX - 4, bobY - 4, 0, bobX, bobY, 18);
    bobGrad.addColorStop(0, "#60a5fa");
    bobGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = bobGrad;
    ctx.beginPath();
    ctx.arc(bobX, bobY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Force vectors
    // Gravity
    const gForce = 40;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bobX, bobY);
    ctx.lineTo(bobX, bobY + gForce);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(bobX, bobY + gForce);
    ctx.lineTo(bobX - 5, bobY + gForce - 8);
    ctx.lineTo(bobX + 5, bobY + gForce - 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.fillText("mg", bobX + 10, bobY + gForce);

    // Tension
    const tLen = 35;
    const tx = pivotX - bobX;
    const ty = pivotY - bobY;
    const tMag = Math.sqrt(tx * tx + ty * ty);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bobX, bobY);
    ctx.lineTo(bobX + (tx / tMag) * tLen, bobY + (ty / tMag) * tLen);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    const tipX = bobX + (tx / tMag) * tLen;
    const tipY = bobY + (ty / tMag) * tLen;
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - (tx / tMag) * 8 - (ty / tMag) * 5, tipY - (ty / tMag) * 8 + (tx / tMag) * 5);
    ctx.lineTo(tipX - (tx / tMag) * 8 + (ty / tMag) * 5, tipY - (ty / tMag) * 8 - (tx / tMag) * 5);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.fillText("T", tipX + 10, tipY);

    // Info box
    const omega = Math.sqrt(gravity / (length / 100));
    const period = (2 * Math.PI) / omega;
    const KE = 0.5 * angVelRef.current * angVelRef.current * L * L;
    const PE = gravity * L * (1 - Math.cos(theta));
    const maxE = Math.max(KE + PE, 1);

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 210, 15, 195, 105, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("PENDULUM DATA", W - 198, 33);

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Period:  ${period.toFixed(2)} s`, W - 198, 53);
    ctx.fillText(`θ:       ${((theta * 180) / Math.PI).toFixed(1)}°`, W - 198, 70);
    ctx.fillText(`ω:       ${angVelRef.current.toFixed(2)} rad/s`, W - 198, 87);
    ctx.fillText(`Length:  ${(length / 100).toFixed(1)} m`, W - 198, 104);

    // Energy bars at bottom
    const barY = H - 50;
    const barW = W * 0.5;
    const barX = (W - barW) / 2;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(barX - 10, barY - 25, barW + 20, 55, 8);
    ctx.fill();

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("KE", barX, barY - 8);

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(barX, barY, (KE / maxE) * barW, 8, 3);
    ctx.fill();

    ctx.fillStyle = "#94a3b8";
    ctx.fillText("PE", barX, barY + 15);

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(barX, barY + 18, (PE / maxE) * barW, 8, 3);
    ctx.fill();
  }, [length, gravity]);

  const animate = useCallback(() => {
    const dt = 0.025;
    const g = gravity;
    const L = length / 100; // meters
    const alpha = -(g / L) * Math.sin(angleRef.current);
    angVelRef.current += alpha * dt;
    angVelRef.current *= 0.999; // tiny damping
    angleRef.current += angVelRef.current * dt;

    const canvas = canvasRef.current;
    if (canvas) {
      const W = canvas.width;
      const H = canvas.height;
      const pivotX = W * 0.5;
      const pivotY = H * 0.15;
      const scale = Math.min(1, (H * 0.7) / length);
      const L2 = length * scale;
      const bobX = pivotX + L2 * Math.sin(angleRef.current);
      const bobY = pivotY + L2 * Math.cos(angleRef.current);
      trailRef.current.push({ x: bobX, y: bobY });
      if (trailRef.current.length > 200) trailRef.current.shift();
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [length, gravity, draw]);

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
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    angleRef.current = (initAngle * Math.PI) / 180;
    angVelRef.current = 0;
    trailRef.current = [];
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Length</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={50} max={350} value={length}
              onChange={(e) => { setLength(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{(length/100).toFixed(1)} m</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gravity</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={25} step={0.1} value={gravity}
              onChange={(e) => { setGravity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">{gravity.toFixed(1)} m/s²</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial Angle</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={5} max={170} value={initAngle}
              onChange={(e) => { setInitAngle(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{initAngle}&deg;</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T = 2π√(L/g)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">α = -(g/L) sin(θ)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E = mgh = mgL(1-cosθ)</div>
        </div>
      </div>
    </div>
  );
}
