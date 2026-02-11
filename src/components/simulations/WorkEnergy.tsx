"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function WorkEnergy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [force, setForce] = useState(20);
  const [mass, setMass] = useState(5);
  const [friction, setFriction] = useState(0.1);
  const [isRunning, setIsRunning] = useState(false);

  const timeRef = useRef(0);
  const posRef = useRef(0);
  const velRef = useRef(0);
  const historyRef = useRef<{ x: number; ke: number; work: number }[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const groundY = H * 0.65;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, groundY);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(1, "#1e293b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, groundY);

    // Ground
    const grd = ctx.createLinearGradient(0, groundY, 0, H);
    grd.addColorStop(0, "#374151");
    grd.addColorStop(1, "#1f2937");
    ctx.fillStyle = grd;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x, groundY + H);
      ctx.stroke();
    }

    // Box position
    const boxW = 50;
    const boxH = 40;
    const startX = 60;
    const maxTravel = W - 140;
    const boxX = startX + Math.min(posRef.current * 8, maxTravel);
    const boxY = groundY - boxH;

    // Box shadow / glow
    const glowGrad = ctx.createRadialGradient(boxX + boxW / 2, boxY + boxH / 2, 0, boxX + boxW / 2, boxY + boxH / 2, 50);
    glowGrad.addColorStop(0, "rgba(59,130,246,0.15)");
    glowGrad.addColorStop(1, "rgba(59,130,246,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(boxX + boxW / 2, boxY + boxH / 2, 50, 0, Math.PI * 2);
    ctx.fill();

    // Box
    const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    boxGrad.addColorStop(0, "#3b82f6");
    boxGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = boxGrad;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mass label on box
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${mass}kg`, boxX + boxW / 2, boxY + boxH / 2 + 4);

    // Force arrow (red)
    if (isRunning || force > 0) {
      const arrowLen = Math.min(force * 2.5, 100);
      const arrowY = boxY + boxH / 2;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(boxX + boxW + 5, arrowY);
      ctx.lineTo(boxX + boxW + 5 + arrowLen, arrowY);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(boxX + boxW + 5 + arrowLen + 10, arrowY);
      ctx.lineTo(boxX + boxW + 5 + arrowLen - 2, arrowY - 6);
      ctx.lineTo(boxX + boxW + 5 + arrowLen - 2, arrowY + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`F = ${force} N`, boxX + boxW + 5 + arrowLen / 2, arrowY - 12);
    }

    // Friction arrow (orange, opposite direction)
    const frictionForce = friction * mass * 9.8;
    if (velRef.current > 0.01 && frictionForce > 0) {
      const fLen = Math.min(frictionForce * 2.5, 60);
      const fY = boxY + boxH / 2 + 2;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxX - 5, fY);
      ctx.lineTo(boxX - 5 - fLen, fY);
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(boxX - 5 - fLen - 8, fY);
      ctx.lineTo(boxX - 5 - fLen + 2, fY - 5);
      ctx.lineTo(boxX - 5 - fLen + 2, fY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`f = ${frictionForce.toFixed(1)} N`, boxX - 5 - fLen / 2, fY - 10);
    }

    // Velocity arrow (green)
    if (velRef.current > 0.1) {
      const vLen = Math.min(velRef.current * 15, 80);
      const vY = boxY - 15;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxX + boxW / 2, vY);
      ctx.lineTo(boxX + boxW / 2 + vLen, vY);
      ctx.stroke();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(boxX + boxW / 2 + vLen + 7, vY);
      ctx.lineTo(boxX + boxW / 2 + vLen - 2, vY - 4);
      ctx.lineTo(boxX + boxW / 2 + vLen - 2, vY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`v = ${velRef.current.toFixed(1)} m/s`, boxX + boxW / 2 + vLen / 2, vY - 8);
    }

    // --- Energy bar graph ---
    const barX = W - 190;
    const barW = 170;
    const barTop = 20;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(barX - 10, barTop, barW + 20, 160, 8);
    ctx.fill();

    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY DATA", barX, barTop + 18);

    const ke = 0.5 * mass * velRef.current * velRef.current;
    const netForce = force - frictionForce;
    const workDone = netForce * posRef.current;
    const workByF = force * posRef.current;
    const workByFriction = -frictionForce * posRef.current;

    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`KE = ${ke.toFixed(1)} J`, barX, barTop + 40);
    ctx.fillStyle = "#22c55e";
    ctx.fillText(`W_net = ${workDone.toFixed(1)} J`, barX, barTop + 58);
    ctx.fillStyle = "#ef4444";
    ctx.fillText(`W_F = ${workByF.toFixed(1)} J`, barX, barTop + 76);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText(`W_fric = ${workByFriction.toFixed(1)} J`, barX, barTop + 94);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`d = ${posRef.current.toFixed(1)} m`, barX, barTop + 116);
    ctx.fillText(`v = ${velRef.current.toFixed(2)} m/s`, barX, barTop + 134);

    // Check theorem: W_net = delta KE
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`ΔKE = ${ke.toFixed(1)} J`, barX, barTop + 152);

    // --- Bottom graph ---
    const graphY = groundY + 10;
    const graphH = H - groundY - 20;
    const graphW2 = W - 40;
    const history = historyRef.current;

    if (history.length > 1) {
      const maxE = Math.max(1, ...history.map(h => Math.max(h.ke, Math.abs(h.work))));
      const maxX2 = Math.max(1, ...history.map(h => h.x));

      // KE line (blue)
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.4)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = 20 + (history[i].x / maxX2) * graphW2;
        const py = graphY + graphH - (history[i].ke / maxE) * (graphH - 10);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Work line (green)
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.4)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = 20 + (history[i].x / maxX2) * graphW2;
        const py = graphY + graphH - (history[i].work / maxE) * (graphH - 10);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Legend
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "left";
      ctx.fillText("KE", 25, graphY + 12);
      ctx.fillStyle = "#22c55e";
      ctx.fillText("W_net", 55, graphY + 12);
    }
  }, [force, mass, friction, isRunning]);

  const animate = useCallback(() => {
    const dt = 0.03;
    const g = 9.8;
    const frictionForce = friction * mass * g;
    const netForce = Math.max(0, force - (velRef.current > 0.01 ? frictionForce : 0));
    const accel = netForce / mass;

    velRef.current += accel * dt;
    if (velRef.current < 0) velRef.current = 0;
    posRef.current += velRef.current * dt;
    timeRef.current += dt;

    const ke = 0.5 * mass * velRef.current * velRef.current;
    const workNet = (force - frictionForce) * posRef.current;
    historyRef.current.push({ x: posRef.current, ke, work: workNet });
    if (historyRef.current.length > 500) historyRef.current.shift();

    draw();

    if (posRef.current < 80) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      setIsRunning(false);
    }
  }, [force, mass, friction, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 500);
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

  useEffect(() => { draw(); }, [draw]);

  const start = () => {
    timeRef.current = 0;
    posRef.current = 0;
    velRef.current = 0;
    historyRef.current = [];
    setIsRunning(true);
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    timeRef.current = 0;
    posRef.current = 0;
    velRef.current = 0;
    historyRef.current = [];
    setIsRunning(false);
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Applied Force (N)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={5} max={80} value={force}
              onChange={(e) => { setForce(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{force}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass (kg)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={20} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{mass}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Friction (mu_k)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={0.5} step={0.01} value={friction}
              onChange={(e) => { setFriction(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{friction.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={start} disabled={isRunning}
            className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Running..." : "Push"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={reset}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">W = F d cos(theta)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">KE = 1/2 m v^2</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">W_net = Delta KE</div>
        </div>
      </div>
    </div>
  );
}
