"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function CircularMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [radius, setRadius] = useState(150);
  const [speed, setSpeed] = useState(3);
  const [showVectors, setShowVectors] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const angleRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number; a: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);
  const pxPerMeter = 50;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.45;
    const cy = H * 0.5;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const theta = angleRef.current;
    const R = Math.min(radius, Math.min(W, H) * 0.35);

    // Orbit path
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Radius line
    const bx = cx + R * Math.cos(theta);
    const by = cy - R * Math.sin(theta);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Trail (fading)
    const trail = trailRef.current;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.4;
        ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }

    // Angle arc
    const arcR = 30;
    ctx.strokeStyle = "rgba(251,191,36,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (theta >= 0) {
      ctx.arc(cx, cy, arcR, 0, -theta, true);
    } else {
      ctx.arc(cx, cy, arcR, 0, -theta, false);
    }
    ctx.stroke();

    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    const degAngle = ((theta * 180) / Math.PI) % 360;
    ctx.fillText(`${degAngle.toFixed(0)}°`, cx + 42 * Math.cos(-theta / 2), cy + 42 * Math.sin(-theta / 2));

    // Center point
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    if (showVectors) {
      const radiusMeters = R / pxPerMeter;
      const omega = speed / Math.max(radiusMeters, 0.1);
      const velMag = speed * 15; // visual scale
      const accelMag = (speed * speed / Math.max(radiusMeters, 0.1)) * 4; // visual scale

      // Velocity vector (tangential)
      const vx = -Math.sin(theta) * velMag;
      const vy = -Math.cos(theta) * velMag;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + vx, by + vy);
      ctx.stroke();
      // Arrow
      const vmag = Math.sqrt(vx * vx + vy * vy);
      if (vmag > 5) {
        const nvx = vx / vmag;
        const nvy = vy / vmag;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(bx + vx, by + vy);
        ctx.lineTo(bx + vx - nvx * 8 - nvy * 4, by + vy - nvy * 8 + nvx * 4);
        ctx.lineTo(bx + vx - nvx * 8 + nvy * 4, by + vy - nvy * 8 - nvx * 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = "11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.fillText("v", bx + vx * 0.5 + 12, by + vy * 0.5 + 5);

      // Centripetal acceleration (toward center)
      const ax = (cx - bx);
      const ay = (cy - by);
      const amag = Math.sqrt(ax * ax + ay * ay);
      const accelLen = Math.min(accelMag, amag * 0.7);
      const anx = ax / amag;
      const any = ay / amag;

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + anx * accelLen, by + any * accelLen);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(bx + anx * accelLen, by + any * accelLen);
      ctx.lineTo(bx + anx * (accelLen - 8) - any * 4, by + any * (accelLen - 8) + anx * 4);
      ctx.lineTo(bx + anx * (accelLen - 8) + any * 4, by + any * (accelLen - 8) - anx * 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillText("ac", bx + anx * accelLen * 0.5 - 15, by + any * accelLen * 0.5);

      // Legend
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(12, 12, 140, 55, 6);
      ctx.fill();
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = "#22c55e";
      ctx.fillText("— velocity (tangent)", 22, 30);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("— centripetal accel", 22, 48);

      // Omega display
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(12, 72, 140, 30, 6);
      ctx.fill();
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`ω = ${omega.toFixed(2)} rad/s`, 22, 92);
    }

    // Ball glow
    const ballGlow = ctx.createRadialGradient(bx, by, 0, bx, by, 25);
    ballGlow.addColorStop(0, "rgba(59,130,246,0.4)");
    ballGlow.addColorStop(1, "transparent");
    ctx.fillStyle = ballGlow;
    ctx.beginPath();
    ctx.arc(bx, by, 25, 0, Math.PI * 2);
    ctx.fill();

    // Ball
    const ballGrad = ctx.createRadialGradient(bx - 3, by - 3, 0, bx, by, 12);
    ballGrad.addColorStop(0, "#93c5fd");
    ballGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, Math.PI * 2);
    ctx.fill();

    // Info panel
    const radiusMeters = R / pxPerMeter;
    const period = (2 * Math.PI * radiusMeters) / speed;
    const ac = (speed * speed) / radiusMeters;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 195, 12, 183, 95, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CIRCULAR MOTION", W - 183, 30);
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Speed:  ${speed.toFixed(1)} m/s`, W - 183, 48);
    ctx.fillText(`Radius: ${radiusMeters.toFixed(1)} m`, W - 183, 63);
    ctx.fillText(`Period: ${period.toFixed(2)} s`, W - 183, 78);
    ctx.fillText(`a_c:    ${ac.toFixed(1)} m/s²`, W - 183, 93);
  }, [radius, speed, showVectors]);

  const animate = useCallback(() => {
    const R = Math.min(radius, 200);
    const radiusMeters = R / pxPerMeter;
    const omega = speed / Math.max(radiusMeters, 0.1);
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    angleRef.current += omega * dt;

    const canvas = canvasRef.current;
    if (canvas) {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W * 0.45;
      const cy = H * 0.5;
      const R2 = Math.min(radius, Math.min(W, H) * 0.35);
      const bx = cx + R2 * Math.cos(angleRef.current);
      const by = cy - R2 * Math.sin(angleRef.current);
      trailRef.current.push({ x: bx, y: by, a: angleRef.current });
      if (trailRef.current.length > 120) trailRef.current.shift();
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [radius, speed, draw]);

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
    angleRef.current = 0;
    trailRef.current = [];
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
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Radius</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={50} max={200} value={radius}
              onChange={(e) => { setRadius(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{(radius / pxPerMeter).toFixed(1)} m</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={10} step={0.1} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{speed.toFixed(1)} m/s</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowVectors(!showVectors)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showVectors ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Vectors {showVectors ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
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
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">a_c = v²/r</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T = 2πr/v</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ω = v/r</div>
        </div>
      </div>
    </div>
  );
}
