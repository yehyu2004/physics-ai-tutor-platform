"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

interface PlanetData {
  name: string;
  mass: number;       // kg
  radius: number;     // meters
  color: string;
  surfaceColor: string;
  glowColor: string;
  btnColor: string;
  btnActiveColor: string;
}

const PLANETS: PlanetData[] = [
  {
    name: "Earth",
    mass: 5.97e24,
    radius: 6.371e6,
    color: "#3b82f6",
    surfaceColor: "#166534",
    glowColor: "rgba(59,130,246,0.3)",
    btnColor: "border-blue-400 text-blue-400",
    btnActiveColor: "bg-blue-600 text-white border-blue-600",
  },
  {
    name: "Moon",
    mass: 7.35e22,
    radius: 1.74e6,
    color: "#94a3b8",
    surfaceColor: "#475569",
    glowColor: "rgba(148,163,184,0.3)",
    btnColor: "border-gray-400 text-gray-400",
    btnActiveColor: "bg-gray-500 text-white border-gray-500",
  },
  {
    name: "Mars",
    mass: 6.39e23,
    radius: 3.39e6,
    color: "#ef4444",
    surfaceColor: "#991b1b",
    glowColor: "rgba(239,68,68,0.3)",
    btnColor: "border-red-400 text-red-400",
    btnActiveColor: "bg-red-600 text-white border-red-600",
  },
  {
    name: "Jupiter",
    mass: 1.90e27,
    radius: 6.99e7,
    color: "#f59e0b",
    surfaceColor: "#92400e",
    glowColor: "rgba(245,158,11,0.3)",
    btnColor: "border-amber-400 text-amber-400",
    btnActiveColor: "bg-amber-600 text-white border-amber-600",
  },
];

const G = 6.674e-11; // gravitational constant

function escapeVelocity(planet: PlanetData): number {
  return Math.sqrt((2 * G * planet.mass) / planet.radius);
}

