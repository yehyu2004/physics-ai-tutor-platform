"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function DopplerEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [sourceSpeed, setSourceSpeed] = useState(0.4);
  const [waveSpeed, setWaveSpeed] = useState(1.0);
  const [isRunning, setIsRunning] = useState(true);

  const timeRef = useRef(0);
  const wavesRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const cy = H * 0.5;

    // Source position
    const sourceX = W * 0.2 + sourceSpeed * t * 60;
    const wrappedX = ((sourceX - W * 0.1) % (W * 0.8)) + W * 0.1;

    // Draw wavefronts (circles expanding from emission point)
    const waves = wavesRef.current;
    for (const wave of waves) {
      const age = t - wave.t;
      const radius = age * waveSpeed * 120;
      if (radius > W) continue;

      const alpha = Math.max(0, 0.4 - age * 0.04);
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Source
    const srcGlow = ctx.createRadialGradient(wrappedX, cy, 0, wrappedX, cy, 25);
    srcGlow.addColorStop(0, "rgba(239,68,68,0.4)");
    srcGlow.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = srcGlow;
    ctx.beginPath();
    ctx.arc(wrappedX, cy, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(wrappedX, cy, 10, 0, Math.PI * 2);
    ctx.fill();

    // Velocity arrow
    if (Math.abs(sourceSpeed) > 0.01) {
      const arrLen = sourceSpeed * 50;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(wrappedX, cy - 25);
      ctx.lineTo(wrappedX + arrLen, cy - 25);
      ctx.stroke();
      ctx.fillStyle = "#22c55e";
      const dir = sourceSpeed > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(wrappedX + arrLen, cy - 25);
      ctx.lineTo(wrappedX + arrLen - dir * 7, cy - 30);
      ctx.lineTo(wrappedX + arrLen - dir * 7, cy - 20);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px system-ui";
      ctx.fillText("v_s", wrappedX + arrLen + 5, cy - 22);
    }

    // Observer positions
    const obs = [
      { x: W * 0.85, label: "Observer (ahead)", shift: "higher" },
      { x: W * 0.08, label: "Observer (behind)", shift: "lower" },
    ];

    obs.forEach((o) => {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(o.x, cy, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "10px system-ui";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      ctx.fillText(o.label, o.x, cy + 25);

      // Frequency indicator
      const ratio = sourceSpeed > 0
        ? (o.shift === "higher"
          ? waveSpeed / (waveSpeed - sourceSpeed)
          : waveSpeed / (waveSpeed + sourceSpeed))
        : 1;
      ctx.fillStyle = ratio > 1 ? "#ef4444" : ratio < 1 ? "#3b82f6" : "#94a3b8";
      ctx.font = "bold 11px ui-monospace";
      ctx.fillText(`f' = ${ratio.toFixed(2)}f₀`, o.x, cy + 42);
    });

    // Info
    const mach = sourceSpeed / waveSpeed;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 100, 12, 200, 60, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("DOPPLER DATA", W / 2, 28);
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`v_s/v = ${mach.toFixed(2)} (Mach ${mach.toFixed(2)})`, W / 2, 48);
    ctx.fillStyle = mach >= 1 ? "#ef4444" : "#22c55e";
    ctx.fillText(mach >= 1 ? "SUPERSONIC" : "SUBSONIC", W / 2, 64);
  }, [sourceSpeed, waveSpeed]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;
    const t = timeRef.current;
    const cy = canvasRef.current ? canvasRef.current.height * 0.5 : 250;
    const W = canvasRef.current ? canvasRef.current.width : 800;

    // Emit wavefront every 0.3s
    const sourceX = W * 0.2 + sourceSpeed * t * 60;
    const wrappedX = ((sourceX - W * 0.1) % (W * 0.8)) + W * 0.1;

    if (wavesRef.current.length === 0 || t - wavesRef.current[wavesRef.current.length - 1].t > 0.3) {
      wavesRef.current.push({ x: wrappedX, y: cy, t });
    }

    // Remove old waves
    wavesRef.current = wavesRef.current.filter((w) => t - w.t < 10);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [sourceSpeed, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.45, 400);
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
    timeRef.current = 0;
    lastTsRef.current = null;
    wavesRef.current = [];
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={-1} max={1.5} step={0.05} value={sourceSpeed}
              onChange={(e) => { setSourceSpeed(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{sourceSpeed.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wave Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={2} step={0.1} value={waveSpeed}
              onChange={(e) => { setWaveSpeed(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{waveSpeed.toFixed(1)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2">
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
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Doppler Effect</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">f&apos; = f₀ · v/(v ± v_s)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Approaching: f&apos; &gt; f₀</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Receding: f&apos; &lt; f₀</div>
        </div>
      </div>
    </div>
  );
}
