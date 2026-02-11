"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function SpinningTop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  const [mass, setMass] = useState(1.0); // kg
  const [length, setLength] = useState(0.14); // m
  const [tiltDeg, setTiltDeg] = useState(28); // degrees
  const [spinRate, setSpinRate] = useState(120); // rad/s
  const [spinDamping, setSpinDamping] = useState(0.08); // 1/s
  const [isRunning, setIsRunning] = useState(true);

  const phiRef = useRef(0);
  const omegaRef = useRef(spinRate);
  const thetaRef = useRef((tiltDeg * Math.PI) / 180);
  const nutationPhaseRef = useRef(0);

  const g = 9.81;
  const topRadius = 0.12; // m
  const momentOfInertia = 0.5 * mass * topRadius * topRadius; // disk approximation

  const projectPoint = useCallback((x: number, y: number, z: number, cx: number, baseY: number, scale: number) => {
    return {
      x: cx + scale * (x + 0.45 * z),
      y: baseY - scale * (y + 0.2 * z),
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.36;
    const baseY = H * 0.78;
    const scale = 420;

    const theta = thetaRef.current;
    const phi = phiRef.current;
    const omega = omegaRef.current;

    const nx = Math.sin(theta) * Math.cos(phi);
    const ny = Math.cos(theta);
    const nz = Math.sin(theta) * Math.sin(phi);

    const com = projectPoint(nx * length, ny * length, nz * length, cx, baseY, scale);
    const pivot = projectPoint(0, 0, 0, cx, baseY, scale);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    // Ground plane
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, baseY + 8, W, H - baseY);
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 8);
    ctx.lineTo(W, baseY + 8);
    ctx.stroke();

    // Precession guide circle
    const circleR = length * Math.sin(theta) * scale;
    ctx.strokeStyle = "rgba(59,130,246,0.25)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, baseY - length * Math.cos(theta) * scale, circleR, circleR * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Trail
    if (trailRef.current.length > 1) {
      for (let i = 1; i < trailRef.current.length; i++) {
        const alpha = i / trailRef.current.length;
        ctx.strokeStyle = `rgba(168,85,247,${alpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(trailRef.current[i - 1].x, trailRef.current[i - 1].y);
        ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
        ctx.stroke();
      }
    }

    // Top axis
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(com.x, com.y);
    ctx.stroke();

    // Top body
    const bodyR = 26;
    const bodyGrad = ctx.createRadialGradient(com.x - 4, com.y - 4, 0, com.x, com.y, bodyR);
    bodyGrad.addColorStop(0, "#60a5fa");
    bodyGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(com.x, com.y, bodyR, bodyR * 0.62, phi * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Spin indicator ring
    const spinGlow = Math.min(1, omega / 160);
    ctx.strokeStyle = `rgba(250,204,21,${0.25 + 0.45 * spinGlow})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(com.x, com.y, bodyR + 8, bodyR * 0.72, phi * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Pivot point
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Angle label
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    ctx.fillText(`theta = ${(theta * 180 / Math.PI).toFixed(1)} deg`, cx - 120, baseY - 18);

    // Data panel
    const panelX = W * 0.62;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect(panelX, 18, W * 0.34, H - 36, 10);
    ctx.fill();

    const L = momentOfInertia * omega;
    const precessionOmega = (mass * g * length) / Math.max(L, 1e-4);
    const keRot = 0.5 * momentOfInertia * omega * omega;

    let y = 46;
    ctx.textAlign = "left";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("SPINNING TOP", panelX + 14, y);
    y += 24;

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#22c55e";
    ctx.fillText(`omega_spin = ${omega.toFixed(1)} rad/s`, panelX + 14, y);
    y += 22;
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`Omega_prec = ${precessionOmega.toFixed(2)} rad/s`, panelX + 14, y);
    y += 22;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`L = ${L.toFixed(3)} kg m^2/s`, panelX + 14, y);
    y += 22;
    ctx.fillStyle = "#60a5fa";
    ctx.fillText(`KE_rot = ${keRot.toFixed(2)} J`, panelX + 14, y);
    y += 26;

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`I = ${(momentOfInertia).toFixed(4)} kg m^2`, panelX + 14, y);
    y += 16;
    ctx.fillText(`m = ${mass.toFixed(2)} kg, l = ${length.toFixed(2)} m`, panelX + 14, y);
    y += 20;

    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Model: Omega = tau/L = mgl/(I*omega)", panelX + 14, y);
  }, [length, mass, momentOfInertia, projectPoint]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    // Spin damping
    omegaRef.current *= Math.exp(-spinDamping * dt);

    // Small nutation around the selected tilt angle.
    nutationPhaseRef.current += dt * Math.max(2, omegaRef.current * 0.05);
    const baseTheta = (tiltDeg * Math.PI) / 180;
    const nutationAmp = 0.03 * Math.exp(-spinDamping * 3);
    thetaRef.current = baseTheta + nutationAmp * Math.sin(nutationPhaseRef.current);

    const L = momentOfInertia * Math.max(omegaRef.current, 0.4);
    const precessionOmega = (mass * g * length) / L;
    phiRef.current += precessionOmega * dt;

    const canvas = canvasRef.current;
    if (canvas) {
      const cx = canvas.width * 0.36;
      const baseY = canvas.height * 0.78;
      const scale = 420;
      const nx = Math.sin(thetaRef.current) * Math.cos(phiRef.current);
      const ny = Math.cos(thetaRef.current);
      const nz = Math.sin(thetaRef.current) * Math.sin(phiRef.current);
      const com = projectPoint(nx * length, ny * length, nz * length, cx, baseY, scale);
      trailRef.current.push({ x: com.x, y: com.y });
      if (trailRef.current.length > 180) trailRef.current.shift();
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, length, mass, momentOfInertia, projectPoint, spinDamping, tiltDeg]);

  useEffect(() => {
    omegaRef.current = spinRate;
  }, [spinRate]);

  useEffect(() => {
    thetaRef.current = (tiltDeg * Math.PI) / 180;
  }, [tiltDeg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.52, 470);
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
  }, [animate, isRunning]);

  const reset = () => {
    phiRef.current = 0;
    thetaRef.current = (tiltDeg * Math.PI) / 180;
    omegaRef.current = spinRate;
    nutationPhaseRef.current = 0;
    lastTsRef.current = null;
    trailRef.current = [];
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Spin Rate</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={20} max={300} step={2} value={spinRate}
              onChange={(e) => setSpinRate(Number(e.target.value))}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4.5rem] text-right">{spinRate.toFixed(0)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tilt Angle</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={70} step={1} value={tiltDeg}
              onChange={(e) => setTiltDeg(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{tiltDeg}°</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stem Length (m)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.05} max={0.25} step={0.005} value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{length.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass (kg)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.2} max={2.0} step={0.05} value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="flex-1 accent-cyan-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{mass.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Spin Damping</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={0.4} step={0.01} value={spinDamping}
              onChange={(e) => setSpinDamping(Number(e.target.value))}
              className="flex-1 accent-emerald-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{spinDamping.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => {
              if (!isRunning) {
                lastTsRef.current = null;
              }
              setIsRunning(!isRunning);
            }}
            className="flex-1 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Gyroscope Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">L = I omega</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">tau = m g l</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Omega = tau / L</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">KE = 1/2 I omega^2</div>
        </div>
      </div>
    </div>
  );
}
