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
import { drawInfoPanel, drawMeter } from "@/lib/simulation/drawing";
import { getCanvasMousePos } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

interface KeplerMeasurement {
  perihelion: number;
  aphelion: number;
  period: number;
  startTime: number;
  startAngle: number;
  completed: boolean;
  lastAngle: number;
  totalAngle: number;
}

export default function OrbitalMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [centralMass, setCentralMass] = useState(500);
  const [orbiterSpeed, setOrbiterSpeed] = useState(1.0);
  const [isRunning, setIsRunning] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [showEnergy, setShowEnergy] = useState(true);
  const [mode, setMode] = useState<"free" | "stableOrbit" | "hohmann">("free");

  const posRef = useRef({ x: 0.75, y: 0.5 });
  const velRef = useRef({ vx: 0, vy: 0 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  // Particle system for thrust effects
  const particleSystemRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());

  // Kepler measurement
  const keplerRef = useRef<KeplerMeasurement>({
    perihelion: Infinity,
    aphelion: 0,
    period: 0,
    startTime: 0,
    startAngle: 0,
    completed: false,
    lastAngle: 0,
    totalAngle: 0,
  });

  // Challenge targets
  const targetRadiusRef = useRef(0.15);
  // Hohmann: inner and outer orbit radii
  const hohmannRef = useRef({ innerR: 0.15, outerR: 0.35, phase: 0 as 0 | 1 | 2 });

  const G_SCALE = 0.0008;

  const init = useCallback(() => {
    const r0 = 0.25;
    posRef.current = { x: 0.5 + r0, y: 0.5 };
    const GM = centralMass * G_SCALE;
    const vCirc = Math.sqrt(GM / r0);
    const v = vCirc * orbiterSpeed;
    velRef.current = { vx: 0, vy: -v };
    trailRef.current = [];
    timeRef.current = 0;
    keplerRef.current = {
      perihelion: Infinity,
      aphelion: 0,
      period: 0,
      startTime: 0,
      startAngle: 0,
      completed: false,
      lastAngle: 0,
      totalAngle: 0,
    };
  }, [orbiterSpeed, centralMass]);

  useEffect(() => {
    init();
  }, [init]);

  const startStableOrbitChallenge = useCallback(() => {
    targetRadiusRef.current = 0.1 + Math.random() * 0.2;
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Achieve circular orbit at target radius",
    };
    setMode("stableOrbit");
    // Reset to a different starting position
    const r0 = 0.2;
    posRef.current = { x: 0.5 + r0, y: 0.5 };
    const GM = centralMass * G_SCALE;
    const vCirc = Math.sqrt(GM / r0);
    velRef.current = { vx: 0, vy: -vCirc * 0.8 }; // not quite circular
    trailRef.current = [];
    timeRef.current = 0;
  }, [centralMass]);

  const startHohmannChallenge = useCallback(() => {
    const innerR = 0.12;
    const outerR = 0.3;
    hohmannRef.current = { innerR, outerR, phase: 0 };
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Hohmann transfer to outer orbit",
    };
    setMode("hohmann");
    // Start in circular orbit at inner radius
    posRef.current = { x: 0.5 + innerR, y: 0.5 };
    const GM = centralMass * G_SCALE;
    const vCirc = Math.sqrt(GM / innerR);
    velRef.current = { vx: 0, vy: -vCirc };
    trailRef.current = [];
    timeRef.current = 0;
  }, [centralMass]);

  const checkStableOrbit = useCallback(() => {
    const kepler = keplerRef.current;
    const targetR = targetRadiusRef.current;

    // Measure eccentricity (how circular)
    const semiMajor = (kepler.perihelion + kepler.aphelion) / 2;
    const eccentricity = kepler.aphelion > 0 ? (kepler.aphelion - kepler.perihelion) / (kepler.aphelion + kepler.perihelion) : 1;

    // Score based on: being near target radius AND being circular
    const radiusResult = calculateAccuracy(semiMajor, targetR, targetR * 0.5);
    const circularResult = calculateAccuracy(eccentricity, 0, 0.5);

    // Combined score
    const combinedPoints = Math.min(radiusResult.points, circularResult.points);
    const result = {
      points: combinedPoints,
      tier: combinedPoints >= 3 ? "perfect" as const : combinedPoints >= 2 ? "great" as const : combinedPoints >= 1 ? "good" as const : "miss" as const,
      label: combinedPoints >= 3 ? "Perfect!" : combinedPoints >= 2 ? "Great!" : combinedPoints >= 1 ? "Close!" : "Try Again",
    };

    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${result.label} (e=${eccentricity.toFixed(2)})`,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 3,
        startTime: performance.now(),
      });
    }

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (result.tier === "perfect" && canvas) {
        particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 25);
      }
      // New target
      setTimeout(() => {
        targetRadiusRef.current = 0.1 + Math.random() * 0.2;
        keplerRef.current = { ...keplerRef.current, perihelion: Infinity, aphelion: 0, completed: false, totalAngle: 0 };
      }, 2000);
    } else {
      playSFX("incorrect");
    }
  }, []);

  const applyBoost = useCallback(
    (clickX: number, clickY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;

      const px = posRef.current.x * W;
      const py = posRef.current.y * H;

      // Direction from planet toward click
      const dx = clickX - px;
      const dy = clickY - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) return;

      const boostMag = 0.008;
      const bx = (dx / dist) * boostMag;
      const by = (dy / dist) * boostMag;

      velRef.current.vx += bx;
      velRef.current.vy += by;

      // Thrust particles in opposite direction
      const thrustAngle = Math.atan2(-by, -bx);
      particleSystemRef.current.emit(px, py, 12, "#f59e0b", {
        speed: 200,
        lifetime: 0.5,
        size: 3,
        shape: "spark",
        gravity: 0,
        drag: 0.95,
        angle: thrustAngle,
        spread: Math.PI * 0.4,
      });
      playSFX("launch");

      // Hohmann phase tracking
      if (mode === "hohmann") {
        const h = hohmannRef.current;
        if (h.phase === 0) {
          h.phase = 1; // first burn done
          playSFX("powerup");
        } else if (h.phase === 1) {
          h.phase = 2; // second burn
          // Check if we're near the outer orbit
          const currentR = Math.sqrt((posRef.current.x - 0.5) ** 2 + (posRef.current.y - 0.5) ** 2);
          const result = calculateAccuracy(currentR, h.outerR, h.outerR * 0.3);
          challengeRef.current = updateChallengeState(challengeRef.current, result);

          if (canvas) {
            popupsRef.current.push({
              text: result.label,
              points: result.points,
              x: canvas.width / 2,
              y: canvas.height / 3,
              startTime: performance.now(),
            });
          }

          if (result.points > 0) {
            playSFX("success");
            playScore(result.points);
            if (result.tier === "perfect") {
              particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 30);
            }
          } else {
            playSFX("incorrect");
          }
        }
      }
    },
    [mode]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const now = performance.now();

    ctx.clearRect(0, 0, W, H);

    // Space background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (let i = 0; i < 120; i++) {
      const sx = (i * 7919 + 104729) % W;
      const sy = (i * 6271 + 51407) % H;
      const sr = i % 7 === 0 ? 1.5 : 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.08})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    const cx = W * 0.5;
    const cy = H * 0.5;

    // Target orbit ring (for stable orbit challenge)
    if (mode === "stableOrbit" && challengeRef.current.active) {
      const targetR = targetRadiusRef.current;
      const targetPx = targetR * Math.min(W, H);
      const pulse = (now % 3000) / 3000;
      const pulseAlpha = 0.15 + Math.sin(pulse * Math.PI * 2) * 0.08;

      ctx.strokeStyle = `rgba(245, 158, 11, ${pulseAlpha})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, targetPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target label
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`Target: r = ${(targetR * 100).toFixed(0)}`, cx, cy - targetPx - 10);
    }

    // Hohmann orbit rings
    if (mode === "hohmann" && challengeRef.current.active) {
      const h = hohmannRef.current;

      // Inner orbit
      const innerPx = h.innerR * Math.min(W, H);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, innerPx, 0, Math.PI * 2);
      ctx.stroke();

      // Outer orbit
      const outerPx = h.outerR * Math.min(W, H);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
      ctx.beginPath();
      ctx.arc(cx, cy, outerPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "center";
      ctx.fillText("inner orbit", cx, cy - innerPx - 8);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("outer orbit (target)", cx, cy - outerPx - 8);

      // Phase indicator
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, H - 80, 200, 68, 8);
      ctx.fill();
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#f59e0b";
      ctx.fillText("HOHMANN TRANSFER", 22, H - 62);
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = h.phase === 0 ? "#22c55e" : "#64748b";
      ctx.fillText(`1. Click to fire prograde burn`, 22, H - 45);
      ctx.fillStyle = h.phase === 1 ? "#22c55e" : "#64748b";
      ctx.fillText(`2. Coast to apoapsis`, 22, H - 30);
      ctx.fillStyle = h.phase >= 1 ? "#22c55e" : "#64748b";
      ctx.fillText(`3. Click to circularize`, 22, H - 15);
    }

    // Trail
    if (showTrail) {
      const trail = trailRef.current;
      if (trail.length > 2) {
        for (let i = 1; i < trail.length; i++) {
          const alpha = (i / trail.length) * 0.7;
          ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
          ctx.lineTo(trail[i].x * W, trail[i].y * H);
          ctx.stroke();
        }
      }
    }

    // Central body glow
    const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
    sunGlow.addColorStop(0, "rgba(251, 191, 36, 0.35)");
    sunGlow.addColorStop(0.4, "rgba(251, 191, 36, 0.08)");
    sunGlow.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.fill();

    // Central body
    const sunRadius = 14 + centralMass / 100;
    const sunGrad = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, sunRadius);
    sunGrad.addColorStop(0, "#fef08a");
    sunGrad.addColorStop(0.5, "#fbbf24");
    sunGrad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sun corona rays
    ctx.strokeStyle = "rgba(251, 191, 36, 0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Date.now() * 0.0008;
      ctx.beginPath();
      ctx.moveTo(
        cx + Math.cos(angle) * (sunRadius + 3),
        cy + Math.sin(angle) * (sunRadius + 3)
      );
      ctx.lineTo(
        cx + Math.cos(angle) * (sunRadius + 18),
        cy + Math.sin(angle) * (sunRadius + 18)
      );
      ctx.stroke();
    }

    // Orbiting body
    const px = posRef.current.x * W;
    const py = posRef.current.y * H;

    // Planet glow
    const planetGlow = ctx.createRadialGradient(px, py, 0, px, py, 28);
    planetGlow.addColorStop(0, "rgba(59, 130, 246, 0.35)");
    planetGlow.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = planetGlow;
    ctx.beginPath();
    ctx.arc(px, py, 28, 0, Math.PI * 2);
    ctx.fill();

    // Planet
    const planetGrad = ctx.createRadialGradient(px - 3, py - 3, 0, px, py, 10);
    planetGrad.addColorStop(0, "#93c5fd");
    planetGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fill();

    // Velocity vector
    const vx = velRef.current.vx;
    const vy = velRef.current.vy;
    const vScale = 25;
    const vMag = Math.sqrt(vx * vx + vy * vy);
    if (vMag > 0.005) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + vx * vScale, py + vy * vScale);
      ctx.stroke();
      const nvx = vx / vMag;
      const nvy = vy / vMag;
      const tipX = px + vx * vScale;
      const tipY = py + vy * vScale;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - nvx * 8 - nvy * 4, tipY - nvy * 8 + nvx * 4);
      ctx.lineTo(tipX - nvx * 8 + nvy * 4, tipY - nvy * 8 - nvx * 4);
      ctx.closePath();
      ctx.fill();
    }

    // Gravity vector (towards center)
    const gdx = cx - px;
    const gdy = cy - py;
    const dist = Math.sqrt(gdx * gdx + gdy * gdy);
    if (dist > sunRadius + 15) {
      const gLen = Math.min(30, (2000 / (dist * dist)) * 100);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (gdx / dist) * gLen, py + (gdy / dist) * gLen);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      const gtipX = px + (gdx / dist) * gLen;
      const gtipY = py + (gdy / dist) * gLen;
      ctx.beginPath();
      ctx.moveTo(gtipX, gtipY);
      ctx.lineTo(
        gtipX - (gdx / dist) * 7 - (gdy / dist) * 3.5,
        gtipY - (gdy / dist) * 7 + (gdx / dist) * 3.5
      );
      ctx.lineTo(
        gtipX - (gdx / dist) * 7 + (gdy / dist) * 3.5,
        gtipY - (gdy / dist) * 7 - (gdx / dist) * 3.5
      );
      ctx.closePath();
      ctx.fill();
    }

    // Draw particle system (thrust effects)
    particleSystemRef.current.draw(ctx);

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 150, 75, 8);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#22c55e";
    ctx.fillText("\u2014 velocity", 25, 30);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("\u2014 gravity", 25, 48);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("\u2014 orbit trail", 25, 66);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("click to thrust", 25, 82);

    // Orbital data info
    const distNorm = Math.sqrt(
      (posRef.current.x - 0.5) ** 2 + (posRef.current.y - 0.5) ** 2
    );
    const speed = Math.sqrt(vx * vx + vy * vy);
    const GM = centralMass * G_SCALE;
    const vEsc = Math.sqrt((2 * GM) / distNorm);
    const orbitType =
      speed >= vEsc ? "Hyperbolic" : orbiterSpeed === 1 ? "Circular" : "Elliptical";

    // Energy display
    if (showEnergy) {
      const KE = 0.5 * speed * speed;
      const PE = -GM / distNorm;
      const totalE = KE + PE;

      drawInfoPanel(ctx, W - 200, 12, 188, 145, "ORBITAL DATA", [
        { label: "Speed", value: (speed * 100).toFixed(1), color: "#22c55e" },
        { label: "Distance", value: (distNorm * 100).toFixed(1), color: "#60a5fa" },
        { label: "v/v_esc", value: (speed / vEsc).toFixed(2), color: "#e2e8f0" },
        {
          label: "Orbit",
          value: orbitType,
          color:
            orbitType === "Circular"
              ? "#22c55e"
              : orbitType === "Elliptical"
              ? "#3b82f6"
              : "#ef4444",
        },
        { label: "KE", value: (KE * 1000).toFixed(1), color: "#22c55e" },
        { label: "PE", value: (PE * 1000).toFixed(1), color: "#ef4444" },
        {
          label: "Total E",
          value: (totalE * 1000).toFixed(1),
          color: totalE < 0 ? "#3b82f6" : "#ef4444",
        },
      ]);

      // Energy bar meters
      const barY = 165;
      const maxE = 0.05;
      drawMeter(ctx, W - 200, barY, 90, 8, KE, maxE, "#22c55e", "KE");
      drawMeter(ctx, W - 200, barY + 18, 90, 8, Math.abs(PE), maxE * 2, "#ef4444", "|PE|");
    } else {
      // Simplified info
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 195, 12, 183, 100, 8);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("ORBITAL DATA", W - 183, 30);
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Speed:  ${(speed * 100).toFixed(1)}`, W - 183, 48);
      ctx.fillText(`Dist:   ${(distNorm * 100).toFixed(1)}`, W - 183, 64);
      ctx.fillText(`v/v_esc: ${(speed / vEsc).toFixed(2)}`, W - 183, 80);
      ctx.fillStyle =
        orbitType === "Circular"
          ? "#22c55e"
          : orbitType === "Elliptical"
          ? "#3b82f6"
          : "#ef4444";
      ctx.fillText(`Orbit:  ${orbitType}`, W - 183, 96);
    }

    // Kepler's law verification panel
    const kepler = keplerRef.current;
    if (kepler.totalAngle > Math.PI * 2 && kepler.period > 0) {
      const a = (kepler.perihelion + kepler.aphelion) / 2;
      const T = kepler.period;
      const T2_a3 = (T * T) / (a * a * a);

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, 95, 175, 75, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#a78bfa";
      ctx.textAlign = "left";
      ctx.fillText("KEPLER VERIFICATION", 22, 112);
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`a = ${(a * 100).toFixed(1)}`, 22, 128);
      ctx.fillText(`T = ${T.toFixed(2)} s`, 22, 142);
      ctx.fillStyle = "#a78bfa";
      ctx.fillText(`T\u00B2/a\u00B3 = ${T2_a3.toFixed(2)}`, 22, 156);
      ctx.fillStyle = "#64748b";
      ctx.fillText(`(should be const)`, 100, 156);
    }

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Challenge scoreboard
    if (challengeRef.current.active) {
      renderScoreboard(ctx, W - 165, H - 140, 155, 130, challengeRef.current);
    }
  }, [centralMass, showTrail, showEnergy, orbiterSpeed, mode]);

  const animate = useCallback(() => {
    const GM = centralMass * G_SCALE;
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const frameDt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    const substeps = 4;
    const dt = frameDt / substeps;

    const pos = posRef.current;
    const vel = velRef.current;

    for (let s = 0; s < substeps; s++) {
      const dx = 0.5 - pos.x;
      const dy = 0.5 - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.005) {
        // Velocity Verlet
        const F = GM / (dist * dist);
        const ax = F * (dx / dist);
        const ay = F * (dy / dist);

        vel.vx += ax * dt * 0.5;
        vel.vy += ay * dt * 0.5;

        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;

        const dx2 = 0.5 - pos.x;
        const dy2 = 0.5 - pos.y;
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist2 > 0.005) {
          const F2 = GM / (dist2 * dist2);
          const ax2 = F2 * (dx2 / dist2);
          const ay2 = F2 * (dy2 / dist2);
          vel.vx += ax2 * dt * 0.5;
          vel.vy += ay2 * dt * 0.5;
        }
      }
    }

    timeRef.current += frameDt;

    // Kepler measurement tracking
    const distNorm = Math.sqrt((pos.x - 0.5) ** 2 + (pos.y - 0.5) ** 2);
    const kepler = keplerRef.current;

    // Track perihelion/aphelion
    if (distNorm < kepler.perihelion) kepler.perihelion = distNorm;
    if (distNorm > kepler.aphelion) kepler.aphelion = distNorm;

    // Track angle for period measurement
    const angle = Math.atan2(pos.y - 0.5, pos.x - 0.5);
    if (kepler.startTime === 0) {
      kepler.startTime = timeRef.current;
      kepler.startAngle = angle;
      kepler.lastAngle = angle;
    } else {
      // Track total angle traversed
      let dAngle = angle - kepler.lastAngle;
      // Handle wrapping
      if (dAngle > Math.PI) dAngle -= Math.PI * 2;
      if (dAngle < -Math.PI) dAngle += Math.PI * 2;
      kepler.totalAngle += Math.abs(dAngle);
      kepler.lastAngle = angle;

      // Completed one orbit?
      if (kepler.totalAngle >= Math.PI * 2 && !kepler.completed) {
        kepler.period = timeRef.current - kepler.startTime;
        kepler.completed = true;
      }
    }

    // Keep trail manageable
    trailRef.current.push({ x: pos.x, y: pos.y });
    if (trailRef.current.length > 800) trailRef.current.shift();

    particleSystemRef.current.update(frameDt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [centralMass, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.6), _isMobile ? 500 : 520);
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

  // Click-to-boost handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasMousePos(canvas, e.nativeEvent);
      applyBoost(pos.x, pos.y);
    },
    [applyBoost]
  );

  const reset = () => {
    init();
    lastTsRef.current = null;
    particleSystemRef.current.clear();
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          onClick={handleCanvasClick}
        />
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Mode
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setMode("free");
              challengeRef.current = { ...challengeRef.current, active: false };
              reset();
            }}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              mode === "free"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Free Orbit
          </button>
          <button
            onClick={startStableOrbitChallenge}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              mode === "stableOrbit"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Stable Orbit Challenge
          </button>
          <button
            onClick={startHohmannChallenge}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              mode === "hohmann"
                ? "bg-red-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Hohmann Transfer
          </button>
        </div>
      </div>

      {/* Stable orbit challenge panel */}
      {mode === "stableOrbit" && challengeRef.current.active && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Click to thrust and achieve a circular orbit at the target radius
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Target: r = {(targetRadiusRef.current * 100).toFixed(0)} | Score:{" "}
                {challengeRef.current.score} pts | Streak: {challengeRef.current.streak}
              </p>
            </div>
            <button
              onClick={checkStableOrbit}
              className="px-6 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Check Orbit
            </button>
          </div>
        </div>
      )}

      {/* Hohmann challenge panel */}
      {mode === "hohmann" && challengeRef.current.active && (
        <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                Perform a Hohmann transfer: two burns to reach the outer orbit
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Phase: {hohmannRef.current.phase === 0 ? "Waiting for first burn" : hohmannRef.current.phase === 1 ? "Coasting to apoapsis" : "Transfer complete"} |
                Score: {challengeRef.current.score} pts
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Central Mass
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={centralMass}
              onChange={(e) => {
                setCentralMass(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {centralMass} M☉
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Speed (&times; v_circ)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.3}
              max={1.6}
              step={0.05}
              value={orbiterSpeed}
              onChange={(e) => {
                setOrbiterSpeed(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {orbiterSpeed.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => setShowTrail(!showTrail)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showTrail
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Trail {showTrail ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => setShowEnergy(!showEnergy)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showEnergy
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Energy {showEnergy ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => {
              if (!isRunning) {
                lastTsRef.current = null;
              }
              setIsRunning(!isRunning);
            }}
            className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Kepler&apos;s Laws &amp; Orbits
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            F = GMm/r&sup2;
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            v_circ = &radic;(GM/r)
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            v_esc = &radic;(2GM/r)
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            T&sup2; &prop; a&sup3;
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="F = \frac{GMm}{r^2}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="v_{orbit} = \sqrt{\frac{GM}{r}}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="T^2 \propto a^3" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Click to apply thrust and change the orbit. Watch how speed changes with distance (Kepler&apos;s laws)!
      </p>
    </div>
  );
}
