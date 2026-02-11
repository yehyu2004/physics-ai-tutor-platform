"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function HeatEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [tHot, setTHot] = useState(600); // K
  const [tCold, setTCold] = useState(300); // K
  const [isRunning, setIsRunning] = useState(true);

  const progressRef = useRef(0); // 0 to 4 (4 stages of Carnot cycle)
  const timeRef = useRef(0);

  // Carnot efficiency
  const efficiency = 1 - tCold / tHot;

  // PV diagram points for Carnot cycle
  // Stage 0-1: Isothermal expansion at T_hot (A->B)
  // Stage 1-2: Adiabatic expansion (B->C)
  // Stage 2-3: Isothermal compression at T_cold (C->D)
  // Stage 3-4: Adiabatic compression (D->A)
  const nMoles = 1;
  const R = 8.314;
  const gamma = 5 / 3; // monatomic ideal gas

  const getCarnotPoints = useCallback(() => {
    // Volumes
    const V_A = 1;
    const V_B = 3;
    // Adiabatic: T*V^(gamma-1) = const
    const V_C = V_B * Math.pow(tHot / tCold, 1 / (gamma - 1));
    const V_D = V_A * Math.pow(tHot / tCold, 1 / (gamma - 1));

    return {
      A: { V: V_A, P: nMoles * R * tHot / V_A },
      B: { V: V_B, P: nMoles * R * tHot / V_B },
      C: { V: V_C, P: nMoles * R * tCold / V_C },
      D: { V: V_D, P: nMoles * R * tCold / V_D },
    };
  }, [tHot, tCold, gamma]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const progress = progressRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const pts = getCarnotPoints();

    // --- Left: PV Diagram ---
    const pvX = 60;
    const pvY = 40;
    const pvW = W * 0.5 - 80;
    const pvH = H - 80;

    // Find ranges
    const allV = [pts.A.V, pts.B.V, pts.C.V, pts.D.V];
    const allP = [pts.A.P, pts.B.P, pts.C.P, pts.D.P];
    const maxV = Math.max(...allV) * 1.15;
    const maxP = Math.max(...allP) * 1.15;

    const toX = (v: number) => pvX + (v / maxV) * pvW;
    const toY = (p: number) => pvY + pvH - (p / maxP) * pvH;

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pvX, pvY);
    ctx.lineTo(pvX, pvY + pvH);
    ctx.lineTo(pvX + pvW, pvY + pvH);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("V (m^3)", pvX + pvW / 2, pvY + pvH + 20);
    ctx.save();
    ctx.translate(pvX - 25, pvY + pvH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("P (Pa)", 0, 0);
    ctx.restore();

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(pvX, pvY + (pvH * i) / 6);
      ctx.lineTo(pvX + pvW, pvY + (pvH * i) / 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pvX + (pvW * i) / 6, pvY);
      ctx.lineTo(pvX + (pvW * i) / 6, pvY + pvH);
      ctx.stroke();
    }

    // Draw cycle path with shading
    ctx.fillStyle = "rgba(139,92,246,0.08)";
    ctx.beginPath();

    // A->B isothermal at T_hot
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.A.V + (pts.B.V - pts.A.V) * f;
      const p = nMoles * R * tHot / v;
      if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
    }
    // B->C adiabatic
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.B.V + (pts.C.V - pts.B.V) * f;
      const t = tHot * Math.pow(pts.B.V / v, gamma - 1);
      const p = nMoles * R * t / v;
      ctx.lineTo(toX(v), toY(p));
    }
    // C->D isothermal at T_cold
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.C.V + (pts.D.V - pts.C.V) * f;
      const p = nMoles * R * tCold / v;
      ctx.lineTo(toX(v), toY(p));
    }
    // D->A adiabatic
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.D.V + (pts.A.V - pts.D.V) * f;
      const t = tCold * Math.pow(pts.D.V / v, gamma - 1);
      const p = nMoles * R * t / v;
      ctx.lineTo(toX(v), toY(p));
    }
    ctx.closePath();
    ctx.fill();

    // Draw cycle lines
    const stageColors = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];
    const stageNames = ["Isothermal Expansion", "Adiabatic Expansion", "Isothermal Compression", "Adiabatic Compression"];

    // A->B (red)
    ctx.strokeStyle = stageColors[0];
    ctx.lineWidth = progress >= 0 && progress < 1 ? 3 : 2;
    ctx.shadowColor = progress >= 0 && progress < 1 ? stageColors[0] : "transparent";
    ctx.shadowBlur = progress >= 0 && progress < 1 ? 8 : 0;
    ctx.beginPath();
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.A.V + (pts.B.V - pts.A.V) * f;
      const p = nMoles * R * tHot / v;
      if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // B->C (orange)
    ctx.strokeStyle = stageColors[1];
    ctx.lineWidth = progress >= 1 && progress < 2 ? 3 : 2;
    ctx.shadowColor = progress >= 1 && progress < 2 ? stageColors[1] : "transparent";
    ctx.shadowBlur = progress >= 1 && progress < 2 ? 8 : 0;
    ctx.beginPath();
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.B.V + (pts.C.V - pts.B.V) * f;
      const t = tHot * Math.pow(pts.B.V / v, gamma - 1);
      const p = nMoles * R * t / v;
      if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // C->D (blue)
    ctx.strokeStyle = stageColors[2];
    ctx.lineWidth = progress >= 2 && progress < 3 ? 3 : 2;
    ctx.shadowColor = progress >= 2 && progress < 3 ? stageColors[2] : "transparent";
    ctx.shadowBlur = progress >= 2 && progress < 3 ? 8 : 0;
    ctx.beginPath();
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.C.V + (pts.D.V - pts.C.V) * f;
      const p = nMoles * R * tCold / v;
      if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // D->A (green)
    ctx.strokeStyle = stageColors[3];
    ctx.lineWidth = progress >= 3 ? 3 : 2;
    ctx.shadowColor = progress >= 3 ? stageColors[3] : "transparent";
    ctx.shadowBlur = progress >= 3 ? 8 : 0;
    ctx.beginPath();
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.D.V + (pts.A.V - pts.D.V) * f;
      const t = tCold * Math.pow(pts.D.V / v, gamma - 1);
      const p = nMoles * R * t / v;
      if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current position indicator
    const stage = Math.floor(progress) % 4;
    const frac = progress - stage;
    let curV = 0, curP = 0;

    if (stage === 0) {
      curV = pts.A.V + (pts.B.V - pts.A.V) * frac;
      curP = nMoles * R * tHot / curV;
    } else if (stage === 1) {
      curV = pts.B.V + (pts.C.V - pts.B.V) * frac;
      const curT = tHot * Math.pow(pts.B.V / curV, gamma - 1);
      curP = nMoles * R * curT / curV;
    } else if (stage === 2) {
      curV = pts.C.V + (pts.D.V - pts.C.V) * frac;
      curP = nMoles * R * tCold / curV;
    } else {
      curV = pts.D.V + (pts.A.V - pts.D.V) * frac;
      const curT = tCold * Math.pow(pts.D.V / curV, gamma - 1);
      curP = nMoles * R * curT / curV;
    }

    // Dot glow
    const dotGrad = ctx.createRadialGradient(toX(curV), toY(curP), 0, toX(curV), toY(curP), 15);
    dotGrad.addColorStop(0, `${stageColors[stage]}80`);
    dotGrad.addColorStop(1, "transparent");
    ctx.fillStyle = dotGrad;
    ctx.beginPath();
    ctx.arc(toX(curV), toY(curP), 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(toX(curV), toY(curP), 5, 0, Math.PI * 2);
    ctx.fill();

    // Point labels
    const pointNames = ["A", "B", "C", "D"];
    const pointArr = [pts.A, pts.B, pts.C, pts.D];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(pointNames[i], toX(pointArr[i].V), toY(pointArr[i].P) - 10);
    }

    // --- Right: Info panel ---
    const panelX = W * 0.55;
    const panelW2 = W * 0.42;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(panelX, 15, panelW2, H - 30, 10);
    ctx.fill();

    let y = 40;
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CARNOT ENGINE", panelX + 15, y);
    y += 30;

    // Current stage
    ctx.fillStyle = stageColors[stage];
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillText(`Stage: ${stageNames[stage]}`, panelX + 15, y);
    y += 25;

    // Temperatures
    ctx.fillStyle = "#ef4444";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(`T_hot  = ${tHot} K`, panelX + 15, y);
    y += 20;
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`T_cold = ${tCold} K`, panelX + 15, y);
    y += 25;

    // Efficiency
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.fillText(`eta = ${(efficiency * 100).toFixed(1)}%`, panelX + 15, y);
    y += 30;

    // Heat and Work
    const Q_H = nMoles * R * tHot * Math.log(pts.B.V / pts.A.V);
    const Q_C = nMoles * R * tCold * Math.log(pts.C.V / pts.D.V);
    const W_net = Q_H - Q_C;

    ctx.fillStyle = "#ef4444";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`Q_H = ${Q_H.toFixed(0)} J`, panelX + 15, y);
    y += 20;
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`Q_C = ${Q_C.toFixed(0)} J`, panelX + 15, y);
    y += 20;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`W_net = ${W_net.toFixed(0)} J`, panelX + 15, y);
    y += 30;

    // Current state
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`V = ${curV.toFixed(2)} m^3`, panelX + 15, y);
    y += 18;
    ctx.fillText(`P = ${curP.toFixed(0)} Pa`, panelX + 15, y);
    y += 30;

    // Legend
    ctx.font = "9px ui-monospace, monospace";
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = stageColors[i];
      ctx.fillRect(panelX + 15, y - 7, 10, 10);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(stageNames[i], panelX + 30, y);
      y += 16;
    }
  }, [tHot, tCold, efficiency, getCarnotPoints, gamma]);

  const animate = useCallback(() => {
    progressRef.current += 0.008;
    if (progressRef.current >= 4) progressRef.current = 0;
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">T_hot (K)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={400} max={1000} step={10} value={tHot}
              onChange={(e) => setTHot(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{tHot}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">T_cold (K)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={200} max={tHot - 50} step={10} value={tCold}
              onChange={(e) => setTCold(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{tCold}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => { progressRef.current = 0; draw(); }}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset Cycle
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">eta_Carnot = 1 - T_C/T_H</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">W = Q_H - Q_C</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">eta = W/Q_H = {(efficiency * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}
