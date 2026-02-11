"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function DiffractionGrating() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numSlits, setNumSlits] = useState(6);
  const [slitSpacing, setSlitSpacing] = useState(40);
  const [wavelength, setWavelength] = useState(550);

  function wavelengthToRGB(wl: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    if (wl >= 380 && wl < 440) { r = -(wl - 440) / 60; b = 1; }
    else if (wl >= 440 && wl < 490) { g = (wl - 440) / 50; b = 1; }
    else if (wl >= 490 && wl < 510) { g = 1; b = -(wl - 510) / 20; }
    else if (wl >= 510 && wl < 580) { r = (wl - 510) / 70; g = 1; }
    else if (wl >= 580 && wl < 645) { r = 1; g = -(wl - 645) / 65; }
    else if (wl >= 645 && wl <= 780) { r = 1; }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    const [cr, cg, cb] = wavelengthToRGB(wavelength);
    const gratingX = W * 0.25;
    const screenX = W * 0.85;
    const midY = H / 2;

    // Grating barrier
    ctx.fillStyle = "#334155";
    const slitW = 3;
    const totalH = slitSpacing * (numSlits - 1);
    const startY = midY - totalH / 2;

    // Fill barrier, leave slits open
    ctx.fillRect(gratingX - 4, 0, 8, startY - slitW);
    for (let i = 0; i < numSlits - 1; i++) {
      const y = startY + i * slitSpacing + slitW;
      ctx.fillRect(gratingX - 4, y, 8, slitSpacing - slitW * 2);
    }
    ctx.fillRect(gratingX - 4, startY + totalH + slitW, 8, H - startY - totalH - slitW);

    // Slit markers
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "right";
    for (let i = 0; i < numSlits; i++) {
      const y = startY + i * slitSpacing;
      ctx.fillText(`${i + 1}`, gratingX - 10, y + 3);
    }

    // Calculate diffraction pattern: I = (sin(Nβ)/sin(β))² × (sinα/α)²
    // where β = πd·sinθ/λ, α = πa·sinθ/λ
    const d = slitSpacing;
    const lambda = wavelength / 15;
    const L = screenX - gratingX;
    const barW = 18;

    for (let py = 0; py < H; py++) {
      const y = py - midY;
      const sinTheta = y / Math.sqrt(y * y + L * L);

      const beta = (Math.PI * d * sinTheta) / lambda;
      const sinNBeta = Math.sin(numSlits * beta);
      const sinBeta = Math.sin(beta);

      let intensity: number;
      if (Math.abs(sinBeta) < 0.001) {
        intensity = numSlits * numSlits; // principal maximum
      } else {
        intensity = (sinNBeta / sinBeta) ** 2;
      }
      intensity /= (numSlits * numSlits); // normalize to 1

      ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(intensity, 1)})`;
      ctx.fillRect(screenX - barW / 2, py, barW, 1);
    }

    // Screen edge
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX + barW / 2 + 2, 0);
    ctx.lineTo(screenX + barW / 2 + 2, H);
    ctx.stroke();

    // Intensity graph
    const graphX = screenX + barW / 2 + 15;
    const graphW2 = W - graphX - 10;
    if (graphW2 > 30) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX, 0);
      ctx.lineTo(graphX, H);
      ctx.stroke();

      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let py = 0; py < H; py += 1) {
        const y = py - midY;
        const sinTheta = y / Math.sqrt(y * y + L * L);
        const beta = (Math.PI * d * sinTheta) / lambda;
        const sinNBeta = Math.sin(numSlits * beta);
        const sinBeta = Math.sin(beta);
        const intensity = Math.abs(sinBeta) < 0.001
          ? 1
          : (sinNBeta / sinBeta) ** 2 / (numSlits * numSlits);
        const gx = graphX + Math.min(intensity, 1) * graphW2 * 0.9;
        if (py === 0) ctx.moveTo(gx, py);
        else ctx.lineTo(gx, py);
      }
      ctx.stroke();

      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText("I(θ)", graphX + graphW2 / 2, 12);
    }

    // Order labels (m = 0, ±1, ±2, ...)
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    for (let m = -3; m <= 3; m++) {
      const sinTheta = (m * lambda) / d;
      if (Math.abs(sinTheta) >= 1) continue;
      const y = midY + L * sinTheta / Math.sqrt(1 - sinTheta * sinTheta);
      if (y > 10 && y < H - 10) {
        ctx.fillText(`m=${m}`, screenX + barW / 2 + 5, y + 3);
      }
    }

    // Info
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 175, 65, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("GRATING DATA", 22, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`N = ${numSlits} slits`, 22, 45);
    ctx.fillText(`λ = ${wavelength} nm`, 22, 60);
    ctx.fillText(`d = ${slitSpacing} (arb)`, 22, 75);
  }, [numSlits, slitSpacing, wavelength]);

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

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Number of Slits</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={2} max={20} value={numSlits}
              onChange={(e) => setNumSlits(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{numSlits}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Spacing</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={15} max={80} value={slitSpacing}
              onChange={(e) => setSlitSpacing(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{slitSpacing}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wavelength (nm)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={380} max={700} value={wavelength}
              onChange={(e) => setWavelength(Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: `rgb(${wavelengthToRGB(wavelength).join(",")})` }}
            />
            <span className="text-sm font-mono font-bold" style={{ color: `rgb(${wavelengthToRGB(wavelength).join(",")})` }}>{wavelength}</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Diffraction Grating</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">d sinθ = mλ (maxima)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">I ∝ (sin(Nβ)/sin(β))²</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">N slits → sharper peaks</div>
        </div>
      </div>
    </div>
  );
}
