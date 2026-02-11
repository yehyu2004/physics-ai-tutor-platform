"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function OrbitalMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [centralMass, setCentralMass] = useState(500);
  const [orbiterSpeed, setOrbiterSpeed] = useState(1.0); // fraction of circular orbit speed
  const [isRunning, setIsRunning] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  const posRef = useRef({ x: 0.75, y: 0.5 });
  const velRef = useRef({ vx: 0, vy: 0 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  const G_SCALE = 0.0008;

  const init = useCallback(() => {
    const r0 = 0.25; // initial distance from center
    posRef.current = { x: 0.5 + r0, y: 0.5 };
    // Calculate circular orbit speed: v_circ = sqrt(GM/r)
    const GM = centralMass * G_SCALE;
    const vCirc = Math.sqrt(GM / r0);
    // Apply speed multiplier (1.0 = circular, <1 = ellipse inward, >1 = ellipse outward)
    const v = vCirc * orbiterSpeed;
    velRef.current = { vx: 0, vy: -v };
    trailRef.current = [];
  }, [orbiterSpeed, centralMass]);

  useEffect(() => {
    init();
  }, [init]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Space background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (let i = 0; i < 120; i++) {
      const sx = ((i * 7919 + 104729) % W);
      const sy = ((i * 6271 + 51407) % H);
      const sr = i % 7 === 0 ? 1.5 : 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.08})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    const cx = W * 0.5;
    const cy = H * 0.5;

    // Trail
    if (showTrail) {
      const trail = trailRef.current;
      if (trail.length > 2) {
        for (let i = 1; i < trail.length; i++) {
          const alpha = (i / trail.length) * 0.7;
          ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
          ctx.lineTo(trail[i].x * W, trail[i].y * H);
          ctx.stroke();
        }
      }
    }

    // Central body glow
    const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
    sunGlow.addColorStop(0, "rgba(251, 191, 36, 0.35)");
    sunGlow.addColorStop(0.4, "rgba(251, 191, 36, 0.08)");
    sunGlow.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.fill();

    // Central body
    const sunRadius = 14 + centralMass / 100;
    const sunGrad = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, sunRadius);
    sunGrad.addColorStop(0, "#fef08a");
    sunGrad.addColorStop(0.5, "#fbbf24");
    sunGrad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sun corona rays
    ctx.strokeStyle = "rgba(251, 191, 36, 0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Date.now() * 0.0008;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * (sunRadius + 3), cy + Math.sin(angle) * (sunRadius + 3));
      ctx.lineTo(cx + Math.cos(angle) * (sunRadius + 18), cy + Math.sin(angle) * (sunRadius + 18));
      ctx.stroke();
    }

    // Orbiting body
    const px = posRef.current.x * W;
    const py = posRef.current.y * H;

    // Planet glow
    const planetGlow = ctx.createRadialGradient(px, py, 0, px, py, 28);
    planetGlow.addColorStop(0, "rgba(59, 130, 246, 0.35)");
    planetGlow.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = planetGlow;
    ctx.beginPath();
    ctx.arc(px, py, 28, 0, Math.PI * 2);
    ctx.fill();

    // Planet
    const planetGrad = ctx.createRadialGradient(px - 3, py - 3, 0, px, py, 10);
    planetGrad.addColorStop(0, "#93c5fd");
    planetGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fill();

    // Velocity vector
    const vx = velRef.current.vx;
    const vy = velRef.current.vy;
    const vScale = 25;
    const vMag = Math.sqrt(vx * vx + vy * vy);
    if (vMag > 0.005) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + vx * vScale, py + vy * vScale);
      ctx.stroke();
      const nvx = vx / vMag;
      const nvy = vy / vMag;
      const tipX = px + vx * vScale;
      const tipY = py + vy * vScale;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - nvx * 8 - nvy * 4, tipY - nvy * 8 + nvx * 4);
      ctx.lineTo(tipX - nvx * 8 + nvy * 4, tipY - nvy * 8 - nvx * 4);
      ctx.closePath();
      ctx.fill();
    }

    // Gravity vector (towards center)
    const gdx = cx - px;
    const gdy = cy - py;
    const dist = Math.sqrt(gdx * gdx + gdy * gdy);
    if (dist > sunRadius + 15) {
      const gLen = Math.min(30, 2000 / (dist * dist) * 100);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (gdx / dist) * gLen, py + (gdy / dist) * gLen);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      const gtipX = px + (gdx / dist) * gLen;
      const gtipY = py + (gdy / dist) * gLen;
      ctx.beginPath();
      ctx.moveTo(gtipX, gtipY);
      ctx.lineTo(gtipX - (gdx / dist) * 7 - (gdy / dist) * 3.5, gtipY - (gdy / dist) * 7 + (gdx / dist) * 3.5);
      ctx.lineTo(gtipX - (gdx / dist) * 7 + (gdy / dist) * 3.5, gtipY - (gdy / dist) * 7 - (gdx / dist) * 3.5);
      ctx.closePath();
      ctx.fill();
    }

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 140, 60, 8);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#22c55e";
    ctx.fillText("— velocity", 25, 30);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("— gravity", 25, 48);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("— orbit trail", 25, 66);

    // Info
    const distNorm = Math.sqrt(
      (posRef.current.x - 0.5) ** 2 + (posRef.current.y - 0.5) ** 2
    );
    const speed = Math.sqrt(vx * vx + vy * vy);
    const GM = centralMass * G_SCALE;
    const vEsc = Math.sqrt(2 * GM / distNorm);
    const orbitType = speed >= vEsc ? "Hyperbolic" : orbiterSpeed === 1 ? "Circular" : "Elliptical";

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 195, 12, 183, 100, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ORBITAL DATA", W - 183, 30);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Speed:  ${(speed * 100).toFixed(1)}`, W - 183, 48);
    ctx.fillText(`Dist:   ${(distNorm * 100).toFixed(1)}`, W - 183, 64);
    ctx.fillText(`v/v_esc: ${(speed / vEsc).toFixed(2)}`, W - 183, 80);
    ctx.fillStyle = orbitType === "Circular" ? "#22c55e" : orbitType === "Elliptical" ? "#3b82f6" : "#ef4444";
    ctx.fillText(`Orbit:  ${orbitType}`, W - 183, 96);
  }, [centralMass, showTrail, orbiterSpeed]);

  const animate = useCallback(() => {
    const GM = centralMass * G_SCALE;
    const dt = 0.005;
    const substeps = 3; // multiple substeps for accuracy

    const pos = posRef.current;
    const vel = velRef.current;

    for (let s = 0; s < substeps; s++) {
      const dx = 0.5 - pos.x;
      const dy = 0.5 - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.005) {
        // Leapfrog / Velocity Verlet for energy conservation
        const F = GM / (dist * dist);
        const ax = F * (dx / dist);
        const ay = F * (dy / dist);

        // Half-step velocity
        vel.vx += ax * dt * 0.5;
        vel.vy += ay * dt * 0.5;

        // Full-step position
        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;

        // Recalculate acceleration at new position
        const dx2 = 0.5 - pos.x;
        const dy2 = 0.5 - pos.y;
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist2 > 0.005) {
          const F2 = GM / (dist2 * dist2);
          const ax2 = F2 * (dx2 / dist2);
          const ay2 = F2 * (dy2 / dist2);
          vel.vx += ax2 * dt * 0.5;
          vel.vy += ay2 * dt * 0.5;
        }
      }
    }

    // Keep trail manageable
    trailRef.current.push({ x: pos.x, y: pos.y });
    if (trailRef.current.length > 800) trailRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [centralMass, draw]);

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
    init();
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Central Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={100} max={2000} step={50} value={centralMass}
              onChange={(e) => { setCentralMass(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{centralMass}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed (× v_circ)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.3} max={1.6} step={0.05} value={orbiterSpeed}
              onChange={(e) => { setOrbiterSpeed(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{orbiterSpeed.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setShowTrail(!showTrail)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showTrail ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            {showTrail ? "Trail: ON" : "Trail: OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Kepler&apos;s Laws &amp; Orbits</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">F = GMm/r²</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">v_circ = √(GM/r)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">v_esc = √(2GM/r)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T² ∝ a³</div>
        </div>
      </div>
    </div>
  );
}
