"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function QuantumTunneling() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [barrierHeight, setBarrierHeight] = useState(1.5);
  const [barrierWidth, setBarrierWidth] = useState(30);
  const [particleEnergy, setParticleEnergy] = useState(1.0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);

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

    const margin = 50;
    const plotH = H * 0.7;
    const plotY = H * 0.15;
    const zeroY = plotY + plotH * 0.6; // Zero potential line
    const barrierX = W * 0.45;
    const bWidth = barrierWidth * 3;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let y = plotY; y <= plotY + plotH; y += 30) {
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(W - margin, y);
      ctx.stroke();
    }

    // Zero potential line
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin, zeroY);
    ctx.lineTo(W - margin, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "right";
    ctx.fillText("V = 0", margin - 5, zeroY + 4);

    // Barrier (potential energy)
    const barrierPixelH = (barrierHeight / 3) * plotH * 0.5;
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fillRect(barrierX, zeroY - barrierPixelH, bWidth, barrierPixelH);
    ctx.strokeStyle = "rgba(239,68,68,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, zeroY);
    ctx.lineTo(barrierX, zeroY);
    ctx.lineTo(barrierX, zeroY - barrierPixelH);
    ctx.lineTo(barrierX + bWidth, zeroY - barrierPixelH);
    ctx.lineTo(barrierX + bWidth, zeroY);
    ctx.lineTo(W - margin, zeroY);
    ctx.stroke();

    // V₀ label
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "left";
    ctx.fillText(`V₀ = ${barrierHeight.toFixed(1)} eV`, barrierX + bWidth + 8, zeroY - barrierPixelH + 5);

    // Energy level line
    const energyPixelH = (particleEnergy / 3) * plotH * 0.5;
    ctx.strokeStyle = "rgba(59,130,246,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(margin, zeroY - energyPixelH);
    ctx.lineTo(barrierX, zeroY - energyPixelH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#3b82f6";
    ctx.font = "11px ui-monospace";
    ctx.textAlign = "right";
    ctx.fillText(`E = ${particleEnergy.toFixed(1)} eV`, margin - 5, zeroY - energyPixelH + 4);

    // Wave function
    const k1 = Math.sqrt(particleEnergy) * 0.15; // wave number outside barrier
    const kappa = Math.sqrt(Math.max(barrierHeight - particleEnergy, 0)) * 0.08; // decay constant inside barrier
    const k2 = k1; // same on other side

    // Transmission coefficient
    const transmissionCoeff = particleEnergy >= barrierHeight
      ? 1
      : Math.exp(-2 * kappa * bWidth);

    const waveAmp = plotH * 0.15;
    const omega = 3;

    // Draw wave function |ψ|² with animation
    ctx.lineWidth = 2.5;

    // Incident wave (left of barrier)
    ctx.strokeStyle = "#3b82f6";
    ctx.shadowColor = "rgba(59,130,246,0.4)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let px = margin; px <= barrierX; px++) {
      const x = px - barrierX;
      const psi = Math.sin(k1 * x - omega * t);
      const py = zeroY - energyPixelH + psi * waveAmp;
      if (px === margin) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Reflected wave (interference creates standing-wave-like pattern near barrier)
    const reflCoeff = Math.sqrt(1 - transmissionCoeff);
    if (reflCoeff > 0.01) {
      ctx.strokeStyle = "rgba(168,85,247,0.4)";
      ctx.beginPath();
      for (let px = margin; px <= barrierX; px++) {
        const x = px - barrierX;
        const psiRef = reflCoeff * Math.sin(-k1 * x - omega * t);
        const py = zeroY - energyPixelH + psiRef * waveAmp;
        if (px === margin) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Wave inside barrier (exponential decay)
    if (particleEnergy < barrierHeight) {
      ctx.strokeStyle = "rgba(239,68,68,0.5)";
      ctx.beginPath();
      for (let px = barrierX; px <= barrierX + bWidth; px++) {
        const x = px - barrierX;
        const decay = Math.exp(-kappa * x);
        const psi = decay * Math.sin(k1 * 0 - omega * t);
        const py = zeroY - energyPixelH + psi * waveAmp;
        if (px === barrierX) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Envelope
      ctx.strokeStyle = "rgba(239,68,68,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let px = barrierX; px <= barrierX + bWidth; px++) {
        const x = px - barrierX;
        const decay = Math.exp(-kappa * x);
        ctx.lineTo(px, zeroY - energyPixelH - decay * waveAmp);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let px = barrierX; px <= barrierX + bWidth; px++) {
        const x = px - barrierX;
        const decay = Math.exp(-kappa * x);
        ctx.lineTo(px, zeroY - energyPixelH + decay * waveAmp);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Transmitted wave (right of barrier)
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(34,197,94,0.4)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    const transAmp = waveAmp * Math.sqrt(transmissionCoeff);
    for (let px = barrierX + bWidth; px <= W - margin; px++) {
      const x = px - (barrierX + bWidth);
      const psi = Math.sin(k2 * x - omega * t) * transAmp / waveAmp;
      const py = zeroY - energyPixelH + psi * waveAmp;
      if (px === barrierX + bWidth) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Labels
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("Incident ψ", barrierX / 2, plotY + 15);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("Transmitted ψ", barrierX + bWidth + (W - margin - barrierX - bWidth) / 2, plotY + 15);

    // Barrier width label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`width = ${barrierWidth}`, barrierX + bWidth / 2, zeroY + 20);

    // Transmission probability panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 230, H - 100, 218, 88, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("TUNNELING DATA", W - 218, H - 90);

    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`T = ${(transmissionCoeff * 100).toFixed(2)}%`, W - 218, H - 72);
    ctx.fillText(`E/V₀ = ${(particleEnergy / barrierHeight).toFixed(2)}`, W - 218, H - 55);

    // Transmission bar
    const tBarW = 150;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.roundRect(W - 218, H - 35, tBarW, 12, 3);
    ctx.fill();

    const tColor = transmissionCoeff > 0.5 ? "#22c55e" : transmissionCoeff > 0.1 ? "#f59e0b" : "#ef4444";
    ctx.fillStyle = tColor;
    ctx.beginPath();
    ctx.roundRect(W - 218, H - 35, tBarW * transmissionCoeff, 12, 3);
    ctx.fill();

    ctx.fillStyle = particleEnergy > barrierHeight ? "#22c55e" : "#f59e0b";
    ctx.font = "10px system-ui";
    ctx.fillText(
      particleEnergy > barrierHeight ? "E > V₀: classically allowed" : "E < V₀: quantum tunneling!",
      W - 218, H - 18
    );

    // Wave equation hint
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, H - 55, 230, 40, 6);
    ctx.fill();
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText("T ≈ exp(−2κL)", 22, H - 40);
    ctx.fillText("κ = √(2m(V₀−E)/ℏ²)", 22, H - 25);
  }, [barrierHeight, barrierWidth, particleEnergy]);

  const animate = useCallback(() => {
    timeRef.current += 0.03;
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Particle Energy</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={3} step={0.1} value={particleEnergy}
              onChange={(e) => setParticleEnergy(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{particleEnergy.toFixed(1)} eV</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Barrier Height</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={3} step={0.1} value={barrierHeight}
              onChange={(e) => setBarrierHeight(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{barrierHeight.toFixed(1)} eV</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Barrier Width</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={5} max={80} value={barrierWidth}
              onChange={(e) => setBarrierWidth(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{barrierWidth}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Quantum Tunneling</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T ≈ e^(−2κL)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">κ = √(2m(V₀−E)/ℏ²)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">−ℏ²/2m · d²ψ/dx² + Vψ = Eψ</div>
        </div>
      </div>
    </div>
  );
}
