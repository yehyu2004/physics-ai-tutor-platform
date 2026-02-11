"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function ThermalEquilibrium() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [t1, setT1] = useState(90); // Object 1 initial temp (C)
  const [t2, setT2] = useState(20); // Object 2 initial temp (C)
  const [m1, setM1] = useState(2); // mass 1 (kg)
  const [m2, setM2] = useState(3); // mass 2 (kg)
  const [c1] = useState(900); // specific heat 1 (aluminum, J/kg*C)
  const [c2] = useState(4186); // specific heat 2 (water, J/kg*C)
  const [isRunning, setIsRunning] = useState(true);

  const timeRef = useRef(0);
  const temp1Ref = useRef(t1);
  const temp2Ref = useRef(t2);
  const historyRef = useRef<{ t: number; t1: number; t2: number }[]>([]);

  // Equilibrium temperature
  const tEq = (m1 * c1 * t1 + m2 * c2 * t2) / (m1 * c1 + m2 * c2);

  // Reset temperatures when params change
  useEffect(() => {
    temp1Ref.current = t1;
    temp2Ref.current = t2;
    historyRef.current = [];
    timeRef.current = 0;
  }, [t1, t2, m1, m2]);

  const tempToColor = (temp: number): string => {
    const norm = Math.max(0, Math.min(1, (temp - 0) / 100));
    const r = Math.floor(40 + norm * 215);
    const g = Math.floor(80 - norm * 40);
    const b = Math.floor(220 - norm * 180);
    return `rgb(${r},${g},${b})`;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cur1 = temp1Ref.current;
    const cur2 = temp2Ref.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // --- Left: Objects visualization ---
    const objW = W * 0.5;
    const objCX = objW * 0.5;
    const objCY = H * 0.5;

    // Object 1 (left - aluminum block)
    const block1W = 70 + m1 * 10;
    const block1H = 50 + m1 * 8;
    const b1x = objCX - block1W - 10;
    const b1y = objCY - block1H / 2;

    // Glow
    const glow1 = ctx.createRadialGradient(b1x + block1W / 2, b1y + block1H / 2, 0, b1x + block1W / 2, b1y + block1H / 2, block1W);
    const c1rgb = tempToColor(cur1).match(/\d+/g)!;
    glow1.addColorStop(0, `rgba(${c1rgb[0]},${c1rgb[1]},${c1rgb[2]},0.25)`);
    glow1.addColorStop(1, `rgba(${c1rgb[0]},${c1rgb[1]},${c1rgb[2]},0)`);
    ctx.fillStyle = glow1;
    ctx.beginPath();
    ctx.arc(b1x + block1W / 2, b1y + block1H / 2, block1W, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = tempToColor(cur1);
    ctx.beginPath();
    ctx.roundRect(b1x, b1y, block1W, block1H, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Al", b1x + block1W / 2, b1y + block1H / 2 - 6);
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`${cur1.toFixed(1)} C`, b1x + block1W / 2, b1y + block1H / 2 + 10);

    // Object 2 (right - water)
    const block2W = 70 + m2 * 10;
    const block2H = 50 + m2 * 8;
    const b2x = objCX + 10;
    const b2y = objCY - block2H / 2;

    // Glow
    const glow2 = ctx.createRadialGradient(b2x + block2W / 2, b2y + block2H / 2, 0, b2x + block2W / 2, b2y + block2H / 2, block2W);
    const c2rgb = tempToColor(cur2).match(/\d+/g)!;
    glow2.addColorStop(0, `rgba(${c2rgb[0]},${c2rgb[1]},${c2rgb[2]},0.25)`);
    glow2.addColorStop(1, `rgba(${c2rgb[0]},${c2rgb[1]},${c2rgb[2]},0)`);
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(b2x + block2W / 2, b2y + block2H / 2, block2W, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = tempToColor(cur2);
    ctx.beginPath();
    ctx.roundRect(b2x, b2y, block2W, block2H, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Water wave effect
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      for (let x = b2x + 5; x < b2x + block2W - 5; x += 2) {
        const wy = b2y + block2H * 0.3 + i * 12 + Math.sin((x - b2x) * 0.1 + timeRef.current * 2 + i) * 3;
        if (x === b2x + 5) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("H2O", b2x + block2W / 2, b2y + block2H / 2 - 6);
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`${cur2.toFixed(1)} C`, b2x + block2W / 2, b2y + block2H / 2 + 10);

    // Heat flow arrows
    const diff = cur1 - cur2;
    if (Math.abs(diff) > 0.5) {
      const arrowCount = Math.min(Math.floor(Math.abs(diff) / 10) + 1, 5);
      for (let i = 0; i < arrowCount; i++) {
        const ay = objCY - (arrowCount - 1) * 8 + i * 16;
        const alpha = 0.4 + Math.abs(Math.sin(timeRef.current * 3 + i * 0.5)) * 0.4;
        ctx.strokeStyle = diff > 0 ? `rgba(239,68,68,${alpha})` : `rgba(59,130,246,${alpha})`;
        ctx.lineWidth = 2;
        const ax1 = diff > 0 ? b1x + block1W + 5 : b2x - 5;
        const ax2 = diff > 0 ? b2x - 5 : b1x + block1W + 5;
        ctx.beginPath();
        ctx.moveTo(ax1, ay);
        ctx.lineTo(ax2, ay);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        if (diff > 0) {
          ctx.moveTo(ax2 + 6, ay);
          ctx.lineTo(ax2 - 2, ay - 4);
          ctx.lineTo(ax2 - 2, ay + 4);
        } else {
          ctx.moveTo(ax2 - 6, ay);
          ctx.lineTo(ax2 + 2, ay - 4);
          ctx.lineTo(ax2 + 2, ay + 4);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("Q -->", objCX, objCY + block1H / 2 + 25);
    } else {
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText("EQUILIBRIUM", objCX, objCY + block1H / 2 + 25);
    }

    // Labels
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`m=${m1}kg, c=${c1} J/kgC`, b1x + block1W / 2, b1y - 12);
    ctx.fillText(`m=${m2}kg, c=${c2} J/kgC`, b2x + block2W / 2, b2y - 12);

    // --- Right: Temperature graph ---
    const graphX = objW + 30;
    const graphW2 = W - graphX - 25;
    const graphTop = 30;
    const graphH2 = H - 60;
    const history = historyRef.current;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphTop - 10, graphW2 + 20, graphH2 + 30, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("TEMPERATURE vs TIME", graphX, graphTop + 8);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphTop + 20);
    ctx.lineTo(graphX, graphTop + graphH2);
    ctx.lineTo(graphX + graphW2, graphTop + graphH2);
    ctx.stroke();

    // Equilibrium line
    const maxTemp = Math.max(t1, t2) + 5;
    const minTemp = Math.min(t1, t2) - 5;
    const tRange = maxTemp - minTemp;
    const eqY = graphTop + graphH2 - ((tEq - minTemp) / tRange) * (graphH2 - 25);
    ctx.strokeStyle = "rgba(251,191,36,0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, eqY);
    ctx.lineTo(graphX + graphW2, eqY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText(`T_eq = ${tEq.toFixed(1)} C`, graphX + graphW2 - 80, eqY - 5);

    if (history.length > 1) {
      const maxTime = Math.max(history[history.length - 1].t, 1);

      // T1 line
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(239,68,68,0.3)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxTime) * graphW2;
        const py = graphTop + graphH2 - ((history[i].t1 - minTemp) / tRange) * (graphH2 - 25);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // T2 line
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.3)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxTime) * graphW2;
        const py = graphTop + graphH2 - ((history[i].t2 - minTemp) / tRange) * (graphH2 - 25);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Legend
    ctx.fillStyle = "#ef4444";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("T1 (Al)", graphX + 5, graphTop + graphH2 + 15);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("T2 (H2O)", graphX + 80, graphTop + graphH2 + 15);
  }, [t1, t2, m1, m2, c1, c2, tEq]);

  const animate = useCallback(() => {
    const dt = 0.05;
    timeRef.current += dt;

    // Newton's law of cooling between two objects
    // Rate of heat transfer proportional to temperature difference
    const k = 50; // heat transfer coefficient
    const diff = temp1Ref.current - temp2Ref.current;
    const dQ = k * diff * dt;

    temp1Ref.current -= dQ / (m1 * c1);
    temp2Ref.current += dQ / (m2 * c2);

    historyRef.current.push({
      t: timeRef.current,
      t1: temp1Ref.current,
      t2: temp2Ref.current,
    });
    if (historyRef.current.length > 1000) historyRef.current.shift();

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [m1, m2, c1, c2, draw]);

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

  const reset = () => {
    temp1Ref.current = t1;
    temp2Ref.current = t2;
    historyRef.current = [];
    timeRef.current = 0;
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">T1 init (C)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={10} max={100} value={t1}
              onChange={(e) => { setT1(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{t1}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">T2 init (C)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={90} value={t2}
              onChange={(e) => { setT2(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{t2}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">m1 (kg)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} value={m1}
              onChange={(e) => { setM1(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-400" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{m1}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">m2 (kg)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} value={m2}
              onChange={(e) => { setM2(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-400" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{m2}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Q = mc DeltaT</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Q_lost = Q_gained</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">T_eq = {tEq.toFixed(1)} C</div>
        </div>
      </div>
    </div>
  );
}
