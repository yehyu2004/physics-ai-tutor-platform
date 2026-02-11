"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function FaradayLaw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [coilTurns, setCoilTurns] = useState(5);
  const [isRunning, setIsRunning] = useState(true);
  const [magnetSpeed, setMagnetSpeed] = useState(1.0);

  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; emf: number; flux: number }[]>([]);

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

    const coilX = W * 0.4;
    const coilY = H * 0.4;
    const coilH = 100;
    const coilW = 60;

    // Magnet oscillates
    const magnetX = coilX + Math.sin(t * magnetSpeed * 2) * 160;
    const magnetY = coilY;

    // Flux calculation (depends on magnet distance from coil center)
    const dist = magnetX - coilX;
    const flux = coilTurns * 100 / (1 + (dist / 60) * (dist / 60));
    const prevFlux = historyRef.current.length > 0 ? historyRef.current[historyRef.current.length - 1].flux : flux;
    const emf = -(flux - prevFlux) / 0.016 * 0.01;

    // Coil
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    for (let i = 0; i < coilTurns; i++) {
      const offset = (i - coilTurns / 2) * 8;
      ctx.beginPath();
      ctx.ellipse(coilX + offset, coilY, coilW / 2, coilH / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Coil label
    ctx.fillStyle = "#f59e0b";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${coilTurns} turns`, coilX, coilY + coilH / 2 + 20);

    // Magnet
    const magW = 80;
    const magH = 40;

    // N pole
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(magnetX - magW / 2, magnetY - magH / 2, magW / 2, magH, [6, 0, 0, 6]);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", magnetX - magW / 4, magnetY);

    // S pole
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(magnetX, magnetY - magH / 2, magW / 2, magH, [0, 6, 6, 0]);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText("S", magnetX + magW / 4, magnetY);

    // Magnetic field lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const yOff = (i - 2.5) * 15;
      ctx.beginPath();
      for (let x = magnetX - magW / 2 - 80; x < magnetX + magW / 2 + 80; x += 3) {
        const dx = x - magnetX;
        const fieldY = magnetY + yOff + dx * dx * 0.001 * (yOff > 0 ? 1 : -1);
        if (x === magnetX - magW / 2 - 80) ctx.moveTo(x, fieldY);
        else ctx.lineTo(x, fieldY);
      }
      ctx.stroke();
    }

    // EMF indicator (galvanometer)
    const galX = coilX;
    const galY = H * 0.82;
    const galR = 30;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.arc(galX, galY, galR + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(galX, galY, galR, Math.PI, 0);
    ctx.stroke();

    // Needle
    const needleAngle = Math.PI + Math.max(-Math.PI / 2, Math.min(Math.PI / 2, emf * 0.3));
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(galX, galY);
    ctx.lineTo(galX + Math.cos(needleAngle) * (galR - 5), galY + Math.sin(needleAngle) * (galR - 5));
    ctx.stroke();

    // Scale marks
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    for (let a = -4; a <= 4; a++) {
      const angle = Math.PI + (a / 4) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(galX + Math.cos(angle) * (galR - 3), galY + Math.sin(angle) * (galR - 3));
      ctx.lineTo(galX + Math.cos(angle) * galR, galY + Math.sin(angle) * galR);
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("EMF", galX, galY + 12);

    // Wires connecting coil to galvanometer
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(coilX - coilTurns * 4, coilY + coilH / 2);
    ctx.lineTo(coilX - coilTurns * 4, galY);
    ctx.lineTo(galX - galR, galY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coilX + coilTurns * 4, coilY + coilH / 2);
    ctx.lineTo(coilX + coilTurns * 4, galY + 15);
    ctx.lineTo(galX + galR, galY + 15);
    ctx.lineTo(galX + galR, galY);
    ctx.stroke();

    // Graph on right side
    const graphX = W * 0.6;
    const graphW2 = W - graphX - 20;
    const graphH2 = H * 0.35;

    const history = historyRef.current;

    // Flux graph
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX, 15, graphW2, graphH2, 6);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText("Magnetic Flux Φ", graphX + 8, 30);

    if (history.length > 1) {
      const maxT2 = Math.max(t, 5);
      const maxFlux = coilTurns * 100 + 10;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + 5 + (history[i].t / maxT2) * (graphW2 - 10);
        const py = 15 + graphH2 - 5 - (history[i].flux / maxFlux) * (graphH2 - 20);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // EMF graph
    const emfGraphY = 20 + graphH2 + 15;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX, emfGraphY, graphW2, graphH2, 6);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#22c55e";
    ctx.fillText("Induced EMF (ε = −dΦ/dt)", graphX + 8, emfGraphY + 15);

    if (history.length > 1) {
      const maxT2 = Math.max(t, 5);
      const maxEmf = coilTurns * 3 + 5;
      // Zero line
      const zeroY = emfGraphY + graphH2 / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX + 5, zeroY);
      ctx.lineTo(graphX + graphW2 - 5, zeroY);
      ctx.stroke();

      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + 5 + (history[i].t / maxT2) * (graphW2 - 10);
        const py = zeroY - (history[i].emf / maxEmf) * (graphH2 / 2 - 15);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }, [coilTurns, magnetSpeed]);

  const animate = useCallback(() => {
    timeRef.current += 0.016;
    const t = timeRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const coilX = canvas.width * 0.4;
    const magnetX = coilX + Math.sin(t * magnetSpeed * 2) * 160;
    const dist = magnetX - coilX;
    const flux = coilTurns * 100 / (1 + (dist / 60) * (dist / 60));
    const prevFlux = historyRef.current.length > 0 ? historyRef.current[historyRef.current.length - 1].flux : flux;
    const emf = -(flux - prevFlux) / 0.016 * 0.01;

    historyRef.current.push({ t, emf, flux });
    if (historyRef.current.length > 800) historyRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [coilTurns, magnetSpeed, draw]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Coil Turns</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={10} value={coilTurns}
              onChange={(e) => { setCoilTurns(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{coilTurns}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Magnet Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.2} max={3} step={0.1} value={magnetSpeed}
              onChange={(e) => setMagnetSpeed(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{magnetSpeed.toFixed(1)}×</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Faraday&apos;s Law</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">ε = −N dΦ/dt</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Φ = B · A · cosθ</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Lenz&apos;s law: opposes change</div>
        </div>
      </div>
    </div>
  );
}
