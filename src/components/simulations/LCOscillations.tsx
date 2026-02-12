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
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

// Energy flow particle: travels along a path between capacitor and inductor
interface EnergyParticle {
  progress: number; // 0..1 along path
  speed: number;
  color: string;
  size: number;
  alpha: number;
  direction: "cap-to-ind" | "ind-to-cap";
}

type ChallengeMode = "predict-freq" | "match-freq" | null;

interface FreqChallenge {
  targetL: number; // mH
  targetC: number; // uF
  actualFreq: number; // Hz
}

interface MatchChallenge {
  targetFreq: number; // Hz
  tolerance: number;
}

export default function LCOscillations() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [inductance, setInductance] = useState(100); // mH
  const [capacitance, setCapacitance] = useState(100); // µF
  const [isRunning, setIsRunning] = useState(false); // starts paused, click capacitor to discharge
  const [discharged, setDischarged] = useState(false);
  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; q: number; i: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);

  // Challenge state
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>(null);
  const challengeStateRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [challengeAttempts, setChallengeAttempts] = useState(0);

  // Predict frequency challenge
  const [freqChallenge, setFreqChallenge] = useState<FreqChallenge | null>(null);
  const [userFreqGuess, setUserFreqGuess] = useState("");
  const [showResult, setShowResult] = useState<string | null>(null);

  // Match frequency challenge
  const [matchChallenge, setMatchChallenge] = useState<MatchChallenge | null>(null);

  // Particle systems
  const particlesRef = useRef(new ParticleSystem());
  const energyParticlesRef = useRef<EnergyParticle[]>([]);
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Capacitor click area (stored for hit testing)
  const capAreaRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // omega = 1/sqrt(LC)
  const L = inductance / 1000; // H
  const C = capacitance / 1000000; // F
  const omega = 1 / Math.sqrt(L * C);
  const period = (2 * Math.PI) / omega;
  const frequency = 1 / period;

  // Generate energy flow particles based on current state
  const updateEnergyParticles = useCallback(
    (q: number, i: number, Q0: number, dt: number) => {
      const particles = energyParticlesRef.current;
      const iScale = Math.abs(i) / (Q0 * omega);
      const qScale = Math.abs(q) / Q0;

      // Spawn new particles based on current flow
      if (iScale > 0.1 && Math.random() < iScale * 0.6) {
        const dir: EnergyParticle["direction"] =
          i > 0 ? "cap-to-ind" : "ind-to-cap";
        // When current flows positive, energy moves from cap to ind
        // When current flows negative, energy moves from ind to cap
        particles.push({
          progress: 0,
          speed: 0.8 + Math.random() * 0.5,
          color:
            dir === "cap-to-ind"
              ? `rgba(59,130,246,${0.5 + qScale * 0.5})`
              : `rgba(245,158,11,${0.5 + (1 - qScale) * 0.5})`,
          size: 2 + Math.random() * 2,
          alpha: 0.8,
          direction: dir,
        });
      }

      // Update existing particles
      for (let j = particles.length - 1; j >= 0; j--) {
        const p = particles[j];
        p.progress += p.speed * dt;
        p.alpha = Math.max(0, 1 - p.progress);
        if (p.progress >= 1) {
          particles.splice(j, 1);
        }
      }
    },
    [omega],
  );

  // Generate new predict-frequency challenge
  const generateFreqChallenge = useCallback(() => {
    const targetL = Math.round(20 + Math.random() * 450); // 20-470 mH
    const targetC = Math.round(20 + Math.random() * 450); // 20-470 uF
    const Lval = targetL / 1000;
    const Cval = targetC / 1000000;
    const actualFreq = 1 / (2 * Math.PI * Math.sqrt(Lval * Cval));
    setFreqChallenge({ targetL, targetC, actualFreq });
    setUserFreqGuess("");
    setShowResult(null);
  }, []);

  // Generate new match-frequency challenge
  const generateMatchChallenge = useCallback(() => {
    // Random target frequency between 5 and 100 Hz
    const targetFreq = Math.round(5 + Math.random() * 95);
    setMatchChallenge({ targetFreq, tolerance: 3 });
  }, []);

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

    const Q0 = 1;
    const q = discharged ? Q0 * Math.cos(omega * t) : Q0;
    const i = discharged ? -Q0 * omega * Math.sin(omega * t) : 0;

    // Energy
    const UE = (0.5 * q * q) / C;
    const UB = 0.5 * L * i * i;
    const UTotal = (0.5 * Q0 * Q0) / C;
    const UEfrac = UE / UTotal;
    const UBfrac = UB / UTotal;

    // --- Circuit layout ---
    const circCenterX = W * 0.25;
    const circY = H * 0.32;
    const circW2 = W * 0.16;
    const circH2 = H * 0.17;

    // Store capacitor area for click detection
    const capX = circCenterX - circW2 - 20;
    const capY = circY - circH2 - 10;
    const capW = 40;
    const capH = circH2 * 2 + 20;
    capAreaRef.current = { x: capX, y: capY, w: capW, h: capH };

    // Wires
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    // Top wire
    ctx.beginPath();
    ctx.moveTo(circCenterX - circW2, circY - circH2);
    ctx.lineTo(circCenterX + circW2, circY - circH2);
    ctx.stroke();
    // Bottom wire
    ctx.beginPath();
    ctx.moveTo(circCenterX - circW2, circY + circH2);
    ctx.lineTo(circCenterX + circW2, circY + circH2);
    ctx.stroke();
    // Left side (capacitor side)
    ctx.beginPath();
    ctx.moveTo(circCenterX - circW2, circY - circH2);
    ctx.lineTo(circCenterX - circW2, circY - 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(circCenterX - circW2, circY + 18);
    ctx.lineTo(circCenterX - circW2, circY + circH2);
    ctx.stroke();
    // Right side (inductor side)
    ctx.beginPath();
    ctx.moveTo(circCenterX + circW2, circY - circH2);
    ctx.lineTo(circCenterX + circW2, circY - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(circCenterX + circW2, circY + 12 + circH2 * 0.5);
    ctx.lineTo(circCenterX + circW2, circY + circH2);
    ctx.stroke();

    // === Capacitor symbol (left side) ===
    const capCenterX = circCenterX - circW2;
    // Plates
    const plateGap = 10;
    const plateLen = 22;

    // Glow based on charge
    if (Math.abs(q) > 0.05) {
      const glowAlpha = Math.abs(q) / Q0;
      ctx.shadowColor = `rgba(59,130,246,${glowAlpha * 0.6})`;
      ctx.shadowBlur = 15 * glowAlpha;
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(59,130,246,${0.4 + (Math.abs(q) / Q0) * 0.6})`;
    // Top plate
    ctx.beginPath();
    ctx.moveTo(capCenterX - plateLen / 2, circY - plateGap / 2);
    ctx.lineTo(capCenterX + plateLen / 2, circY - plateGap / 2);
    ctx.stroke();
    // Bottom plate
    ctx.beginPath();
    ctx.moveTo(capCenterX - plateLen / 2, circY + plateGap / 2);
    ctx.lineTo(capCenterX + plateLen / 2, circY + plateGap / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Charge visualization between plates
    const chargeFrac = Math.abs(q) / Q0;
    if (chargeFrac > 0.05) {
      const grad = ctx.createLinearGradient(
        capCenterX,
        circY - plateGap / 2,
        capCenterX,
        circY + plateGap / 2,
      );
      grad.addColorStop(0, `rgba(59,130,246,${chargeFrac * 0.6})`);
      grad.addColorStop(0.5, `rgba(96,165,250,${chargeFrac * 0.3})`);
      grad.addColorStop(1, `rgba(59,130,246,${chargeFrac * 0.6})`);
      ctx.fillStyle = grad;
      ctx.fillRect(
        capCenterX - plateLen / 2,
        circY - plateGap / 2,
        plateLen,
        plateGap,
      );

      // + and - signs
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = `rgba(147,197,253,${chargeFrac})`;
      ctx.textAlign = "center";
      if (q > 0) {
        ctx.fillText("+", capCenterX, circY - plateGap / 2 - 5);
        ctx.fillText("-", capCenterX, circY + plateGap / 2 + 12);
      } else {
        ctx.fillText("-", capCenterX, circY - plateGap / 2 - 5);
        ctx.fillText("+", capCenterX, circY + plateGap / 2 + 12);
      }
    }

    // "Click to discharge" prompt
    if (!discharged) {
      const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(59,130,246,${pulse * 0.15})`;
      ctx.beginPath();
      ctx.arc(capCenterX, circY, 30, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(59,130,246,${pulse * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(capCenterX, circY, 30, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(147,197,253,${pulse})`;
      ctx.font = "bold 10px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("CLICK TO", capCenterX, circY + 42);
      ctx.fillText("DISCHARGE", capCenterX, circY + 54);
    }

    // Capacitor label
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("C", capCenterX, circY + circH2 + 20);

    // === Inductor symbol (right side) - coil ===
    const coilX = circCenterX + circW2;
    const coilTop = circY - 12;
    const coilBot = circY + 12 + circH2 * 0.5;
    const coilH = coilBot - coilTop;

    // Magnetic field glow
    if (Math.abs(i) > 0.05 * Q0 * omega) {
      const iGlow = Math.abs(i) / (Q0 * omega);
      ctx.shadowColor = `rgba(245,158,11,${iGlow * 0.5})`;
      ctx.shadowBlur = 12 * iGlow;
    }

    ctx.strokeStyle = `rgba(245,158,11,${0.4 + UBfrac * 0.6})`;
    ctx.lineWidth = 2.5;
    const numCoils = 5;
    for (let j = 0; j < numCoils; j++) {
      const y1 = coilTop + (j / numCoils) * coilH;
      const y2 = coilTop + ((j + 1) / numCoils) * coilH;
      ctx.beginPath();
      ctx.arc(coilX, (y1 + y2) / 2, (y2 - y1) / 2, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Magnetic field lines around inductor (when current flows)
    if (UBfrac > 0.1) {
      const fieldAlpha = UBfrac * 0.3;
      ctx.strokeStyle = `rgba(245,158,11,${fieldAlpha})`;
      ctx.lineWidth = 1;
      for (let r = 15; r <= 30; r += 8) {
        ctx.beginPath();
        ctx.ellipse(
          coilX + 10,
          circY,
          r,
          r * 0.6,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("L", coilX + 24, circY);

    // === Current arrows on wires ===
    const iScale = Math.abs(i) / (Q0 * omega);
    if (discharged && iScale > 0.05) {
      ctx.fillStyle = `rgba(34,197,94,${0.3 + iScale * 0.7})`;
      const dir = i > 0 ? 1 : -1;
      const arrowSize = 5;
      // Top wire arrows
      for (
        let ax = circCenterX - circW2 + 30;
        ax < circCenterX + circW2 - 10;
        ax += 22
      ) {
        ctx.beginPath();
        ctx.moveTo(ax + dir * arrowSize, circY - circH2);
        ctx.lineTo(ax - dir * 3, circY - circH2 - 3);
        ctx.lineTo(ax - dir * 3, circY - circH2 + 3);
        ctx.closePath();
        ctx.fill();
      }
      // Bottom wire arrows (opposite direction)
      for (
        let ax = circCenterX - circW2 + 30;
        ax < circCenterX + circW2 - 10;
        ax += 22
      ) {
        ctx.beginPath();
        ctx.moveTo(ax - dir * arrowSize, circY + circH2);
        ctx.lineTo(ax + dir * 3, circY + circH2 - 3);
        ctx.lineTo(ax + dir * 3, circY + circH2 + 3);
        ctx.closePath();
        ctx.fill();
      }

      // Current value label
      ctx.fillStyle = "#22c55e";
      ctx.font = "10px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `i = ${i.toFixed(2)} A`,
        circCenterX,
        circY - circH2 - 8,
      );
    }

    // === Energy flow particles ===
    const eParticles = energyParticlesRef.current;
    for (const ep of eParticles) {
      // Path: goes along the top wire from cap to ind, or bottom wire back
      let px: number, py: number;
      const prog = ep.progress;
      if (ep.direction === "cap-to-ind") {
        // Along top wire, then down right side
        if (prog < 0.5) {
          const frac = prog / 0.5;
          px = capCenterX + frac * (coilX - capCenterX);
          py = circY - circH2 + Math.sin(frac * Math.PI) * -8;
        } else {
          const frac = (prog - 0.5) / 0.5;
          px = coilX;
          py = circY - circH2 + frac * (circH2 * 2);
        }
      } else {
        // Along bottom wire, then up left side
        if (prog < 0.5) {
          const frac = prog / 0.5;
          px = coilX - frac * (coilX - capCenterX);
          py = circY + circH2 + Math.sin(frac * Math.PI) * 8;
        } else {
          const frac = (prog - 0.5) / 0.5;
          px = capCenterX;
          py = circY + circH2 - frac * (circH2 * 2);
        }
      }

      ctx.beginPath();
      ctx.arc(px, py, ep.size, 0, Math.PI * 2);
      ctx.fillStyle = ep.color;
      ctx.globalAlpha = ep.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // === Energy bars (resonance visualization) ===
    const barX = circCenterX - circW2 - 10;
    const barW = circW2 * 2 + 20;
    const barY = circY + circH2 + 35;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, 75, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY RESONANCE", barX + 8, barY + 15);

    // UE bar
    const barInnerX = barX + 8;
    const barInnerW = barW - 16;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(barInnerX, barY + 22, barInnerW, 14, 3);
    ctx.fill();

    const ueGrad = ctx.createLinearGradient(
      barInnerX,
      0,
      barInnerX + UEfrac * barInnerW,
      0,
    );
    ueGrad.addColorStop(0, "rgba(59,130,246,0.9)");
    ueGrad.addColorStop(1, "rgba(96,165,250,0.6)");
    ctx.fillStyle = ueGrad;
    ctx.beginPath();
    ctx.roundRect(barInnerX, barY + 22, Math.max(0, UEfrac * barInnerW), 14, 3);
    ctx.fill();
    // Glow on the bar edge
    if (UEfrac > 0.1) {
      ctx.shadowColor = "rgba(59,130,246,0.5)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(barInnerX + UEfrac * barInnerW, barY + 29, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#93c5fd";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#93c5fd";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText(`UE = ${(UEfrac * 100).toFixed(0)}%`, barInnerX + 2, barY + 33);
    ctx.textAlign = "right";
    ctx.fillText("Electric", barInnerX + barInnerW - 2, barY + 33);

    // UB bar
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(barInnerX, barY + 42, barInnerW, 14, 3);
    ctx.fill();

    const ubGrad = ctx.createLinearGradient(
      barInnerX,
      0,
      barInnerX + UBfrac * barInnerW,
      0,
    );
    ubGrad.addColorStop(0, "rgba(245,158,11,0.9)");
    ubGrad.addColorStop(1, "rgba(252,211,77,0.6)");
    ctx.fillStyle = ubGrad;
    ctx.beginPath();
    ctx.roundRect(barInnerX, barY + 42, Math.max(0, UBfrac * barInnerW), 14, 3);
    ctx.fill();
    if (UBfrac > 0.1) {
      ctx.shadowColor = "rgba(245,158,11,0.5)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(barInnerX + UBfrac * barInnerW, barY + 49, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fcd34d";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#fcd34d";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`UB = ${(UBfrac * 100).toFixed(0)}%`, barInnerX + 2, barY + 53);
    ctx.textAlign = "right";
    ctx.fillText("Magnetic", barInnerX + barInnerW - 2, barY + 53);

    // Total energy conservation indicator
    ctx.textAlign = "center";
    ctx.fillStyle = "#22c55e";
    ctx.font = "9px ui-monospace";
    ctx.fillText(
      `UE + UB = ${((UEfrac + UBfrac) * 100).toFixed(0)}% (conserved)`,
      barX + barW / 2,
      barY + 70,
    );

    // === Right side: Graph ===
    const graphX = W * 0.55;
    const graphW = W - graphX - 20;
    const graphY = 25;
    const graphH = H - 50;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphY - 10, graphW + 20, graphH + 20, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CHARGE & CURRENT vs TIME", graphX, graphY + 5);

    // Zero line
    const midGraphY = graphY + graphH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, midGraphY);
    ctx.lineTo(graphX + graphW, midGraphY);
    ctx.stroke();

    const history = historyRef.current;
    if (history.length > 1) {
      const maxT = Math.max(history[history.length - 1].t, period * 2);
      const plotH = graphH / 2 - 20;

      // Plot charge
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.3)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let j = 0; j < history.length; j++) {
        const px = graphX + (history[j].t / maxT) * graphW;
        const py = midGraphY - (history[j].q / Q0) * plotH;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Plot current (scaled)
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.3)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let j = 0; j < history.length; j++) {
        const px = graphX + (history[j].t / maxT) * graphW;
        const py = midGraphY - (history[j].i / (Q0 * omega)) * plotH;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Plot energy fractions (small overlay at bottom)
      const enH = 30;
      const enY = graphY + graphH - enH - 5;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(graphX, enY - 2, graphW, enH + 4, 4);
      ctx.fill();

      // UE energy trace
      ctx.strokeStyle = "rgba(59,130,246,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j < history.length; j++) {
        const px = graphX + (history[j].t / maxT) * graphW;
        const hq = history[j].q;
        const ue = (0.5 * hq * hq) / C / UTotal;
        const py = enY + enH - ue * enH;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // UB energy trace
      ctx.strokeStyle = "rgba(245,158,11,0.5)";
      ctx.beginPath();
      for (let j = 0; j < history.length; j++) {
        const px = graphX + (history[j].t / maxT) * graphW;
        const hi = history[j].i;
        const ub = (0.5 * L * hi * hi) / UTotal;
        const py = enY + enH - ub * enH;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Legend
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("-- q(t)", graphX + graphW - 100, graphY + 5);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("-- i(t)", graphX + graphW - 50, graphY + 5);

    // Info panel
    drawInfoPanel(ctx, graphX, graphY + graphH - 50, graphW, 45, "PARAMETERS", [
      { label: "omega", value: `${omega.toFixed(1)} rad/s`, color: "#e2e8f0" },
      {
        label: "f",
        value: `${frequency.toFixed(1)} Hz`,
        color: "#f59e0b",
      },
      {
        label: "T",
        value: `${(period * 1000).toFixed(1)} ms`,
        color: "#93c5fd",
      },
    ]);

    // === Challenge mode overlays ===
    if (challengeMode === "match-freq" && matchChallenge) {
      // Target frequency indicator
      const targetFreq = matchChallenge.targetFreq;
      const currentFreq = frequency;
      const diff = Math.abs(currentFreq - targetFreq);
      const isMatched = diff < matchChallenge.tolerance;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(graphX, graphY + 20, graphW, 50, 6);
      ctx.fill();

      ctx.font = "bold 12px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(
        `TARGET: ${targetFreq.toFixed(1)} Hz`,
        graphX + graphW / 2,
        graphY + 38,
      );

      ctx.fillStyle = isMatched ? "#22c55e" : "#ef4444";
      ctx.font = "11px ui-monospace";
      ctx.fillText(
        `Current: ${currentFreq.toFixed(1)} Hz  |  ${isMatched ? "MATCHED!" : `Off by ${diff.toFixed(1)} Hz`}`,
        graphX + graphW / 2,
        graphY + 56,
      );

      if (isMatched) {
        ctx.shadowColor = "rgba(34,197,94,0.5)";
        ctx.shadowBlur = 10;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(graphX, graphY + 20, graphW, 50, 6);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // Scoreboard
    if (challengeMode) {
      renderScoreboard(
        ctx,
        W - 140,
        10,
        130,
        100,
        challengeStateRef.current,
      );
    }

    // Score popups
    const now = Date.now();
    for (let j = scorePopupsRef.current.length - 1; j >= 0; j--) {
      const alive = renderScorePopup(ctx, scorePopupsRef.current[j], now);
      if (!alive) scorePopupsRef.current.splice(j, 1);
    }

    // Particle system
    particlesRef.current.draw(ctx);
  }, [
    omega,
    period,
    frequency,
    L,
    C,
    discharged,
    challengeMode,
    matchChallenge,
  ]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    if (discharged) {
      timeRef.current += dt * 2; // speed scale
    }

    const t = timeRef.current;
    const Q0 = 1;
    const q = discharged ? Q0 * Math.cos(omega * t) : Q0;
    const i = discharged ? -Q0 * omega * Math.sin(omega * t) : 0;

    if (discharged) {
      historyRef.current.push({ t, q, i });
      if (historyRef.current.length > 800) historyRef.current.shift();
      updateEnergyParticles(q, i, Q0, dt);
    }

    particlesRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [omega, draw, discharged, updateEnergyParticles]);

  // Click handler for capacitor discharge
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        if (!discharged) {
          const cap = capAreaRef.current;
          // Generous hit area around the capacitor
          const hitX = cap.x - 15;
          const hitY = cap.y - 15;
          const hitW = cap.w + 30;
          const hitH = cap.h + 30;
          if (
            x >= hitX &&
            x <= hitX + hitW &&
            y >= hitY &&
            y <= hitY + hitH
          ) {
            setDischarged(true);
            setIsRunning(true);
            playSFX("launch");
            // Spark effect from capacitor
            particlesRef.current.emitSparks(
              cap.x + cap.w / 2,
              cap.y + cap.h / 2,
              15,
              "#60a5fa",
            );
          }
        }
      },
    });

    return cleanup;
  }, [discharged]);

  // Canvas resize
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

  // Animation loop
  useEffect(() => {
    if (isRunning) {
      lastTsRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    timeRef.current = 0;
    historyRef.current = [];
    energyParticlesRef.current = [];
    lastTsRef.current = null;
    setDischarged(false);
    setIsRunning(false);
    draw();
  };

  // Challenge: submit frequency prediction
  const submitFreqGuess = () => {
    if (!freqChallenge || !userFreqGuess) return;
    const guess = parseFloat(userFreqGuess);
    if (isNaN(guess)) return;

    const result = calculateAccuracy(guess, freqChallenge.actualFreq, freqChallenge.actualFreq);
    const newState = updateChallengeState(challengeStateRef.current, result);
    challengeStateRef.current = newState;
    setChallengeScore(newState.score);
    setChallengeAttempts(newState.attempts);

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }

    scorePopupsRef.current.push({
      text: `${result.label} (${freqChallenge.actualFreq.toFixed(1)} Hz)`,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 2 : 200,
      startTime: Date.now(),
    });

    setShowResult(
      `${result.label} Answer: ${freqChallenge.actualFreq.toFixed(2)} Hz, Your guess: ${guess.toFixed(2)} Hz`,
    );

    // Generate next challenge after a delay
    setTimeout(() => {
      generateFreqChallenge();
    }, 2000);
  };

  // Challenge: check match frequency
  const checkMatchFreq = () => {
    if (!matchChallenge) return;
    const result = calculateAccuracy(
      frequency,
      matchChallenge.targetFreq,
      matchChallenge.targetFreq,
    );

    const newState = updateChallengeState(challengeStateRef.current, result);
    challengeStateRef.current = newState;
    setChallengeScore(newState.score);
    setChallengeAttempts(newState.attempts);

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      particlesRef.current.emitConfetti(
        canvasRef.current ? canvasRef.current.width / 2 : 300,
        canvasRef.current ? canvasRef.current.height / 2 : 200,
        20,
      );
    } else {
      playSFX("incorrect");
    }

    scorePopupsRef.current.push({
      text: result.label,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 2 : 200,
      startTime: Date.now(),
    });

    // New target after short delay
    setTimeout(() => {
      generateMatchChallenge();
    }, 1500);
  };

  // Start/stop challenge modes
  const startPredictChallenge = () => {
    setChallengeMode("predict-freq");
    challengeStateRef.current = createChallengeState();
    challengeStateRef.current.active = true;
    challengeStateRef.current.description = "Predict the oscillation frequency";
    setChallengeScore(0);
    setChallengeAttempts(0);
    generateFreqChallenge();
    playSFX("powerup");
  };

  const startMatchChallenge = () => {
    setChallengeMode("match-freq");
    challengeStateRef.current = createChallengeState();
    challengeStateRef.current.active = true;
    challengeStateRef.current.description = "Match the target frequency";
    setChallengeScore(0);
    setChallengeAttempts(0);
    generateMatchChallenge();
    playSFX("powerup");
  };

  const stopChallenge = () => {
    setChallengeMode(null);
    setFreqChallenge(null);
    setMatchChallenge(null);
    setShowResult(null);
    challengeStateRef.current = createChallengeState();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            L (mH)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={inductance}
              onChange={(e) => {
                setInductance(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {inductance}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            C (uF)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={capacitance}
              onChange={(e) => {
                setCapacitance(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {capacitance}
            </span>
          </div>
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
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium"
          >
            Reset
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Challenge
          </label>
          {!challengeMode ? (
            <div className="flex gap-2">
              <button
                onClick={startPredictChallenge}
                className="flex-1 h-8 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
              >
                Predict f
              </button>
              <button
                onClick={startMatchChallenge}
                className="flex-1 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
              >
                Match f
              </button>
            </div>
          ) : (
            <button
              onClick={stopChallenge}
              className="h-8 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              End Challenge ({challengeScore} pts / {challengeAttempts} tries)
            </button>
          )}
        </div>
      </div>

      {/* Predict Frequency Challenge UI */}
      {challengeMode === "predict-freq" && freqChallenge && (
        <div className="rounded-xl border-2 border-purple-500/30 bg-purple-950/20 dark:bg-purple-950/30 p-4">
          <h3 className="text-sm font-bold text-purple-300 mb-3">
            Predict the Oscillation Frequency
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-gray-800 rounded-lg px-4 py-2 text-sm font-mono text-gray-200">
              L = {freqChallenge.targetL} mH, C = {freqChallenge.targetC} uF
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-400">
              f = 1 / (2pi * sqrt(LC))
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Your guess (Hz)"
                value={userFreqGuess}
                onChange={(e) => setUserFreqGuess(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitFreqGuess();
                }}
                className="w-40 h-9 rounded-lg border border-gray-600 bg-gray-900 text-gray-100 px-3 text-sm font-mono focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={submitFreqGuess}
                className="h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
          {showResult && (
            <p className="mt-2 text-sm text-gray-300">{showResult}</p>
          )}
        </div>
      )}

      {/* Match Frequency Challenge UI */}
      {challengeMode === "match-freq" && matchChallenge && (
        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-950/20 dark:bg-emerald-950/30 p-4">
          <h3 className="text-sm font-bold text-emerald-300 mb-3">
            Match the Target Frequency
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-gray-800 rounded-lg px-4 py-2 font-mono">
              <span className="text-emerald-400 text-lg font-bold">
                {matchChallenge.targetFreq.toFixed(1)} Hz
              </span>
              <span className="text-gray-500 text-xs ml-2">target</span>
            </div>
            <div className="text-sm text-gray-300">
              Adjust L and C sliders to match. Current:{" "}
              <span
                className={`font-mono font-bold ${
                  Math.abs(frequency - matchChallenge.targetFreq) <
                  matchChallenge.tolerance
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {frequency.toFixed(1)} Hz
              </span>
            </div>
            <button
              onClick={checkMatchFreq}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
            >
              Check Match
            </button>
          </div>
        </div>
      )}

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\omega = \frac{1}{\sqrt{LC}}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="q(t) = Q_0\cos(\omega t)" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="U_E + U_B = \text{const}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Watch energy oscillate between the capacitor (electric) and inductor (magnetic). Adjust L and C to change frequency!</p>
    </div>
  );
}
