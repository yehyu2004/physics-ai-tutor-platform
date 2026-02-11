"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Atom {
  x: number;
  y: number;
  decayed: boolean;
  decayTime: number;
}

export default function RadioactiveDecay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [halfLife, setHalfLife] = useState(3);
  const [numAtoms, setNumAtoms] = useState(200);
  const [isRunning, setIsRunning] = useState(true);

  const atomsRef = useRef<Atom[]>([]);
  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; remaining: number }[]>([]);

  const initAtoms = useCallback(() => {
    const atoms: Atom[] = [];
    const cols = Math.ceil(Math.sqrt(numAtoms * 1.5));
    const rows = Math.ceil(numAtoms / cols);
    for (let i = 0; i < numAtoms; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      atoms.push({
        x: (col + 0.5) / cols,
        y: (row + 0.5) / rows,
        decayed: false,
        decayTime: -1,
      });
    }
    atomsRef.current = atoms;
    timeRef.current = 0;
    historyRef.current = [{ t: 0, remaining: numAtoms }];
  }, [numAtoms]);

  useEffect(() => { initAtoms(); }, [initAtoms]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;
    const atoms = atomsRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Split: left = atoms, right = graph
    const splitX = W * 0.45;

    // --- Left: Atom grid ---
    const gridMargin = 20;
    const gridW = splitX - gridMargin * 2;
    const gridH = H - gridMargin * 2;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(gridMargin - 5, gridMargin - 5, gridW + 10, gridH + 10, 8);
    ctx.fill();

    const remaining = atoms.filter((a) => !a.decayed).length;
    const atomR = Math.max(2, Math.min(6, gridW / Math.sqrt(numAtoms) / 2.5));

    atoms.forEach((atom) => {
      const ax = gridMargin + atom.x * gridW;
      const ay = gridMargin + atom.y * gridH;

      if (atom.decayed) {
        // Decayed - small, dark
        ctx.fillStyle = "rgba(100,116,139,0.3)";
        ctx.beginPath();
        ctx.arc(ax, ay, atomR * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Undecayed - glowing
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(ax, ay, atomR, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Count display
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(gridMargin, H - 50, gridW, 35, 6);
    ctx.fill();
    ctx.font = "bold 13px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#22c55e";
    ctx.fillText(`${remaining}`, gridMargin + gridW * 0.25, H - 28);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px ui-monospace";
    ctx.fillText("remaining", gridMargin + gridW * 0.25, H - 18);
    ctx.font = "bold 13px ui-monospace";
    ctx.fillStyle = "#ef4444";
    ctx.fillText(`${numAtoms - remaining}`, gridMargin + gridW * 0.75, H - 28);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px ui-monospace";
    ctx.fillText("decayed", gridMargin + gridW * 0.75, H - 18);

    // --- Right: Decay curve ---
    const graphX = splitX + 20;
    const graphW2 = W - graphX - 25;
    const graphY = 30;
    const graphH2 = H - 70;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphY - 15, graphW2 + 20, graphH2 + 40, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("N(t) DECAY CURVE", graphX, graphY);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphY + 15);
    ctx.lineTo(graphX, graphY + graphH2);
    ctx.lineTo(graphX + graphW2, graphY + graphH2);
    ctx.stroke();

    // Half-life markers
    const maxT2 = Math.max(halfLife * 5, t + 1);
    for (let hl = 1; hl <= 4; hl++) {
      const hlT = halfLife * hl;
      if (hlT > maxT2) break;
      const hlX = graphX + (hlT / maxT2) * graphW2;
      ctx.strokeStyle = "rgba(251,191,36,0.2)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hlX, graphY + 15);
      ctx.lineTo(hlX, graphY + graphH2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${hl}t½`, hlX, graphY + graphH2 + 12);
    }

    // N/2 line
    const halfY = graphY + 15 + (graphH2 - 15) / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(graphX, halfY);
    ctx.lineTo(graphX + graphW2, halfY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#64748b";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "right";
    ctx.fillText("N₀/2", graphX - 5, halfY + 3);
    ctx.fillText("N₀", graphX - 5, graphY + 18);

    // Theoretical curve
    ctx.strokeStyle = "rgba(239,68,68,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let px = 0; px <= graphW2; px++) {
      const tVal = (px / graphW2) * maxT2;
      const N = numAtoms * Math.exp(-Math.log(2) * tVal / halfLife);
      const py = graphY + 15 + (1 - N / numAtoms) * (graphH2 - 15);
      if (px === 0) ctx.moveTo(graphX + px, py);
      else ctx.lineTo(graphX + px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Plot actual data
    const history = historyRef.current;
    if (history.length > 1) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.3)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT2) * graphW2;
        const py = graphY + 15 + (1 - history[i].remaining / numAtoms) * (graphH2 - 15);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Legend
    ctx.font = "9px system-ui";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("— actual (stochastic)", graphX + 5, graphY + graphH2 + 25);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("--- theoretical N₀e^(−λt)", graphX + graphW2 / 2, graphY + graphH2 + 25);

    // Time display
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(graphX, graphY + graphH2 + 30, graphW2, 20, 4);
    ctx.fill();
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.fillText(`t = ${t.toFixed(1)} s  |  t½ = ${halfLife} s  |  λ = ${(Math.log(2)/halfLife).toFixed(3)} s⁻¹`, graphX + graphW2 / 2, graphY + graphH2 + 44);
  }, [halfLife, numAtoms]);

  const animate = useCallback(() => {
    const dt = 0.05;
    timeRef.current += dt;
    const atoms = atomsRef.current;
    const decayConstant = Math.log(2) / halfLife;

    // Each undecayed atom has probability λ·dt of decaying this frame
    const pDecay = 1 - Math.exp(-decayConstant * dt);
    atoms.forEach((atom) => {
      if (!atom.decayed && Math.random() < pDecay) {
        atom.decayed = true;
        atom.decayTime = timeRef.current;
      }
    });

    const remaining = atoms.filter((a) => !a.decayed).length;
    historyRef.current.push({ t: timeRef.current, remaining });
    if (historyRef.current.length > 1000) historyRef.current.shift();

    draw();
    if (remaining > 0) {
      animRef.current = requestAnimationFrame(animate);
    }
  }, [halfLife, draw]);

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
    initAtoms();
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Half-Life (s)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={10} step={0.5} value={halfLife}
              onChange={(e) => { setHalfLife(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{halfLife} s</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Number of Atoms</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={50} max={500} step={10} value={numAtoms}
              onChange={(e) => { setNumAtoms(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{numAtoms}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Radioactive Decay</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">N(t) = N₀ e^(−λt)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">t½ = ln(2)/λ</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">A = λN (activity)</div>
        </div>
      </div>
    </div>
  );
}
