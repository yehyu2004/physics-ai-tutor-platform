"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Trail {
  x: number;
  y: number;
}

export default function ProjectileMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [angle, setAngle] = useState(45);
  const [speed, setSpeed] = useState(50);
  const [gravity, setGravity] = useState(9.8);
  const [isRunning, setIsRunning] = useState(false);
  const timeRef = useRef(0);
  const trailsRef = useRef<Trail[]>([]);

  const groundY = 0.85; // fraction of canvas height

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const gY = H * groundY;
    const scale = (gY - 40) / ((speed * speed) / (2 * gravity) + 10);
    const originX = 60;

    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, gY);
    skyGrad.addColorStop(0, "#0f172a");
    skyGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, gY);

    // Stars
    const starSeed = 42;
    for (let i = 0; i < 60; i++) {
      const sx = ((starSeed * (i + 1) * 7) % W);
      const sy = ((starSeed * (i + 1) * 13) % (gY * 0.7));
      const sr = (i % 3 === 0) ? 1.5 : 0.8;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.1})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground
    const groundGrad = ctx.createLinearGradient(0, gY, 0, H);
    groundGrad.addColorStop(0, "#166534");
    groundGrad.addColorStop(1, "#14532d");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gY, W, H - gY);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = gY; y > 0; y -= 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Predicted trajectory (dashed)
    const rad = (angle * Math.PI) / 180;
    const vx = speed * Math.cos(rad);
    const vy = speed * Math.sin(rad);
    const totalTime = (2 * vy) / gravity;

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let t = 0; t <= totalTime; t += 0.02) {
      const px = originX + vx * t * scale;
      const py = gY - (vy * t - 0.5 * gravity * t * t) * scale;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Trail with glow
    const currentTrails = trailsRef.current;
    if (currentTrails.length > 1) {
      // Glow
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      currentTrails.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Trail dots
      currentTrails.forEach((p, i) => {
        if (i % 3 === 0) {
          const alpha = 0.3 + 0.7 * (i / currentTrails.length);
          ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Current ball position
    if (isRunning && timeRef.current <= totalTime) {
      const t = timeRef.current;
      const bx = originX + vx * t * scale;
      const by = gY - (vy * t - 0.5 * gravity * t * t) * scale;

      // Ball glow
      const ballGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 20);
      ballGrad.addColorStop(0, "rgba(251, 191, 36, 0.6)");
      ballGrad.addColorStop(1, "rgba(251, 191, 36, 0)");
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(bx, by, 20, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Cannon
    ctx.save();
    ctx.translate(originX, gY);
    ctx.rotate(-rad);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(-5, -6, 40, 12);
    ctx.fillStyle = "#475569";
    ctx.fillRect(30, -8, 10, 16);
    ctx.restore();

    // Cannon base
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.arc(originX, gY, 14, Math.PI, 0);
    ctx.fill();

    // Info overlay
    const range = (speed * speed * Math.sin(2 * rad)) / gravity;
    const maxH = (vy * vy) / (2 * gravity);

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(W - 200, 12, 188, 90);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.strokeRect(W - 200, 12, 188, 90);
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("PROJECTILE DATA", W - 190, 30);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Range:  ${range.toFixed(1)} m`, W - 190, 50);
    ctx.fillText(`Max H:  ${maxH.toFixed(1)} m`, W - 190, 67);
    ctx.fillText(`Time:   ${totalTime.toFixed(2)} s`, W - 190, 84);
  }, [angle, speed, gravity, isRunning]);

  const animate = useCallback(() => {
    const rad = (angle * Math.PI) / 180;
    const vy = speed * Math.sin(rad);
    const vx = speed * Math.cos(rad);
    const totalTime = (2 * vy) / gravity;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gY = canvas.height * groundY;
    const scale = (gY - 40) / ((speed * speed) / (2 * gravity) + 10);
    const originX = 60;

    if (timeRef.current <= totalTime) {
      const t = timeRef.current;
      const bx = originX + vx * t * scale;
      const by = gY - (vy * t - 0.5 * gravity * t * t) * scale;
      trailsRef.current = [...trailsRef.current, { x: bx, y: by }];
      timeRef.current += 0.025;
      draw();
      animRef.current = requestAnimationFrame(animate);
    } else {
      setIsRunning(false);
    }
  }, [angle, speed, gravity, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 500);
      draw();
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  useEffect(() => {
    draw();
  }, [draw]);

  const launch = () => {
    timeRef.current = 0;
    trailsRef.current = [];
    setIsRunning(true);
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    timeRef.current = 0;
    trailsRef.current = [];
    setIsRunning(false);
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Launch Angle
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={5}
              max={85}
              value={angle}
              onChange={(e) => { setAngle(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {angle}&deg;
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Initial Speed
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={100}
              value={speed}
              onChange={(e) => { setSpeed(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
              {speed} m/s
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Gravity
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={25}
              step={0.1}
              value={gravity}
              onChange={(e) => { setGravity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">
              {gravity.toFixed(1)} m/s²
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={launch}
            disabled={isRunning}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Launching..." : "Launch"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            x(t) = v₀ cos(θ) · t
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            y(t) = v₀ sin(θ) · t − ½gt²
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            R = v₀² sin(2θ) / g
          </div>
        </div>
      </div>
    </div>
  );
}
