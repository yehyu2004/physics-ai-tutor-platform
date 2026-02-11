"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function TorqueRotation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [appliedForce, setAppliedForce] = useState(20);
  const [radius, setRadius] = useState(100);
  const [momentOfInertia, setMomentOfInertia] = useState(50);
  const [friction, setFriction] = useState(0.5);
  const [isRunning, setIsRunning] = useState(true);

  const angleRef = useRef(0);
  const angVelRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.4;
    const cy = H * 0.5;
    const R = Math.min(radius, Math.min(W * 0.3, H * 0.38));

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const theta = angleRef.current;

    // Disc
    const discGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    discGrad.addColorStop(0, "#334155");
    discGrad.addColorStop(0.8, "#1e293b");
    discGrad.addColorStop(1, "#475569");
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spokes
    for (let i = 0; i < 6; i++) {
      const angle = theta + (i / 6) * Math.PI * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.stroke();
    }

    // Reference mark on rim
    const markAngle = theta;
    const markX = cx + Math.cos(markAngle) * R;
    const markY = cy + Math.sin(markAngle) * R;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(markX, markY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Center axle
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Applied force arrow (tangent at top of disc)
    const forcePointAngle = theta - Math.PI / 2;
    const fpx = cx + Math.cos(forcePointAngle) * R;
    const fpy = cy + Math.sin(forcePointAngle) * R;
    const fScale = appliedForce * 1.5;

    // Force direction (tangent = perpendicular to radius)
    const ftx = -Math.sin(forcePointAngle);
    const fty = Math.cos(forcePointAngle);

    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fpx, fpy);
    ctx.lineTo(fpx + ftx * fScale, fpy + fty * fScale);
    ctx.stroke();
    // Arrow
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(fpx + ftx * fScale, fpy + fty * fScale);
    ctx.lineTo(fpx + ftx * (fScale - 10) - fty * 5, fpy + fty * (fScale - 10) + ftx * 5);
    ctx.lineTo(fpx + ftx * (fScale - 10) + fty * 5, fpy + fty * (fScale - 10) - ftx * 5);
    ctx.closePath();
    ctx.fill();
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("F", fpx + ftx * fScale + 8, fpy + fty * fScale);

    // Radius arrow
    ctx.strokeStyle = "rgba(251,191,36,0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(fpx, fpy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    const rmx = (cx + fpx) / 2;
    const rmy = (cy + fpy) / 2;
    ctx.fillText("r", rmx + Math.sin(forcePointAngle) * 15, rmy - Math.cos(forcePointAngle) * 15);

    // Angular velocity arc arrow
    if (Math.abs(angVelRef.current) > 0.01) {
      const arcR = R + 20;
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      const arcLen = Math.min(Math.abs(angVelRef.current) * 0.5, 1.5);
      const startA = theta - arcLen;
      const endA = theta;
      if (angVelRef.current > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, startA, endA);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, endA, startA, true);
        ctx.stroke();
      }
      ctx.fillStyle = "#a855f7";
      ctx.font = "11px system-ui";
      ctx.fillText(`ω = ${angVelRef.current.toFixed(2)} rad/s`, cx + arcR + 5, cy - arcR + 30);
    }

    // Info panel
    const torque = appliedForce * (R / 100);
    const alpha = torque / momentOfInertia;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 210, 12, 198, 105, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ROTATION DATA", W - 198, 28);
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`τ = F×r = ${torque.toFixed(1)} N·m`, W - 198, 48);
    ctx.fillText(`I = ${momentOfInertia} kg·m²`, W - 198, 64);
    ctx.fillText(`α = τ/I = ${alpha.toFixed(3)} rad/s²`, W - 198, 80);
    ctx.fillText(`ω = ${angVelRef.current.toFixed(2)} rad/s`, W - 198, 96);
    ctx.fillText(`θ = ${((angleRef.current * 180 / Math.PI) % 360).toFixed(0)}°`, W - 198, 112);
  }, [appliedForce, radius, momentOfInertia, friction]);

  const animate = useCallback(() => {
    const dt = 0.02;
    const R_m = radius / 100;
    const torque = appliedForce * R_m;
    const frictionTorque = friction * angVelRef.current;
    const alpha = (torque - frictionTorque) / momentOfInertia;

    angVelRef.current += alpha * dt;
    angleRef.current += angVelRef.current * dt;

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [appliedForce, radius, momentOfInertia, friction, draw]);

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
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    angleRef.current = 0;
    angVelRef.current = 0;
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Force (N)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={50} value={appliedForce}
              onChange={(e) => { setAppliedForce(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{appliedForce}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Radius</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={40} max={180} value={radius}
              onChange={(e) => { setRadius(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{(radius/100).toFixed(1)}m</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Inertia (I)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={10} max={200} value={momentOfInertia}
              onChange={(e) => { setMomentOfInertia(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{momentOfInertia}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Friction</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={5} step={0.1} value={friction}
              onChange={(e) => setFriction(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{friction.toFixed(1)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Rotational Dynamics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">τ = r × F = Iα</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">I = ½mr² (disc)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ω = ω₀ + αt</div>
        </div>
      </div>
    </div>
  );
}
