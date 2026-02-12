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
import { drawMeter } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

interface ShotParticle {
  x: number;
  y: number;
  vx: number;
  phase: number;
  state: "approaching" | "in_barrier" | "transmitted" | "reflected" | "done";
  tunneled: boolean;
  id: number;
}

interface TunnelingQuiz {
  barrierH: number;
  barrierW: number;
  energy: number;
  correctT: number; // transmission coefficient
  options: number[];
  answered: boolean;
  selectedIdx: number;
  correct: boolean;
}

type DragTarget = "barrier_left" | "barrier_right" | "barrier_top" | null;

export default function QuantumTunneling() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [barrierHeight, setBarrierHeight] = useState(1.5);
  const [barrierWidth, setBarrierWidth] = useState(30);
  const [particleEnergy, setParticleEnergy] = useState(1.0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);

  // Challenge mode
  const [challengeMode, setChallengeMode] = useState(false);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [, setChallengeAttempts] = useState(0);

  // Tunneling quiz
  const [quiz, setQuiz] = useState<TunnelingQuiz | null>(null);

  // Score popups and particles
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());

  // Multi-particle shots
  const shotParticlesRef = useRef<ShotParticle[]>([]);
  const [shotMode, setShotMode] = useState(false);
  const [transmitted, setTransmitted] = useState(0);
  const [reflected, setReflected] = useState(0);
  const [totalShots, setTotalShots] = useState(0);
  const nextIdRef = useRef(0);

  // Barrier drag
  const dragTargetRef = useRef<DragTarget>(null);
  const barrierGeomRef = useRef({
    barrierX: 0,
    bWidth: 0,
    zeroY: 0,
    barrierPixelH: 0,
    plotH: 0,
    margin: 0,
  });

  // Calculate transmission coefficient
  const calcTransmission = useCallback(
    (E: number, V: number, w: number) => {
      if (E >= V) return 1;
      if (V <= 0) return 1;
      const kappa = Math.sqrt(Math.max(V - E, 0)) * 0.08;
      const bw = w * 3;
      return Math.exp(-2 * kappa * bw);
    },
    []
  );

  // Generate quiz
  const generateQuiz = useCallback(() => {
    const bH = 0.5 + Math.random() * 2.5;
    const bW = 10 + Math.floor(Math.random() * 60);
    const pE = 0.2 + Math.random() * 2.5;

    const correctT = pE >= bH ? 1.0 : Math.exp(-2 * Math.sqrt(Math.max(bH - pE, 0)) * 0.08 * bW * 3);
    const correctPct = Math.round(correctT * 100);

    // Generate options: correct + 3 wrong
    const options = [correctPct];
    // Add plausible wrong answers
    const wrongCandidates = [
      Math.round(correctT * 50),
      Math.min(100, Math.round(correctT * 200)),
      Math.round((1 - correctT) * 100),
      Math.round(Math.random() * 100),
      Math.round(correctPct + 15 + Math.random() * 20),
      Math.round(Math.max(0, correctPct - 15 - Math.random() * 20)),
    ].filter((v) => v !== correctPct && v >= 0 && v <= 100);

    // Remove duplicates and pick 3
    const uniqueWrong = Array.from(new Set(wrongCandidates));
    while (options.length < 4 && uniqueWrong.length > 0) {
      const idx = Math.floor(Math.random() * uniqueWrong.length);
      options.push(uniqueWrong.splice(idx, 1)[0]);
    }
    // Fill remaining if needed
    while (options.length < 4) {
      const v = Math.floor(Math.random() * 100);
      if (!options.includes(v)) options.push(v);
    }
    options.sort(() => Math.random() - 0.5);

    setQuiz({
      barrierH: bH,
      barrierW: bW,
      energy: pE,
      correctT,
      options,
      answered: false,
      selectedIdx: -1,
      correct: false,
    });

    // Set the simulation parameters to match quiz
    setBarrierHeight(parseFloat(bH.toFixed(1)));
    setBarrierWidth(bW);
    setParticleEnergy(parseFloat(pE.toFixed(1)));
  }, []);

  // Fire a single particle shot
  const fireShot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { margin, zeroY } = barrierGeomRef.current;

    const T = calcTransmission(particleEnergy, barrierHeight, barrierWidth);
    const tunneled = Math.random() < T;

    const id = nextIdRef.current++;
    shotParticlesRef.current.push({
      x: margin,
      y: zeroY - (particleEnergy / 3) * barrierGeomRef.current.plotH * 0.5,
      vx: 200,
      phase: Math.random() * Math.PI * 2,
      state: "approaching",
      tunneled,
      id,
    });

    playSFX("launch");
  }, [particleEnergy, barrierHeight, barrierWidth, calcTransmission]);

  // Fire a burst of particles
  const fireBurst = useCallback(
    (count: number) => {
      for (let i = 0; i < count; i++) {
        setTimeout(() => fireShot(), i * 80);
      }
    },
    [fireShot]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const margin = 50;
    const plotH = H * 0.7;
    const plotY = H * 0.15;
    const zeroY = plotY + plotH * 0.6;
    const barrierX = W * 0.45;
    const bWidth = barrierWidth * 3;

    // Cache geometry for drag handling
    barrierGeomRef.current = {
      barrierX,
      bWidth,
      zeroY,
      barrierPixelH: (barrierHeight / 3) * plotH * 0.5,
      plotH,
      margin,
    };

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let y = plotY; y <= plotY + plotH; y += 30) {
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(W - margin, y);
      ctx.stroke();
    }

    // Zero potential line
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin, zeroY);
    ctx.lineTo(W - margin, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "right";
    ctx.fillText("V = 0", margin - 5, zeroY + 4);

    // Barrier (potential energy)
    const barrierPixelH = (barrierHeight / 3) * plotH * 0.5;

    // Barrier glow effect
    const barrierGlow = ctx.createLinearGradient(barrierX, zeroY - barrierPixelH, barrierX, zeroY);
    barrierGlow.addColorStop(0, "rgba(239,68,68,0.25)");
    barrierGlow.addColorStop(1, "rgba(239,68,68,0.05)");
    ctx.fillStyle = barrierGlow;
    ctx.fillRect(barrierX, zeroY - barrierPixelH, bWidth, barrierPixelH);

    // Barrier outline with drag handles
    ctx.strokeStyle = "rgba(239,68,68,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, zeroY);
    ctx.lineTo(barrierX, zeroY);
    ctx.lineTo(barrierX, zeroY - barrierPixelH);
    ctx.lineTo(barrierX + bWidth, zeroY - barrierPixelH);
    ctx.lineTo(barrierX + bWidth, zeroY);
    ctx.lineTo(W - margin, zeroY);
    ctx.stroke();

    // Drag handles on barrier edges
    const handleSize = 6;
    // Left edge handle
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(barrierX, zeroY - barrierPixelH / 2, handleSize, 0, Math.PI * 2);
    ctx.fill();
    // Right edge handle
    ctx.beginPath();
    ctx.arc(barrierX + bWidth, zeroY - barrierPixelH / 2, handleSize, 0, Math.PI * 2);
    ctx.fill();
    // Top handle
    ctx.beginPath();
    ctx.arc(barrierX + bWidth / 2, zeroY - barrierPixelH, handleSize, 0, Math.PI * 2);
    ctx.fill();

    // Drag hint
    ctx.font = "8px ui-monospace";
    ctx.fillStyle = "rgba(239,68,68,0.4)";
    ctx.textAlign = "center";
    ctx.fillText("drag edges to resize", barrierX + bWidth / 2, zeroY - barrierPixelH - 10);

    // V0 label
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "left";
    ctx.fillText(`V\u2080 = ${barrierHeight.toFixed(1)} eV`, barrierX + bWidth + 8, zeroY - barrierPixelH + 5);

    // Energy level line
    const energyPixelH = (particleEnergy / 3) * plotH * 0.5;
    ctx.strokeStyle = "rgba(59,130,246,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(margin, zeroY - energyPixelH);
    ctx.lineTo(barrierX, zeroY - energyPixelH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#3b82f6";
    ctx.font = "11px ui-monospace";
    ctx.textAlign = "right";
    ctx.fillText(`E = ${particleEnergy.toFixed(1)} eV`, margin - 5, zeroY - energyPixelH + 4);

    // Wave function
    const k1 = Math.sqrt(particleEnergy) * 0.15;
    const kappa = Math.sqrt(Math.max(barrierHeight - particleEnergy, 0)) * 0.08;
    const k2 = k1;

    // Transmission coefficient
    const transmissionCoeff = calcTransmission(particleEnergy, barrierHeight, barrierWidth);

    const waveAmp = plotH * 0.15;
    const omega = 3;

    ctx.lineWidth = 2.5;

    // Incident wave (left of barrier)
    ctx.strokeStyle = "#3b82f6";
    ctx.shadowColor = "rgba(59,130,246,0.4)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let px = margin; px <= barrierX; px++) {
      const x = px - barrierX;
      const psi = Math.sin(k1 * x - omega * t);
      const py = zeroY - energyPixelH + psi * waveAmp;
      if (px === margin) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Reflected wave
    const reflCoeff = Math.sqrt(1 - transmissionCoeff);
    if (reflCoeff > 0.01) {
      ctx.strokeStyle = "rgba(168,85,247,0.4)";
      ctx.beginPath();
      for (let px = margin; px <= barrierX; px++) {
        const x = px - barrierX;
        const psiRef = reflCoeff * Math.sin(-k1 * x - omega * t);
        const py = zeroY - energyPixelH + psiRef * waveAmp;
        if (px === margin) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Wave inside barrier (exponential decay)
    if (particleEnergy < barrierHeight) {
      ctx.strokeStyle = "rgba(239,68,68,0.5)";
      ctx.beginPath();
      for (let px = barrierX; px <= barrierX + bWidth; px++) {
        const x = px - barrierX;
        const decay = Math.exp(-kappa * x);
        const psi = decay * Math.sin(k1 * 0 - omega * t);
        const py = zeroY - energyPixelH + psi * waveAmp;
        if (px === barrierX) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Envelope
      ctx.strokeStyle = "rgba(239,68,68,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let px = barrierX; px <= barrierX + bWidth; px++) {
        const x = px - barrierX;
        const decay = Math.exp(-kappa * x);
        ctx.lineTo(px, zeroY - energyPixelH - decay * waveAmp);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let px = barrierX; px <= barrierX + bWidth; px++) {
        const x = px - barrierX;
        const decay = Math.exp(-kappa * x);
        ctx.lineTo(px, zeroY - energyPixelH + decay * waveAmp);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Transmitted wave (right of barrier)
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(34,197,94,0.4)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    const transAmp = waveAmp * Math.sqrt(transmissionCoeff);
    for (let px = barrierX + bWidth; px <= W - margin; px++) {
      const x = px - (barrierX + bWidth);
      const psi = (Math.sin(k2 * x - omega * t) * transAmp) / waveAmp;
      const py = zeroY - energyPixelH + psi * waveAmp;
      if (px === barrierX + bWidth) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Labels
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("Incident \u03C8", barrierX / 2, plotY + 15);
    ctx.fillStyle = "#22c55e";
    ctx.fillText(
      "Transmitted \u03C8",
      barrierX + bWidth + (W - margin - barrierX - bWidth) / 2,
      plotY + 15
    );

    // Barrier width label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`width = ${barrierWidth}`, barrierX + bWidth / 2, zeroY + 20);

    // --- Draw shot particles ---
    for (const sp of shotParticlesRef.current) {
      if (sp.state === "done") continue;

      const particleColor = sp.tunneled ? "#22c55e" : "#3b82f6";
      const size = 6;

      // Particle glow
      const pGlow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 15);
      pGlow.addColorStop(0, sp.tunneled ? "rgba(34,197,94,0.6)" : "rgba(59,130,246,0.6)");
      pGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pGlow;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 15, 0, Math.PI * 2);
      ctx.fill();

      // Particle body
      ctx.fillStyle = particleColor;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, size, 0, Math.PI * 2);
      ctx.fill();

      // Wave packet oscillation visual
      ctx.strokeStyle = particleColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let i = -12; i <= 12; i++) {
        const wave = Math.sin(i * 0.6 + sp.phase + t * 10) * 5;
        const px = sp.x + i;
        const py = sp.y + wave;
        if (i === -12) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Reflected indicator
      if (sp.state === "reflected") {
        ctx.fillStyle = "rgba(168,85,247,0.4)";
        ctx.font = "9px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText("REFLECTED", sp.x, sp.y - 20);
      }
    }

    // --- Draw particles ---
    particlesRef.current.draw(ctx);

    // --- Transmission probability panel (enlarged, prominent) ---
    const tPanelW = 230;
    const tPanelH = 108;
    const tPanelX = W - tPanelW - 12;
    const tPanelY = H - tPanelH - 12;

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.roundRect(tPanelX, tPanelY, tPanelW, tPanelH, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "bold 11px ui-monospace";
    ctx.fillStyle = "#f59e0b";
    ctx.textAlign = "left";
    ctx.fillText("TUNNELING DATA", tPanelX + 12, tPanelY + 18);

    // Large T display
    ctx.font = "bold 22px ui-monospace";
    const tColor =
      transmissionCoeff > 0.5 ? "#22c55e" : transmissionCoeff > 0.1 ? "#f59e0b" : "#ef4444";
    ctx.fillStyle = tColor;
    ctx.fillText(`T = ${(transmissionCoeff * 100).toFixed(2)}%`, tPanelX + 12, tPanelY + 45);

    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`E/V\u2080 = ${(particleEnergy / barrierHeight).toFixed(2)}`, tPanelX + 12, tPanelY + 62);

    // Transmission bar
    const tBarW = tPanelW - 24;
    drawMeter(ctx, tPanelX + 12, tPanelY + 70, tBarW, 14, transmissionCoeff, 1, tColor, `${(transmissionCoeff * 100).toFixed(1)}%`);

    ctx.fillStyle = particleEnergy > barrierHeight ? "#22c55e" : "#f59e0b";
    ctx.font = "10px system-ui";
    ctx.fillText(
      particleEnergy > barrierHeight ? "E > V\u2080: classically allowed" : "E < V\u2080: quantum tunneling!",
      tPanelX + 12,
      tPanelY + tPanelH - 8
    );

    // --- Particle counter panel ---
    if (shotMode && totalShots > 0) {
      const cPanelW = 180;
      const cPanelH = 80;
      const cPanelX = 12;
      const cPanelY = H - cPanelH - 12;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(cPanelX, cPanelY, cPanelW, cPanelH, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("PARTICLE COUNTER", cPanelX + 10, cPanelY + 16);

      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#22c55e";
      ctx.fillText(`Transmitted: ${transmitted}`, cPanelX + 10, cPanelY + 34);
      ctx.fillStyle = "#a855f7";
      ctx.fillText(`Reflected:   ${reflected}`, cPanelX + 10, cPanelY + 50);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Total:       ${totalShots}`, cPanelX + 10, cPanelY + 66);

      // Experimental T
      if (totalShots > 0) {
        const expT = transmitted / totalShots;
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "right";
        ctx.fillText(`T_exp = ${(expT * 100).toFixed(1)}%`, cPanelX + cPanelW - 10, cPanelY + 34);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText(`T_theory = ${(transmissionCoeff * 100).toFixed(1)}%`, cPanelX + cPanelW - 10, cPanelY + 50);
      }
    }

    // Wave equation hint
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, H - 55, 230, 40, 6);
    ctx.fill();
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText("T \u2248 exp(\u22122\u03BAL)", 22, H - 40);
    ctx.fillText("\u03BA = \u221A(2m(V\u2080\u2212E)/\u210F\u00B2)", 22, H - 25);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((popup) =>
      renderScorePopup(ctx, popup, now)
    );

    // Challenge scoreboard
    if (challengeMode) {
      renderScoreboard(ctx, 10, 10, 140, 110, challengeRef.current);
    }
  }, [barrierHeight, barrierWidth, particleEnergy, shotMode, totalShots, transmitted, reflected, challengeMode, calcTransmission]);

  const animate = useCallback(() => {
    const now = performance.now();
    const dt = Math.min((now - (lastFrameRef.current || now)) / 1000, 0.05);
    lastFrameRef.current = now;
    timeRef.current += 0.03;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const { barrierX, bWidth, margin } = barrierGeomRef.current;

    // Update shot particles
    let newTransmitted = 0;
    let newReflected = 0;
    for (const sp of shotParticlesRef.current) {
      if (sp.state === "done") continue;

      switch (sp.state) {
        case "approaching":
          sp.x += sp.vx * dt;
          if (sp.x >= barrierX) {
            if (sp.tunneled) {
              sp.state = "in_barrier";
            } else {
              sp.state = "reflected";
              sp.vx = -sp.vx;
              particlesRef.current.emitSparks(sp.x, sp.y, 6, "#a855f7");
              playSFX("collision");
            }
          }
          break;
        case "in_barrier":
          sp.x += sp.vx * dt * 0.5; // slower inside barrier
          if (sp.x >= barrierX + bWidth) {
            sp.state = "transmitted";
            sp.vx = 200;
            particlesRef.current.emitGlow(sp.x, sp.y, 10, "#22c55e");
            particlesRef.current.emitSparks(sp.x, sp.y, 8, "#22c55e");
            playSFX("powerup");
            newTransmitted++;
          }
          break;
        case "transmitted":
          sp.x += sp.vx * dt;
          if (sp.x > W - margin + 20) {
            sp.state = "done";
          }
          break;
        case "reflected":
          sp.x += sp.vx * dt;
          if (sp.x < margin - 20) {
            sp.state = "done";
            newReflected++;
          }
          break;
      }

      // Trail particles
      if (sp.state !== "done") {
        const trailColor = sp.state === "reflected" ? "#a855f7" : sp.tunneled ? "#22c55e" : "#3b82f6";
        if (Math.random() < 0.3) {
          particlesRef.current.emitTrail(sp.x, sp.y, sp.vx > 0 ? 0 : Math.PI, trailColor);
        }
      }
    }

    if (newTransmitted > 0) {
      setTransmitted((prev) => prev + newTransmitted);
      setTotalShots((prev) => prev + newTransmitted);
    }
    if (newReflected > 0) {
      setReflected((prev) => prev + newReflected);
      setTotalShots((prev) => prev + newReflected);
    }

    // Clean up done particles
    shotParticlesRef.current = shotParticlesRef.current.filter((sp) => sp.state !== "done");

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Barrier drag handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const { barrierX, bWidth, zeroY, barrierPixelH } = barrierGeomRef.current;

        // Check if near left edge
        if (Math.abs(x - barrierX) < 15 && y > zeroY - barrierPixelH - 15 && y < zeroY + 15) {
          dragTargetRef.current = "barrier_left";
          return true;
        }
        // Check if near right edge
        if (Math.abs(x - (barrierX + bWidth)) < 15 && y > zeroY - barrierPixelH - 15 && y < zeroY + 15) {
          dragTargetRef.current = "barrier_right";
          return true;
        }
        // Check if near top
        if (
          x > barrierX - 10 &&
          x < barrierX + bWidth + 10 &&
          Math.abs(y - (zeroY - barrierPixelH)) < 15
        ) {
          dragTargetRef.current = "barrier_top";
          return true;
        }

        return false;
      },
      onDrag: (_x, _y, dx, dy) => {
        const target = dragTargetRef.current;
        if (!target) return;

        const { plotH } = barrierGeomRef.current;

        if (target === "barrier_left" || target === "barrier_right") {
          // Adjust barrier width
          const pixelsPerUnit = 3; // barrierWidth * 3 = pixels
          const widthChange = target === "barrier_right" ? dx / pixelsPerUnit : -dx / pixelsPerUnit;
          setBarrierWidth((prev) => Math.max(5, Math.min(80, Math.round(prev + widthChange))));
        } else if (target === "barrier_top") {
          // Adjust barrier height
          const heightPixelRange = plotH * 0.5;
          const heightChange = (-dy / heightPixelRange) * 3;
          setBarrierHeight((prev) => parseFloat(Math.max(0.5, Math.min(3, prev + heightChange)).toFixed(1)));
        }
      },
      onDragEnd: () => {
        dragTargetRef.current = null;
      },
      onClick: (x) => {
        // If shot mode is on, fire a particle on click (outside barrier)
        if (shotMode) {
          const { barrierX: bx, margin: m } = barrierGeomRef.current;
          if (x < bx && x > m) {
            fireShot();
          }
        }
      },
    });

    return cleanup;
  }, [shotMode, fireShot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 480);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      lastFrameRef.current = performance.now();
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Answer quiz
  const answerQuiz = (selectedPct: number, idx: number) => {
    if (!quiz || quiz.answered) return;
    const correctPct = Math.round(quiz.correctT * 100);
    const correct = selectedPct === correctPct;

    const result = correct
      ? { points: 3, tier: "perfect" as const, label: "Correct!" }
      : { points: 0, tier: "miss" as const, label: "Wrong!" };

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeScore(challengeRef.current.score);
    setChallengeAttempts(challengeRef.current.attempts);

    if (correct) {
      playSFX("correct");
      playScore(3);
    } else {
      playSFX("incorrect");
    }

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
    }

    setQuiz({ ...quiz, answered: true, selectedIdx: idx, correct });

    setTimeout(() => {
      generateQuiz();
    }, 2500);
  };

  // Reset particle counter
  const resetCounter = () => {
    setTransmitted(0);
    setReflected(0);
    setTotalShots(0);
    shotParticlesRef.current = [];
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Particle Energy
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={particleEnergy}
              onChange={(e) => setParticleEnergy(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {particleEnergy.toFixed(1)} eV
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Barrier Height
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={barrierHeight}
              onChange={(e) => setBarrierHeight(Number(e.target.value))}
              className="flex-1 accent-red-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {barrierHeight.toFixed(1)} eV
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Barrier Width
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={5}
              max={80}
              value={barrierWidth}
              onChange={(e) => setBarrierWidth(Number(e.target.value))}
              className="flex-1 accent-red-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {barrierWidth}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      {/* Particle shots & challenge controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Particle Shots
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShotMode(true);
                fireShot();
              }}
              className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              Fire 1
            </button>
            <button
              onClick={() => {
                setShotMode(true);
                fireBurst(10);
              }}
              className="flex-1 h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
            >
              Fire 10
            </button>
            <button
              onClick={() => {
                setShotMode(true);
                fireBurst(50);
              }}
              className="flex-1 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
            >
              Fire 50
            </button>
          </div>
          {totalShots > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {transmitted}/{totalShots} tunneled ({totalShots > 0 ? ((transmitted / totalShots) * 100).toFixed(1) : 0}%)
              </span>
              <button onClick={resetCounter} className="text-xs text-red-500 hover:text-red-400">
                Reset
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Transmission Coefficient
          </label>
          <div className="text-2xl font-mono font-bold text-center" style={{
            color: calcTransmission(particleEnergy, barrierHeight, barrierWidth) > 0.5
              ? "#22c55e"
              : calcTransmission(particleEnergy, barrierHeight, barrierWidth) > 0.1
                ? "#f59e0b"
                : "#ef4444"
          }}>
            T = {(calcTransmission(particleEnergy, barrierHeight, barrierWidth) * 100).toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 text-center mt-1">
            {particleEnergy > barrierHeight
              ? "Classically allowed (E > V)"
              : "Quantum tunneling regime"}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Challenge Mode
          </label>
          <button
            onClick={() => {
              const newMode = !challengeMode;
              setChallengeMode(newMode);
              challengeRef.current = { ...challengeRef.current, active: newMode };
              if (newMode) {
                generateQuiz();
              } else {
                setQuiz(null);
              }
            }}
            className={`w-full h-9 rounded-lg text-sm font-medium transition-colors ${
              challengeMode
                ? "bg-amber-500 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            {challengeMode ? `Score: ${challengeScore}` : "Will It Tunnel?"}
          </button>
        </div>
      </div>

      {/* Quiz section */}
      {challengeMode && quiz && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
            Will It Tunnel? Predict the Transmission
          </h3>
          <div className="text-sm text-gray-700 dark:text-gray-300 mb-3 space-y-1">
            <p>
              Given: E = <span className="font-mono font-bold">{quiz.energy.toFixed(1)} eV</span>,
              V_0 = <span className="font-mono font-bold">{quiz.barrierH.toFixed(1)} eV</span>,
              width = <span className="font-mono font-bold">{quiz.barrierW}</span>
            </p>
            <p className="text-xs text-gray-500">
              What is the transmission probability T?
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quiz.options.map((pct, i) => {
              const correctPct = Math.round(quiz.correctT * 100);
              const isCorrectAnswer = pct === correctPct;
              let btnClass =
                "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
              if (quiz.answered) {
                if (isCorrectAnswer) {
                  btnClass = "bg-green-600 text-white";
                } else if (i === quiz.selectedIdx) {
                  btnClass = "bg-red-600 text-white";
                } else {
                  btnClass =
                    "border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600";
                }
              }
              return (
                <button
                  key={i}
                  onClick={() => answerQuiz(pct, i)}
                  disabled={quiz.answered}
                  className={`h-10 rounded-lg text-sm font-mono font-medium transition-colors ${btnClass}`}
                >
                  T = {pct}%
                </button>
              );
            })}
          </div>
          {quiz.answered && (
            <p
              className={`text-sm mt-2 font-medium ${
                quiz.correct ? "text-green-600" : "text-red-500"
              }`}
            >
              {quiz.correct
                ? `Correct! T = exp(-2*kappa*L) = ${(quiz.correctT * 100).toFixed(1)}%`
                : `The correct answer is T = ${(quiz.correctT * 100).toFixed(1)}%. Remember: T = exp(-2*kappa*L)`}
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="T \approx e^{-2\kappa L}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\kappa = \sqrt{\frac{2m(V_0 - E)}{\hbar^2}}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Adjust particle energy and barrier height/width to see how tunneling probability changes exponentially!</p>
    </div>
  );
}