export default function EscapeVelocity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [planetIdx, setPlanetIdx] = useState(0);
  const [velocityFrac, setVelocityFrac] = useState(1.0); // fraction of v_esc
  const [launched, setLaunched] = useState(false);
  const [score, setScore] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const [launchAngle, setLaunchAngle] = useState(90); // degrees from horizontal, 90 = vertical
  const [showPrediction, setShowPrediction] = useState(true);

  // Simulation state refs (real SI units)
  const rRef = useRef(0);          // distance from planet center (m)
  const vRef = useRef(0);          // radial velocity (m/s) - positive = outward
  const timeRef = useRef(0);       // simulation time (s)
  const maxAltRef = useRef(0);     // max altitude reached (m)
  const outcomeRef = useRef<"flying" | "escaped" | "returned" | null>(null);
  const rocketMass = 1000;         // kg (for energy calculations)
  const particleSystemRef = useRef(new ParticleSystem());
  const thrustParticlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }>>([]);

  const planet = PLANETS[planetIdx];
  const vEsc = escapeVelocity(planet);

  const resetSim = useCallback(() => {
    rRef.current = planet.radius;
    vRef.current = 0;
    timeRef.current = 0;
    maxAltRef.current = 0;
    outcomeRef.current = null;
    setLaunched(false);
    setLastResult(null);
  }, [planet.radius]);

  useEffect(() => {
    resetSim();
  }, [resetSim]);

  const launch = useCallback(() => {
    if (launched) return;
    const v0 = velocityFrac * vEsc;
    rRef.current = planet.radius;
    vRef.current = v0;
    timeRef.current = 0;
    maxAltRef.current = 0;
    outcomeRef.current = "flying";
    particleSystemRef.current.clear();
    thrustParticlesRef.current = [];
    setLaunched(true);
    setLastResult(null);
    playSFX("launch");
  }, [launched, velocityFrac, vEsc, planet.radius]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const halfW = W / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Stars (deterministic)
    for (let i = 0; i < 150; i++) {
      const sx = ((i * 7919 + 104729) % W);
      const sy = ((i * 6271 + 51407) % H);
      const sr = i % 7 === 0 ? 1.5 : 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.12 + (i % 5) * 0.06})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Divider line
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, H);
    ctx.stroke();

    // ===== LEFT HALF: Planet surface with rocket =====
    const leftCx = halfW / 2;
    const surfaceY = H * 0.78;
    const planetVisualR = halfW * 0.85;

    // Planet body (arc at bottom)
    const planetCenterY = surfaceY + planetVisualR;
    const planetGrad = ctx.createRadialGradient(
      leftCx, planetCenterY - planetVisualR * 0.3, planetVisualR * 0.1,
      leftCx, planetCenterY, planetVisualR
    );
    planetGrad.addColorStop(0, planet.surfaceColor);
    planetGrad.addColorStop(1, planet.color);
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(leftCx, planetCenterY, planetVisualR, 0, Math.PI * 2);
    ctx.fill();

    // Atmosphere glow
    const atmosGlow = ctx.createRadialGradient(
      leftCx, planetCenterY, planetVisualR - 5,
      leftCx, planetCenterY, planetVisualR + 30
    );
    atmosGlow.addColorStop(0, planet.glowColor);
    atmosGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = atmosGlow;
    ctx.beginPath();
    ctx.arc(leftCx, planetCenterY, planetVisualR + 30, 0, Math.PI * 2);
    ctx.fill();

    // Surface detail lines
    ctx.strokeStyle = `rgba(255,255,255,0.06)`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const ly = surfaceY + 8 + i * 18;
      ctx.beginPath();
      const xSpread = Math.sqrt(Math.max(0, planetVisualR * planetVisualR - (ly - planetCenterY) * (ly - planetCenterY)));
      ctx.moveTo(leftCx - xSpread + 20, ly);
      ctx.quadraticCurveTo(leftCx, ly + (i % 2 === 0 ? -6 : 6), leftCx + xSpread - 20, ly);
      ctx.stroke();
    }

    // Rocket position calculation
    const altitude = rRef.current - planet.radius; // meters above surface
    // Map altitude to visual position: surface = surfaceY, top of left panel = 20
    // Use logarithmic scaling for large altitudes
    const maxVisualAlt = surfaceY - 30;
    let rocketY: number;
    if (altitude <= 0) {
      rocketY = surfaceY;
    } else {
      // Scale: when altitude = planet.radius, rocket is near top
      const normAlt = Math.min(altitude / (planet.radius * 2), 1);
      const logScale = Math.log(1 + normAlt * 99) / Math.log(100); // log scaling
      rocketY = surfaceY - logScale * maxVisualAlt;
    }

    // Clamp rocket
    if (rocketY < -30) {
      // Escaped off screen
      rocketY = -30;
    }

    // Draw rocket
    const rocketX = leftCx;
    const rSize = 12;

    // Rocket flame (when launching and moving upward) - enhanced with particle system
    if (launched && outcomeRef.current === "flying" && vRef.current > 0 && timeRef.current < 2) {
      // Main flame triangle
      const flameLen = 12 + Math.random() * 14;
      const flameGrad = ctx.createLinearGradient(rocketX, rocketY + rSize, rocketX, rocketY + rSize + flameLen);
      flameGrad.addColorStop(0, "rgba(255,255,255,0.9)");
      flameGrad.addColorStop(0.2, "rgba(251,191,36,0.9)");
      flameGrad.addColorStop(0.5, "rgba(239,68,68,0.7)");
      flameGrad.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(rocketX - 6, rocketY + rSize);
      ctx.lineTo(rocketX, rocketY + rSize + flameLen);
      ctx.lineTo(rocketX + 6, rocketY + rSize);
      ctx.closePath();
      ctx.fill();

      // Secondary inner flame
      const innerLen = 6 + Math.random() * 8;
      const innerGrad = ctx.createLinearGradient(rocketX, rocketY + rSize, rocketX, rocketY + rSize + innerLen);
      innerGrad.addColorStop(0, "rgba(255,255,255,0.8)");
      innerGrad.addColorStop(0.5, "rgba(147,197,253,0.5)");
      innerGrad.addColorStop(1, "rgba(147,197,253,0)");
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.moveTo(rocketX - 3, rocketY + rSize);
      ctx.lineTo(rocketX, rocketY + rSize + innerLen);
      ctx.lineTo(rocketX + 3, rocketY + rSize);
      ctx.closePath();
      ctx.fill();

      // Thrust exhaust particles
      for (let tp = 0; tp < 2; tp++) {
        thrustParticlesRef.current.push({
          x: rocketX + (Math.random() - 0.5) * 8,
          y: rocketY + rSize + 5,
          vx: (Math.random() - 0.5) * 40,
          vy: 30 + Math.random() * 80,
          life: 0.3 + Math.random() * 0.4,
          maxLife: 0.3 + Math.random() * 0.4,
          size: 2 + Math.random() * 3,
        });
      }

      // Flame glow
      const fGlow = ctx.createRadialGradient(rocketX, rocketY + rSize + 5, 0, rocketX, rocketY + rSize + 5, 25);
      fGlow.addColorStop(0, "rgba(251,191,36,0.4)");
      fGlow.addColorStop(0.5, "rgba(239,68,68,0.15)");
      fGlow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = fGlow;
      ctx.beginPath();
      ctx.arc(rocketX, rocketY + rSize + 5, 25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw thrust exhaust particles
    for (const tp of thrustParticlesRef.current) {
      const tpAlpha = tp.life / tp.maxLife;
      ctx.fillStyle = `rgba(251,191,36,${tpAlpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, tp.size * tpAlpha, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rocket body (triangle/arrow pointing up)
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(rocketX, rocketY - rSize);         // nose
    ctx.lineTo(rocketX - 6, rocketY + rSize);     // bottom left
    ctx.lineTo(rocketX + 6, rocketY + rSize);     // bottom right
    ctx.closePath();
    ctx.fill();

    // Rocket window
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.arc(rocketX, rocketY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Rocket fins
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(rocketX - 6, rocketY + rSize);
    ctx.lineTo(rocketX - 10, rocketY + rSize + 5);
    ctx.lineTo(rocketX - 4, rocketY + rSize);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rocketX + 6, rocketY + rSize);
    ctx.lineTo(rocketX + 10, rocketY + rSize + 5);
    ctx.lineTo(rocketX + 4, rocketY + rSize);
    ctx.closePath();
    ctx.fill();

    // Rocket glow
    const rGlow = ctx.createRadialGradient(rocketX, rocketY, 0, rocketX, rocketY, 30);
    rGlow.addColorStop(0, "rgba(255,255,255,0.15)");
    rGlow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rGlow;
    ctx.beginPath();
    ctx.arc(rocketX, rocketY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Trajectory prediction line (before launch)
    if (!launched && showPrediction) {
      const predV0 = velocityFrac * vEsc;
      const totalE2 = 0.5 * rocketMass * predV0 * predV0 - G * planet.mass * rocketMass / planet.radius;
      // Draw predicted maximum altitude line
      let maxPredAlt = 0;
      if (totalE2 >= 0) {
        maxPredAlt = planet.radius * 4; // Will escape
      } else {
        // r_max = -GMm / E_total (for bound orbit)
        maxPredAlt = -G * planet.mass * rocketMass / totalE2 - planet.radius;
      }
      const maxVisualAlt2 = surfaceY - 30;
      const normAlt2 = Math.min(maxPredAlt / (planet.radius * 2), 1);
      const logScale2 = Math.log(1 + normAlt2 * 99) / Math.log(100);
      const predY = surfaceY - logScale2 * maxVisualAlt2;

      // Dashed prediction line
      ctx.strokeStyle = "rgba(251,191,36,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rocketX, surfaceY);
      ctx.lineTo(rocketX, Math.max(predY, 10));
      ctx.stroke();
      ctx.setLineDash([]);

      // Prediction altitude label
      if (maxPredAlt > 0) {
        const altLabel = totalE2 >= 0 ? "Escapes!" : `Max: ${(maxPredAlt / 1000).toFixed(0)} km`;
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillStyle = totalE2 >= 0 ? "#22c55e" : "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText(altLabel, rocketX, Math.max(predY, 20) - 5);
      }
    }

    // Launch pad
    ctx.fillStyle = "#64748b";
    ctx.fillRect(rocketX - 18, surfaceY, 36, 4);
    ctx.fillStyle = "#475569";
    ctx.fillRect(rocketX - 3, surfaceY - 2, 6, 6);

    // Left panel info overlay
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(8, 8, halfW - 24, 108, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ESCAPE VELOCITY CHALLENGE", 18, 26);

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Planet: ${planet.name}`, 18, 44);
    ctx.fillText(`v_esc = ${(vEsc / 1000).toFixed(2)} km/s`, 18, 60);

    const currentV = vRef.current;
    const altKm = Math.max(0, altitude / 1000);
    ctx.fillText(`Velocity: ${(currentV / 1000).toFixed(2)} km/s`, 18, 78);
    ctx.fillText(`Altitude: ${altKm < 1000 ? altKm.toFixed(1) + " km" : (altKm / 1000).toFixed(2) + " Mm"}`, 18, 96);

    // Outcome display with near-miss and orbit feedback
    if (outcomeRef.current === "escaped") {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(8, H * 0.38, halfW - 24, 40, 8);
      ctx.fill();
      ctx.font = "bold 14px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText("ESCAPED!", leftCx, H * 0.38 + 26);
    } else if (outcomeRef.current === "returned") {
      const ratio = velocityFrac;
      const isNearMiss = ratio >= 0.85 && ratio < 1.0;
      const isOrbit = ratio >= 0.7 && ratio < 0.85;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(8, H * 0.38, halfW - 24, isNearMiss || isOrbit ? 72 : 56, 8);
      ctx.fill();
      ctx.font = "bold 14px system-ui";
      ctx.fillStyle = isNearMiss ? "#f59e0b" : "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText(isNearMiss ? "ALMOST!" : "FELL BACK", leftCx, H * 0.38 + 24);
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Max alt: ${(maxAltRef.current / 1000).toFixed(1)} km`, leftCx, H * 0.38 + 44);

      if (isNearMiss) {
        ctx.fillStyle = "#f59e0b";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(`${((1 - ratio) * 100).toFixed(1)}% short of escape!`, leftCx, H * 0.38 + 60);
      } else if (isOrbit) {
        ctx.fillStyle = "#3b82f6";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(`Orbit altitude: ${(maxAltRef.current / 1000).toFixed(0)} km`, leftCx, H * 0.38 + 60);
      }
    }

    // ===== RIGHT HALF: PE well diagram =====
    const rMargin = 30;
    const chartLeft = halfW + rMargin;
    const chartRight = W - rMargin;
    const chartTop = 50;
    const chartBottom = H - 50;
    const chartW = chartRight - chartLeft;
    const chartH = chartBottom - chartTop;

    // Chart title
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(halfW + 8, 8, chartW + rMargin * 2 - 16, 32, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY vs DISTANCE", halfW + 20, 28);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    // Axis labels
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("r (distance from center)", (chartLeft + chartRight) / 2, chartBottom + 30);
    ctx.save();
    ctx.translate(halfW + 14, (chartTop + chartBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Energy", 0, 0);
    ctx.restore();

    // Energy calculations
    const v0 = velocityFrac * vEsc;
    const KE0 = 0.5 * rocketMass * v0 * v0;
    const PE0 = -G * planet.mass * rocketMass / planet.radius;
    const totalE = KE0 + PE0;

    // PE curve: plot from r = R to r = 5R
    // Scale: map energy range to chart height
    const rMin = planet.radius;
    const rMax = planet.radius * 5;
    const PEatRmin = -G * planet.mass * rocketMass / rMin;
    const PEatRmax = -G * planet.mass * rocketMass / rMax;

    // Energy range: from PEatRmin (most negative) to max of (totalE, 0) + some margin
    const eMin = PEatRmin * 1.1;
    const eMax = Math.max(Math.abs(PEatRmin) * 0.15, totalE * 1.3, KE0 * 0.3);
    const eRange = eMax - eMin;

    const mapR = (r: number) => chartLeft + ((r - rMin) / (rMax - rMin)) * chartW;
    const mapE = (e: number) => chartBottom - ((e - eMin) / eRange) * chartH;

    // Zero energy line
    const zeroY = mapE(0);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, zeroY);
    ctx.lineTo(chartRight, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "right";
    ctx.fillText("E = 0", chartLeft - 4, zeroY + 3);

    // PE curve
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#3b82f6";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const r = rMin + (i / steps) * (rMax - rMin);
      const pe = -G * planet.mass * rocketMass / r;
      const px = mapR(r);
      const py = mapE(pe);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // PE label
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText("PE = -GMm/r", mapR(rMin + (rMax - rMin) * 0.55), mapE(PEatRmax) - 10);

    // Total energy line (horizontal)
    const teY = mapE(totalE);
    if (teY > chartTop - 10 && teY < chartBottom + 10) {
      ctx.strokeStyle = totalE >= 0 ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.shadowColor = totalE >= 0 ? "#22c55e" : "#ef4444";
      ctx.shadowBlur = 4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(chartLeft, teY);
      ctx.lineTo(chartRight, teY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Total energy label
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = totalE >= 0 ? "#22c55e" : "#ef4444";
      ctx.textAlign = "right";
      const teLabel = totalE >= 0 ? "E_total >= 0 (Escapes)" : "E_total < 0 (Bound)";
      ctx.fillText(teLabel, chartRight, teY - 8);
    }

    // KE bar at current position
    if (launched && outcomeRef.current === "flying") {
      const currentR = rRef.current;
      if (currentR >= rMin && currentR <= rMax) {
        const currentPE = -G * planet.mass * rocketMass / currentR;
        const currentKE = totalE - currentPE; // from conservation
        const currentRx = mapR(currentR);
        const currentPEy = mapE(currentPE);

        // KE bar (from PE curve up to total energy line)
        if (currentKE > 0) {
          const keTopY = mapE(currentPE + currentKE);
          ctx.fillStyle = "rgba(239,68,68,0.3)";
          ctx.fillRect(currentRx - 8, keTopY, 16, currentPEy - keTopY);
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(currentRx - 8, keTopY, 16, currentPEy - keTopY);

          // KE label
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "center";
          ctx.fillText("KE", currentRx, keTopY - 5);
        }

        // Current position dot on PE curve
        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#fbbf24";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(currentRx, currentPEy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Position marker line
        ctx.strokeStyle = "rgba(251,191,36,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(currentRx, chartTop);
        ctx.lineTo(currentRx, chartBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (!launched) {
      // Show initial position dot at surface
      const initRx = mapR(rMin);
      const initPEy = mapE(PEatRmin);

      // KE bar preview
      if (KE0 > 0) {
        const keTopY = mapE(PEatRmin + KE0);
        ctx.fillStyle = "rgba(239,68,68,0.2)";
        ctx.fillRect(initRx - 8, keTopY, 16, initPEy - keTopY);
        ctx.strokeStyle = "rgba(239,68,68,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(initRx - 8, keTopY, 16, initPEy - keTopY);

        ctx.font = "9px ui-monospace, monospace";
        ctx.fillStyle = "rgba(239,68,68,0.7)";
        ctx.textAlign = "center";
        ctx.fillText("KE", initRx, keTopY - 5);
      }

      // Dot at surface
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(initRx, initPEy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // R-axis ticks
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    for (let i = 1; i <= 5; i++) {
      const r = planet.radius * i;
      const rx = mapR(r);
      if (rx >= chartLeft && rx <= chartRight) {
        ctx.beginPath();
        ctx.moveTo(rx, chartBottom);
        ctx.lineTo(rx, chartBottom + 5);
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText(`${i}R`, rx, chartBottom + 16);
      }
    }

    // Score display
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(halfW + 8, H - 42, 90, 32, 8);
    ctx.fill();
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, halfW + 18, H - 20);
  }, [planet, vEsc, velocityFrac, launched, score, rocketMass]);

  const animate = useCallback(() => {
    if (!launched || outcomeRef.current !== "flying") {
      draw();
      return;
    }

    // Time scaling: use real physics with scaled time step
    // Use substeps with Velocity Verlet for accuracy
    const realDt = 1 / 60; // 60fps frame
    const timeScale = planet.radius / 2000; // scale time to make it visually interesting
    const dt = realDt * timeScale;
    const substeps = 8;
    const subDt = dt / substeps;

    const r = rRef.current;
    const v = vRef.current;

    let newR = r;
    let newV = v;

    for (let s = 0; s < substeps; s++) {
      // Velocity Verlet integration: a = -GM/r^2 (positive = outward for r increasing)
      const a1 = -G * planet.mass / (newR * newR);

      // Half-step velocity
      const vHalf = newV + a1 * subDt * 0.5;

      // Full-step position
      newR = newR + vHalf * subDt;

      // Check if hit surface
      if (newR <= planet.radius) {
        newR = planet.radius;
        newV = 0;
        outcomeRef.current = "returned";

        // Score calculation
        const ratio = velocityFrac;
        if (ratio >= 0.98 && ratio <= 1.02) {
          // Within 2% of exact escape velocity but still didn't escape - edge case
          // Actually if within 2%, the rocket would barely escape or not
          // Score based on launch velocity ratio
        }
        break;
      }

      // Recalculate acceleration at new position
      const a2 = -G * planet.mass / (newR * newR);

      // Full-step velocity
      newV = vHalf + a2 * subDt * 0.5;
    }

    rRef.current = newR;
    vRef.current = newV;
    timeRef.current += dt;

    // Track max altitude
    const alt = newR - planet.radius;
    if (alt > maxAltRef.current) {
      maxAltRef.current = alt;
    }

    // Check escape: if altitude > 4 * planet radius, consider escaped
    if (alt > planet.radius * 4 && newV > 0) {
      outcomeRef.current = "escaped";
      // Calculate score
      const ratio = velocityFrac;
      let pts = 0;
      if (Math.abs(ratio - 1.0) <= 0.02) {
        pts = 3;
        setLastResult("Perfect! Exactly escape velocity (+3)");
        playSFX("success");
        playScore(3);
      } else if (Math.abs(ratio - 1.0) <= 0.05) {
        pts = 2;
        setLastResult("Close! Within 5% of v_esc (+2)");
        playSFX("correct");
        playScore(2);
      } else {
        pts = 1;
        setLastResult("Escaped! (+1)");
        playSFX("correct");
        playScore(1);
      }
      setScore((prev) => prev + pts);
    }

    // Check returned
    if (outcomeRef.current === "returned") {
      const ratio = velocityFrac;
      // Orbit capture scoring
      if (ratio >= 0.7 && ratio < 1.0) {
        const orbitAltKm = maxAltRef.current / 1000;
        let pts = 0;
        if (ratio >= 0.95) {
          pts = 2;
          setLastResult(`Near miss! Max alt ${orbitAltKm.toFixed(0)} km (+2)`);
          playSFX("whoosh");
          playScore(2);
        } else if (ratio >= 0.85) {
          pts = 1;
          setLastResult(`High orbit! Max alt ${orbitAltKm.toFixed(0)} km (+1)`);
          playSFX("whoosh");
          playScore(1);
        } else {
          setLastResult(`Orbit at ${orbitAltKm.toFixed(0)} km. Need more speed!`);
          playSFX("drop");
        }
        if (pts > 0) setScore((prev) => prev + pts);
      } else {
        setLastResult("Rocket fell back. Try more velocity!");
        playSFX("drop");
      }
    }

    // Update thrust particles
    thrustParticlesRef.current = thrustParticlesRef.current.filter((tp) => {
      tp.x += tp.vx * realDt;
      tp.y += tp.vy * realDt;
      tp.life -= realDt;
      return tp.life > 0;
    });

    draw();

    if (outcomeRef.current === "flying") {
      animRef.current = requestAnimationFrame(animate);
    }
  }, [launched, planet, velocityFrac, draw]);

  useEffect(() => {
    if (launched && outcomeRef.current === "flying") {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [launched, animate]);

  // Initial draw and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 520));
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Redraw when not animating
  useEffect(() => {
    if (!launched || outcomeRef.current !== "flying") {
      draw();
    }
  }, [draw, launched]);

  const handlePlanetChange = (idx: number) => {
    setPlanetIdx(idx);
    // Reset will happen via useEffect on planet.radius change
  };

  const currentPlanet = PLANETS[planetIdx];
  const currentVesc = escapeVelocity(currentPlanet);
  const launchV = velocityFrac * currentVesc;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Planet selector */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Planet
          </label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {PLANETS.map((p, idx) => (
              <button
                key={p.name}
                onClick={() => handlePlanetChange(idx)}
                disabled={launched}
                className={`h-9 rounded-lg text-xs font-medium border transition-colors ${
                  planetIdx === idx
                    ? p.btnActiveColor
                    : `${p.btnColor} hover:opacity-80`
                } ${launched ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Velocity slider */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Launch Velocity ({(velocityFrac * 100).toFixed(0)}% of v_esc)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={velocityFrac}
              onChange={(e) => {
                if (!launched) setVelocityFrac(Number(e.target.value));
              }}
              disabled={launched}
              className="flex-1 accent-purple-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4.5rem] text-right">
              {(launchV / 1000).toFixed(2)} km/s
            </span>
          </div>
        </div>

        {/* Launch Angle */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Launch Angle
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={30}
              max={90}
              step={5}
              value={launchAngle}
              onChange={(e) => {
                if (!launched) setLaunchAngle(Number(e.target.value));
              }}
              disabled={launched}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {launchAngle}&deg;
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showPrediction}
                onChange={(e) => setShowPrediction(e.target.checked)}
                className="accent-amber-500"
              />
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Show prediction</span>
            </label>
          </div>
        </div>

        {/* Launch / Reset */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={launch}
            disabled={launched}
            className={`flex-1 h-10 rounded-lg font-medium text-sm transition-colors ${
              launched
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
          >
            Launch
          </button>
          <button
            onClick={resetSim}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Score & Result */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Score
          </label>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-amber-500">{score}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">pts</span>
          </div>
          {lastResult && (
            <p className={`text-xs mt-1 font-medium ${
              lastResult.includes("Perfect") ? "text-green-500" :
              lastResult.includes("Close") ? "text-blue-500" :
              lastResult.includes("Escaped") ? "text-amber-500" :
              "text-red-400"
            }`}>
              {lastResult}
            </p>
          )}
        </div>
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Escape Velocity &amp; Gravitational Energy
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            v_esc = &radic;(2GM/R)
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            KE = &frac12;mv&sup2;
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            PE = &minus;GMm/r
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            E = KE + PE
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="v_{esc} = \sqrt{\frac{2GM}{R}}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E = \frac{1}{2}mv^2 - \frac{GMm}{r}" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Launch at different speeds to see if the object escapes or falls back. Try different planet masses!
      </p>
    </div>
  );
}
