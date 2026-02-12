"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX } from "@/lib/simulation/sound";
import { drawInfoPanel, drawMeter } from "@/lib/simulation/drawing";
import { renderScoreboard, renderScorePopup, createChallengeState, updateChallengeState, type ScorePopup, type ChallengeState } from "@/lib/simulation/scoring";
import { SimMath } from "@/components/simulations/SimMath";

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  mass: number;
  trail: { x: number; y: number }[];
  // Orbit tracking
  orbitAngle: number; // accumulated angle around heaviest body
  orbitRevolutions: number;
  lastAngle: number;
}

type InteractionMode = "idle" | "placing" | "dragging";

const TRAIL_LENGTH = 200;
const SOFTENING = 0.0015;
const BASE_G = 0.00015;
const MIN_BODY_RADIUS = 3;

function bodyRadius(mass: number): number {
  return Math.max(MIN_BODY_RADIUS, Math.cbrt(mass) * 2.2);
}

function bodyColor(mass: number): { fill: string; glow: string; trailRgb: string } {
  if (mass >= 200) {
    return { fill: "#f59e0b", glow: "rgba(245, 158, 11, 0.35)", trailRgb: "245, 158, 11" };
  } else if (mass >= 30) {
    if (mass >= 100) {
      return { fill: "#3b82f6", glow: "rgba(59, 130, 246, 0.35)", trailRgb: "59, 130, 246" };
    }
    return { fill: "#22c55e", glow: "rgba(34, 197, 94, 0.35)", trailRgb: "34, 197, 94" };
  }
  return { fill: "#94a3b8", glow: "rgba(148, 163, 184, 0.25)", trailRgb: "148, 163, 184" };
}

function computeAccelerations(bodies: Body[], G: number) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    bodies[i].ax = 0;
    bodies[i].ay = 0;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
      const r = Math.sqrt(r2);
      const r3 = r2 * r;
      const fx = G * bodies[i].mass * bodies[j].mass * dx / r3;
      const fy = G * bodies[i].mass * bodies[j].mass * dy / r3;
      bodies[i].ax += fx / bodies[i].mass;
      bodies[i].ay += fy / bodies[i].mass;
      bodies[j].ax -= fx / bodies[j].mass;
      bodies[j].ay -= fy / bodies[j].mass;
    }
  }
}

