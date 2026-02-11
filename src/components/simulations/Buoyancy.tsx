"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function Buoyancy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [objectDensity, setObjectDensity] = useState(500);
  const [fluidDensity, setFluidDensity] = useState(1000);
  const [objectSize, setObjectSize] = useState(60);
  const [isRunning, setIsRunning] = useState(true);

  const posRef = useRef(0.2);
  const velRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

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

    const waterLevel = H * 0.35;
    const objY = posRef.current * H;
    const objX = W * 0.35;
    const objR = objectSize / 2;

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, waterLevel);
    skyGrad.addColorStop(0, "#1e3a5f");
    skyGrad.addColorStop(1, "#0f2847");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, waterLevel);

    // Water
    const waterGrad = ctx.createLinearGradient(0, waterLevel, 0, H);
    waterGrad.addColorStop(0, "rgba(14, 116, 144, 0.6)");
    waterGrad.addColorStop(1, "rgba(8, 51, 68, 0.8)");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, waterLevel, W, H - waterLevel);

    // Water surface ripple
    ctx.strokeStyle = "rgba(103, 232, 249, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < W; x += 2) {
      const y = waterLevel + Math.sin(x * 0.03 + Date.now() * 0.002) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Object
    const submergedFraction = Math.max(0, Math.min(1, (objY + objR - waterLevel) / (objR * 2)));
    const densityRatio = objectDensity / 2000;
    const r = Math.round(100 + densityRatio * 155);
    const g = Math.round(150 - densityRatio * 100);
    const b = Math.round(200 - densityRatio * 150);

    // Object shadow in water
    if (submergedFraction > 0) {
      ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
      ctx.beginPath();
      ctx.ellipse(objX, objY + objR + 10, objR * 0.8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Object body
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.strokeStyle = `rgba(255,255,255,0.2)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(objX - objR, objY - objR, objR * 2, objR * 2, 6);
    ctx.fill();
    ctx.stroke();

    // Density label on object
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${objectDensity}`, objX, objY - 5);
    ctx.font = "9px system-ui";
    ctx.fillText("kg/m³", objX, objY + 10);

    // Force arrows
    const vol = (objectSize / 100) ** 3;
    const weight = objectDensity * vol * 9.8;
    const subVol = vol * submergedFraction;
    const buoyantForce = fluidDensity * subVol * 9.8;
    const maxF = Math.max(weight, buoyantForce, 1) * 1.2;
    const arrowScale = 80 / maxF;

    // Weight (down)
    const wLen = weight * arrowScale;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(objX + objR + 20, objY);
    ctx.lineTo(objX + objR + 20, objY + wLen);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(objX + objR + 20, objY + wLen);
    ctx.lineTo(objX + objR + 15, objY + wLen - 8);
    ctx.lineTo(objX + objR + 25, objY + wLen - 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`W = ${weight.toFixed(1)} N`, objX + objR + 30, objY + wLen / 2);

    // Buoyant force (up)
    if (buoyantForce > 0.1) {
      const bLen = buoyantForce * arrowScale;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(objX - objR - 20, objY);
      ctx.lineTo(objX - objR - 20, objY - bLen);
      ctx.stroke();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(objX - objR - 20, objY - bLen);
      ctx.lineTo(objX - objR - 25, objY - bLen + 8);
      ctx.lineTo(objX - objR - 15, objY - bLen + 8);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = "right";
      ctx.fillText(`F_b = ${buoyantForce.toFixed(1)} N`, objX - objR - 30, objY - bLen / 2);
    }

    // Waterline marker
    ctx.fillStyle = "rgba(103,232,249,0.5)";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText("water surface", 15, waterLevel - 10);

    // Info panel
    const equilibriumFraction = objectDensity / fluidDensity;
    const status = equilibriumFraction >= 1 ? "SINKS" : "FLOATS";

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 220, 12, 208, 115, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("BUOYANCY DATA", W - 208, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`ρ_obj = ${objectDensity} kg/m³`, W - 208, 46);
    ctx.fillText(`ρ_fluid = ${fluidDensity} kg/m³`, W - 208, 62);
    ctx.fillText(`Submerged: ${(submergedFraction * 100).toFixed(0)}%`, W - 208, 78);
    ctx.fillText(`ρ_obj/ρ_fluid = ${equilibriumFraction.toFixed(2)}`, W - 208, 94);
    ctx.fillStyle = status === "FLOATS" ? "#22c55e" : "#ef4444";
    ctx.font = "bold 12px ui-monospace";
    ctx.fillText(status, W - 208, 114);

    // Fluid density label
    ctx.fillStyle = "rgba(103,232,249,0.4)";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`ρ = ${fluidDensity} kg/m³`, W / 2, H - 20);
  }, [objectDensity, fluidDensity, objectSize]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const H = canvas.height;
    const waterLevel = H * 0.35;
    const objR = objectSize / 2;
    const objY = posRef.current * H;

    const vol = (objectSize / 100) ** 3;
    const submergedFraction = Math.max(0, Math.min(1, (objY + objR - waterLevel) / (objR * 2)));
    const subVol = vol * submergedFraction;

    const weight = objectDensity * vol * 9.8;
    const buoyantForce = fluidDensity * subVol * 9.8;
    const netForce = weight - buoyantForce;

    const accel = netForce / (objectDensity * vol);
    velRef.current += accel * dt * 0.0003;
    velRef.current *= Math.pow(0.98, dt / 0.016); // frame-rate independent damping
    posRef.current += velRef.current * (dt / 0.016);

    // Bounds
    if (posRef.current > 0.85) { posRef.current = 0.85; velRef.current *= -0.3; }
    if (posRef.current < 0.1) { posRef.current = 0.1; velRef.current *= -0.3; }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [objectDensity, fluidDensity, objectSize, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.6, 500);
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
    posRef.current = 0.2;
    velRef.current = 0;
    lastTsRef.current = null;
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Density (kg/m³)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={100} max={3000} step={50} value={objectDensity}
              onChange={(e) => { setObjectDensity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{objectDensity}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fluid Density (kg/m³)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={500} max={13600} step={100} value={fluidDensity}
              onChange={(e) => { setFluidDensity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-cyan-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{fluidDensity}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Size</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={30} max={100} value={objectSize}
              onChange={(e) => { setObjectSize(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{objectSize}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Archimedes&apos; Principle</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">F_b = ρ_fluid × V_sub × g</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Floats if ρ_obj &lt; ρ_fluid</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">% submerged = ρ_obj/ρ_fluid</div>
        </div>
      </div>
    </div>
  );
}
