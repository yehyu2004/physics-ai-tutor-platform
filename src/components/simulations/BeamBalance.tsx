"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { createDragHandler } from "@/lib/simulation/interaction";
import { drawInfoPanel, drawArrow } from "@/lib/simulation/drawing";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type SimMode = "beam" | "hooke" | "challenge";

/* ---------- Beam Balance types ---------- */
interface BeamWeight {
  id: number;
  mass: number; // kg
  position: number; // metres from pivot (negative = left, positive = right)
  color: string;
}

/* ---------- Weight palette ---------- */
const WEIGHT_PALETTE = [
  { mass: 1, color: "#3b82f6", label: "1 kg" },
  { mass: 2, color: "#22c55e", label: "2 kg" },
  { mass: 3, color: "#f59e0b", label: "3 kg" },
  { mass: 5, color: "#ef4444", label: "5 kg" },
  { mass: 10, color: "#a855f7", label: "10 kg" },
];

const BEAM_LENGTH_M = 4; // metres, total beam length
const BEAM_HALF = BEAM_LENGTH_M / 2;
const G = 9.81;
const EQUILIBRIUM_TOLERANCE = 0.5; // N*m

/* ---------- Challenge generator ---------- */
function generateChallenge(): { weights: BeamWeight[]; target: number } {
  const count = 2 + Math.floor(Math.random() * 2); // 2-3 weights
  const weights: BeamWeight[] = [];
  for (let i = 0; i < count; i++) {
    const palette = WEIGHT_PALETTE[Math.floor(Math.random() * WEIGHT_PALETTE.length)];
    weights.push({
      id: i + 1,
      mass: palette.mass,
      position: -BEAM_HALF + Math.random() * BEAM_LENGTH_M,
      color: palette.color,
    });
  }
  return { weights, target: 0 };
}

