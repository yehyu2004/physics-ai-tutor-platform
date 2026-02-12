"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  calculateAccuracy,
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawMeter } from "@/lib/simulation/drawing";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

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
  const isRunning = true;
  const [showHistogram, setShowHistogram] = useState(true);
  const [challengeMode, setChallengeMode] = useState(false);
  const [displayPressure, setDisplayPressure] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayTarget, setDisplayTarget] = useState(0);
  const displayTickRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const speedHistRef = useRef<number[]>(new Array(20).fill(0));
  const particleSystemRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());

  // Piston state - normalized position (0 = fully left, 1 = fully right)
  const pistonRef = useRef(1.0); // 1.0 = max volume
  const pistonDraggingRef = useRef(false);

  // Pressure tracking
  const pressureRef = useRef(0); // wall-hit pressure (for visual glow)
  const kineticPressureRef = useRef(0); // kinetic theory pressure (P = N<v²>/2V)
  const wallHitsRef = useRef(0);
  const pressureHistoryRef = useRef<number[]>([]);

  // Challenge: target pressure
  const targetPressureRef = useRef(0);

  const initParticles = useCallback((n: number, temp: number) => {
    const particles: Particle[] = [];
    const speedScale = Math.sqrt(temp / 300) * 3;
    const maxX = pistonRef.current * 0.86 + 0.02; // account for piston position
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 2 + 0.5) * speedScale;
      particles.push({
        x: 0.02 + Math.random() * (maxX - 0.02),
        y: 0.02 + Math.random() * 0.96,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 2,
      });
    }
    particlesRef.current = particles;
    wallHitsRef.current = 0;
    pressureHistoryRef.current = [];
  }, []);

  useEffect(() => {
    initParticles(numParticles, temperature);
  }, [numParticles, temperature, initParticles]);

  const startChallenge = useCallback(() => {
    // Generate a target pressure based on current kinetic pressure
    const currentKP = kineticPressureRef.current || 1;
    const targetFactor = 0.5 + Math.random() * 1.5;
    targetPressureRef.current = Math.round(currentKP * targetFactor);
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: `Reach target pressure: ${targetPressureRef.current.toFixed(0)}`,
    };
    setChallengeMode(true);
  }, []);

  const checkPressure = useCallback(() => {
    const currentPressure = kineticPressureRef.current;
    const target = targetPressureRef.current;
    const result = calculateAccuracy(currentPressure, target, target * 0.5);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight / 2,
        startTime: performance.now(),
      });
    }

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (result.tier === "perfect" && canvas) {
        particleSystemRef.current.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight / 2, 20);
      }
      // Generate new target
      setTimeout(() => {
        const currentKP = kineticPressureRef.current || 1;
        const targetFactor = 0.3 + Math.random() * 2.0;
        targetPressureRef.current = Math.round(currentKP * targetFactor);
        challengeRef.current = {
          ...challengeRef.current,
          description: `Reach target pressure: ${targetPressureRef.current.toFixed(0)}`,
        };
      }, 1500);
    } else {
      playSFX("incorrect");
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const now = performance.now();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const boxLeft = W * 0.05;
    const boxTop = H * 0.05;
    const boxMaxW = W * 0.6;
    const boxW = boxMaxW * pistonRef.current;
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

    // Piston (right wall of container) - draggable
    const pistonX = boxLeft + boxW;
    const pistonGrad = ctx.createLinearGradient(pistonX - 12, 0, pistonX + 12, 0);
    pistonGrad.addColorStop(0, "#64748b");
    pistonGrad.addColorStop(0.5, "#94a3b8");
    pistonGrad.addColorStop(1, "#64748b");
    ctx.fillStyle = pistonGrad;
    ctx.fillRect(pistonX - 8, boxTop + 2, 16, boxH - 4);

    // Piston handle grip lines
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    for (let gy = boxTop + boxH * 0.3; gy < boxTop + boxH * 0.7; gy += 8) {
      ctx.beginPath();
      ctx.moveTo(pistonX - 4, gy);
      ctx.lineTo(pistonX + 4, gy);
      ctx.stroke();
    }

    // Piston arrow hint
    if (!pistonDraggingRef.current) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("\u2190 drag \u2192", pistonX, boxTop - 8);
    }

    // Compute kinetic pressure from particle speeds (P = N<v²>/(2V))
    const particlesArr = particlesRef.current;
    let sumV2 = 0;
    for (const p of particlesArr) sumV2 += p.vx * p.vx + p.vy * p.vy;
    const pressure = particlesArr.length * sumV2 / (2 * Math.max(pistonRef.current, 0.05));
    const maxPressure = numParticles * 50; // scale for display

    // Wall hit intensity for visual glow
    const wallHitPressure = pressureRef.current;
    const pressureIntensity = Math.min(wallHitPressure / (numParticles * 2), 1);
    const pColor = `rgba(239, 68, 68, ${pressureIntensity * 0.5})`;
    ctx.fillStyle = pColor;
    ctx.fillRect(boxLeft, boxTop, boxW, 4);
    ctx.fillRect(boxLeft, boxTop + boxH - 4, boxW, 4);
    ctx.fillRect(boxLeft, boxTop, 4, boxH);
    ctx.fillRect(pistonX - 4, boxTop, 4, boxH);

    // Pressure gauge
    const gaugeX = boxLeft + 10;
    const gaugeY = boxTop + boxH - 50;
    drawMeter(ctx, gaugeX, gaugeY, 100, 12, pressure, maxPressure, "#ef4444", `P: ${pressure.toFixed(0)} Pa`);

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

    // Speed histogram with Maxwell-Boltzmann overlay
    if (showHistogram && speeds.length > 0) {
      const histX = boxLeft + boxMaxW + 30;
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

        // Maxwell-Boltzmann curve (theoretical overlay)
        const kT = temperature / 300;
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(251,191,36,0.4)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let i = 0; i <= histW; i++) {
          const v = (i / histW) * maxSpeed;
          // f(v) proportional to v^2 exp(-v^2/(2kT))
          const fv = v * v * Math.exp(-(v * v) / (2 * kT * 4));
          const maxFv = 2 * kT * 4 * Math.exp(-1) * 0.7;
          const py = histY + histH - (fv / maxFv) * (histH - 30) * (maxCount / numParticles) * 10;
          if (i === 0) ctx.moveTo(histX + i, py);
          else ctx.lineTo(histX + i, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Labels
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText("speed \u2192", histX + histW / 2, histY + histH + 15);
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("\u2014 Maxwell-Boltzmann", histX + histW / 2, histY + histH + 32);
      }
    }

    // Temperature indicator
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(boxLeft + 10, boxTop + 10, 140, 55, 6);
    ctx.fill();
    ctx.font = "bold 14px ui-monospace";
    ctx.fillStyle =
      temperature > 500 ? "#ef4444" : temperature > 200 ? "#fbbf24" : "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText(`T = ${temperature} K`, boxLeft + 20, boxTop + 33);

    // Volume display
    const volume = (pistonRef.current * 100).toFixed(0);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`V = ${volume}%`, boxLeft + 20, boxTop + 50);

    // Ideal gas law readout — compute from kinetic theory
    const allParticles = particlesRef.current;
    let totalV2 = 0;
    for (const p of allParticles) totalV2 += p.vx * p.vx + p.vy * p.vy;
    const avgV2 = totalV2 / Math.max(allParticles.length, 1);
    // 2D kinetic theory: PV = NkT, kT = m<v²>/2, P = N<v²>/(2V)
    const kineticPressure = allParticles.length * avgV2 / (2 * pistonRef.current);
    // PV/NkT from kinetic theory (should ≈ 1.0)
    const pvNkT = avgV2 > 0 ? (kineticPressure * pistonRef.current) / (allParticles.length * avgV2 / 2) : 0;
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#60a5fa";
    ctx.fillText(`PV/NkT \u2248 ${pvNkT.toFixed(2)}`, boxLeft + 20, boxTop + 62);

    // Particle effects
    particleSystemRef.current.draw(ctx);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Challenge mode scoreboard and target
    if (challengeMode && challengeRef.current.active) {
      // Target pressure indicator
      const targetP = targetPressureRef.current;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(boxLeft + 10, boxTop + boxH - 95, 140, 40, 6);
      ctx.fill();

      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText("TARGET PRESSURE", boxLeft + 20, boxTop + boxH - 78);
      ctx.font = "bold 16px ui-monospace, monospace";
      const pDiff = Math.abs(kineticPressureRef.current - targetP) / Math.max(targetP, 1);
      ctx.fillStyle = pDiff < 0.1 ? "#22c55e" : pDiff < 0.3 ? "#f59e0b" : "#ef4444";
      ctx.fillText(`P = ${targetP.toFixed(0)} Pa`, boxLeft + 20, boxTop + boxH - 60);

      // Scoreboard
      renderScoreboard(ctx, W - 165, H - 135, 155, 125, challengeRef.current);
    }
  }, [temperature, numParticles, showHistogram, challengeMode]);

  const lastTsRef = useRef<number | null>(null);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) lastTsRef.current = now;
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    const particles = particlesRef.current;
    const piston = pistonRef.current;
    // effective wall for piston
    const rightWall = 0.98 * piston / Math.max(piston, 0.15);
    let frameMomentum = 0;

    for (const p of particles) {
      p.x += p.vx * dt * 0.03;
      p.y += p.vy * dt * 0.03;

      // Bounce off walls - track momentum transfer (|v_perp|) for pressure
      if (p.x < 0.02) {
        p.x = 0.02;
        frameMomentum += Math.abs(p.vx);
        p.vx = Math.abs(p.vx);
      }
      if (p.x > rightWall) {
        p.x = rightWall;
        frameMomentum += Math.abs(p.vx);
        p.vx = -Math.abs(p.vx);
      }
      if (p.y < 0.02) {
        p.y = 0.02;
        frameMomentum += Math.abs(p.vy);
        p.vy = Math.abs(p.vy);
      }
      if (p.y > 0.98) {
        p.y = 0.98;
        frameMomentum += Math.abs(p.vy);
        p.vy = -Math.abs(p.vy);
      }
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

            // Collision sparks
            const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy);
            if (relSpeed > 3) {
              const canvas = canvasRef.current;
              if (canvas) {
                const boxLeft = canvas.clientWidth * 0.05;
                const boxTop = canvas.clientHeight * 0.05;
                const boxW = canvas.clientWidth * 0.6 * pistonRef.current;
                const boxH = canvas.clientHeight * 0.9;
                const sparkX = boxLeft + ((particles[i].x + particles[j].x) / 2) * boxW;
                const sparkY = boxTop + ((particles[i].y + particles[j].y) / 2) * boxH;
                const sparkIntensity = Math.min(relSpeed / 8, 1);
                particleSystemRef.current.emitSparks(
                  sparkX,
                  sparkY,
                  Math.round(2 + sparkIntensity * 4),
                  `rgba(255, ${Math.round(200 - sparkIntensity * 100)}, ${Math.round(100 - sparkIntensity * 100)}, 0.8)`
                );
              }
            }
          }

          // Separate
          const overlap = minDist - dist;
          particles[i].x -= (nx * overlap) / 2;
          particles[i].y -= (ny * overlap) / 2;
          particles[j].x += (nx * overlap) / 2;
          particles[j].y += (ny * overlap) / 2;
        }
      }
    }

    // Update wall-hit pressure (for visual glow)
    wallHitsRef.current = wallHitsRef.current * 0.95 + frameMomentum * 0.05;
    const perimeter = 2 * (1 + piston);
    pressureRef.current = (wallHitsRef.current / Math.max(perimeter, 0.1)) * 60;

    // Update kinetic pressure: P = N<v²>/(2V)
    let animTotalV2 = 0;
    for (const p of particles) animTotalV2 += p.vx * p.vx + p.vy * p.vy;
    const rawKP = particles.length * animTotalV2 / (2 * Math.max(piston, 0.05));
    kineticPressureRef.current = kineticPressureRef.current * 0.9 + rawKP * 0.1;

    // Pressure history for smoothing display
    pressureHistoryRef.current.push(kineticPressureRef.current);
    if (pressureHistoryRef.current.length > 60) pressureHistoryRef.current.shift();

    // Update display state every ~10 frames to keep JSX panel in sync
    displayTickRef.current++;
    if (displayTickRef.current % 10 === 0) {
      setDisplayPressure(Math.round(kineticPressureRef.current));
      setDisplayScore(challengeRef.current.score);
      setDisplayTarget(Math.round(targetPressureRef.current));
    }

    particleSystemRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 480));
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

  // Piston drag handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.clientWidth / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      const W = canvas.clientWidth;
      const boxLeft = W * 0.05;
      const boxMaxW = W * 0.6;
      const pistonX = boxLeft + boxMaxW * pistonRef.current;

      // Check if clicking near the piston
      if (Math.abs(mx - pistonX) < 20) {
        pistonDraggingRef.current = true;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!pistonDraggingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.clientWidth / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      const W = canvas.clientWidth;
      const boxLeft = W * 0.05;
      const boxMaxW = W * 0.6;

      const newPiston = Math.max(0.15, Math.min(1.0, (mx - boxLeft) / boxMaxW));
      pistonRef.current = newPiston;

      // Push particles if piston compresses past them
      const rightWall = 0.98 * newPiston / Math.max(newPiston, 0.15);
      for (const p of particlesRef.current) {
        if (p.x > rightWall) {
          p.x = rightWall - 0.01;
          p.vx = -Math.abs(p.vx) * 1.1; // slight boost from piston compression
        }
      }
    };

    const handleMouseUp = () => {
      pistonDraggingRef.current = false;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
        <canvas ref={canvasRef} className="w-full cursor-ew-resize" />
      </div>

      {/* Challenge mode panel */}
      {challengeMode && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Adjust temperature and volume to reach target pressure
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Target: P = {displayTarget} Pa | Current: P = {displayPressure} Pa |
                Score: {displayScore} pts
              </p>
            </div>
            <button
              onClick={checkPressure}
              className="px-6 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Check Pressure
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Temperature
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={50}
              max={1000}
              step={10}
              value={temperature}
              onChange={(e) => adjustTemp(Number(e.target.value))}
              className="flex-1 accent-orange-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {temperature} K
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Particles
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={200}
              step={5}
              value={numParticles}
              onChange={(e) => setNumParticles(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {numParticles}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => setShowHistogram(!showHistogram)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showHistogram
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Histogram {showHistogram ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => {
              if (challengeMode) {
                setChallengeMode(false);
                challengeRef.current = { ...challengeRef.current, active: false };
              } else {
                startChallenge();
              }
            }}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              challengeMode
                ? "bg-green-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            {challengeMode ? "End Challenge" : "Challenge"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => {
              pistonRef.current = 1.0;
              setTemperature(300);
              setNumParticles(80);
              setChallengeMode(false);
              challengeRef.current = { ...challengeRef.current, active: false };
              initParticles(80, 300);
            }}
            className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="PV = nRT" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="KE_{avg} = \frac{3}{2}k_BT" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="v_{rms} = \sqrt{\frac{3k_BT}{m}}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Adjust temperature and volume to see how gas molecules behave. Watch pressure change in real time!</p>
    </div>
  );
}
