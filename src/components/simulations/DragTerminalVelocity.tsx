"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function DragTerminalVelocity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [mass, setMass] = useState(5);
  const [dragCoeff, setDragCoeff] = useState(0.5);
  const [crossArea, setCrossArea] = useState(0.1);
  const [isRunning, setIsRunning] = useState(true);

  const posRef = useRef(0);
  const velRef = useRef(0);
  const historyRef = useRef<{ t: number; v: number; y: number }[]>([]);
  const timeRef = useRef(0);

  const g = 9.8;
  const rho = 1.225; // air density

  const terminalVel = Math.sqrt((2 * mass * g) / (rho * dragCoeff * crossArea));

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

    // Split: left = animation, right = graph
    const splitX = W * 0.4;

    // --- Left: falling object ---
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, "#1e3a5f");
    skyGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, splitX, H);

    // Wind lines
    const windSpeed = velRef.current;
    for (let i = 0; i < 15; i++) {
      const ly = ((i * 37 + posRef.current * 3) % H);
      const lx = 20 + Math.random() * (splitX - 60);
      const len = Math.min(windSpeed * 2, 40);
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + windSpeed / terminalVel * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + (Math.random() - 0.5) * 10, ly - len);
      ctx.stroke();
    }

    // Object (centered, doesn't move but world moves around it)
    const objX = splitX * 0.5;
    const objY = H * 0.4;
    const objR = 12 + mass;

    // Glow
    const glow = ctx.createRadialGradient(objX, objY, 0, objX, objY, objR * 2);
    glow.addColorStop(0, "rgba(251,191,36,0.2)");
    glow.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(objX, objY, objR * 2, 0, Math.PI * 2);
    ctx.fill();

    // Object
    const objGrad = ctx.createRadialGradient(objX - 3, objY - 3, 0, objX, objY, objR);
    objGrad.addColorStop(0, "#fef08a");
    objGrad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = objGrad;
    ctx.beginPath();
    ctx.arc(objX, objY, objR, 0, Math.PI * 2);
    ctx.fill();

    // Mass label
    ctx.fillStyle = "#000";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${mass}kg`, objX, objY);

    // Force arrows
    // Gravity (down)
    const gForce = mass * g;
    const maxForce = mass * g;
    const gLen = (gForce / maxForce) * 60;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(objX, objY + objR + 5);
    ctx.lineTo(objX, objY + objR + 5 + gLen);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(objX, objY + objR + 5 + gLen);
    ctx.lineTo(objX - 5, objY + objR + 5 + gLen - 8);
    ctx.lineTo(objX + 5, objY + objR + 5 + gLen - 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("mg", objX + 10, objY + objR + 5 + gLen / 2);

    // Drag (up)
    const dragForce = 0.5 * rho * dragCoeff * crossArea * velRef.current * velRef.current;
    const dLen = (dragForce / maxForce) * 60;
    if (dLen > 2) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(objX, objY - objR - 5);
      ctx.lineTo(objX, objY - objR - 5 - dLen);
      ctx.stroke();
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(objX, objY - objR - 5 - dLen);
      ctx.lineTo(objX - 5, objY - objR - 5 - dLen + 8);
      ctx.lineTo(objX + 5, objY - objR - 5 - dLen + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillText("F_drag", objX + 10, objY - objR - 5 - dLen / 2);
    }

    // --- Right: velocity graph ---
    const graphX = splitX + 30;
    const graphW = W - graphX - 30;
    const graphY = 40;
    const graphH = H - 80;

    // Graph background
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 15, graphY - 20, graphW + 30, graphH + 50, 8);
    ctx.fill();

    // Title
    ctx.font = "bold 11px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("VELOCITY vs TIME", graphX, graphY - 5);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphY);
    ctx.lineTo(graphX, graphY + graphH);
    ctx.lineTo(graphX + graphW, graphY + graphH);
    ctx.stroke();

    // Terminal velocity line (dashed)
    const maxV = terminalVel * 1.2;
    const vtY = graphY + graphH - (terminalVel / maxV) * graphH;
    ctx.strokeStyle = "rgba(239,68,68,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, vtY);
    ctx.lineTo(graphX + graphW, vtY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "right";
    ctx.fillText(`v_t = ${terminalVel.toFixed(1)} m/s`, graphX + graphW, vtY - 5);

    // Plot history
    const history = historyRef.current;
    if (history.length > 1) {
      const maxT = Math.max(history[history.length - 1].t, 5);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(34,197,94,0.4)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT) * graphW;
        const py = graphY + graphH - (history[i].v / maxV) * graphH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Axis labels
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("time (s)", graphX + graphW / 2, graphY + graphH + 20);
    ctx.save();
    ctx.translate(graphX - 10, graphY + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("v (m/s)", 0, 0);
    ctx.restore();

    // Current values
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, H - 70, 160, 58, 6);
    ctx.fill();
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.fillText(`v = ${velRef.current.toFixed(1)} m/s`, 22, H - 52);
    ctx.fillText(`v/v_t = ${(velRef.current / terminalVel * 100).toFixed(0)}%`, 22, H - 35);
    ctx.fillText(`t = ${timeRef.current.toFixed(1)} s`, 22, H - 18);
  }, [mass, dragCoeff, crossArea, terminalVel]);

  const animate = useCallback(() => {
    const dt = 0.03;
    timeRef.current += dt;

    const v = velRef.current;
    const dragForce = 0.5 * rho * dragCoeff * crossArea * v * v;
    const netForce = mass * g - dragForce;
    const accel = netForce / mass;

    velRef.current += accel * dt;
    posRef.current += velRef.current * dt;

    historyRef.current.push({ t: timeRef.current, v: velRef.current, y: posRef.current });
    if (historyRef.current.length > 500) historyRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [mass, dragCoeff, crossArea, draw]);

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

  const reset = () => {
    velRef.current = 0;
    posRef.current = 0;
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
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={20} step={0.5} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{mass} kg</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Drag Coefficient</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={2} step={0.1} value={dragCoeff}
              onChange={(e) => { setDragCoeff(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{dragCoeff.toFixed(1)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cross-Section Area</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.01} max={0.5} step={0.01} value={crossArea}
              onChange={(e) => { setCrossArea(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{crossArea.toFixed(2)} m²</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Drag Force</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">F_drag = ½ρCdAv²</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">v_t = √(2mg/ρCdA)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">v_t = {terminalVel.toFixed(1)} m/s</div>
        </div>
      </div>
    </div>
  );
}