/* ---------- Component ---------- */
export default function BeamBalance() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  /* Mode */
  const [mode, setMode] = useState<SimMode>("beam");

  /* Beam mode state */
  const [selectedWeight, setSelectedWeight] = useState(0); // index into WEIGHT_PALETTE
  const weightsRef = useRef<BeamWeight[]>([]);
  const nextIdRef = useRef(1);
  const beamAngleRef = useRef(0);
  const beamAngVelRef = useRef(0);
  const draggingWeightRef = useRef<number | null>(null);

  /* Hooke mode state */
  const [hookeMass, setHookeMass] = useState(2);
  const [springK, setSpringK] = useState(40);
  const hookeHistoryRef = useRef<{ x: number; F: number }[]>([]);
  const springAnimRef = useRef({ y: 0, vy: 0 });

  /* Challenge mode state */
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const challengeWeightsRef = useRef<BeamWeight[]>([]);
  const challengeLockedRef = useRef<Set<number>>(new Set());
  const challengeBeamAngleRef = useRef(0);
  const challengeBeamAngVelRef = useRef(0);

  /* Particles */
  const particlesRef = useRef(new ParticleSystem());

  /* Timing */
  const lastTsRef = useRef<number | null>(null);

  /* ---------- Beam drawing helper ---------- */
  const computeBeamGeometry = useCallback((W: number, H: number) => {
    const beamCx = W * 0.5;
    const beamCy = H * 0.45;
    const beamPixelLen = Math.min(W * 0.75, 520);
    const pxPerMeter = beamPixelLen / BEAM_LENGTH_M;
    return { beamCx, beamCy, beamPixelLen, pxPerMeter };
  }, []);

  const meterToPixel = useCallback((posM: number, pxPerMeter: number) => {
    return posM * pxPerMeter;
  }, []);

  const pixelToMeter = useCallback((posPx: number, pxPerMeter: number) => {
    return posPx / pxPerMeter;
  }, []);

  /* ---------- Net torque ---------- */
  const computeNetTorque = useCallback((weights: BeamWeight[]) => {
    return weights.reduce((sum, w) => sum + w.mass * G * w.position, 0);
  }, []);

  /* ---------- Draw beam scene ---------- */
  const drawBeamScene = useCallback((
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    weights: BeamWeight[],
    angle: number,
    showChallengeBadge: boolean,
  ) => {
    const { beamCx, beamCy, beamPixelLen, pxPerMeter } = computeBeamGeometry(W, H);

    /* Fulcrum triangle */
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.moveTo(beamCx, beamCy + 10);
    ctx.lineTo(beamCx - 22, beamCy + 55);
    ctx.lineTo(beamCx + 22, beamCy + 55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.stroke();

    /* Ground line */
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(beamCx - beamPixelLen * 0.6, beamCy + 55);
    ctx.lineTo(beamCx + beamPixelLen * 0.6, beamCy + 55);
    ctx.stroke();

    /* Beam body */
    ctx.save();
    ctx.translate(beamCx, beamCy);
    ctx.rotate(angle);

    const beamH = 14;
    const beamGrad = ctx.createLinearGradient(-beamPixelLen / 2, -beamH, beamPixelLen / 2, beamH);
    beamGrad.addColorStop(0, "#4b5563");
    beamGrad.addColorStop(0.5, "#6b7280");
    beamGrad.addColorStop(1, "#4b5563");
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.roundRect(-beamPixelLen / 2, -beamH / 2, beamPixelLen, beamH, 4);
    ctx.fill();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Tick marks every 0.5 m */
    for (let m = -BEAM_HALF; m <= BEAM_HALF; m += 0.5) {
      const px = meterToPixel(m, pxPerMeter);
      const isCenter = Math.abs(m) < 0.01;
      const isMeter = Math.abs(m - Math.round(m)) < 0.01;
      const tickH = isCenter ? 14 : isMeter ? 10 : 5;
      ctx.strokeStyle = isCenter ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = isCenter ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(px, -beamH / 2 - tickH);
      ctx.lineTo(px, -beamH / 2);
      ctx.stroke();

      if (isMeter && !isCenter) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "9px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${m.toFixed(0)}m`, px, -beamH / 2 - tickH - 5);
      }
    }

    /* Draw weights on beam */
    for (const w of weights) {
      const wx = meterToPixel(w.position, pxPerMeter);
      const wSize = 14 + w.mass * 3;

      /* Weight shadow */
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(wx - wSize / 2 + 2, -beamH / 2 - wSize - 6 + 2, wSize, wSize, 4);
      ctx.fill();

      /* Weight body */
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.roundRect(wx - wSize / 2, -beamH / 2 - wSize - 6, wSize, wSize, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      /* Mass label */
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px ui-monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${w.mass}`, wx, -beamH / 2 - wSize / 2 - 6);
      ctx.textBaseline = "alphabetic";

      /* Gravity arrow (F = mg) */
      const arrowLen = w.mass * 3.5;
      ctx.strokeStyle = "rgba(239,68,68,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx, beamH / 2 + 4);
      ctx.lineTo(wx, beamH / 2 + 4 + arrowLen);
      ctx.stroke();
      ctx.fillStyle = "rgba(239,68,68,0.6)";
      ctx.beginPath();
      ctx.moveTo(wx, beamH / 2 + 4 + arrowLen + 5);
      ctx.lineTo(wx - 3, beamH / 2 + 4 + arrowLen);
      ctx.lineTo(wx + 3, beamH / 2 + 4 + arrowLen);
      ctx.closePath();
      ctx.fill();

      /* Torque vector (curved arrow) */
      const torque = w.mass * G * w.position;
      if (Math.abs(torque) > 0.1) {
        const torqueColor = torque > 0 ? "rgba(59,130,246,0.7)" : "rgba(249,115,22,0.7)";
        const torqueRadius = 20 + Math.min(Math.abs(torque) * 0.8, 30);
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (torque > 0 ? -Math.PI * 0.6 : Math.PI * 0.6);
        ctx.strokeStyle = torqueColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wx, -beamH / 2 - wSize - 12, torqueRadius, startAngle, endAngle, torque > 0);
        ctx.stroke();

        /* Arrowhead on torque curve */
        const aX = wx + Math.cos(endAngle) * torqueRadius;
        const aY = -beamH / 2 - wSize - 12 + Math.sin(endAngle) * torqueRadius;
        ctx.fillStyle = torqueColor;
        ctx.beginPath();
        ctx.arc(aX, aY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    /* Data panel */
    const netTorque = computeNetTorque(weights);
    const isEquilibrium = Math.abs(netTorque) < EQUILIBRIUM_TOLERANCE && Math.abs(angle) < 0.03;

    const individualTorques = weights.map(w => ({
      label: `${w.mass}kg @ ${w.position.toFixed(2)}m`,
      value: `${(w.mass * G * w.position).toFixed(2)} N·m`,
      color: w.color,
    }));

    drawInfoPanel(ctx, 12, 12, 240,
      54 + individualTorques.length * 15 + 15,
      "TORQUE DATA",
      [
        { label: "Net torque", value: `${netTorque.toFixed(2)} N·m`, color: isEquilibrium ? "#22c55e" : "#f59e0b" },
        { label: "Beam angle", value: `${(angle * 180 / Math.PI).toFixed(1)}\u00B0` },
        ...individualTorques,
        { label: "Status", value: isEquilibrium ? "EQUILIBRIUM" : "Unbalanced", color: isEquilibrium ? "#22c55e" : "#ef4444" },
      ],
    );

    /* Equilibrium glow */
    if (isEquilibrium && weights.length >= 2) {
      ctx.save();
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = 20;
      ctx.strokeStyle = "rgba(34,197,94,0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(beamCx, beamCy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* Mode badge */
    if (showChallengeBadge) {
      const badgeText = "BALANCE CHALLENGE";
      ctx.fillStyle = "rgba(245,158,11,0.15)";
      const badgeW = ctx.measureText(badgeText).width + 24;
      ctx.beginPath();
      ctx.roundRect(W / 2 - badgeW / 2, H - 32, badgeW, 24, 6);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, W / 2, H - 15);
    }

    /* Drag hint */
    if (!showChallengeBadge && weights.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "11px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("Click on the beam to place a weight", W / 2, H - 15);
    }

    return isEquilibrium;
  }, [computeBeamGeometry, meterToPixel, computeNetTorque]);

  /* ---------- Draw Hooke's Law scene ---------- */
  const drawHookeScene = useCallback((
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ) => {
    const anchorX = W * 0.35;
    const anchorY = 50;
    const equilibriumY = anchorY + 80;
    const displacement = (hookeMass * G) / springK; // F = kx => x = mg/k (in metres)
    const pxPerMeter = 200;
    const displacementPx = displacement * pxPerMeter;

    /* Animate spring position */
    const springState = springAnimRef.current;
    const targetY = equilibriumY + displacementPx;
    /* Use target for drawing (after animation settles) */
    const massY = springState.y > 0 ? springState.y : targetY;

    /* Ceiling */
    ctx.fillStyle = "#334155";
    ctx.fillRect(anchorX - 60, anchorY - 8, 120, 10);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorX - 60, anchorY + 2);
    ctx.lineTo(anchorX + 60, anchorY + 2);
    ctx.stroke();

    /* Hatching on ceiling */
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    for (let i = -55; i <= 55; i += 10) {
      ctx.beginPath();
      ctx.moveTo(anchorX + i, anchorY - 8);
      ctx.lineTo(anchorX + i + 8, anchorY + 2);
      ctx.stroke();
    }

    /* Spring coils */
    const springTop = anchorY + 2;
    const springBottom = massY - 20;
    const springLen = springBottom - springTop;
    const coils = 10;
    const coilW = 18;

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(anchorX, springTop);
    for (let i = 0; i <= coils; i++) {
      const t = i / coils;
      const y = springTop + t * springLen;
      const xOff = (i % 2 === 0 ? -1 : 1) * coilW;
      if (i === 0 || i === coils) {
        ctx.lineTo(anchorX, y);
      } else {
        ctx.lineTo(anchorX + xOff, y);
      }
    }
    ctx.stroke();

    /* Equilibrium line (dashed) */
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(anchorX - 50, equilibriumY);
    ctx.lineTo(anchorX + 50, equilibriumY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText("x = 0", anchorX + 55, equilibriumY + 3);

    /* Displacement arrow */
    if (displacementPx > 5) {
      drawArrow(ctx, anchorX + 45, equilibriumY, 0, displacementPx, "#f59e0b", {
        lineWidth: 2,
        label: `x = ${displacement.toFixed(3)} m`,
      });
    }

    /* Mass block */
    const massSize = 30 + hookeMass * 3;
    const massGrad = ctx.createLinearGradient(
      anchorX - massSize / 2, massY - 10,
      anchorX + massSize / 2, massY + massSize,
    );
    massGrad.addColorStop(0, "#3b82f6");
    massGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = massGrad;
    ctx.beginPath();
    ctx.roundRect(anchorX - massSize / 2, massY - 10, massSize, massSize, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(147,197,253,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Mass label */
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px ui-monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${hookeMass} kg`, anchorX, massY + massSize / 2 - 10);
    ctx.textBaseline = "alphabetic";

    /* Force arrows */
    const forceScale = 3;
    const mg = hookeMass * G;
    const Fs = springK * displacement;

    /* Gravity (down, red) */
    drawArrow(ctx, anchorX - 25, massY + massSize - 10, 0, mg * forceScale, "#ef4444", {
      lineWidth: 2.5,
      label: `mg = ${mg.toFixed(1)} N`,
    });

    /* Spring force (up, green) */
    drawArrow(ctx, anchorX + 25, massY - 10, 0, -Fs * forceScale, "#22c55e", {
      lineWidth: 2.5,
      label: `F_s = ${Fs.toFixed(1)} N`,
    });

    /* ----- F vs x graph ----- */
    const graphX = W * 0.62;
    const graphY = 40;
    const graphW = W * 0.33;
    const graphH = H * 0.7;

    /* Graph background */
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphY - 10, graphW + 30, graphH + 40, 8);
    ctx.fill();

    /* Title */
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 12px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("F vs x (Hooke\u2019s Law)", graphX + graphW / 2, graphY + 5);

    /* Axes */
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphY + 20);
    ctx.lineTo(graphX, graphY + graphH);
    ctx.lineTo(graphX + graphW, graphY + graphH);
    ctx.stroke();

    /* Axis labels */
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("x (m)", graphX + graphW / 2, graphY + graphH + 20);
    ctx.save();
    ctx.translate(graphX - 8, graphY + 20 + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("F (N)", 0, 0);
    ctx.restore();

    /* Graph scaling */
    const maxX = Math.max(displacement * 1.5, 0.5);
    const maxF = Math.max(mg * 1.5, 10);

    /* Grid lines */
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      const gy = graphY + 20 + (graphH - 20) * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(graphX, gy);
      ctx.lineTo(graphX + graphW, gy);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "8px ui-monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${(maxF * i / 4).toFixed(0)}`, graphX - 4, gy + 3);
    }
    for (let i = 1; i <= 4; i++) {
      const gx = graphX + graphW * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, graphY + 20);
      ctx.lineTo(gx, graphY + graphH);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "8px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${(maxX * i / 4).toFixed(2)}`, gx, graphY + graphH + 10);
    }

    /* Hooke's Law line (theoretical: F = kx) */
    ctx.strokeStyle = "rgba(59,130,246,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, graphY + graphH);
    const theoEndX = graphX + graphW;
    const theoEndY = graphY + 20 + (graphH - 20) * (1 - (springK * maxX) / maxF);
    ctx.lineTo(theoEndX, Math.max(graphY + 20, theoEndY));
    ctx.stroke();
    ctx.setLineDash([]);

    /* History trace */
    const history = hookeHistoryRef.current;
    if (history.length > 1) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const pt = history[i];
        const px = graphX + (pt.x / maxX) * graphW;
        const py = graphY + 20 + (graphH - 20) * (1 - pt.F / maxF);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    /* Current point */
    const cpx = graphX + (displacement / maxX) * graphW;
    const cpy = graphY + 20 + (graphH - 20) * (1 - mg / maxF);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(cpx, cpy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText(`(${displacement.toFixed(3)}, ${mg.toFixed(1)})`, cpx + 8, cpy - 4);

    /* Data panel */
    drawInfoPanel(ctx, 12, 12, 220, 115, "HOOKE\u2019S LAW", [
      { label: "Mass", value: `${hookeMass} kg` },
      { label: "Spring k", value: `${springK} N/m`, color: "#60a5fa" },
      { label: "Extension x", value: `${displacement.toFixed(4)} m`, color: "#f59e0b" },
      { label: "F = mg", value: `${mg.toFixed(2)} N`, color: "#ef4444" },
      { label: "F = kx", value: `${Fs.toFixed(2)} N`, color: "#22c55e" },
    ]);
  }, [hookeMass, springK]);

  /* ---------- Main draw ---------- */
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

    if (mode === "beam") {
      drawBeamScene(ctx, W, H, weightsRef.current, beamAngleRef.current, false);
    } else if (mode === "hooke") {
      drawHookeScene(ctx, W, H);
    } else if (mode === "challenge") {
      const balanced = drawBeamScene(ctx, W, H, challengeWeightsRef.current, challengeBeamAngleRef.current, true);

      /* Scoreboard */
      renderScoreboard(ctx, W - 170, 12, 158, 110, challengeRef.current);

      /* Check for equilibrium win */
      if (balanced && challengeWeightsRef.current.length >= 2) {
        /* Handled in animation loop */
      }
    }

    /* Particles */
    particlesRef.current.draw(ctx);

    /* Score popups */
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now),
    );
  }, [mode, drawBeamScene, drawHookeScene]);

  /* ---------- Physics animation ---------- */
  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) lastTsRef.current = now;
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    particlesRef.current.update(dt);

    if (mode === "beam") {
      /* Beam physics: angular acceleration based on net torque */
      const netTorque = computeNetTorque(weightsRef.current);
      const beamMoi = 50; // moment of inertia for beam
      // Add gravity restoring torque on beam itself
      const gravityRestore = -20 * Math.sin(beamAngleRef.current);
      const alpha = (netTorque + gravityRestore) / beamMoi;
      beamAngVelRef.current += alpha * dt;
      beamAngVelRef.current *= 0.88; // damping
      beamAngleRef.current += beamAngVelRef.current * dt;
      /* Clamp beam angle */
      beamAngleRef.current = Math.max(-0.4, Math.min(0.4, beamAngleRef.current));
    } else if (mode === "hooke") {
      /* Spring physics */
      const springState = springAnimRef.current;
      computeBeamGeometry(
        canvasRef.current?.width ?? 800,
        canvasRef.current?.height ?? 480,
      );
      const equilibriumY = 50 + 80;
      const pxPerMeter = 200;
      const displacement = (hookeMass * G) / springK;
      const targetY = equilibriumY + displacement * pxPerMeter;

      if (springState.y === 0) {
        springState.y = targetY;
      }

      /* Spring-mass damped oscillation */
      const springForcePx = -springK * ((springState.y - equilibriumY) / pxPerMeter) * pxPerMeter;
      const gravForce = hookeMass * G * pxPerMeter;
      const dampForce = -8 * springState.vy;
      const accel = (springForcePx + gravForce + dampForce) / (hookeMass * pxPerMeter);
      springState.vy += accel * dt * pxPerMeter;
      springState.y += springState.vy * dt;
    } else if (mode === "challenge") {
      /* Challenge beam physics */
      const netTorque = computeNetTorque(challengeWeightsRef.current);
      const beamMoi = 50;
      const gravityRestore = -20 * Math.sin(challengeBeamAngleRef.current);
      const alpha = (netTorque + gravityRestore) / beamMoi;
      challengeBeamAngVelRef.current += alpha * dt;
      challengeBeamAngVelRef.current *= 0.88;
      challengeBeamAngleRef.current += challengeBeamAngVelRef.current * dt;
      challengeBeamAngleRef.current = Math.max(-0.4, Math.min(0.4, challengeBeamAngleRef.current));

      /* Check equilibrium */
      const isBalanced = Math.abs(netTorque) < EQUILIBRIUM_TOLERANCE &&
        Math.abs(challengeBeamAngleRef.current) < 0.03 &&
        challengeWeightsRef.current.length >= 2;

      if (isBalanced) {
        /* Award points only once per stable period */
        if (!challengeRef.current.lastResult || challengeRef.current.lastResult.label !== "checking") {
          const canvas = canvasRef.current;
          const cx = canvas ? canvas.clientWidth / 2 : 300;
          const cy = canvas ? canvas.clientHeight / 2 : 200;

          const result = { points: 3, tier: "perfect" as const, label: "Balanced!" };
          challengeRef.current = updateChallengeState(challengeRef.current, result);
          /* Mark as "checking" so we don't re-award */
          challengeRef.current.lastResult = { ...result, label: "checking" };

          scorePopupsRef.current.push({
            text: "Balanced!",
            points: 3,
            x: cx,
            y: cy - 60,
            startTime: performance.now(),
          });

          playSFX("success");
          playScore(3);
          particlesRef.current.emitConfetti(cx, cy, 25);

          /* Generate new challenge after delay */
          setTimeout(() => {
            const ch = generateChallenge();
            challengeWeightsRef.current = ch.weights;
            challengeLockedRef.current = new Set();
            challengeBeamAngleRef.current = 0;
            challengeBeamAngVelRef.current = 0;
            challengeRef.current.lastResult = null;
          }, 2500);
        }
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [mode, draw, computeNetTorque, computeBeamGeometry, hookeMass, springK]);

  /* ---------- Canvas resize ---------- */
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

  /* ---------- Animation loop ---------- */
  useEffect(() => {
    lastTsRef.current = null;
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  /* ---------- Beam interaction: click to place / drag to move weights ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mode !== "beam" && mode !== "challenge") return;

    const weightsArray = mode === "beam" ? weightsRef : challengeWeightsRef;
    const angleArray = mode === "beam" ? beamAngleRef : challengeBeamAngleRef;
    const angVelArray = mode === "beam" ? beamAngVelRef : challengeBeamAngVelRef;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const { beamCx, beamCy, beamPixelLen, pxPerMeter } = computeBeamGeometry(canvas.clientWidth, canvas.clientHeight);
        const angle = angleArray.current;

        /* Check if clicking on an existing weight */
        for (const w of weightsArray.current) {
          const wx = beamCx + meterToPixel(w.position, pxPerMeter) * Math.cos(angle);
          const wy = beamCy + meterToPixel(w.position, pxPerMeter) * Math.sin(angle);
          const wSize = 14 + w.mass * 3;
          const dist = Math.sqrt((x - wx) ** 2 + (y - wy) ** 2);
          if (dist < wSize + 10) {
            draggingWeightRef.current = w.id;
            return true;
          }
        }

        /* Check if clicking on beam (to place new weight) */
        /* Simplified: check if y is near beam center */
        if (Math.abs(y - beamCy) < 50 && Math.abs(x - beamCx) < beamPixelLen / 2 + 10) {
          return true; // Will handle in onClick
        }
        return false;
      },
      onDrag: (x) => {
        if (draggingWeightRef.current == null) return;
        const { beamCx, pxPerMeter } = computeBeamGeometry(canvas.clientWidth, canvas.clientHeight);
        const newPosM = pixelToMeter(x - beamCx, pxPerMeter);
        const clampedPos = Math.max(-BEAM_HALF, Math.min(BEAM_HALF, newPosM));

        const w = weightsArray.current.find(w => w.id === draggingWeightRef.current);
        if (w) {
          w.position = clampedPos;
          /* Reset angular velocity when dragging */
          angVelArray.current = 0;
        }
      },
      onDragEnd: () => {
        if (draggingWeightRef.current != null) {
          playSFX("drop");
          draggingWeightRef.current = null;
        }
      },
      onClick: (x, y) => {
        if (draggingWeightRef.current != null) return;
        const { beamCx, beamCy, beamPixelLen, pxPerMeter } = computeBeamGeometry(canvas.clientWidth, canvas.clientHeight);

        /* Check if near the beam to place */
        if (Math.abs(y - beamCy) < 50 && Math.abs(x - beamCx) < beamPixelLen / 2) {
          const posM = pixelToMeter(x - beamCx, pxPerMeter);
          const clampedPos = Math.max(-BEAM_HALF, Math.min(BEAM_HALF, posM));
          const palette = WEIGHT_PALETTE[selectedWeight];
          const newWeight: BeamWeight = {
            id: nextIdRef.current++,
            mass: palette.mass,
            position: clampedPos,
            color: palette.color,
          };
          weightsArray.current = [...weightsArray.current, newWeight];
          angVelArray.current = 0;
          playSFX("pop");
        }
      },
    });

    /* Right-click to remove weights */
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.clientWidth / rect.width;
      const scaleY = canvas.clientHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const { beamCx, beamCy, pxPerMeter } = computeBeamGeometry(canvas.clientWidth, canvas.clientHeight);
      const angle = angleArray.current;

      for (let i = weightsArray.current.length - 1; i >= 0; i--) {
        const w = weightsArray.current[i];
        const wx = beamCx + meterToPixel(w.position, pxPerMeter) * Math.cos(angle);
        const wy = beamCy + meterToPixel(w.position, pxPerMeter) * Math.sin(angle);
        const wSize = 14 + w.mass * 3;
        const dist = Math.sqrt((x - wx) ** 2 + (y - wy) ** 2);
        if (dist < wSize + 10) {
          weightsArray.current = weightsArray.current.filter(ww => ww.id !== w.id);
          angVelArray.current = 0;
          playSFX("whoosh");
          break;
        }
      }
    };

    canvas.addEventListener("contextmenu", handleContextMenu);
    return () => {
      cleanup();
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [mode, selectedWeight, computeBeamGeometry, meterToPixel, pixelToMeter]);

  /* ---------- Hooke history tracking ---------- */
  useEffect(() => {
    if (mode !== "hooke") return;
    const displacement = (hookeMass * G) / springK;
    const F = hookeMass * G;
    const history = hookeHistoryRef.current;

    /* Only add point if displacement changed enough */
    const last = history[history.length - 1];
    if (!last || Math.abs(last.x - displacement) > 0.001) {
      history.push({ x: displacement, F });
      /* Keep sorted by x for clean line */
      history.sort((a, b) => a.x - b.x);
    }
  }, [hookeMass, springK, mode]);

  /* ---------- Mode switch ---------- */
  const switchMode = useCallback((newMode: SimMode) => {
    setMode(newMode);
    weightsRef.current = [];
    beamAngleRef.current = 0;
    beamAngVelRef.current = 0;
    challengeBeamAngleRef.current = 0;
    challengeBeamAngVelRef.current = 0;
    hookeHistoryRef.current = [];
    springAnimRef.current = { y: 0, vy: 0 };
    challengeRef.current = createChallengeState();
    scorePopupsRef.current = [];
    particlesRef.current.clear();
    lastTsRef.current = null;

    if (newMode === "challenge") {
      const ch = generateChallenge();
      challengeWeightsRef.current = ch.weights;
      challengeLockedRef.current = new Set();
    }
  }, []);

  /* ---------- Clear beam ---------- */
  const clearBeam = useCallback(() => {
    weightsRef.current = [];
    beamAngleRef.current = 0;
    beamAngVelRef.current = 0;
    playSFX("whoosh");
  }, []);

  /* ---------- Clear Hooke history ---------- */
  const clearHookeHistory = useCallback(() => {
    hookeHistoryRef.current = [];
    springAnimRef.current = { y: 0, vy: 0 };
  }, []);

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Simulation Mode
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => switchMode("beam")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "beam"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Beam Balance
          </button>
          <button
            onClick={() => switchMode("hooke")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "hooke"
                ? "bg-green-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Hooke&apos;s Law
          </button>
          <button
            onClick={() => switchMode("challenge")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "challenge"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Balance Challenge
          </button>
        </div>
        {mode === "beam" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Click on the beam to place weights. Drag weights to reposition. Right-click to remove.
          </p>
        )}
        {mode === "hooke" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Adjust mass and spring constant to observe Hooke&apos;s Law. The graph traces F vs x in real time.
          </p>
        )}
        {mode === "challenge" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Given random weights on the beam, drag them to achieve equilibrium (net torque = 0). 3 points for balancing!
          </p>
        )}
      </div>

      {/* Beam mode controls */}
      {(mode === "beam" || mode === "challenge") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
              Select Weight to Place
            </label>
            <div className="flex gap-2 flex-wrap">
              {WEIGHT_PALETTE.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedWeight(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedWeight === i
                      ? "text-white"
                      : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  style={selectedWeight === i ? { backgroundColor: w.color } : {}}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
            {mode === "beam" && (
              <button
                onClick={clearBeam}
                className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
              >
                Clear All
              </button>
            )}
            {mode === "challenge" && (
              <button
                onClick={() => {
                  const ch = generateChallenge();
                  challengeWeightsRef.current = ch.weights;
                  challengeLockedRef.current = new Set();
                  challengeBeamAngleRef.current = 0;
                  challengeBeamAngVelRef.current = 0;
                }}
                className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
              >
                New Challenge
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hooke mode controls */}
      {mode === "hooke" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Mass (kg)
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={0.5}
                max={15}
                step={0.5}
                value={hookeMass}
                onChange={(e) => {
                  setHookeMass(Number(e.target.value));
                  springAnimRef.current.vy = 0;
                }}
                className="flex-1 accent-blue-500"
              />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
                {hookeMass} kg
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Spring Constant k (N/m)
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={springK}
                onChange={(e) => {
                  setSpringK(Number(e.target.value));
                  springAnimRef.current.vy = 0;
                }}
                className="flex-1 accent-green-500"
              />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
                {springK} N/m
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
            <button
              onClick={clearHookeHistory}
              className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Clear Graph
            </button>
          </div>
        </div>
      )}

      {/* Challenge scoreboard */}
      {mode === "challenge" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Score
              </label>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                {challengeRef.current.score}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {challengeRef.current.attempts} balanced
              </p>
              {challengeRef.current.streak > 0 && (
                <p className="text-xs text-amber-500 font-medium">
                  Streak: {challengeRef.current.streak}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Key equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="\tau = r \times F" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="\sum \tau = 0" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="F = -kx" />
          </div>
        </div>
      </div>
    </div>
  );
}
