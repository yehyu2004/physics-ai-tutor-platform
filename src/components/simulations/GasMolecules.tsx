"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export default function GasMolecules() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [temperature, setTemperature] = useState(300);
  const [numParticles, setNumParticles] = useState(80);
  const [isRunning, setIsRunning] = useState(true);
  const [showHistogram, setShowHistogram] = useState(true);
  const particlesRef = useRef<Particle[]>([]);
  const speedHistRef = useRef<number[]>(new Array(20).fill(0));

  const initParticles = useCallback((n: number, temp: number) => {
    const particles: Particle[] = [];
    const speedScale = Math.sqrt(temp / 300) * 3;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 2 + 0.5) * speedScale;
      particles.push({
        x: 0.1 + Math.random() * 0.55,
        y: 0.1 + Math.random() * 0.8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 2,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    initParticles(numParticles, temperature);
  }, [numParticles, temperature, initParticles]);

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

    const boxLeft = W * 0.05;
    const boxTop = H * 0.05;
    const boxW = W * 0.6;
    const boxH = H * 0.9;

    // Container
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(boxLeft, boxTop, boxW, boxH, 8);
    ctx.stroke();

    // Container fill
    ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
    ctx.beginPath();
    ctx.roundRect(boxLeft, boxTop, boxW, boxH, 8);
    ctx.fill();

    // Particles
    const particles = particlesRef.current;
    const speeds: number[] = [];

    for (const p of particles) {
      const px = boxLeft + p.x * boxW;
      const py = boxTop + p.y * boxH;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      speeds.push(speed);

      // Color by speed
      const maxSpeed = 8;
      const t = Math.min(speed / maxSpeed, 1);
      const r = Math.round(t * 255);
      const g = Math.round((1 - Math.abs(t - 0.5) * 2) * 200);
      const b = Math.round((1 - t) * 255);

      // Glow
      ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
      ctx.beginPath();
      ctx.arc(px, py, p.r * 3, 0, Math.PI * 2);
      ctx.fill();

      // Particle
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Speed histogram
    if (showHistogram && speeds.length > 0) {
      const histX = boxLeft + boxW + 30;
      const histY = boxTop + 20;
      const histW = W - histX - 20;
      const histH = boxH - 40;

      if (histW > 60) {
        // Background
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.roundRect(histX - 10, histY - 15, histW + 20, histH + 55, 8);
        ctx.fill();

        ctx.font = "bold 11px ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText("SPEED DISTRIBUTION", histX + histW / 2, histY);

        // Calculate histogram
        const bins = 20;
        const maxSpeed = 10;
        const hist = new Array(bins).fill(0);
        for (const s of speeds) {
          const bin = Math.min(Math.floor((s / maxSpeed) * bins), bins - 1);
          hist[bin]++;
        }

        // Smooth with previous
        const prevHist = speedHistRef.current;
        for (let i = 0; i < bins; i++) {
          prevHist[i] = prevHist[i] * 0.9 + hist[i] * 0.1;
        }

        const maxCount = Math.max(...prevHist, 1);
        const barW = (histW - 10) / bins;

        for (let i = 0; i < bins; i++) {
          const barH = (prevHist[i] / maxCount) * (histH - 30);
          const t = i / bins;
          const r = Math.round(t * 255);
          const g = Math.round((1 - Math.abs(t - 0.5) * 2) * 200);
          const b = Math.round((1 - t) * 255);

          ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
          ctx.beginPath();
          ctx.roundRect(histX + i * barW + 1, histY + histH - barH, barW - 2, barH, 2);
          ctx.fill();
        }

        // Maxwell-Boltzmann curve
        const kT = temperature / 300;
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= histW; i++) {
          const v = (i / histW) * maxSpeed;
          // f(v) ∝ v² exp(-v²/(2kT))
          const fv = v * v * Math.exp(-(v * v) / (2 * kT * 4));
          const maxFv = (2 * kT * 4) * Math.exp(-1) * 0.7; // approximate max
          const py = histY + histH - (fv / maxFv) * (histH - 30) * (maxCount / numParticles) * 10;
          if (i === 0) ctx.moveTo(histX + i, py);
          else ctx.lineTo(histX + i, py);
        }
        ctx.stroke();

        // Labels
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText("speed →", histX + histW / 2, histY + histH + 15);
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("— Maxwell-Boltzmann", histX + histW / 2, histY + histH + 32);
      }
    }

    // Temperature indicator
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(boxLeft + 10, boxTop + 10, 130, 35, 6);
    ctx.fill();
    ctx.font = "bold 14px ui-monospace";
    ctx.fillStyle = temperature > 500 ? "#ef4444" : temperature > 200 ? "#fbbf24" : "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText(`T = ${temperature} K`, boxLeft + 20, boxTop + 33);
  }, [temperature, numParticles, showHistogram]);

  const animate = useCallback(() => {
    const particles = particlesRef.current;
    const dt = 0.016;

    for (const p of particles) {
      p.x += p.vx * dt * 0.03;
      p.y += p.vy * dt * 0.03;

      // Bounce off walls
      if (p.x < 0.02) { p.x = 0.02; p.vx = Math.abs(p.vx); }
      if (p.x > 0.98) { p.x = 0.98; p.vx = -Math.abs(p.vx); }
      if (p.y < 0.02) { p.y = 0.02; p.vy = Math.abs(p.vy); }
      if (p.y > 0.98) { p.y = 0.98; p.vy = -Math.abs(p.vy); }
    }

    // Simple collision detection between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[j].x - particles[i].x;
        const dy = particles[j].y - particles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 0.02;

        if (dist < minDist && dist > 0) {
          // Elastic collision
          const nx = dx / dist;
          const ny = dy / dist;
          const dvx = particles[i].vx - particles[j].vx;
          const dvy = particles[i].vy - particles[j].vy;
          const dvDotN = dvx * nx + dvy * ny;

          if (dvDotN > 0) {
            particles[i].vx -= dvDotN * nx;
            particles[i].vy -= dvDotN * ny;
            particles[j].vx += dvDotN * nx;
            particles[j].vy += dvDotN * ny;
          }

          // Separate
          const overlap = minDist - dist;
          particles[i].x -= nx * overlap / 2;
          particles[i].y -= ny * overlap / 2;
          particles[j].x += nx * overlap / 2;
          particles[j].y += ny * overlap / 2;
        }
      }
    }

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

  const adjustTemp = (newTemp: number) => {
    const ratio = Math.sqrt(newTemp / temperature);
    for (const p of particlesRef.current) {
      p.vx *= ratio;
      p.vy *= ratio;
    }
    setTemperature(newTemp);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Temperature</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={50} max={1000} step={10} value={temperature}
              onChange={(e) => adjustTemp(Number(e.target.value))}
              className="flex-1 accent-orange-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{temperature} K</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Particles</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={200} step={5} value={numParticles}
              onChange={(e) => setNumParticles(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{numParticles}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowHistogram(!showHistogram)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showHistogram ? "bg-amber-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Histogram {showHistogram ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={() => initParticles(numParticles, temperature)}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Kinetic Theory</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">KE_avg = (3/2)kT</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">v_rms = √(3kT/m)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">PV = NkT</div>
        </div>
      </div>
    </div>
  );
}
