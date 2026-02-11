"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Ball {
  x: number;
  vx: number;
  mass: number;
  color: string;
  glow: string;
}

export default function Collisions() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [mass1, setMass1] = useState(3);
  const [mass2, setMass2] = useState(3);
  const [v1, setV1] = useState(4);
  const [v2, setV2] = useState(-2);
  const [elasticity, setElasticity] = useState(1); // 1 = elastic, 0 = perfectly inelastic
  const [isRunning, setIsRunning] = useState(false);
  const [hasCollided, setHasCollided] = useState(false);
  const ballsRef = useRef<Ball[]>([]);
  const trailsRef = useRef<{ x1: number; x2: number }[]>([]);

  const initBalls = useCallback(() => {
    ballsRef.current = [
      { x: 0.25, vx: v1 * 0.02, mass: mass1, color: "#ef4444", glow: "rgba(239,68,68,0.3)" },
      { x: 0.75, vx: v2 * 0.02, mass: mass2, color: "#3b82f6", glow: "rgba(59,130,246,0.3)" },
    ];
    trailsRef.current = [];
    setHasCollided(false);
  }, [mass1, mass2, v1, v2]);

  useEffect(() => { initBalls(); }, [initBalls]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const balls = ballsRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const trackY = H * 0.4;
    const margin = 50;

    // Track
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(margin, trackY + 20, W - margin * 2, 6);

    // Draw balls
    balls.forEach((ball, idx) => {
      const bx = margin + ball.x * (W - margin * 2);
      const radius = 14 + ball.mass * 2;

      // Glow
      const glow = ctx.createRadialGradient(bx, trackY, 0, bx, trackY, radius * 2);
      glow.addColorStop(0, ball.glow);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bx, trackY, radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      const grad = ctx.createRadialGradient(bx - 3, trackY - 3, 0, bx, trackY, radius);
      grad.addColorStop(0, idx === 0 ? "#fca5a5" : "#93c5fd");
      grad.addColorStop(1, ball.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, trackY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Mass label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${ball.mass}kg`, bx, trackY + 1);

      // Velocity arrow
      const velScale = 800;
      const arrLen = ball.vx * velScale;
      if (Math.abs(arrLen) > 3) {
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, trackY - radius - 12);
        ctx.lineTo(bx + arrLen, trackY - radius - 12);
        ctx.stroke();

        const dir = arrLen > 0 ? 1 : -1;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(bx + arrLen, trackY - radius - 12);
        ctx.lineTo(bx + arrLen - dir * 6, trackY - radius - 16);
        ctx.lineTo(bx + arrLen - dir * 6, trackY - radius - 8);
        ctx.closePath();
        ctx.fill();

        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${(ball.vx / 0.02).toFixed(1)} m/s`, bx + arrLen / 2, trackY - radius - 18);
      }

      // Label
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = ball.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`Ball ${idx + 1}`, bx, trackY + radius + 8);
    });

    // Momentum and energy display
    const p1 = balls[0].mass * balls[0].vx / 0.02;
    const p2 = balls[1].mass * balls[1].vx / 0.02;
    const totalP = p1 + p2;
    const ke1 = 0.5 * balls[0].mass * (balls[0].vx / 0.02) ** 2;
    const ke2 = 0.5 * balls[1].mass * (balls[1].vx / 0.02) ** 2;
    const totalKE = ke1 + ke2;

    const infoY = H * 0.65;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(margin, infoY, W - margin * 2, H - infoY - 15, 8);
    ctx.fill();

    // Momentum bars
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("MOMENTUM", margin + 15, infoY + 10);

    const barX = margin + 15;
    const barW = (W - margin * 2 - 30) * 0.4;
    const barMidX = barX + barW / 2;
    const mBarY = infoY + 28;
    const maxP = Math.max(Math.abs(p1), Math.abs(p2), Math.abs(totalP), 10);

    // p1
    ctx.fillStyle = "#ef4444";
    const p1W = (p1 / maxP) * (barW / 2);
    ctx.beginPath();
    ctx.roundRect(barMidX, mBarY, p1W, 10, 2);
    ctx.fill();
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#fca5a5";
    ctx.textAlign = "left";
    ctx.fillText(`p₁ = ${p1.toFixed(1)}`, barX, mBarY + 1);

    // p2
    ctx.fillStyle = "#3b82f6";
    const p2W = (p2 / maxP) * (barW / 2);
    ctx.beginPath();
    ctx.roundRect(barMidX, mBarY + 16, p2W, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`p₂ = ${p2.toFixed(1)}`, barX, mBarY + 17);

    // total
    ctx.fillStyle = "#a855f7";
    const tpW = (totalP / maxP) * (barW / 2);
    ctx.beginPath();
    ctx.roundRect(barMidX, mBarY + 32, tpW, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#d8b4fe";
    ctx.fillText(`Σp = ${totalP.toFixed(1)}`, barX, mBarY + 33);

    // Center line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barMidX, mBarY - 2);
    ctx.lineTo(barMidX, mBarY + 44);
    ctx.stroke();

    // Energy section
    const eX = margin + 15 + (W - margin * 2 - 30) * 0.5;
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("KINETIC ENERGY", eX, infoY + 10);

    const eBarX = eX;
    const eBarW = (W - margin * 2 - 30) * 0.4;
    const eBarY = infoY + 28;
    const maxKE = Math.max(totalKE, 10);

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(eBarX, eBarY, (ke1 / maxKE) * eBarW, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`KE₁ = ${ke1.toFixed(1)}`, eBarX + eBarW + 8, eBarY + 1);

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(eBarX, eBarY + 16, (ke2 / maxKE) * eBarW, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`KE₂ = ${ke2.toFixed(1)}`, eBarX + eBarW + 8, eBarY + 17);

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.roundRect(eBarX, eBarY + 32, (totalKE / maxKE) * eBarW, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#fcd34d";
    ctx.fillText(`ΣKE = ${totalKE.toFixed(1)}`, eBarX + eBarW + 8, eBarY + 33);

    // Collision type badge
    if (hasCollided) {
      ctx.fillStyle = "rgba(34,197,94,0.2)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 50, 12, 100, 28, 6);
      ctx.fill();
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("COLLIDED!", W / 2, 26);
    }
  }, [hasCollided]);

  const animate = useCallback(() => {
    const balls = ballsRef.current;
    const b1 = balls[0];
    const b2 = balls[1];

    b1.x += b1.vx;
    b2.x += b2.vx;

    // Collision detection
    const r1 = (14 + b1.mass * 2) / 800;
    const r2 = (14 + b2.mass * 2) / 800;
    const dist = Math.abs(b2.x - b1.x);

    if (dist < (r1 + r2) && b1.vx - b2.vx > 0) {
      // Collision!
      const m1 = b1.mass;
      const m2 = b2.mass;
      const u1 = b1.vx;
      const u2 = b2.vx;
      const e = elasticity;

      // General collision formula with coefficient of restitution
      const v1New = ((m1 - e * m2) * u1 + (1 + e) * m2 * u2) / (m1 + m2);
      const v2New = ((m2 - e * m1) * u2 + (1 + e) * m1 * u1) / (m1 + m2);

      b1.vx = v1New;
      b2.vx = v2New;
      setHasCollided(true);

      // Separate
      const overlap = (r1 + r2) - dist;
      b1.x -= overlap / 2;
      b2.x += overlap / 2;
    }

    // Wall bounces
    if (b1.x < 0.02) { b1.x = 0.02; b1.vx = Math.abs(b1.vx); }
    if (b1.x > 0.98) { b1.x = 0.98; b1.vx = -Math.abs(b1.vx); }
    if (b2.x < 0.02) { b2.x = 0.02; b2.vx = Math.abs(b2.vx); }
    if (b2.x > 0.98) { b2.x = 0.98; b2.vx = -Math.abs(b2.vx); }

    trailsRef.current.push({ x1: b1.x, x2: b2.x });
    if (trailsRef.current.length > 300) trailsRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [elasticity, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 460);
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
    initBalls();
    setIsRunning(false);
    cancelAnimationFrame(animRef.current);
  };

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Mass 1</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} value={mass1}
              onChange={(e) => { setMass1(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{mass1}kg</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Vel 1</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={-8} max={8} step={0.5} value={v1}
              onChange={(e) => { setV1(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{v1}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Mass 2</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} value={mass2}
              onChange={(e) => { setMass2(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{mass2}kg</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Vel 2</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={-8} max={8} step={0.5} value={v2}
              onChange={(e) => { setV2(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{v2}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-purple-500 uppercase tracking-wider">Elasticity</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={1} step={0.1} value={elasticity}
              onChange={(e) => { setElasticity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{elasticity.toFixed(1)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => { if (!isRunning) initBalls(); setIsRunning(!isRunning); }}
            className="flex-1 h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-xs transition-colors">
            {isRunning ? "Pause" : "Go"}
          </button>
          <button onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Conservation Laws</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">m₁v₁ + m₂v₂ = m₁v₁&apos; + m₂v₂&apos;</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">e = |v₂&apos;−v₁&apos;| / |v₁−v₂|</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">e=1: elastic, e=0: inelastic</div>
        </div>
      </div>
    </div>
  );
}