export default function GravitySandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);

  const bodiesRef = useRef<Body[]>([]);
  const [bodyCount, setBodyCount] = useState(0);

  const [isRunning, setIsRunning] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showVelocities, setShowVelocities] = useState(true);
  const [timeScale, setTimeScale] = useState(1.0);
  const [gravityScale, setGravityScale] = useState(1.0);
  const [placeMass, setPlaceMass] = useState(50);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showLagrange, setShowLagrange] = useState(false);
  const [challengeMode, setChallengeMode] = useState(false);

  const modeRef = useRef<InteractionMode>("idle");
  const placingPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);

  // Refs for animation-accessible values
  const showTrailsRef = useRef(showTrails);
  const showVelocitiesRef = useRef(showVelocities);
  const timeScaleRef = useRef(timeScale);
  const gravityScaleRef = useRef(gravityScale);
  const isRunningRef = useRef(isRunning);
  const soundEnabledRef = useRef(soundEnabled);
  const showLagrangeRef = useRef(showLagrange);
  const challengeModeRef = useRef(challengeMode);

  // Enhanced features
  const particleSystemRef = useRef(new ParticleSystem());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const orbitTargetRef = useRef(3); // Target revolutions for challenge

  useEffect(() => { showTrailsRef.current = showTrails; }, [showTrails]);
  useEffect(() => { showVelocitiesRef.current = showVelocities; }, [showVelocities]);
  useEffect(() => { timeScaleRef.current = timeScale; }, [timeScale]);
  useEffect(() => { gravityScaleRef.current = gravityScale; }, [gravityScale]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { showLagrangeRef.current = showLagrange; }, [showLagrange]);
  useEffect(() => { challengeModeRef.current = challengeMode; }, [challengeMode]);

  const clearAll = useCallback(() => {
    bodiesRef.current = [];
    setBodyCount(0);
    lastTsRef.current = null;
    particleSystemRef.current.clear();
    scorePopupsRef.current = [];
  }, []);

  // Calculate total system energy
  const calculateSystemEnergy = useCallback((bodies: Body[], G: number): { ke: number; pe: number; total: number } => {
    let ke = 0;
    let pe = 0;
    for (let i = 0; i < bodies.length; i++) {
      ke += 0.5 * bodies[i].mass * (bodies[i].vx * bodies[i].vx + bodies[i].vy * bodies[i].vy);
      for (let j = i + 1; j < bodies.length; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const r = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING);
        pe -= G * bodies[i].mass * bodies[j].mass / r;
      }
    }
    return { ke, pe, total: ke + pe };
  }, []);

  const loadPreset = useCallback((name: string) => {
    bodiesRef.current = [];
    lastTsRef.current = null;
    particleSystemRef.current.clear();

    const cx = 0.5;
    const cy = 0.5;

    const makeBody = (x: number, y: number, vx: number, vy: number, mass: number): Body => ({
      x, y, vx, vy, ax: 0, ay: 0, mass, trail: [],
      orbitAngle: 0, orbitRevolutions: 0,
      lastAngle: Math.atan2(y - cy, x - cx),
    });

    if (name === "sun-planet") {
      const starMass = 800;
      const planetMass = 10;
      const r = 0.18;
      const GM = BASE_G * gravityScaleRef.current * starMass;
      const vCirc = Math.sqrt(GM / r);
      bodiesRef.current = [
        makeBody(cx, cy, 0, 0, starMass),
        makeBody(cx + r, cy, 0, -vCirc, planetMass),
      ];
    } else if (name === "binary") {
      const mass = 400;
      const r = 0.1;
      const GM = BASE_G * gravityScaleRef.current * mass;
      const v = Math.sqrt(GM / (4 * r)) * 0.95;
      bodiesRef.current = [
        makeBody(cx - r, cy, 0, v, mass),
        makeBody(cx + r, cy, 0, -v, mass),
      ];
    } else if (name === "solar-system") {
      const starMass = 800;
      const G = BASE_G * gravityScaleRef.current;
      const planets = [
        { mass: 15, r: 0.1 },
        { mass: 30, r: 0.18 },
        { mass: 8, r: 0.28 },
      ];
      bodiesRef.current = [makeBody(cx, cy, 0, 0, starMass)];
      for (const p of planets) {
        const vCirc = Math.sqrt(G * starMass / p.r);
        bodiesRef.current.push(makeBody(cx + p.r, cy, 0, -vCirc, p.mass));
      }
    } else if (name === "figure-eight") {
      const mass = 200;
      const scale = 0.15;
      const x1 = 0.97000436 * scale;
      const y1 = -0.24308753 * scale;
      const vx3 = -0.93240737 * scale * 0.022;
      const vy3 = -0.86473146 * scale * 0.022;
      bodiesRef.current = [
        makeBody(cx + x1, cy + y1, -vx3 / 2, -vy3 / 2, mass),
        makeBody(cx - x1, cy - y1, -vx3 / 2, -vy3 / 2, mass),
        makeBody(cx, cy, vx3, vy3, mass),
      ];
    }

    setBodyCount(bodiesRef.current.length);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const bodies = bodiesRef.current;
    const G = BASE_G * gravityScaleRef.current;

    // Background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Background stars
    for (let i = 0; i < 150; i++) {
      const sx = ((i * 7919 + 104729) % W);
      const sy = ((i * 6271 + 51407) % H);
      const sr = i % 7 === 0 ? 1.5 : 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.12 + (i % 5) * 0.06})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Lagrange points (L4/L5)
    if (showLagrangeRef.current && bodies.length >= 2) {
      // Find the two most massive bodies
      const sorted = [...bodies].sort((a, b) => b.mass - a.mass);
      if (sorted.length >= 2) {
        const m1 = sorted[0];
        const m2 = sorted[1];
        const dx = m2.x - m1.x;
        const dy = m2.y - m1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.01) {
          // L4 is 60 degrees ahead of m2 relative to m1
          // L5 is 60 degrees behind
          const angle = Math.atan2(dy, dx);

          const l4x = m1.x + dist * Math.cos(angle + Math.PI / 3);
          const l4y = m1.y + dist * Math.sin(angle + Math.PI / 3);
          const l5x = m1.x + dist * Math.cos(angle - Math.PI / 3);
          const l5y = m1.y + dist * Math.sin(angle - Math.PI / 3);

          // Draw L4
          const l4px = l4x * W;
          const l4py = l4y * H;
          ctx.strokeStyle = "rgba(168,85,247,0.5)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);

          // Triangle connecting m1, m2, L4
          ctx.beginPath();
          ctx.moveTo(m1.x * W, m1.y * H);
          ctx.lineTo(m2.x * W, m2.y * H);
          ctx.lineTo(l4px, l4py);
          ctx.closePath();
          ctx.stroke();

          // Triangle connecting m1, m2, L5
          const l5px = l5x * W;
          const l5py = l5y * H;
          ctx.beginPath();
          ctx.moveTo(m1.x * W, m1.y * H);
          ctx.lineTo(m2.x * W, m2.y * H);
          ctx.lineTo(l5px, l5py);
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);

          // L4 marker
          ctx.fillStyle = "rgba(168,85,247,0.3)";
          ctx.beginPath();
          ctx.arc(l4px, l4py, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a855f7";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(l4px, l4py, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = "bold 9px ui-monospace";
          ctx.fillStyle = "#a855f7";
          ctx.textAlign = "center";
          ctx.fillText("L4", l4px, l4py - 12);

          // L5 marker
          ctx.fillStyle = "rgba(168,85,247,0.3)";
          ctx.beginPath();
          ctx.arc(l5px, l5py, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a855f7";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(l5px, l5py, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = "bold 9px ui-monospace";
          ctx.fillStyle = "#a855f7";
          ctx.textAlign = "center";
          ctx.fillText("L5", l5px, l5py - 12);
        }
      }
    }

    // Draw trails
    if (showTrailsRef.current) {
      for (const body of bodies) {
        if (body.trail.length < 2) continue;
        const colors = bodyColor(body.mass);
        for (let i = 1; i < body.trail.length; i++) {
          const alpha = (i / body.trail.length) * 0.6;
          ctx.strokeStyle = `rgba(${colors.trailRgb}, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(body.trail[i - 1].x * W, body.trail[i - 1].y * H);
          ctx.lineTo(body.trail[i].x * W, body.trail[i].y * H);
          ctx.stroke();
        }
      }
    }

    // Draw particles (collision sparkles etc)
    particleSystemRef.current.draw(ctx);

    // Draw bodies
    for (const body of bodies) {
      const bx = body.x * W;
      const by = body.y * H;
      const r = bodyRadius(body.mass);
      const colors = bodyColor(body.mass);

      // Glow
      const glowR = r * 3.5;
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
      glow.addColorStop(0, colors.glow);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bx, by, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Body
      const bodyGrad = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, 0, bx, by, r);
      if (body.mass >= 200) {
        bodyGrad.addColorStop(0, "#fef08a");
        bodyGrad.addColorStop(0.5, "#fbbf24");
        bodyGrad.addColorStop(1, "#f59e0b");
      } else if (body.mass >= 100) {
        bodyGrad.addColorStop(0, "#93c5fd");
        bodyGrad.addColorStop(1, "#2563eb");
      } else if (body.mass >= 30) {
        bodyGrad.addColorStop(0, "#86efac");
        bodyGrad.addColorStop(1, "#16a34a");
      } else {
        bodyGrad.addColorStop(0, "#cbd5e1");
        bodyGrad.addColorStop(1, "#64748b");
      }
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();

      // Corona for stars
      if (body.mass >= 200) {
        ctx.strokeStyle = "rgba(251, 191, 36, 0.1)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 + Date.now() * 0.0008;
          ctx.beginPath();
          ctx.moveTo(bx + Math.cos(angle) * (r + 2), by + Math.sin(angle) * (r + 2));
          ctx.lineTo(bx + Math.cos(angle) * (r + 12), by + Math.sin(angle) * (r + 12));
          ctx.stroke();
        }
      }

      // Velocity vector
      if (showVelocitiesRef.current) {
        const vMag = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
        if (vMag > 0.0005) {
          const vScale = 30;
          const nvx = body.vx / vMag;
          const nvy = body.vy / vMag;
          const tipX = bx + body.vx * vScale;
          const tipY = by + body.vy * vScale;

          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - nvx * 7 - nvy * 3.5, tipY - nvy * 7 + nvx * 3.5);
          ctx.lineTo(tipX - nvx * 7 + nvy * 3.5, tipY - nvy * 7 - nvx * 3.5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Orbit revolution counter for challenge mode
      if (challengeModeRef.current && body.orbitRevolutions > 0 && body.mass < 200) {
        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = body.orbitRevolutions >= orbitTargetRef.current ? "#22c55e" : "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText(`${body.orbitRevolutions.toFixed(0)} rev`, bx, by - r - 8);
      }
    }

    // Center of mass crosshair
    if (bodies.length > 0) {
      let totalMass = 0;
      let comX = 0;
      let comY = 0;
      for (const b of bodies) {
        totalMass += b.mass;
        comX += b.x * b.mass;
        comY += b.y * b.mass;
      }
      comX = (comX / totalMass) * W;
      comY = (comY / totalMass) * H;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      const sz = 8;
      ctx.beginPath();
      ctx.moveTo(comX - sz, comY);
      ctx.lineTo(comX + sz, comY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(comX, comY - sz);
      ctx.lineTo(comX, comY + sz);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(comX, comY, 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Velocity placement arrow
    if (modeRef.current === "dragging" && placingPosRef.current && dragPosRef.current) {
      const sx = placingPosRef.current.x * W;
      const sy = placingPosRef.current.y * H;
      const ex = dragPosRef.current.x * W;
      const ey = dragPosRef.current.y * H;
      const dx = ex - sx;
      const dy = ey - sy;
      const mag = Math.sqrt(dx * dx + dy * dy);

      const r = bodyRadius(placeMass);
      const colors = bodyColor(placeMass);
      const pendGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
      pendGlow.addColorStop(0, colors.glow);
      pendGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = pendGlow;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.fill;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      if (mag > 5) {
        const ndx = dx / mag;
        const ndy = dy / mag;

        ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ndx * 10 - ndy * 5, ey - ndy * 10 + ndx * 5);
        ctx.lineTo(ex - ndx * 10 + ndy * 5, ey - ndy * 10 - ndx * 5);
        ctx.closePath();
        ctx.fill();

        ctx.font = "11px ui-monospace, monospace";
        ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
        ctx.textAlign = "center";
        ctx.fillText(`v = ${(mag / W * 0.5).toFixed(3)}`, (sx + ex) / 2, (sy + ey) / 2 - 10);
      }
    }

    // --- Energy conservation display ---
    const energy = calculateSystemEnergy(bodies, G);
    const infoPanelH = bodies.length > 0 ? 115 : 80;

    drawInfoPanel(ctx, 12, 12, 175, infoPanelH, "N-BODY SANDBOX", [
      { label: "Bodies", value: `${bodies.length}`, color: "#e2e8f0" },
      { label: "KE", value: `${energy.ke.toFixed(4)}`, color: "#ef4444" },
      { label: "PE", value: `${energy.pe.toFixed(4)}`, color: "#3b82f6" },
      { label: "Total E", value: `${energy.total.toFixed(4)}`, color: "#a855f7" },
      { label: "G", value: `${(BASE_G * gravityScaleRef.current).toFixed(6)}`, color: "#94a3b8" },
    ]);

    // Energy bar (KE vs PE)
    if (bodies.length > 0) {
      const totalAbsE = Math.abs(energy.ke) + Math.abs(energy.pe);
      if (totalAbsE > 0.0001) {
        const keFrac = Math.abs(energy.ke) / totalAbsE;
        drawMeter(ctx, 22, 12 + infoPanelH - 18, 155, 8, keFrac, 1, "#ef4444", "KE/PE ratio");
      }
    }

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 160, 12, 148, 78, 8);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("● Star (m ≥ 200)", W - 148, 30);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("● Planet (m ≥ 100)", W - 148, 46);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("● Planet (m ≥ 30)", W - 148, 62);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("● Asteroid (m < 30)", W - 148, 78);

    // Challenge scoreboard
    if (challengeModeRef.current) {
      const challenge = challengeRef.current;
      renderScoreboard(ctx, W - 160, 96, 148, 100, challenge);

      // Target display
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 160, 200, 148, 28, 6);
      ctx.fill();
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`Target: ${orbitTargetRef.current} revolutions`, W - 86, 218);
    }

    // Score popups
    for (let i = scorePopupsRef.current.length - 1; i >= 0; i--) {
      const alive = renderScorePopup(ctx, scorePopupsRef.current[i], performance.now());
      if (!alive) scorePopupsRef.current.splice(i, 1);
    }

    // Instructions
    if (bodies.length === 0) {
      ctx.font = "14px system-ui";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.textAlign = "center";
      ctx.fillText("Click to place a body, drag to set velocity", W / 2, H / 2 - 10);
      ctx.fillText("or choose a preset below", W / 2, H / 2 + 14);
    }
  }, [placeMass, calculateSystemEnergy]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bodies = bodiesRef.current;
    const G = BASE_G * gravityScaleRef.current;
    const ts = timeScaleRef.current;
    const W = canvas.width;
    const H = canvas.height;

    if (isRunningRef.current && bodies.length > 0) {
      const now = performance.now();
      if (lastTsRef.current == null) {
        lastTsRef.current = now;
      }
      const frameDt = Math.min((now - lastTsRef.current) / 1000, 0.05) * ts;
      lastTsRef.current = now;

      const substeps = 4;
      const dt = frameDt / substeps;

      for (let s = 0; s < substeps; s++) {
        computeAccelerations(bodies, G);

        for (const body of bodies) {
          body.vx += body.ax * dt * 0.5;
          body.vy += body.ay * dt * 0.5;
          body.x += body.vx * dt;
          body.y += body.vy * dt;
        }

        computeAccelerations(bodies, G);

        for (const body of bodies) {
          body.vx += body.ax * dt * 0.5;
          body.vy += body.ay * dt * 0.5;
        }

        // Collision detection and merging
        for (let i = bodies.length - 1; i >= 0; i--) {
          for (let j = i - 1; j >= 0; j--) {
            const dx = bodies[i].x - bodies[j].x;
            const dy = bodies[i].y - bodies[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ri = bodyRadius(bodies[i].mass);
            const rj = bodyRadius(bodies[j].mass);
            const minDist = (ri + rj) / Math.max(canvas.width, 1) * 0.8;

            if (dist < minDist) {
              // Merge position for sparkle effects
              const mergeX = (bodies[j].x * bodies[j].mass + bodies[i].x * bodies[i].mass) / (bodies[i].mass + bodies[j].mass);
              const mergeY = (bodies[j].y * bodies[j].mass + bodies[i].y * bodies[i].mass) / (bodies[i].mass + bodies[j].mass);
              const mergePxX = mergeX * W;
              const mergePxY = mergeY * H;

              // Collision sparkle effects!
              const mergedMass = bodies[i].mass + bodies[j].mass;
              const sparkCount = Math.min(Math.floor(mergedMass / 10), 40) + 10;
              const sparkColor = mergedMass >= 200 ? "#fbbf24" : mergedMass >= 100 ? "#60a5fa" : mergedMass >= 30 ? "#4ade80" : "#94a3b8";
              particleSystemRef.current.emitSparks(mergePxX, mergePxY, sparkCount, sparkColor);
              particleSystemRef.current.emitGlow(mergePxX, mergePxY, 8, sparkColor);

              // Sound on merge
              if (soundEnabledRef.current) {
                playSFX("collision");
              }

              // Merge: conservation of momentum
              const totalMass = bodies[i].mass + bodies[j].mass;
              bodies[j].vx = (bodies[j].vx * bodies[j].mass + bodies[i].vx * bodies[i].mass) / totalMass;
              bodies[j].vy = (bodies[j].vy * bodies[j].mass + bodies[i].vy * bodies[i].mass) / totalMass;
              bodies[j].x = mergeX;
              bodies[j].y = mergeY;
              bodies[j].mass = totalMass;
              bodies[j].trail = [];
              bodies[j].orbitAngle = 0;
              bodies[j].orbitRevolutions = 0;
              bodies.splice(i, 1);
              setBodyCount(bodies.length);
              break;
            }
          }
        }

        // Track orbit revolutions (for challenge mode)
        if (challengeModeRef.current && bodies.length >= 2) {
          // Find the heaviest body (assumed to be the central body)
          let heaviestIdx = 0;
          for (let i = 1; i < bodies.length; i++) {
            if (bodies[i].mass > bodies[heaviestIdx].mass) heaviestIdx = i;
          }
          const central = bodies[heaviestIdx];

          for (let i = 0; i < bodies.length; i++) {
            if (i === heaviestIdx) continue;
            const body = bodies[i];
            const angle = Math.atan2(body.y - central.y, body.x - central.x);

            // Detect angle wrapping (crossing from +PI to -PI or vice versa)
            let dAngle = angle - body.lastAngle;
            if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
            if (dAngle < -Math.PI) dAngle += 2 * Math.PI;

            body.orbitAngle += dAngle;
            body.lastAngle = angle;

            const newRevs = Math.floor(Math.abs(body.orbitAngle) / (2 * Math.PI));
            if (newRevs > body.orbitRevolutions) {
              body.orbitRevolutions = newRevs;
              // Check if target reached
              if (newRevs === orbitTargetRef.current) {
                const result = { points: 3, tier: "perfect" as const, label: "Stable Orbit!" };
                challengeRef.current = updateChallengeState(challengeRef.current, result);
                const bx = body.x * W;
                const by = body.y * H;
                scorePopupsRef.current.push({ text: "Stable Orbit!", points: 3, x: bx, y: by, startTime: performance.now() });
                particleSystemRef.current.emitConfetti(bx, by, 20);
                if (soundEnabledRef.current) playSFX("success");
              }
            }
          }
        }
      }

      // Update trails
      for (const body of bodies) {
        body.trail.push({ x: body.x, y: body.y });
        if (body.trail.length > TRAIL_LENGTH) body.trail.shift();
      }
    } else {
      lastTsRef.current = null;
    }

    // Update particles
    particleSystemRef.current.update(0.016);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.6, 560);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Animation loop
  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // Mouse interaction for placing bodies
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getCanvasPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / canvas.width,
        y: (e.clientY - rect.top) / canvas.height,
      };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const pos = getCanvasPos(e);
      modeRef.current = "placing";
      placingPosRef.current = pos;
      dragPosRef.current = pos;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (modeRef.current === "placing" || modeRef.current === "dragging") {
        modeRef.current = "dragging";
        dragPosRef.current = getCanvasPos(e);
      }
    };

    const handleMouseUp = () => {
      if (modeRef.current === "placing" || modeRef.current === "dragging") {
        const pos = placingPosRef.current;
        const drag = dragPosRef.current;
        if (pos && drag) {
          const velScale = 0.5;
          const vx = (drag.x - pos.x) * velScale;
          const vy = (drag.y - pos.y) * velScale;

          // Find heaviest body for orbit tracking
          let heaviestIdx = 0;
          for (let i = 1; i < bodiesRef.current.length; i++) {
            if (bodiesRef.current[i].mass > bodiesRef.current[heaviestIdx].mass) heaviestIdx = i;
          }
          const central = bodiesRef.current.length > 0 ? bodiesRef.current[heaviestIdx] : null;
          const initAngle = central ? Math.atan2(pos.y - central.y, pos.x - central.x) : 0;

          bodiesRef.current.push({
            x: pos.x,
            y: pos.y,
            vx,
            vy,
            ax: 0,
            ay: 0,
            mass: placeMass,
            trail: [],
            orbitAngle: 0,
            orbitRevolutions: 0,
            lastAngle: initAngle,
          });
          setBodyCount(bodiesRef.current.length);
        }
      }
      modeRef.current = "idle";
      placingPosRef.current = null;
      dragPosRef.current = null;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
    };
  }, [placeMass]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Presets */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Presets</label>
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={() => loadPreset("sun-planet")}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors">
            Sun + Planet
          </button>
          <button onClick={() => loadPreset("binary")}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            Binary Stars
          </button>
          <button onClick={() => loadPreset("solar-system")}
            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
            Solar System
          </button>
          <button onClick={() => loadPreset("figure-eight")}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors">
            Figure Eight
          </button>
        </div>
      </div>

      {/* Controls grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Mass to place */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass to Place</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={1000} step={1} value={placeMass}
              onChange={(e) => setPlaceMass(Number(e.target.value))}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{placeMass}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {placeMass >= 200 ? "Star" : placeMass >= 100 ? "Large Planet" : placeMass >= 30 ? "Planet" : "Asteroid"}
          </div>
        </div>

        {/* Time speed */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={5} step={0.1} value={timeScale}
              onChange={(e) => setTimeScale(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{timeScale.toFixed(1)}x</span>
          </div>
        </div>

        {/* Gravity strength */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gravity Strength</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={5} step={0.1} value={gravityScale}
              onChange={(e) => setGravityScale(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{gravityScale.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      {/* Toggles and actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowTrails(!showTrails)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showTrails ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Trails: {showTrails ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowVelocities(!showVelocities)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showVelocities ? "bg-green-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Velocity: {showVelocities ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setShowLagrange(!showLagrange)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showLagrange ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            L4/L5: {showLagrange ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => {
            setSoundEnabled(!soundEnabled);
          }}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              soundEnabled ? "bg-amber-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Sound: {soundEnabled ? "ON" : "OFF"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => {
            if (!isRunning) lastTsRef.current = null;
            setIsRunning(!isRunning);
          }}
            className="w-full h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={clearAll}
            className="w-full h-10 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-sm font-medium transition-colors">
            Clear All ({bodyCount})
          </button>
        </div>
      </div>

      {/* Challenge mode */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Orbit Challenge</label>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button
            onClick={() => {
              setChallengeMode(!challengeMode);
              if (!challengeMode) {
                challengeRef.current = createChallengeState();
                challengeRef.current.active = true;
                // Reset orbit counters
                for (const b of bodiesRef.current) {
                  b.orbitAngle = 0;
                  b.orbitRevolutions = 0;
                }
              }
            }}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              challengeMode
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Challenge: {challengeMode ? "ON" : "OFF"}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Target Revolutions:</span>
            <input
              type="range" min={1} max={10} step={1}
              value={orbitTargetRef.current}
              onChange={(e) => { orbitTargetRef.current = Number(e.target.value); }}
              className="w-24 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{orbitTargetRef.current}</span>
          </div>
          {challengeMode && (
            <div className="text-xs text-gray-400">
              Create an orbit that lasts {orbitTargetRef.current} full revolutions to score!
            </div>
          )}
        </div>
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">N-Body Gravitational Dynamics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">F = Gm&#x2081;m&#x2082;/r&sup2;</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">a = F/m</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">v_orbital = &radic;(GM/r)</div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Place bodies and set their initial velocities by dragging. Enable Lagrange points to see the stable L4/L5
          equilibrium positions of a two-body system. Turn on Challenge mode to score points for creating orbits
          that survive the target number of revolutions.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="F = G\frac{m_1 m_2}{r^2}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\vec{a} = \frac{\vec{F}}{m}" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Click to place masses. Drag to set initial velocity. Watch gravitational interactions unfold!
      </p>
    </div>
  );
}
