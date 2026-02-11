"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function EnergyConservation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const [trackType, setTrackType] = useState<"hills" | "loop" | "valley">("hills");
  const [friction, setFriction] = useState(0);
  const posRef = useRef(0);
  const velRef = useRef(0);

  const getTrackY = useCallback((x: number): number => {
    // Returns height (0 = bottom, 1 = top)
    if (trackType === "hills") {
      return 0.7 * Math.sin(x * 0.8) * Math.exp(-0.05 * (x - 3) * (x - 3)) +
        0.4 * Math.sin(x * 1.5 + 1) * Math.exp(-0.08 * (x - 7) * (x - 7)) +
        0.5 * Math.cos(x * 0.5) * 0.3 + 0.5;
    } else if (trackType === "loop") {
      return 0.6 * Math.sin(x * 0.7) * Math.exp(-0.03 * (x - 5) * (x - 5)) +
        0.3 * Math.cos(x * 1.8) * Math.exp(-0.06 * (x - 5) * (x - 5)) + 0.4;
    } else {
      // valley
      const center = 5;
      const dist = (x - center);
      return 0.3 * dist * dist / 25 + 0.15 +
        0.1 * Math.sin(x * 2) * Math.exp(-0.1 * dist * dist);
    }
  }, [trackType]);

  const getTrackSlope = useCallback((x: number): number => {
    const dx = 0.01;
    return (getTrackY(x + dx) - getTrackY(x - dx)) / (2 * dx);
  }, [getTrackY]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const g = 9.8;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const margin = 40;
    const trackW = W - margin * 2;
    const trackH = H * 0.6;
    const trackTop = H * 0.1;
    const xRange = 10;

    // Draw track
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let px = 0; px <= trackW; px++) {
      const x = (px / trackW) * xRange;
      const y = getTrackY(x);
      const screenX = margin + px;
      const screenY = trackTop + trackH - y * trackH;
      if (px === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();

    // Track fill
    ctx.beginPath();
    for (let px = 0; px <= trackW; px++) {
      const x = (px / trackW) * xRange;
      const y = getTrackY(x);
      const screenX = margin + px;
      const screenY = trackTop + trackH - y * trackH;
      if (px === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.lineTo(margin + trackW, H);
    ctx.lineTo(margin, H);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, trackTop, 0, H);
    fillGrad.addColorStop(0, "rgba(51,65,85,0.3)");
    fillGrad.addColorStop(1, "rgba(30,41,59,0.6)");
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Ball position
    const ballX = posRef.current;
    const ballY = getTrackY(ballX);
    const screenBallX = margin + (ballX / xRange) * trackW;
    const screenBallY = trackTop + trackH - ballY * trackH;

    // Height reference line
    const minTrackY = Math.min(...Array.from({ length: 100 }, (_, i) => getTrackY(i * xRange / 100)));
    const refLineY = trackTop + trackH - minTrackY * trackH;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin, refLineY);
    ctx.lineTo(margin + trackW, refLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Height indicator
    ctx.strokeStyle = "rgba(59,130,246,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(screenBallX, screenBallY);
    ctx.lineTo(screenBallX, refLineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.textAlign = "right";
    ctx.fillText(`h = ${(ballY - minTrackY).toFixed(2)}`, screenBallX - 5, (screenBallY + refLineY) / 2);

    // Ball glow
    const glow = ctx.createRadialGradient(screenBallX, screenBallY - 10, 0, screenBallX, screenBallY - 10, 25);
    glow.addColorStop(0, "rgba(251,191,36,0.4)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(screenBallX, screenBallY - 10, 25, 0, Math.PI * 2);
    ctx.fill();

    // Ball
    const ballGrad = ctx.createRadialGradient(screenBallX - 3, screenBallY - 13, 0, screenBallX, screenBallY - 10, 10);
    ballGrad.addColorStop(0, "#fef08a");
    ballGrad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(screenBallX, screenBallY - 10, 10, 0, Math.PI * 2);
    ctx.fill();

    // Energy bars
    const h = ballY - minTrackY;
    const v = velRef.current;
    const KE = 0.5 * v * v;
    const PE = g * h;
    const TE = KE + PE;
    const maxE = g * (1 - minTrackY) + 2;

    const barX = margin;
    const barY = H - 60;
    const barW = trackW;
    const barH = 15;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(barX - 10, barY - 25, barW + 20, 75, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY", barX, barY - 10);

    // KE
    ctx.fillStyle = "#ef4444";
    const keW = (KE / maxE) * barW;
    ctx.beginPath();
    ctx.roundRect(barX, barY, keW, barH, 3);
    ctx.fill();

    // PE stacked
    ctx.fillStyle = "#3b82f6";
    const peW = (PE / maxE) * barW;
    ctx.beginPath();
    ctx.roundRect(barX + keW, barY, peW, barH, 3);
    ctx.fill();

    // Labels
    ctx.font = "11px system-ui";
    ctx.fillStyle = "#fca5a5";
    ctx.textAlign = "left";
    ctx.fillText(`KE = ${KE.toFixed(1)}`, barX, barY + barH + 15);

    ctx.fillStyle = "#93c5fd";
    ctx.textAlign = "center";
    ctx.fillText(`PE = ${PE.toFixed(1)}`, barX + barW / 2, barY + barH + 15);

    ctx.fillStyle = "#a855f7";
    ctx.textAlign = "right";
    ctx.fillText(`Total = ${TE.toFixed(1)}`, barX + barW, barY + barH + 15);

    // Velocity arrow on ball
    if (Math.abs(v) > 0.1) {
      const arrScale = 8;
      const slope = getTrackSlope(ballX);
      const mag = Math.sqrt(1 + slope * slope);
      const dx = (v > 0 ? 1 : -1) / mag;
      const dy = (v > 0 ? -slope : slope) / mag;

      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenBallX, screenBallY - 10);
      ctx.lineTo(screenBallX + dx * Math.abs(v) * arrScale, screenBallY - 10 + dy * Math.abs(v) * arrScale * (trackH / trackW) * xRange);
      ctx.stroke();
    }
  }, [getTrackY, getTrackSlope]);

  const animate = useCallback(() => {
    const dt = 0.02;
    const g = 9.8;
    const slope = getTrackSlope(posRef.current);
    const accel = -g * slope / (1 + slope * slope) - friction * velRef.current * 0.5;

    velRef.current += accel * dt;
    posRef.current += velRef.current * dt;

    // Boundaries
    if (posRef.current < 0.1) { posRef.current = 0.1; velRef.current = Math.abs(velRef.current) * 0.95; }
    if (posRef.current > 9.9) { posRef.current = 9.9; velRef.current = -Math.abs(velRef.current) * 0.95; }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [getTrackSlope, friction, draw]);

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
    posRef.current = 1;
    velRef.current = 0;
    draw();
  };

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackType]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Track Shape</label>
          <div className="flex gap-2 mt-2">
            {(["hills", "loop", "valley"] as const).map((t) => (
              <button key={t} onClick={() => setTrackType(t)}
                className={`flex-1 h-9 rounded-lg text-xs font-medium capitalize transition-colors ${
                  trackType === t ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Friction</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={2} step={0.1} value={friction}
              onChange={(e) => setFriction(Number(e.target.value))}
              className="flex-1 accent-yellow-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2rem] text-right">{friction.toFixed(1)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2 lg:col-span-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Conservation of Energy</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">KE = ½mv²</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">PE = mgh</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">KE₁ + PE₁ = KE₂ + PE₂</div>
        </div>
      </div>
    </div>
  );
}
