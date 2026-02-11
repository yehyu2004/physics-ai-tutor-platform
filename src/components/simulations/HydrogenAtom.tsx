"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function HydrogenAtom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedN, setSelectedN] = useState(1);
  const [showProbability, setShowProbability] = useState(true);
  const animRef = useRef<number>(0);
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
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // --- Left: Atom visualization ---
    const atomX = W * 0.32;
    const atomY = H * 0.5;
    const maxR = Math.min(W * 0.28, H * 0.42);

    // Orbital probability clouds for all levels
    for (let n = 5; n >= 1; n--) {
      const bohrR = (n * n) * maxR / 25; // Bohr radius scales as n²
      const isSelected = n === selectedN;

      if (showProbability && bohrR < maxR) {
        // Radial probability density |ψ|² ∝ r² R²(r)
        // Draw as concentric rings with varying opacity
        for (let r = 0; r < bohrR * 1.8; r += 2) {
          const rNorm = r / bohrR;
          // Simplified radial probability for 1s, 2s, 3s etc
          let prob: number;
          if (n === 1) prob = 4 * rNorm * rNorm * Math.exp(-2 * rNorm);
          else if (n === 2) prob = rNorm * rNorm * (2 - rNorm) ** 2 * Math.exp(-rNorm) / 8;
          else prob = rNorm * rNorm * Math.exp(-2 * rNorm / n) * (1 + 0.5 * Math.sin(rNorm * n)) ** 2;

          const alpha = prob * (isSelected ? 0.15 : 0.04);
          if (alpha < 0.002) continue;

          const color = isSelected ? "59,130,246" : "148,163,184";
          ctx.strokeStyle = `rgba(${color},${Math.min(alpha, 0.3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(atomX, atomY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Bohr orbit (dashed circle)
      if (bohrR < maxR) {
        ctx.strokeStyle = isSelected ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash(isSelected ? [] : [3, 5]);
        ctx.beginPath();
        ctx.arc(atomX, atomY, bohrR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Level label
        ctx.fillStyle = isSelected ? "#3b82f6" : "rgba(255,255,255,0.15)";
        ctx.font = isSelected ? "bold 11px ui-monospace" : "9px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(`n=${n}`, atomX + bohrR + 5, atomY - 3);
      }
    }

    // Nucleus
    const nucGlow = ctx.createRadialGradient(atomX, atomY, 0, atomX, atomY, 15);
    nucGlow.addColorStop(0, "rgba(239,68,68,0.5)");
    nucGlow.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = nucGlow;
    ctx.beginPath();
    ctx.arc(atomX, atomY, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(atomX, atomY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("p⁺", atomX, atomY);

    // Electron on selected orbit
    const eBohrR = (selectedN * selectedN) * maxR / 25;
    if (eBohrR < maxR) {
      const eAngle = t * (3 / selectedN);
      const ex = atomX + eBohrR * Math.cos(eAngle);
      const ey = atomY + eBohrR * Math.sin(eAngle);

      const eGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 12);
      eGlow.addColorStop(0, "rgba(59,130,246,0.5)");
      eGlow.addColorStop(1, "rgba(59,130,246,0)");
      ctx.fillStyle = eGlow;
      ctx.beginPath();
      ctx.arc(ex, ey, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Right: Energy level diagram ---
    const elvX = W * 0.68;
    const elvW = W * 0.28;
    const elvY = 30;
    const elvH = H - 60;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(elvX - 15, elvY - 15, elvW + 30, elvH + 30, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("ENERGY LEVELS", elvX + elvW / 2, elvY);

    // E_n = -13.6/n² eV
    const E1 = -13.6;
    const maxE = 0;
    const minE = E1;
    const eRange = maxE - minE;

    // Ionization level (E = 0)
    const zeroY = elvY + 20;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(elvX, zeroY);
    ctx.lineTo(elvX + elvW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#64748b";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "right";
    ctx.fillText("0 eV (free)", elvX - 5, zeroY + 3);

    for (let n = 1; n <= 6; n++) {
      const En = -13.6 / (n * n);
      const ly = zeroY + ((0 - En) / eRange) * (elvH - 40);
      const isActive = n === selectedN;

      ctx.strokeStyle = isActive ? "#fbbf24" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isActive ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(elvX, ly);
      ctx.lineTo(elvX + elvW, ly);
      ctx.stroke();

      ctx.fillStyle = isActive ? "#fbbf24" : "#64748b";
      ctx.font = isActive ? "bold 11px ui-monospace" : "10px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`n=${n}`, elvX + elvW + 5, ly + 4);
      ctx.textAlign = "right";
      ctx.fillText(`${En.toFixed(2)} eV`, elvX - 5, ly + 4);
    }

    // Transition arrows (if n > 1, show possible photon emissions)
    if (selectedN > 1) {
      for (let nf = 1; nf < selectedN; nf++) {
        const Ei = -13.6 / (selectedN * selectedN);
        const Ef = -13.6 / (nf * nf);
        const yi = zeroY + ((0 - Ei) / eRange) * (elvH - 40);
        const yf = zeroY + ((0 - Ef) / eRange) * (elvH - 40);
        const photonE = Ei - Ef;

        // Wavy photon arrow
        ctx.strokeStyle = "rgba(168,85,247,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ax = elvX + elvW * 0.3 + nf * 15;
        for (let py = yi; py <= yf; py += 2) {
          const px = ax + Math.sin((py - yi) * 0.3) * 5;
          if (py === yi) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Photon energy label
        ctx.fillStyle = "rgba(168,85,247,0.6)";
        ctx.font = "8px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${Math.abs(photonE).toFixed(1)}eV`, ax + 8, (yi + yf) / 2);
      }
    }
  }, [selectedN, showProbability]);

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
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Energy Level (n)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={6} value={selectedN}
              onChange={(e) => setSelectedN(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">n = {selectedN}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <div>E = <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{(-13.6 / (selectedN * selectedN)).toFixed(2)} eV</span></div>
            <div>r = <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{(selectedN * selectedN * 0.0529).toFixed(3)} nm</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowProbability(!showProbability)}
            className={`w-full h-10 rounded-lg text-sm font-medium ${
              showProbability ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            |ψ|² Cloud {showProbability ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Hydrogen Atom</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E_n = −13.6/n² eV</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">r_n = n²a₀ (a₀ = 0.053nm)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ΔE = 13.6(1/n²f − 1/n²i)</div>
        </div>
      </div>
    </div>
  );
}
