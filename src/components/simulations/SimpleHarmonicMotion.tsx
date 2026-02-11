"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function SimpleHarmonicMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [mass, setMass] = useState(2);
  const [springK, setSpringK] = useState(10);
  const [amplitude, setAmplitude] = useState(100);
  const [damping, setDamping] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const historyRef = useRef<number[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const midY = H * 0.35;
    const graphY = H * 0.65;
    const graphH = H * 0.3;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Equilibrium line
    const eqX = W * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(eqX, 20);
    ctx.lineTo(eqX, midY + 40);
    ctx.stroke();
    ctx.setLineDash([]);

    // Physics
    const omega = Math.sqrt(springK / mass);
    const t = timeRef.current;
    const dampFactor = Math.exp(-damping * t / (2 * mass));
    const displacement = amplitude * dampFactor * Math.cos(omega * t);
    const velocity = -amplitude * omega * dampFactor * Math.sin(omega * t);

    const massX = eqX + displacement;

    // Wall
    ctx.fillStyle = "#475569";
    ctx.fillRect(30, midY - 30, 12, 60);
    // Hash marks
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(30, midY - 25 + i * 12);
      ctx.lineTo(22, midY - 18 + i * 12);
      ctx.stroke();
    }

    // Spring (zigzag)
    const springStart = 42;
    const springEnd = massX - 25;
    const coils = 12;
    const segLen = (springEnd - springStart) / (coils * 2);
    const springAmp = 14;

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(springStart, midY);
    for (let i = 0; i < coils * 2; i++) {
      const sx = springStart + segLen * (i + 1);
      const sy = midY + (i % 2 === 0 ? springAmp : -springAmp);
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(massX - 25, midY);
    ctx.stroke();

    // Mass block
    const blockW = 50;
    const blockH = 50;
    const gradient = ctx.createLinearGradient(massX - blockW/2, midY - blockH/2, massX + blockW/2, midY + blockH/2);
    gradient.addColorStop(0, "#3b82f6");
    gradient.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(massX - blockW/2, midY - blockH/2, blockW, blockH, 6);
    ctx.fill();

    // Mass label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${mass} kg`, massX, midY + 5);

    // Velocity arrow
    const velScale = 0.5;
    const velLen = velocity * velScale;
    if (Math.abs(velLen) > 3) {
      ctx.strokeStyle = "#22c55e";
      ctx.fillStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(massX, midY + blockH/2 + 15);
      ctx.lineTo(massX + velLen, midY + blockH/2 + 15);
      ctx.stroke();
      // Arrowhead
      const dir = velLen > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(massX + velLen, midY + blockH/2 + 15);
      ctx.lineTo(massX + velLen - dir * 8, midY + blockH/2 + 10);
      ctx.lineTo(massX + velLen - dir * 8, midY + blockH/2 + 20);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = "11px system-ui";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("velocity", massX + 30, midY + blockH/2 + 35);

    // Energy bars
    const KE = 0.5 * mass * velocity * velocity / 1000;
    const PE = 0.5 * springK * displacement * displacement / 1000;
    const TE = KE + PE;
    const barMaxW = 120;
    const barX = W - 180;
    const barY = 30;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(barX - 15, barY - 15, 175, 110, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY", barX, barY);

    // KE bar
    ctx.fillStyle = "#ef4444";
    const keW = TE > 0 ? (KE / TE) * barMaxW : 0;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 15, keW, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "11px system-ui";
    ctx.fillText(`KE: ${KE.toFixed(1)}`, barX + barMaxW + 8, barY + 27);

    // PE bar
    ctx.fillStyle = "#3b82f6";
    const peW = TE > 0 ? (PE / TE) * barMaxW : 0;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 38, peW, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`PE: ${PE.toFixed(1)}`, barX + barMaxW + 8, barY + 50);

    // Total bar
    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    ctx.roundRect(barX, barY + 61, barMaxW * dampFactor * dampFactor, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#d8b4fe";
    ctx.fillText(`TE: ${(KE + PE).toFixed(1)}`, barX + barMaxW + 8, barY + 73);

    // Graph
    const history = historyRef.current;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(20, graphY - 10, W - 40, graphH + 20, 8);
    ctx.fill();

    // Graph axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, graphY + graphH / 2);
    ctx.lineTo(W - 30, graphY + graphH / 2);
    ctx.stroke();

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText("x(t)", 42, graphY + 5);

    // Plot displacement history
    if (history.length > 1) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const graphW = W - 80;
      const maxPts = 300;
      const startIdx = Math.max(0, history.length - maxPts);
      for (let i = startIdx; i < history.length; i++) {
        const px = 40 + ((i - startIdx) / maxPts) * graphW;
        const py = graphY + graphH / 2 - (history[i] / (amplitude + 10)) * (graphH / 2 - 5);
        if (i === startIdx) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [mass, springK, amplitude, damping]);

  const animate = useCallback(() => {
    timeRef.current += 0.03;
    const omega = Math.sqrt(springK / mass);
    const dampFactor = Math.exp(-damping * timeRef.current / (2 * mass));
    const displacement = amplitude * dampFactor * Math.cos(omega * timeRef.current);
    historyRef.current.push(displacement);
    if (historyRef.current.length > 500) historyRef.current.shift();
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [mass, springK, amplitude, damping, draw]);

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
    timeRef.current = 0;
    historyRef.current = [];
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={10} step={0.5} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{mass} kg</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Spring Constant</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={50} value={springK}
              onChange={(e) => { setSpringK(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{springK} N/m</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amplitude</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={20} max={180} value={amplitude}
              onChange={(e) => { setAmplitude(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{amplitude} px</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Damping</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={5} step={0.1} value={damping}
              onChange={(e) => { setDamping(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{damping.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="px-6 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => { reset(); if (!isRunning) draw(); }}
          className="px-6 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">x(t) = A cos(ωt)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ω = √(k/m)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T = 2π√(m/k)</div>
        </div>
      </div>
    </div>
  );
}
