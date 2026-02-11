"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function RCCircuit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [resistance, setResistance] = useState(1000);
  const [capacitance, setCapacitance] = useState(100);
  const [voltage, setVoltage] = useState(10);
  const [isCharging, setIsCharging] = useState(true);
  const [isRunning, setIsRunning] = useState(true);

  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; vC: number; i: number }[]>([]);

  const tau = (resistance * capacitance) / 1000000; // R*C in seconds (R in Ohms, C in µF)

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

    // Current values
    const vC = isCharging
      ? voltage * (1 - Math.exp(-t / tau))
      : voltage * Math.exp(-t / tau);
    const current = isCharging
      ? (voltage / resistance) * Math.exp(-t / tau)
      : -(voltage / resistance) * Math.exp(-t / tau);

    // --- Left: Circuit diagram ---
    const circW = W * 0.35;
    const cx = circW * 0.5;
    const cy = H * 0.5;
    const size = Math.min(circW * 0.35, H * 0.35);

    // Battery
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx - size, cy + size);
    ctx.stroke();
    // Battery symbol
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - size - 8, cy - size * 0.3);
    ctx.lineTo(cx - size + 8, cy - size * 0.3);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size - 12, cy - size * 0.15);
    ctx.lineTo(cx - size + 12, cy - size * 0.15);
    ctx.stroke();
    ctx.font = "bold 11px system-ui";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.fillText(`${voltage}V`, cx - size - 25, cy);

    // Top wire
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.stroke();

    // Resistor (zigzag)
    const rStart = cx - size * 0.3;
    const rEnd = cx + size * 0.3;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(rStart, cy - size);
    const steps = 6;
    const stepW = (rEnd - rStart) / steps;
    for (let i = 0; i < steps; i++) {
      ctx.lineTo(rStart + stepW * (i + 0.25), cy - size - 8);
      ctx.lineTo(rStart + stepW * (i + 0.75), cy - size + 8);
    }
    ctx.lineTo(rEnd, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`R=${resistance}Ω`, cx, cy - size - 18);

    // Right wire down
    ctx.beginPath();
    ctx.moveTo(cx + size, cy - size);
    ctx.lineTo(cx + size, cy + size);
    ctx.stroke();

    // Capacitor symbol
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + size - 12, cy - 6);
    ctx.lineTo(cx + size + 12, cy - 6);
    ctx.moveTo(cx + size - 12, cy + 6);
    ctx.lineTo(cx + size + 12, cy + 6);
    ctx.stroke();
    ctx.fillStyle = "#3b82f6";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`C=${capacitance}µF`, cx + size + 25, cy + 5);

    // Capacitor charge visualization
    const chargeFraction = vC / voltage;
    ctx.fillStyle = `rgba(59,130,246,${chargeFraction * 0.4})`;
    ctx.fillRect(cx + size - 10, cy - 5, 20, -chargeFraction * 30);

    // Bottom wire
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + size, cy + size);
    ctx.lineTo(cx - size, cy + size);
    ctx.lineTo(cx - size, cy - size * 0.15);
    ctx.stroke();

    // Current arrows (animated)
    const currentScale = Math.abs(current) * resistance;
    if (currentScale > 0.1) {
      const arrowColor = isCharging ? "#22c55e" : "#f59e0b";
      ctx.fillStyle = arrowColor;
      const offset = (t * 100) % 40;
      // Top wire
      for (let ax = cx - size + offset; ax < cx + size; ax += 40) {
        ctx.beginPath();
        ctx.moveTo(ax, cy - size - 3);
        ctx.lineTo(ax - 5, cy - size - 7);
        ctx.lineTo(ax - 5, cy - size + 1);
        ctx.closePath();
        ctx.globalAlpha = currentScale * 0.5;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Current value label
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`I = ${(current * 1000).toFixed(1)} mA`, cx, cy + size + 20);

    // V_C label
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`V_C = ${vC.toFixed(2)} V`, cx + size, cy + size + 20);

    // --- Right: Graphs ---
    const graphX = circW + 30;
    const graphW = W - graphX - 25;
    const graphH = (H - 60) / 2 - 10;

    const history = historyRef.current;
    const maxT = Math.max(tau * 5, t + 0.5);

    // Voltage graph
    const vGraphY = 25;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, vGraphY, graphW + 20, graphH, 6);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText("Capacitor Voltage V_C(t)", graphX, vGraphY + 14);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, vGraphY + 20);
    ctx.lineTo(graphX, vGraphY + graphH - 5);
    ctx.lineTo(graphX + graphW, vGraphY + graphH - 5);
    ctx.stroke();

    // V_max line
    ctx.strokeStyle = "rgba(251,191,36,0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, vGraphY + 22);
    ctx.lineTo(graphX + graphW, vGraphY + 22);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`${voltage}V`, graphX + graphW + 3, vGraphY + 25);

    // tau line
    if (tau < maxT) {
      const tauX = graphX + (tau / maxT) * graphW;
      ctx.strokeStyle = "rgba(239,68,68,0.3)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tauX, vGraphY + 20);
      ctx.lineTo(tauX, vGraphY + graphH - 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("τ", tauX - 3, vGraphY + graphH + 8);
    }

    // Plot V_C
    if (history.length > 1) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const plotH = graphH - 30;
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT) * graphW;
        const py = vGraphY + graphH - 5 - (history[i].vC / voltage) * plotH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Current graph
    const iGraphY = vGraphY + graphH + 20;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, iGraphY, graphW + 20, graphH, 6);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("Current I(t)", graphX, iGraphY + 14);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, iGraphY + 20);
    ctx.lineTo(graphX, iGraphY + graphH - 5);
    ctx.lineTo(graphX + graphW, iGraphY + graphH - 5);
    ctx.stroke();

    // Plot current
    if (history.length > 1) {
      const maxI = voltage / resistance;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const plotH = graphH - 30;
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT) * graphW;
        const py = iGraphY + graphH - 5 - (Math.abs(history[i].i) / maxI) * plotH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tau info
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, H - 35, 180, 25, 4);
    ctx.fill();
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.fillText(`τ = RC = ${(tau * 1000).toFixed(1)} ms | t = ${(t * 1000).toFixed(0)} ms`, 20, H - 18);
  }, [resistance, capacitance, voltage, isCharging, tau]);

  const animate = useCallback(() => {
    timeRef.current += 0.002;
    const t = timeRef.current;
    const vC = isCharging
      ? voltage * (1 - Math.exp(-t / tau))
      : voltage * Math.exp(-t / tau);
    const current = isCharging
      ? (voltage / resistance) * Math.exp(-t / tau)
      : -(voltage / resistance) * Math.exp(-t / tau);

    historyRef.current.push({ t, vC, i: current });
    if (historyRef.current.length > 1000) historyRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [resistance, capacitance, voltage, isCharging, tau, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.5, 440);
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
    historyRef.current = [];
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">R (Ω)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={100} max={10000} step={100} value={resistance}
              onChange={(e) => { setResistance(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{resistance}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">C (µF)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={10} max={1000} step={10} value={capacitance}
              onChange={(e) => { setCapacitance(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{capacitance}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">V (V)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={20} value={voltage}
              onChange={(e) => { setVoltage(Number(e.target.value)); reset(); }}
              className="flex-1 accent-yellow-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{voltage}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={() => { setIsCharging(!isCharging); reset(); }}
            className={`w-full h-9 rounded-lg text-xs font-medium transition-colors ${
              isCharging ? "bg-green-600 text-white" : "bg-orange-500 text-white"
            }`}>
            {isCharging ? "Charging" : "Discharging"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">RC Circuit Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">τ = RC = {(tau*1000).toFixed(1)} ms</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">V_C = V₀(1 − e^(−t/τ))</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">I = (V₀/R)e^(−t/τ)</div>
        </div>
      </div>
    </div>
  );
}
