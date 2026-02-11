"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function AngularMomentum() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [armExtension, setArmExtension] = useState(1.0); // 0 = tucked, 1 = extended
  const [initialOmega, setInitialOmega] = useState(2); // rad/s
  const [isRunning, setIsRunning] = useState(true);

  const angleRef = useRef(0);
  const timeRef = useRef(0);

  // Moment of inertia model: I = I_body + I_arms
  // I_body ~ 3 kg*m^2, I_arms varies from 0.5 (tucked) to 6 (extended)
  const getI = useCallback((ext: number) => {
    return 3 + ext * 5.5; // range: 3.0 to 8.5 kg*m^2
  }, []);

  // L = I_initial * omega_initial (conserved)
  const I_initial = getI(1.0);
  const L = I_initial * initialOmega;

  const getCurrentOmega = useCallback((ext: number) => {
    const I = getI(ext);
    return L / I;
  }, [L, getI]);

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

    // Stars
    for (let i = 0; i < 40; i++) {
      const sx = ((37 * (i + 1) * 7) % W);
      const sy = ((37 * (i + 1) * 13) % H);
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 4) * 0.08})`;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 1.2 : 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const omega = getCurrentOmega(armExtension);
    const I = getI(armExtension);
    const angle = angleRef.current;

    // --- Left side: Skater top view ---
    const cx = W * 0.35;
    const cy = H * 0.45;

    // Ice rink circle
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.stroke();

    // Rotation indicator ring
    ctx.strokeStyle = `rgba(139,92,246,${0.2 + Math.abs(Math.sin(angle)) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw skater (top view, rotating)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Body (center disc)
    const bodyRadius = 18;
    const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, bodyRadius);
    bodyGrad.addColorStop(0, "#a78bfa");
    bodyGrad.addColorStop(1, "#7c3aed");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, bodyRadius, 0, Math.PI * 2);
    ctx.fill();

    // Glow
    const glow = ctx.createRadialGradient(0, 0, bodyRadius, 0, 0, bodyRadius + 15);
    glow.addColorStop(0, "rgba(167,139,250,0.3)");
    glow.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, bodyRadius + 15, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    const armLen = 20 + armExtension * 55; // 20 to 75 px
    const armWidth = 6;
    ctx.fillStyle = "#c4b5fd";
    // Left arm
    ctx.beginPath();
    ctx.roundRect(-armLen, -armWidth / 2, armLen - bodyRadius + 5, armWidth, 3);
    ctx.fill();
    // Right arm
    ctx.beginPath();
    ctx.roundRect(bodyRadius - 5, -armWidth / 2, armLen - bodyRadius + 5, armWidth, 3);
    ctx.fill();

    // Hands
    ctx.fillStyle = "#ddd6fe";
    ctx.beginPath();
    ctx.arc(-armLen, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(armLen, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Head indicator
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(0, -bodyRadius - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Speed indicator arcs
    const speedArcs = Math.min(Math.floor(omega / 2), 8);
    for (let i = 0; i < speedArcs; i++) {
      ctx.strokeStyle = `rgba(167,139,250,${0.15 + i * 0.05})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 85 + i * 8, angle + i * 0.5, angle + i * 0.5 + 0.8);
      ctx.stroke();
    }

    // --- Right side: Info panel ---
    const panelX = W * 0.58;
    const panelW = W * 0.38;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(panelX, 20, panelW, H - 40, 10);
    ctx.fill();

    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ANGULAR MOMENTUM", panelX + 15, 45);

    const lineH = 28;
    let y = 70;

    // L (conserved)
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`L = ${L.toFixed(1)} kg m^2/s`, panelX + 15, y);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("(conserved)", panelX + 15 + 170, y);
    y += lineH + 5;

    // I
    ctx.font = "13px ui-monospace, monospace";
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`I = ${I.toFixed(2)} kg m^2`, panelX + 15, y);
    y += lineH;

    // omega
    ctx.fillStyle = "#22c55e";
    ctx.fillText(`omega = ${omega.toFixed(2)} rad/s`, panelX + 15, y);
    y += lineH;

    // KE_rot
    const KE = 0.5 * I * omega * omega;
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`KE_rot = ${KE.toFixed(1)} J`, panelX + 15, y);
    y += lineH;

    // Period
    const period = omega > 0 ? (2 * Math.PI) / omega : Infinity;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`T = ${period < 100 ? period.toFixed(2) : "---"} s`, panelX + 15, y);
    y += lineH + 10;

    // Bar visualizations
    const barW2 = panelW - 40;
    const barH2 = 16;

    // I bar
    ctx.fillStyle = "#1e1b4b";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
    ctx.fill();
    ctx.fillStyle = "#a78bfa";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2 * (I / 10), barH2, 4);
    ctx.fill();
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.fillText("I", panelX + 15 + barW2 + 5, y + 12);
    y += barH2 + 8;

    // omega bar
    ctx.fillStyle = "#052e16";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    const maxOmega = L / 3; // max omega when I is minimum
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2 * Math.min(omega / maxOmega, 1), barH2, 4);
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("omega", panelX + 15 + barW2 + 5, y + 12);
    y += barH2 + 8;

    // KE bar
    ctx.fillStyle = "#172554";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
    ctx.fill();
    ctx.fillStyle = "#3b82f6";
    const maxKE = 0.5 * 3 * maxOmega * maxOmega;
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2 * Math.min(KE / maxKE, 1), barH2, 4);
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("KE", panelX + 15 + barW2 + 5, y + 12);
  }, [armExtension, getCurrentOmega, getI, L]);

  const animate = useCallback(() => {
    const omega = getCurrentOmega(armExtension);
    angleRef.current += omega * 0.016;
    timeRef.current += 0.016;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [armExtension, getCurrentOmega, draw]);

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
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Arm Extension</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={1} step={0.01} value={armExtension}
              onChange={(e) => setArmExtension(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {(armExtension * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial omega (rad/s)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={6} step={0.1} value={initialOmega}
              onChange={(e) => setInitialOmega(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {initialOmega.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => { angleRef.current = 0; timeRef.current = 0; draw(); }}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset Angle
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">L = I omega = const</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">KE = 1/2 I omega^2</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">I_1 omega_1 = I_2 omega_2</div>
        </div>
      </div>
    </div>
  );
}
