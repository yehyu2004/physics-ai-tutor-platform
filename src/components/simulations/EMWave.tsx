"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function EMWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [wavelength, setWavelength] = useState(100);
  const [amplitude, setAmplitude] = useState(60);
  const [showE, setShowE] = useState(true);
  const [showB, setShowB] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
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
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    const cy = H * 0.5;
    const k = (2 * Math.PI) / wavelength;
    const omega = k * 3;

    // Propagation axis (x-direction)
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, cy);
    ctx.lineTo(W - 15, cy);
    ctx.stroke();
    // Arrow
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(W - 15, cy);
    ctx.lineTo(W - 25, cy - 4);
    ctx.lineTo(W - 25, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "right";
    ctx.fillText("x (propagation)", W - 30, cy - 8);

    // E-field (vertical oscillation - y direction)
    if (showE) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(239,68,68,0.3)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let px = 30; px < W - 20; px += 2) {
        const x = px - 30;
        const Ey = amplitude * Math.sin(k * x - omega * t);
        const screenY = cy - Ey;
        if (px === 30) ctx.moveTo(px, screenY);
        else ctx.lineTo(px, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // E field vectors (vertical lines from axis)
      ctx.strokeStyle = "rgba(239,68,68,0.2)";
      ctx.lineWidth = 1;
      for (let px = 40; px < W - 20; px += 25) {
        const x = px - 30;
        const Ey = amplitude * Math.sin(k * x - omega * t);
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px, cy - Ey);
        ctx.stroke();
        // Small arrowhead
        if (Math.abs(Ey) > 5) {
          ctx.fillStyle = "rgba(239,68,68,0.3)";
          ctx.beginPath();
          const dir = Ey > 0 ? -1 : 1;
          ctx.moveTo(px, cy - Ey);
          ctx.lineTo(px - 2, cy - Ey + dir * 5);
          ctx.lineTo(px + 2, cy - Ey + dir * 5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Label
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("E (electric)", 35, 25);
    }

    // B-field (depth oscillation - rendered as horizontal displacement, 90° offset)
    if (showB) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(59,130,246,0.3)";
      ctx.shadowBlur = 8;

      // B field oscillates in z-direction, shown as diagonal/perspective
      const bScale = amplitude * 0.6;
      ctx.beginPath();
      for (let px = 30; px < W - 20; px += 2) {
        const x = px - 30;
        const Bz = bScale * Math.sin(k * x - omega * t);
        // Perspective: horizontal displacement
        const screenX = px + Bz * 0.5;
        const screenY = cy + Bz * 0.3;
        if (px === 30) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // B vectors
      ctx.strokeStyle = "rgba(59,130,246,0.2)";
      ctx.lineWidth = 1;
      for (let px = 40; px < W - 20; px += 25) {
        const x = px - 30;
        const Bz = bScale * Math.sin(k * x - omega * t);
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px + Bz * 0.5, cy + Bz * 0.3);
        ctx.stroke();
      }

      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 13px system-ui";
      ctx.fillText("B (magnetic)", 35, 45);
    }

    // Speed of light indicator
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(W - 180, 12, 168, 65, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("EM WAVE", W - 168, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`λ = ${wavelength} (arb. units)`, W - 168, 46);
    ctx.fillText("c = 3 × 10⁸ m/s", W - 168, 62);

    // Axes labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("y ↑", 20, 25);
    ctx.fillText("z ↗", 40, H - 15);
  }, [wavelength, amplitude, showE, showB]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.45, 380);
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wavelength</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={40} max={200} value={wavelength}
              onChange={(e) => setWavelength(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{wavelength}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amplitude</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={20} max={100} value={amplitude}
              onChange={(e) => setAmplitude(Number(e.target.value))}
              className="flex-1 accent-amber-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{amplitude}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => setShowE(!showE)}
            className={`w-full h-8 rounded text-xs font-medium ${showE ? "bg-red-500 text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}>
            E field {showE ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => setShowB(!showB)}
            className={`w-full h-8 rounded text-xs font-medium ${showB ? "bg-blue-500 text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}>
            B field {showB ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
            className="w-full h-8 rounded-lg bg-purple-600 text-white text-xs font-medium">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Electromagnetic Waves</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">c = λf = 1/√(µ₀ε₀)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E ⊥ B ⊥ propagation</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E/B = c</div>
        </div>
      </div>
    </div>
  );
}
