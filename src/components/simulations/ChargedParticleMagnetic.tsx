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
import { drawTarget } from "@/lib/simulation/drawing";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type SimMode = "sandbox" | "detector" | "spectrometer" | "cyclotron";

interface ParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  charge: number;
  mass: number;
  color: string;
  trail: { x: number; y: number }[];
  active: boolean;
  label: string;
}

export default function ChargedParticleMagnetic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [bField, setBField] = useState(2);
  const [charge, setCharge] = useState(1);
  const [mass, setMass] = useState(1);
  const [speed, setSpeed] = useState(4);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<SimMode>("sandbox");
  const [massPrediction, setMassPrediction] = useState("");

  const posRef = useRef({ x: 0.2, y: 0.5 });
  const velRef = useRef({ vx: 0, vy: -1 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());

  // Multi-particle state
  const multiParticlesRef = useRef<ParticleState[]>([]);

  // Detector challenge state
  const detectorRef = useRef<{ x: number; y: number; radius: number }>({ x: 0.8, y: 0.3, radius: 0.04 });
  const detectorHitRef = useRef(false);

  // Spectrometer state
  const spectroMassRef = useRef(1);
  const spectroChargeRef = useRef(1);
  const spectroSpeedRef = useRef(4);

  // Cyclotron state
  const cyclotronTimeRef = useRef(0);
  const cyclotronEnergyRef = useRef(0);

  const timeRef = useRef(0);

  const init = useCallback(() => {
    posRef.current = { x: 0.3, y: 0.7 };
    velRef.current = { vx: speed * 0.01, vy: -speed * 0.005 };
    trailRef.current = [];
    detectorHitRef.current = false;
    timeRef.current = 0;
  }, [speed]);

  useEffect(() => { init(); }, [init]);

  // Generate random detector target
  const newDetectorTarget = useCallback(() => {
    detectorRef.current = {
      x: 0.5 + Math.random() * 0.35,
      y: 0.15 + Math.random() * 0.6,
      radius: 0.035,
    };
    detectorHitRef.current = false;
    init();
  }, [init]);

  // Generate spectrometer challenge
  const newSpectroChallenge = useCallback(() => {
    const masses = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    spectroMassRef.current = masses[Math.floor(Math.random() * masses.length)];
    spectroChargeRef.current = Math.random() > 0.5 ? 1 : -1;
    spectroSpeedRef.current = 3 + Math.random() * 4;
    setMassPrediction("");
    init();
  }, [init]);

  // Initialize multi-particle set
  const initMultiParticles = useCallback(() => {
    const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
    const particles: ParticleState[] = [
      { x: 0.15, y: 0.7, vx: speed * 0.01, vy: -speed * 0.005, charge: 1, mass: 1, color: colors[0], trail: [], active: true, label: "p+" },
      { x: 0.15, y: 0.75, vx: speed * 0.01, vy: -speed * 0.005, charge: -1, mass: 1, color: colors[1], trail: [], active: true, label: "e-" },
      { x: 0.15, y: 0.65, vx: speed * 0.01, vy: -speed * 0.005, charge: 1, mass: 2, color: colors[2], trail: [], active: true, label: "2m" },
      { x: 0.15, y: 0.8, vx: speed * 0.01, vy: -speed * 0.005, charge: 2, mass: 3, color: colors[3], trail: [], active: true, label: "He" },
      { x: 0.15, y: 0.6, vx: speed * 0.01, vy: -speed * 0.005, charge: -1, mass: 0.5, color: colors[4], trail: [], active: true, label: "e/2" },
    ];
    multiParticlesRef.current = particles;
  }, [speed]);

  // Initialize cyclotron
  const initCyclotron = useCallback(() => {
    posRef.current = { x: 0.5, y: 0.5 };
    velRef.current = { vx: speed * 0.003, vy: 0 };
    trailRef.current = [];
    cyclotronTimeRef.current = 0;
    cyclotronEnergyRef.current = 0;
  }, [speed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // B field indicators
    const spacing = 40;
    const isOut = bField > 0;
    ctx.fillStyle = "rgba(100,150,255,0.15)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let x = spacing; x < W; x += spacing) {
      for (let y = spacing; y < H; y += spacing) {
        if (isOut) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = "rgba(100,150,255,0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4);
          ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x + 4, y - 4);
          ctx.lineTo(x - 4, y + 4);
          ctx.stroke();
        }
      }
    }

    // Cyclotron dees
    if (mode === "cyclotron") {
      const cx2 = W * 0.5;
      const cy2 = H * 0.5;
      const deeR = Math.min(W, H) * 0.4;

      // Left dee
      ctx.strokeStyle = "rgba(239,68,68,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx2, cy2, deeR, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(239,68,68,0.03)";
      ctx.fill();

      // Right dee
      ctx.strokeStyle = "rgba(59,130,246,0.3)";
      ctx.beginPath();
      ctx.arc(cx2, cy2, deeR, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(59,130,246,0.03)";
      ctx.fill();

      // Gap
      ctx.fillStyle = "rgba(251,191,36,0.15)";
      ctx.fillRect(cx2 - 3, cy2 - deeR, 6, deeR * 2);

      // Labels
      ctx.font = "bold 14px ui-monospace";
      ctx.fillStyle = "rgba(239,68,68,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("D1", cx2 - deeR * 0.5, cy2);
      ctx.fillStyle = "rgba(59,130,246,0.5)";
      ctx.fillText("D2", cx2 + deeR * 0.5, cy2);

      // Energy display
      const ke = cyclotronEnergyRef.current;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 190, H - 60, 175, 48, 8);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "left";
      ctx.fillText("CYCLOTRON", W - 180, H - 44);
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`KE = ${ke.toFixed(1)} (arb)`, W - 180, H - 28);
      ctx.fillText(`Revolutions: ${Math.floor(cyclotronTimeRef.current / (2 * Math.PI))}`, W - 180, H - 16);
    }

    // Detector target
    if (mode === "detector") {
      const det = detectorRef.current;
      const detX = det.x * W;
      const detY = det.y * H;
      const detR = det.radius * W;

      const pulse = (timeRef.current * 2) % 1;
      drawTarget(ctx, detX, detY, detR, detectorHitRef.current ? "#22c55e" : "#ef4444", pulse);

      if (detectorHitRef.current) {
        ctx.font = "bold 14px ui-monospace";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "center";
        ctx.fillText("HIT!", detX, detY - detR - 10);
      }
    }

    // Spectrometer mode: entry slit and measurement region
    if (mode === "spectrometer") {
      // Entry slit
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.15, 0);
      ctx.lineTo(W * 0.15, H * 0.65);
      ctx.moveTo(W * 0.15, H * 0.75);
      ctx.lineTo(W * 0.15, H);
      ctx.stroke();

      // Slit opening glow
      ctx.fillStyle = "rgba(251,191,36,0.2)";
      ctx.fillRect(W * 0.14, H * 0.65, W * 0.02, H * 0.1);

      // Measurement line
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(W * 0.15, H * 0.7);
      ctx.lineTo(W * 0.9, H * 0.7);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("detector plate", W * 0.65, H * 0.7 + 14);
    }

    // Draw single particle (sandbox, detector, spectrometer modes)
    if (mode !== "cyclotron") {
      // Use spectrometer params in spectrometer mode
      const curCharge = mode === "spectrometer" ? spectroChargeRef.current : charge;

      // Trail with enhanced glow
      const trail = trailRef.current;
      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const alpha = (i / trail.length) * 0.6;
          const hue = curCharge > 0 ? "239,68,68" : "59,130,246";

          // Outer glow
          ctx.strokeStyle = `rgba(${hue},${alpha * 0.3})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
          ctx.lineTo(trail[i].x * W, trail[i].y * H);
          ctx.stroke();

          // Inner trail
          ctx.strokeStyle = `rgba(${hue},${alpha})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
          ctx.lineTo(trail[i].x * W, trail[i].y * H);
          ctx.stroke();
        }
      }

      // Particle
      const px = posRef.current.x * W;
      const py = posRef.current.y * H;

      // Enhanced glow
      const glowColor = curCharge > 0 ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)";
      const outerGlow = ctx.createRadialGradient(px, py, 0, px, py, 40);
      outerGlow.addColorStop(0, glowColor);
      outerGlow.addColorStop(0.5, curCharge > 0 ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)");
      outerGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(px, py, 40, 0, Math.PI * 2);
      ctx.fill();

      // Particle body
      ctx.fillStyle = curCharge > 0 ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = curCharge > 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Charge symbol
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(curCharge > 0 ? "+" : "\u2212", px, py + 1);

      // Velocity vector
      const vx = velRef.current.vx;
      const vy = velRef.current.vy;
      const vMag = Math.sqrt(vx * vx + vy * vy);
      if (vMag > 0.001) {
        const vScale = 2000;
        const tipX = px + vx * vScale;
        const tipY = py + vy * vScale;

        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#22c55e";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const nvx = vx / vMag;
        const nvy = vy / vMag;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - nvx * 8 - nvy * 4, tipY - nvy * 8 + nvx * 4);
        ctx.lineTo(tipX - nvx * 8 + nvy * 4, tipY - nvy * 8 - nvx * 4);
        ctx.closePath();
        ctx.fill();

        ctx.font = "11px system-ui";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("v", tipX + 8, tipY);
      }

      // Magnetic force vector
      const effCharge = mode === "spectrometer" ? spectroChargeRef.current : charge;
      const Fx = effCharge * velRef.current.vy * bField;
      const Fy = -effCharge * velRef.current.vx * bField;
      const FMag = Math.sqrt(Fx * Fx + Fy * Fy);
      if (FMag > 0.001) {
        const fScale = 500;
        const ftipX = px + Fx * fScale;
        const ftipY = py + Fy * fScale;

        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ftipX, ftipY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const nfx = Fx / FMag;
        const nfy = Fy / FMag;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.moveTo(ftipX, ftipY);
        ctx.lineTo(ftipX - nfx * 8 - nfy * 4, ftipY - nfy * 8 + nfx * 4);
        ctx.lineTo(ftipX - nfx * 8 + nfy * 4, ftipY - nfy * 8 - nfx * 4);
        ctx.closePath();
        ctx.fill();

        ctx.font = "11px system-ui";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("F", ftipX + 8, ftipY);
      }

      // Info panel
      const effMass = mode === "spectrometer" ? spectroMassRef.current : mass;
      const radius = (effMass * vMag * 100) / (Math.abs(effCharge) * Math.abs(bField));
      const period = (2 * Math.PI * effMass) / (Math.abs(effCharge) * Math.abs(bField));

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, H - 110, 210, 98, 8);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("CYCLOTRON MOTION", 22, H - 100);
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`r = mv/qB = ${radius.toFixed(1)}`, 22, H - 82);
      ctx.fillText(`T = 2\u03C0m/qB = ${period.toFixed(2)}`, 22, H - 66);
      ctx.fillText(`|v| = ${(vMag * 100).toFixed(1)} m/s`, 22, H - 50);
      if (mode === "spectrometer") {
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`q = ?, m = ? (identify!)`, 22, H - 34);
      } else {
        ctx.fillText(`q = ${effCharge > 0 ? "+" : ""}${effCharge} C, m = ${effMass} kg`, 22, H - 34);
      }
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`B = ${Math.abs(bField).toFixed(1)} T`, 22, H - 18);
    }

    // Multi-particle rendering (sandbox can show multiple)
    if (mode === "sandbox" && multiParticlesRef.current.length > 0) {
      for (const mp of multiParticlesRef.current) {
        if (!mp.active) continue;

        // Trail
        if (mp.trail.length > 1) {
          for (let i = 1; i < mp.trail.length; i++) {
            const alpha = (i / mp.trail.length) * 0.4;
            ctx.strokeStyle = mp.color.replace(")", `,${alpha})`).replace("rgb(", "rgba(").replace("#", "");
            // Use hex to rgba conversion
            const r2 = parseInt(mp.color.slice(1, 3), 16);
            const g = parseInt(mp.color.slice(3, 5), 16);
            const b = parseInt(mp.color.slice(5, 7), 16);
            ctx.strokeStyle = `rgba(${r2},${g},${b},${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mp.trail[i - 1].x * W, mp.trail[i - 1].y * H);
            ctx.lineTo(mp.trail[i].x * W, mp.trail[i].y * H);
            ctx.stroke();
          }
        }

        // Particle
        const mpx = mp.x * W;
        const mpy = mp.y * H;
        ctx.fillStyle = mp.color;
        ctx.beginPath();
        ctx.arc(mpx, mpy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9px ui-monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(mp.label, mpx, mpy);
      }
    }

    // Cyclotron particle
    if (mode === "cyclotron") {
      const trail = trailRef.current;
      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const alpha = (i / trail.length) * 0.5;
          // Rainbow trail based on energy
          const hue2 = (i / trail.length) * 270;
          ctx.strokeStyle = `hsla(${hue2}, 100%, 60%, ${alpha})`;
          ctx.lineWidth = 3;
          ctx.shadowColor = `hsl(${hue2}, 100%, 60%)`;
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x * W, trail[i - 1].y * H);
          ctx.lineTo(trail[i].x * W, trail[i].y * H);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      const px = posRef.current.x * W;
      const py = posRef.current.y * H;

      const glow2 = ctx.createRadialGradient(px, py, 0, px, py, 25);
      glow2.addColorStop(0, "rgba(168,85,247,0.6)");
      glow2.addColorStop(1, "rgba(168,85,247,0)");
      ctx.fillStyle = glow2;
      ctx.beginPath();
      ctx.arc(px, py, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", px, py + 1);
    }

    // B field label
    ctx.fillStyle = "rgba(100,150,255,0.3)";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`B = ${Math.abs(bField).toFixed(1)} T (${isOut ? "out of page" : "into page"})`, W - 15, 15);

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 130, 45, 6);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("\u2014 velocity", 22, 28);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("\u2014 magnetic force", 22, 46);

    // Challenge scoreboard
    if (mode === "detector" || mode === "spectrometer") {
      renderScoreboard(ctx, W - 155, 65, 140, 110, challengeRef.current);
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, performance.now())
    );
  }, [bField, charge, mass, mode]);

  const animate = useCallback(() => {
    const dt = 0.0015;
    timeRef.current += dt;

    if (mode === "cyclotron") {
      // Cyclotron simulation with energy gain
      const pos = posRef.current;
      const vel = velRef.current;

      const Fx = charge * vel.vy * bField;
      const Fy = -charge * vel.vx * bField;
      const ax = Fx / mass;
      const ay = Fy / mass;

      vel.vx += ax * dt;
      vel.vy += ay * dt;

      // Accelerate in the gap (near x = 0.5)
      const gapDist = Math.abs(pos.x - 0.5);
      if (gapDist < 0.01) {
        vel.vx *= 1.003;
        vel.vy *= 1.003;
        cyclotronEnergyRef.current += 0.1;
      }

      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      cyclotronTimeRef.current += dt * Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy) * 10;

      // Check if particle escaped
      const cx2 = 0.5;
      const cy2 = 0.5;
      const dist = Math.sqrt((pos.x - cx2) ** 2 + (pos.y - cy2) ** 2);
      if (dist > 0.4) {
        // Particle escaped cyclotron
        playSFX("success");
        const canvas = canvasRef.current;
        if (canvas) {
          particlesRef.current.emitConfetti(pos.x * canvas.clientWidth, pos.y * canvas.clientHeight, 25);
        }
        initCyclotron();
      }

      trailRef.current.push({ x: pos.x, y: pos.y });
      if (trailRef.current.length > 1500) trailRef.current.shift();

      // Emit trail particles
      if (Math.random() < 0.2) {
        const canvas = canvasRef.current;
        if (canvas) {
          particlesRef.current.emitTrail(pos.x * canvas.clientWidth, pos.y * canvas.clientHeight, Math.atan2(vel.vy, vel.vx), "#a855f7");
        }
      }
    } else if (mode === "spectrometer") {
      // Use hidden mass/charge
      const pos = posRef.current;
      const vel = velRef.current;
      const q = spectroChargeRef.current;
      const m = spectroMassRef.current;

      const Fx = q * vel.vy * bField;
      const Fy = -q * vel.vx * bField;
      const ax = Fx / m;
      const ay = Fy / m;

      vel.vx += ax * dt;
      vel.vy += ay * dt;
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      if (pos.x < 0) pos.x += 1;
      if (pos.x > 1) pos.x -= 1;
      if (pos.y < 0) pos.y += 1;
      if (pos.y > 1) pos.y -= 1;

      trailRef.current.push({ x: pos.x, y: pos.y });
      if (trailRef.current.length > 600) trailRef.current.shift();
    } else {
      // Sandbox and detector modes
      const pos = posRef.current;
      const vel = velRef.current;

      const Fx = charge * vel.vy * bField;
      const Fy = -charge * vel.vx * bField;
      const ax = Fx / mass;
      const ay = Fy / mass;

      vel.vx += ax * dt;
      vel.vy += ay * dt;
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      if (pos.x < 0) pos.x += 1;
      if (pos.x > 1) pos.x -= 1;
      if (pos.y < 0) pos.y += 1;
      if (pos.y > 1) pos.y -= 1;

      trailRef.current.push({ x: pos.x, y: pos.y });
      if (trailRef.current.length > 400) trailRef.current.shift();

      // Check detector hit
      if (mode === "detector" && !detectorHitRef.current) {
        const det = detectorRef.current;
        const dx = pos.x - det.x;
        const dy = pos.y - det.y;
        if (Math.sqrt(dx * dx + dy * dy) < det.radius) {
          detectorHitRef.current = true;
          playSFX("success");
          playScore(3);

          const result = { points: 3, tier: "perfect" as const, label: "Target Hit!" };
          challengeRef.current = updateChallengeState(challengeRef.current, result);

          const canvas = canvasRef.current;
          if (canvas) {
            popupsRef.current.push({
              text: "Target Hit!",
              points: 3,
              x: det.x * canvas.clientWidth,
              y: det.y * canvas.clientHeight,
              startTime: performance.now(),
            });
            particlesRef.current.emitConfetti(det.x * canvas.clientWidth, det.y * canvas.clientHeight, 30);
          }

          setTimeout(() => newDetectorTarget(), 1500);
        }
      }

      // Update multi-particles
      if (mode === "sandbox") {
        for (const mp of multiParticlesRef.current) {
          if (!mp.active) continue;
          const mFx = mp.charge * mp.vy * bField;
          const mFy = -mp.charge * mp.vx * bField;
          mp.vx += (mFx / mp.mass) * dt;
          mp.vy += (mFy / mp.mass) * dt;
          mp.x += mp.vx * dt;
          mp.y += mp.vy * dt;
          if (mp.x < 0) mp.x += 1;
          if (mp.x > 1) mp.x -= 1;
          if (mp.y < 0) mp.y += 1;
          if (mp.y > 1) mp.y -= 1;
          mp.trail.push({ x: mp.x, y: mp.y });
          if (mp.trail.length > 200) mp.trail.shift();
        }
      }
    }

    particlesRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [bField, charge, mass, draw, mode, initCyclotron, newDetectorTarget]);

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

  const reset = () => {
    init();
    multiParticlesRef.current = [];
    draw();
  };

  const handleSpectroSubmit = () => {
    const predicted = parseFloat(massPrediction);
    if (isNaN(predicted)) return;
    const actual = spectroMassRef.current;
    const result = calculateAccuracy(predicted, actual, 5);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    const cx = canvas ? canvas.clientWidth / 2 : 400;
    const cy2 = canvas ? canvas.clientHeight / 2 : 200;
    popupsRef.current.push({
      text: `${result.label} (mass = ${actual.toFixed(1)})`,
      points: result.points,
      x: cx,
      y: cy2,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(cx, cy2, 20);
    } else {
      playSFX("incorrect");
    }

    setTimeout(() => newSpectroChallenge(), 1500);
  };

  const switchMode = (newMode: SimMode) => {
    setMode(newMode);
    init();
    multiParticlesRef.current = [];
    if (newMode === "detector") {
      challengeRef.current = createChallengeState();
      challengeRef.current.active = true;
      newDetectorTarget();
    } else if (newMode === "spectrometer") {
      challengeRef.current = createChallengeState();
      challengeRef.current.active = true;
      newSpectroChallenge();
    } else if (newMode === "cyclotron") {
      initCyclotron();
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "detector", "spectrometer", "cyclotron"] as SimMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {m === "sandbox" ? "Sandbox" : m === "detector" ? "Hit Detector" : m === "spectrometer" ? "Mass Spectrometer" : "Cyclotron"}
          </button>
        ))}
        {mode === "sandbox" && (
          <button
            onClick={() => {
              if (multiParticlesRef.current.length > 0) {
                multiParticlesRef.current = [];
              } else {
                initMultiParticles();
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
          >
            {multiParticlesRef.current.length > 0 ? "Remove Extras" : "Add Multi-Particles"}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Spectrometer prediction */}
      {mode === "spectrometer" && (
        <div className="rounded-xl border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
            An unknown particle enters the magnetic field. From its radius of curvature (r = mv/qB),
            determine its mass. Charge magnitude is 1.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="5"
              value={massPrediction}
              onChange={(e) => setMassPrediction(e.target.value)}
              placeholder="Mass (e.g. 2.0)"
              className="flex-1 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleSpectroSubmit()}
            />
            <button
              onClick={handleSpectroSubmit}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Submit
            </button>
            <button
              onClick={newSpectroChallenge}
              className="px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              Skip
            </button>
          </div>
          {challengeRef.current.lastResult && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Last: {challengeRef.current.lastResult.label} | Score: {challengeRef.current.score} | Streak: {challengeRef.current.streak}
            </p>
          )}
        </div>
      )}

      {/* Detector instructions */}
      {mode === "detector" && (
        <div className="rounded-xl border border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-950/30 p-4">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Adjust B field, speed, charge, and mass to guide the particle into the red target.
            The particle follows a circular path with radius r = mv / |q|B.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">B Field</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={-5} max={5} step={0.1} value={bField}
              onChange={(e) => { setBField(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{bField.toFixed(1)} T</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Charge</label>
          <div className="flex gap-2 mt-1.5">
            <button onClick={() => { setCharge(1); reset(); }}
              className={`flex-1 h-8 rounded text-xs font-medium ${charge > 0 ? "bg-red-500 text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}>+1</button>
            <button onClick={() => { setCharge(-1); reset(); }}
              className={`flex-1 h-8 rounded text-xs font-medium ${charge < 0 ? "bg-blue-500 text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}>{"\u2212"}1</button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0.5} max={5} step={0.5} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); reset(); }}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{mass}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} step={0.5} value={speed}
              onChange={(e) => { setSpeed(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{speed}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-8 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\vec{F} = q\vec{v} \times \vec{B}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="r = \frac{mv}{|q|B}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="T = \frac{2\pi m}{|q|B}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Adjust charge, mass, velocity, and magnetic field to see how the particle&apos;s circular path changes!</p>
    </div>
  );
}
