"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function DoubleSlit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slitSep, setSlitSep] = useState(40);
  const [wavelength, setWavelength] = useState(500);
  const [slitWidth, setSlitWidth] = useState(8);
  const [showWaves, setShowWaves] = useState(true);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const [isRunning, setIsRunning] = useState(true);

  function wavelengthToRGB(wl: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    if (wl >= 380 && wl < 440) {
      r = -(wl - 440) / (440 - 380);
      b = 1;
    } else if (wl >= 440 && wl < 490) {
      g = (wl - 440) / (490 - 440);
      b = 1;
    } else if (wl >= 490 && wl < 510) {
      g = 1;
      b = -(wl - 510) / (510 - 490);
    } else if (wl >= 510 && wl < 580) {
      r = (wl - 510) / (580 - 510);
      g = 1;
    } else if (wl >= 580 && wl < 645) {
      r = 1;
      g = -(wl - 645) / (645 - 580);
    } else if (wl >= 645 && wl <= 780) {
      r = 1;
    }
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

    const wallX = W * 0.3;
    const screenX = W * 0.85;
    const midY = H / 2;
    const [cr, cg, cb] = wavelengthToRGB(wavelength);
    const color = `rgb(${cr},${cg},${cb})`;

    // Light source
    const sourceX = W * 0.08;
    const sourceGlow = ctx.createRadialGradient(sourceX, midY, 0, sourceX, midY, 40);
    sourceGlow.addColorStop(0, color);
    sourceGlow.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.5)`);
    sourceGlow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = sourceGlow;
    ctx.beginPath();
    ctx.arc(sourceX, midY, 40, 0, Math.PI * 2);
    ctx.fill();

    // Incoming waves
    if (showWaves) {
      const t = timeRef.current;
      const k = (2 * Math.PI) / (wavelength / 15);
      const omega = k * 2;

      for (let x = sourceX + 10; x < wallX - 5; x += 3) {
        const phase = k * x - omega * t;
        const intensity = (Math.sin(phase) + 1) / 2;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${intensity * 0.15})`;
        ctx.fillRect(x, midY - 60, 3, 120);
      }
    }

    // Wall / barrier
    ctx.fillStyle = "#334155";
    ctx.fillRect(wallX - 4, 0, 8, midY - slitSep / 2 - slitWidth / 2);
    ctx.fillRect(wallX - 4, midY - slitSep / 2 + slitWidth / 2, 8, slitSep - slitWidth);
    ctx.fillRect(wallX - 4, midY + slitSep / 2 + slitWidth / 2, 8, H);

    // Slit labels
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "right";
    ctx.fillText("slit 1", wallX - 10, midY - slitSep / 2);
    ctx.fillText("slit 2", wallX - 10, midY + slitSep / 2);

    // Diffraction pattern on screen
    const patternH = H;
    const barW = 20;

    // Calculate intensity at each point on the screen
    const lambda = wavelength / 800; // scale
    const d = slitSep;
    const a = slitWidth;
    const L = screenX - wallX;

    for (let py = 0; py < patternH; py++) {
      const y = py - midY;
      const theta = Math.atan2(y, L);
      const sinTheta = Math.sin(theta);

      // Double-slit: I = I0 * cos²(πd·sinθ/λ) * sinc²(πa·sinθ/λ)
      const beta = (Math.PI * a * sinTheta) / lambda;
      const alpha = (Math.PI * d * sinTheta) / lambda;

      const singleSlit = beta !== 0 ? Math.sin(beta) / beta : 1;
      const doubleSlit = Math.cos(alpha);
      const intensity = singleSlit * singleSlit * doubleSlit * doubleSlit;

      ctx.fillStyle = `rgba(${cr},${cg},${cb},${intensity})`;
      ctx.fillRect(screenX - barW / 2, py, barW, 1);
    }

    // Screen border
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX + barW / 2 + 2, 0);
    ctx.lineTo(screenX + barW / 2 + 2, H);
    ctx.stroke();

    // Wave propagation from slits
    if (showWaves) {
      const t = timeRef.current;
      const k = (2 * Math.PI) / (wavelength / 15);
      const omega = k * 2;
      const slit1Y = midY - slitSep / 2;
      const slit2Y = midY + slitSep / 2;

      // Draw circular waves from each slit
      for (let r = 0; r < 300; r += wavelength / 15) {
        const phase = k * r - omega * t;
        const alpha = Math.max(0, 0.08 * (1 - r / 300) * ((Math.sin(phase) + 1) / 2));

        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.lineWidth = 2;

        // Slit 1
        ctx.beginPath();
        ctx.arc(wallX, slit1Y, r, -Math.PI / 2.5, Math.PI / 2.5);
        ctx.stroke();

        // Slit 2
        ctx.beginPath();
        ctx.arc(wallX, slit2Y, r, -Math.PI / 2.5, Math.PI / 2.5);
        ctx.stroke();
      }
    }

    // Intensity graph
    const graphX = screenX + barW / 2 + 15;
    const graphW = W - graphX - 10;
    if (graphW > 30) {
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX, 0);
      ctx.lineTo(graphX, H);
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let py = 0; py < H; py++) {
        const y = py - midY;
        const theta = Math.atan2(y, L);
        const sinTheta = Math.sin(theta);
        const beta = (Math.PI * a * sinTheta) / lambda;
        const alphaVal = (Math.PI * d * sinTheta) / lambda;
        const singleSlit = beta !== 0 ? Math.sin(beta) / beta : 1;
        const doubleSlit = Math.cos(alphaVal);
        const intensity = singleSlit * singleSlit * doubleSlit * doubleSlit;

        const gx = graphX + intensity * graphW * 0.9;
        if (py === 0) ctx.moveTo(gx, py);
        else ctx.lineTo(gx, py);
      }
      ctx.stroke();

      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText("I(θ)", graphX + graphW / 2, 15);
    }
  }, [slitSep, wavelength, slitWidth, showWaves]);

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
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Separation</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={15} max={100} value={slitSep}
              onChange={(e) => setSlitSep(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{slitSep}</span>
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
            <span className="text-sm font-mono font-bold min-w-[3rem] text-right" style={{ color: `rgb(${wavelengthToRGB(wavelength).join(",")})` }}>
              {wavelength}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Width</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={2} max={30} value={slitWidth}
              onChange={(e) => setSlitWidth(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2rem] text-right">{slitWidth}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setShowWaves(!showWaves)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showWaves ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Waves {showWaves ? "ON" : "OFF"}
          </button>
          <button onClick={() => setIsRunning(!isRunning)}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Double-Slit Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">d sin(θ) = mλ (maxima)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">d sin(θ) = (m+½)λ (minima)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">I = I₀ cos²(πd sinθ/λ)</div>
        </div>
      </div>
    </div>
  );
}
