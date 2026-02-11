"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function ChargedParticleMagnetic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [bField, setBField] = useState(2);
  const [charge, setCharge] = useState(1);
  const [mass, setMass] = useState(1);
  const [speed, setSpeed] = useState(4);
  const [isRunning, setIsRunning] = useState(true);

  const posRef = useRef({ x: 0.2, y: 0.5 });
  const velRef = useRef({ vx: 0, vy: -1 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  const init = useCallback(() => {
    posRef.current = { x: 0.3, y: 0.7 };
    velRef.current = { vx: speed * 0.01, vy: -speed * 0.005 };
    trailRef.current = [];
  }, [speed]);

  useEffect(() => { init(); }, [init]);

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

    // B field indicators (dots = out of screen, crosses = into screen)
    const spacing = 40;
    const isOut = bField > 0;
    ctx.fillStyle = "rgba(100,150,255,0.15)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let x = spacing; x < W; x += spacing) {
      for (let y = spacing; y < H; y += spacing) {
        if (isOut) {
          // Dot (coming out)
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Cross (going in)
          ctx.strokeStyle = "rgba(100,150,255,0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4);
          ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x + 4, y - 4);
          ctx.lineTo(x - 4, y + 4);
          ctx.stroke();
        }
      }
    }

    // B field label
    ctx.fillStyle = "rgba(100,150,255,0.3)";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`B = ${Math.abs(bField).toFixed(1)} T (${isOut ? "out of page ⊙" : "into page ⊗"})`, W - 15, 15);

    // Trail
    const trail = trailRef.current;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.5;
        const hue = charge > 0 ? "239,68,68" : "59,130,246";
        ctx.strokeStyle = `rgba(${hue},${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
        ctx.lineTo(trail[i].x * W, trail[i].y * H);
        ctx.stroke();
      }
    }

    // Particle
    const px = posRef.current.x * W;
    const py = posRef.current.y * H;

    // Glow
    const glowColor = charge > 0 ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)";
    const glow = ctx.createRadialGradient(px, py, 0, px, py, 30);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, 30, 0, Math.PI * 2);
    ctx.fill();

    // Particle body
    ctx.fillStyle = charge > 0 ? "#ef4444" : "#3b82f6";
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = charge > 0 ? "#fca5a5" : "#93c5fd";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Charge symbol
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(charge > 0 ? "+" : "−", px, py + 1);

    // Velocity vector
    const vx = velRef.current.vx;
    const vy = velRef.current.vy;
    const vMag = Math.sqrt(vx * vx + vy * vy);
    if (vMag > 0.001) {
      const vScale = 2000;
      const tipX = px + vx * vScale;
      const tipY = py + vy * vScale;

      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Arrow
      const nvx = vx / vMag;
      const nvy = vy / vMag;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - nvx * 8 - nvy * 4, tipY - nvy * 8 + nvx * 4);
      ctx.lineTo(tipX - nvx * 8 + nvy * 4, tipY - nvy * 8 - nvx * 4);
      ctx.closePath();
      ctx.fill();

      ctx.font = "11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "left";
      ctx.fillText("v", tipX + 8, tipY);
    }

    // Magnetic force vector (F = qv × B)
    // For B out of page (z-direction): F = q(v × B) = q(vy·B, -vx·B, 0)
    const Fx = charge * vy * bField;
    const Fy = -charge * vx * bField;
    const FMag = Math.sqrt(Fx * Fx + Fy * Fy);
    if (FMag > 0.001) {
      const fScale = 500;
      const ftipX = px + Fx * fScale;
      const ftipY = py + Fy * fScale;

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ftipX, ftipY);
      ctx.stroke();

      const nfx = Fx / FMag;
      const nfy = Fy / FMag;
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(ftipX, ftipY);
      ctx.lineTo(ftipX - nfx * 8 - nfy * 4, ftipY - nfy * 8 + nfx * 4);
      ctx.lineTo(ftipX - nfx * 8 + nfy * 4, ftipY - nfy * 8 - nfx * 4);
      ctx.closePath();
      ctx.fill();

      ctx.font = "11px system-ui";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText("F", ftipX + 8, ftipY);
    }

    // Info panel
    const radius = (mass * vMag * 100) / (Math.abs(charge) * Math.abs(bField));
    const period = (2 * Math.PI * mass) / (Math.abs(charge) * Math.abs(bField));

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, H - 100, 200, 88, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CYCLOTRON MOTION", 22, H - 90);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`r = mv/qB = ${radius.toFixed(1)}`, 22, H - 72);
    ctx.fillText(`T = 2πm/qB = ${period.toFixed(2)}`, 22, H - 56);
    ctx.fillText(`|v| = ${(vMag * 100).toFixed(1)} m/s`, 22, H - 40);
    ctx.fillText(`q = ${charge > 0 ? "+" : ""}${charge} C, m = ${mass} kg`, 22, H - 24);

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 130, 45, 6);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#22c55e";
    ctx.fillText("— velocity", 22, 28);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("— magnetic force", 22, 46);
  }, [bField, charge, mass]);

  const animate = useCallback(() => {
    const dt = 0.0015;
    const pos = posRef.current;
    const vel = velRef.current;

    // F = qv × B (B in z-direction)
    const Fx = charge * vel.vy * bField;
    const Fy = -charge * vel.vx * bField;

    const ax = Fx / mass;
    const ay = Fy / mass;

    vel.vx += ax * dt;
    vel.vy += ay * dt;
    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;

    // Wrap around
    if (pos.x < 0) pos.x += 1;
    if (pos.x > 1) pos.x -= 1;
    if (pos.y < 0) pos.y += 1;
    if (pos.y > 1) pos.y -= 1;

    trailRef.current.push({ x: pos.x, y: pos.y });
    if (trailRef.current.length > 400) trailRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [bField, charge, mass, draw]);

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
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    init();
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">B Field</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={-5} max={5} step={0.1} value={bField}
              onChange={(e) => { setBField(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{bField.toFixed(1)} T</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Charge</label>
          <div className="flex gap-2 mt-1.5">
            <button onClick={() => { setCharge(1); reset(); }}
              className={`flex-1 h-8 rounded text-xs font-medium ${charge > 0 ? "bg-red-500 text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}>+1</button>
            <button onClick={() => { setCharge(-1); reset(); }}
              className={`flex-1 h-8 rounded text-xs font-medium ${charge < 0 ? "bg-blue-500 text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}>−1</button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0.5} max={5} step={0.5} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); reset(); }}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{mass}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} step={0.5} value={speed}
              onChange={(e) => { setSpeed(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{speed}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-8 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Lorentz Force</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">F = qv × B</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">r = mv / |q|B</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T = 2πm / |q|B</div>
        </div>
      </div>
    </div>
  );
}
