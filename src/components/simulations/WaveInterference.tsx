"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function WaveInterference() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [freq1, setFreq1] = useState(2);
  const [freq2, setFreq2] = useState(2);
  const [amp1, setAmp1] = useState(40);
  const [amp2, setAmp2] = useState(40);
  const [phase, setPhase] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);

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

    const sections = [
      { y: H * 0.17, label: "Wave 1", color: "#ef4444", colorGlow: "rgba(239,68,68,0.3)", freq: freq1, amp: amp1, phaseOff: 0 },
      { y: H * 0.45, label: "Wave 2", color: "#3b82f6", colorGlow: "rgba(59,130,246,0.3)", freq: freq2, amp: amp2, phaseOff: phase },
      { y: H * 0.78, label: "Superposition", color: "#a855f7", colorGlow: "rgba(168,85,247,0.3)", freq: 0, amp: 0, phaseOff: 0 },
    ];

    const t = timeRef.current;
    const margin = 50;
    const graphW = W - margin * 2;

    sections.forEach((sec, idx) => {
      // Center line
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, sec.y);
      ctx.lineTo(W - margin, sec.y);
      ctx.stroke();

      // Label
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = sec.color;
      ctx.textAlign = "left";
      ctx.fillText(sec.label, margin, sec.y - sec.amp - 15 > 10 ? sec.y - (idx < 2 ? sec.amp : Math.max(amp1, amp2)) - 12 : 15);

      // Wave
      ctx.strokeStyle = sec.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = sec.colorGlow;
      ctx.shadowBlur = 10;
      ctx.beginPath();

      for (let px = 0; px <= graphW; px++) {
        const x = (px / graphW) * Math.PI * 8;
        let y: number;
        if (idx < 2) {
          y = sec.amp * Math.sin(sec.freq * x - sec.freq * t * 3 + sec.phaseOff);
        } else {
          const y1 = amp1 * Math.sin(freq1 * x - freq1 * t * 3);
          const y2 = amp2 * Math.sin(freq2 * x - freq2 * t * 3 + phase);
          y = y1 + y2;
        }
        const screenX = margin + px;
        const screenY = sec.y - y;
        if (px === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Fill under wave with subtle gradient
      if (idx === 2) {
        ctx.beginPath();
        for (let px = 0; px <= graphW; px++) {
          const x = (px / graphW) * Math.PI * 8;
          const y1 = amp1 * Math.sin(freq1 * x - freq1 * t * 3);
          const y2 = amp2 * Math.sin(freq2 * x - freq2 * t * 3 + phase);
          const y = y1 + y2;
          const screenX = margin + px;
          const screenY = sec.y - y;
          if (px === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.lineTo(W - margin, sec.y);
        ctx.lineTo(margin, sec.y);
        ctx.closePath();
        ctx.fillStyle = "rgba(168,85,247,0.08)";
        ctx.fill();
      }
    });

    // Separator lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, H * 0.31);
    ctx.lineTo(W - 20, H * 0.31);
    ctx.moveTo(20, H * 0.61);
    ctx.lineTo(W - 20, H * 0.61);
    ctx.stroke();
    ctx.setLineDash([]);

    // "+" symbol between waves
    ctx.font = "bold 20px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "center";
    ctx.fillText("+", W / 2, H * 0.31 + 7);
    ctx.fillText("=", W / 2, H * 0.61 + 7);
  }, [freq1, freq2, amp1, amp2, phase]);

  const animate = useCallback(() => {
    timeRef.current += 0.016;
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Wave 1 Freq</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={5} step={0.1} value={freq1}
              onChange={(e) => setFreq1(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{freq1.toFixed(1)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Wave 1 Amp</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={80} value={amp1}
              onChange={(e) => setAmp1(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{amp1}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Wave 2 Freq</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={5} step={0.1} value={freq2}
              onChange={(e) => setFreq2(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{freq2.toFixed(1)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Wave 2 Amp</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={80} value={amp2}
              onChange={(e) => setAmp2(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{amp2}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-purple-500 uppercase tracking-wider">Phase Diff</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={6.28} step={0.1} value={phase}
              onChange={(e) => setPhase(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{(phase / Math.PI).toFixed(1)}π</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsRunning(!isRunning)}
        className="px-6 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
      >
        {isRunning ? "Pause" : "Play"}
      </button>
    </div>
  );
}
