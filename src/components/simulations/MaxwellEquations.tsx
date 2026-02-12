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
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

type SimMode = "charging" | "emwave" | "faraday";

// Current dot flowing along a wire path
interface CurrentDot {
  progress: number; // 0..1 along path
  speed: number;
}

export default function MaxwellEquations() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Controls
  const [mode, setMode] = useState<SimMode>("charging");
  const [chargeRate, setChargeRate] = useState(1.0);
  const [showEField, setShowEField] = useState(true);
  const [showBField, setShowBField] = useState(true);
  const [showCurrent, setShowCurrent] = useState(true);
  const [isRunning, setIsRunning] = useState(true);

  // Animation state
  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);

  // Capacitor charging state
  const chargeRef = useRef(0); // 0..1 normalized charge
  const chargingRef = useRef(true);

  // Current dots for wire animation
  const currentDotsRef = useRef<CurrentDot[]>([]);

  // Challenge state
  const [challengeActive, setChallengeActive] = useState(false);
  const challengeStateRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const challengeQuestionRef = useRef<{
    equation: number; // 0..3 which Maxwell equation
    label: string;
    options: string[];
    correct: string;
  } | null>(null);
  const [challengeFeedback, setChallengeFeedback] = useState<string | null>(null);
  const [challengeQuestion, setChallengeQuestion] = useState<string>("");

  // Physics constants
  const epsilon0 = 8.854e-12;
  // mu0 = 4 * Math.PI * 1e-7 (permeability of free space, referenced in equations text)
  const plateArea = 0.01; // m^2
  const plateSep = 0.02; // m
  const maxVoltage = 100; // V
  const R = 1000; // Ohms - circuit resistance
  const C = epsilon0 * plateArea / plateSep; // capacitance

  // Initialize current dots
  useEffect(() => {
    const dots: CurrentDot[] = [];
    for (let i = 0; i < 12; i++) {
      dots.push({
        progress: i / 12,
        speed: 0.3 + Math.random() * 0.1,
      });
    }
    currentDotsRef.current = dots;
  }, []);

  // Get active Maxwell equation index for current mode
  const getActiveEquation = useCallback((): number => {
    switch (mode) {
      case "charging": return 3; // Ampere-Maxwell law
      case "emwave": return -1; // All active (coupled)
      case "faraday": return 2; // Faraday's law
    }
  }, [mode]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;
    const charge = chargeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const activeEq = getActiveEquation();

    if (mode === "charging") {
      drawChargingCapacitor(ctx, W, H, t, charge);
    } else if (mode === "emwave") {
      drawEMWave(ctx, W, H, t);
    } else if (mode === "faraday") {
      drawFaradayMode(ctx, W, H, t);
    }

    // --- Maxwell's Equations side panel ---
    drawMaxwellPanel(ctx, W, H, t, activeEq);

    // --- Data panel ---
    drawDataPanel(ctx, W, H, t, charge);

    // Particle system
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Challenge scoreboard
    if (challengeActive) {
      renderScoreboard(ctx, 10, H - 140, 130, 110, challengeStateRef.current);
    }
  }, [mode, showEField, showBField, showCurrent, chargeRate, challengeActive, getActiveEquation]);

  // --- Charging Capacitor Drawing ---
  function drawChargingCapacitor(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    charge: number,
  ) {
    const cx = W * 0.28;
    const cy = H * 0.5;
    const plateH = H * 0.45;
    const plateW = 8;
    const gap = 70;

    const leftPlateX = cx - gap / 2;
    const rightPlateX = cx + gap / 2;

    // --- Wires ---
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2.5;

    // Top wire: battery -> left plate (top)
    const batX = cx;
    const batY = cy - plateH / 2 - 50;
    ctx.beginPath();
    ctx.moveTo(leftPlateX, cy - plateH / 2);
    ctx.lineTo(leftPlateX, batY);
    ctx.lineTo(batX - 12, batY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightPlateX + plateW, cy - plateH / 2);
    ctx.lineTo(rightPlateX + plateW, batY);
    ctx.lineTo(batX + 12, batY);
    ctx.stroke();

    // Battery symbol
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(batX - 12, batY - 10);
    ctx.lineTo(batX - 12, batY + 10);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(batX + 12, batY - 15);
    ctx.lineTo(batX + 12, batY + 15);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${maxVoltage}V`, batX, batY - 20);

    // Animated current dots along wires
    if (showCurrent && charge < 0.98) {
      const chargingFactor = 1 - charge;
      const dots = currentDotsRef.current;

      ctx.fillStyle = `rgba(34,197,94,${0.5 + 0.3 * chargingFactor})`;

      for (const dot of dots) {
        const prog = dot.progress;

        // Left wire path: battery left terminal -> down to left plate
        if (prog < 0.5) {
          const localP = prog * 2;
          // Horizontal part
          if (localP < 0.4) {
            const px = batX - 12 - (leftPlateX - (batX - 12)) * (1 - localP / 0.4);
            ctx.beginPath();
            ctx.arc(px, batY, 3 * chargingFactor, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Vertical part going down
            const vy = batY + (cy - plateH / 2 - batY) * ((localP - 0.4) / 0.6);
            ctx.beginPath();
            ctx.arc(leftPlateX, vy, 3 * chargingFactor, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Right wire path: right plate -> up to battery right terminal
          const localP = (prog - 0.5) * 2;
          if (localP < 0.6) {
            // Vertical part going up
            const vy = cy - plateH / 2 - (cy - plateH / 2 - batY) * (localP / 0.6);
            ctx.beginPath();
            ctx.arc(rightPlateX + plateW, vy, 3 * chargingFactor, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Horizontal part
            const px = rightPlateX + plateW + ((batX + 12) - (rightPlateX + plateW)) * ((localP - 0.6) / 0.4);
            ctx.beginPath();
            ctx.arc(px, batY, 3 * chargingFactor, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // --- Plates ---
    // Left plate (positive)
    const leftGrad = ctx.createLinearGradient(leftPlateX, 0, leftPlateX + plateW, 0);
    leftGrad.addColorStop(0, "#dc2626");
    leftGrad.addColorStop(1, "#ef4444");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(leftPlateX, cy - plateH / 2, plateW, plateH);
    ctx.strokeStyle = "rgba(252,165,165,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(leftPlateX, cy - plateH / 2, plateW, plateH);

    // Right plate (negative)
    const rightGrad = ctx.createLinearGradient(rightPlateX, 0, rightPlateX + plateW, 0);
    rightGrad.addColorStop(0, "#2563eb");
    rightGrad.addColorStop(1, "#3b82f6");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(rightPlateX, cy - plateH / 2, plateW, plateH);
    ctx.strokeStyle = "rgba(147,197,253,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rightPlateX, cy - plateH / 2, plateW, plateH);

    // Charge symbols on plates
    const chargeCount = Math.max(1, Math.floor(charge * 8));
    for (let i = 0; i < chargeCount; i++) {
      const py = cy - plateH / 2 + (plateH / (chargeCount + 1)) * (i + 1);
      const wobble = Math.sin(t * 3 + i) * 1.5;

      // Positive charges (left plate)
      const glow1 = ctx.createRadialGradient(
        leftPlateX - 10 + wobble, py, 0,
        leftPlateX - 10 + wobble, py, 7,
      );
      glow1.addColorStop(0, `rgba(239,68,68,${charge * 0.7})`);
      glow1.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = glow1;
      ctx.beginPath();
      ctx.arc(leftPlateX - 10 + wobble, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(252,165,165,${charge})`;
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("+", leftPlateX - 10 + wobble, py + 4);

      // Negative charges (right plate)
      const glow2 = ctx.createRadialGradient(
        rightPlateX + plateW + 10 + wobble, py, 0,
        rightPlateX + plateW + 10 + wobble, py, 7,
      );
      glow2.addColorStop(0, `rgba(59,130,246,${charge * 0.7})`);
      glow2.addColorStop(1, "rgba(59,130,246,0)");
      ctx.fillStyle = glow2;
      ctx.beginPath();
      ctx.arc(rightPlateX + plateW + 10 + wobble, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(147,197,253,${charge})`;
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("\u2212", rightPlateX + plateW + 10 + wobble, py + 4);
    }

    // --- E-field arrows between plates ---
    if (showEField && charge > 0.02) {
      const fieldRows = 7;
      const eFieldAlpha = Math.min(1, charge);

      for (let i = 0; i < fieldRows; i++) {
        const ay = cy - plateH / 2 + (plateH / (fieldRows + 1)) * (i + 1);
        const ax1 = leftPlateX + plateW + 6;
        const ax2 = rightPlateX - 6;

        // E-field line
        ctx.strokeStyle = `rgba(239,68,68,${eFieldAlpha * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "rgba(239,68,68,0.3)";
        ctx.shadowBlur = 4 * eFieldAlpha;
        ctx.beginPath();
        ctx.moveTo(ax1, ay);
        ctx.lineTo(ax2, ay);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Animated arrows along field line
        const arrowSpeed = 40;
        const arrowSpacing = 16;
        const offset = (t * arrowSpeed) % arrowSpacing;
        ctx.fillStyle = `rgba(251,146,60,${eFieldAlpha * 0.7})`;
        for (let ax = ax1 + offset; ax < ax2 - 6; ax += arrowSpacing) {
          ctx.beginPath();
          ctx.moveTo(ax + 5, ay);
          ctx.lineTo(ax + 1, ay - 2.5);
          ctx.lineTo(ax + 1, ay + 2.5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // E label
      ctx.fillStyle = `rgba(239,68,68,${eFieldAlpha})`;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("E", cx, cy - plateH / 2 - 6);
    }

    // --- B-field (displacement current creates B between plates) ---
    if (showBField && charge < 0.98 && charge > 0.02) {
      const dIdtFactor = (1 - charge) * chargeRate; // displacement current proportional to dE/dt
      const bAlpha = Math.min(1, dIdtFactor);

      // Draw circular B-field lines around the axis between plates (viewed from front)
      const bCenterX = cx;
      const bCenterY = cy;

      for (let r = 10; r <= 28; r += 9) {
        ctx.strokeStyle = `rgba(59,130,246,${bAlpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "rgba(96,165,250,0.3)";
        ctx.shadowBlur = 3;

        ctx.beginPath();
        ctx.arc(bCenterX, bCenterY, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Direction arrows on B circles (counterclockwise when viewed from right)
        const nArrows = r < 15 ? 2 : 3;
        for (let a = 0; a < nArrows; a++) {
          const angle = (a / nArrows) * Math.PI * 2 + t * 2;
          const ax = bCenterX + Math.cos(angle) * r;
          const ay = bCenterY + Math.sin(angle) * r;
          // Tangent direction (counterclockwise)
          const tx = -Math.sin(angle);
          const ty = Math.cos(angle);

          ctx.fillStyle = `rgba(96,165,250,${bAlpha * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(ax + tx * 5, ay + ty * 5);
          ctx.lineTo(ax - tx * 2 + ty * 2.5, ay - ty * 2 - tx * 2.5);
          ctx.lineTo(ax - tx * 2 - ty * 2.5, ay - ty * 2 + tx * 2.5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // B label
      ctx.fillStyle = `rgba(96,165,250,${bAlpha})`;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("B (from I_d)", cx, cy + plateH / 2 + 18);
    }

    // --- Labels ---
    // Conduction current label on wires
    if (showCurrent && charge < 0.98) {
      const icAlpha = 0.5 + 0.3 * (1 - charge);
      ctx.fillStyle = `rgba(34,197,94,${icAlpha})`;
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("I_c (conduction)", leftPlateX - 20, cy - plateH / 2 + 50);

      ctx.fillStyle = `rgba(96,165,250,${icAlpha})`;
      ctx.fillText("I_d (displacement)", cx, cy + plateH / 2 + 30);
    }

    // Amperian loop indicator (dashed circle)
    if (charge > 0.02 && charge < 0.98) {
      ctx.strokeStyle = `rgba(245,158,11,${0.3 + 0.15 * Math.sin(t * 2)})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, 35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245,158,11,0.5)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("Amperian loop", cx + 38, cy - 2);
    }
  }

  // --- EM Wave Mode Drawing ---
  function drawEMWave(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
  ) {
    const cy = H * 0.5;
    const waveStartX = 40;
    const waveEndX = W * 0.55;
    const amplitude = H * 0.25;
    const wavelength = 120;
    const k = (2 * Math.PI) / wavelength;
    const omega = k * 3 * chargeRate;

    // Propagation axis
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(waveStartX, cy);
    ctx.lineTo(waveEndX, cy);
    ctx.stroke();
    // Arrow
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(waveEndX, cy);
    ctx.lineTo(waveEndX - 8, cy - 4);
    ctx.lineTo(waveEndX - 8, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "right";
    ctx.fillText("propagation (x)", waveEndX - 12, cy - 8);

    // E-field wave (vertical oscillation, red/orange)
    if (showEField) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(239,68,68,0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let px = waveStartX; px < waveEndX; px += 2) {
        const x = px - waveStartX;
        const Eval = amplitude * Math.sin(k * x - omega * t);
        const screenY = cy - Eval;
        if (px === waveStartX) ctx.moveTo(px, screenY);
        else ctx.lineTo(px, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // E field vectors
      ctx.strokeStyle = "rgba(239,68,68,0.2)";
      ctx.lineWidth = 1;
      for (let px = waveStartX + 10; px < waveEndX; px += 20) {
        const x = px - waveStartX;
        const Eval = amplitude * Math.sin(k * x - omega * t);
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px, cy - Eval);
        ctx.stroke();
      }

      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("E (electric)", waveStartX, 25);
    }

    // B-field wave (horizontal oscillation via perspective, blue/cyan)
    if (showBField) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(59,130,246,0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let px = waveStartX; px < waveEndX; px += 2) {
        const x = px - waveStartX;
        const Bval = amplitude * 0.6 * Math.sin(k * x - omega * t);
        // Perspective: B oscillates "in/out of screen" shown via x-offset and slight y
        const screenX = px + Bval * 0.4;
        const screenY = cy + Bval * 0.25;
        if (px === waveStartX) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // B vectors
      ctx.strokeStyle = "rgba(59,130,246,0.2)";
      ctx.lineWidth = 1;
      for (let px = waveStartX + 10; px < waveEndX; px += 20) {
        const x = px - waveStartX;
        const Bval = amplitude * 0.6 * Math.sin(k * x - omega * t);
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px + Bval * 0.4, cy + Bval * 0.25);
        ctx.stroke();
      }

      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("B (magnetic)", waveStartX, 45);
    }

    // Show coupling annotation
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Changing E creates B, changing B creates E", (waveStartX + waveEndX) / 2, H - 20);

    // Show c = 1/sqrt(mu0*eps0)
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText("c = 3.00 \u00D7 10\u2078 m/s", (waveStartX + waveEndX) / 2, H - 8);
  }

  // --- Faraday Mode Drawing ---
  function drawFaradayMode(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
  ) {
    const cx = W * 0.28;
    const cy = H * 0.5;
    const coilR = 50;

    // Changing B-field (oscillating, shown as dots/crosses going in/out of screen)
    const bMag = Math.sin(t * chargeRate * 2);
    const absBMag = Math.abs(bMag);

    if (showBField) {
      // Grid of B-field symbols within the coil area
      const gridSpacing = 18;
      for (let gx = cx - coilR + 10; gx <= cx + coilR - 10; gx += gridSpacing) {
        for (let gy = cy - coilR + 10; gy <= cy + coilR - 10; gy += gridSpacing) {
          const dx = gx - cx;
          const dy = gy - cy;
          if (dx * dx + dy * dy > (coilR - 10) * (coilR - 10)) continue;

          ctx.fillStyle = `rgba(59,130,246,${0.3 + absBMag * 0.5})`;
          ctx.font = "bold 12px ui-monospace, monospace";
          ctx.textAlign = "center";

          if (bMag > 0) {
            // Dot (field coming out of screen)
            ctx.beginPath();
            ctx.arc(gx, gy, 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Cross (field going into screen)
            ctx.strokeStyle = `rgba(59,130,246,${0.3 + absBMag * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(gx - 3, gy - 3);
            ctx.lineTo(gx + 3, gy + 3);
            ctx.moveTo(gx + 3, gy - 3);
            ctx.lineTo(gx - 3, gy + 3);
            ctx.stroke();
          }
        }
      }

      // B label
      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`B(t) ${bMag > 0 ? "out" : "in"}`, cx, cy - coilR - 18);
    }

    // Coil (circular loop)
    const dBdt = Math.cos(t * chargeRate * 2) * chargeRate * 2;
    const absdBdt = Math.abs(dBdt);
    const emfGlow = Math.min(1, absdBdt / 3);

    ctx.strokeStyle = `rgba(245,158,11,${0.5 + emfGlow * 0.5})`;
    ctx.lineWidth = 3;
    if (emfGlow > 0.3) {
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = emfGlow * 15;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, coilR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Induced E-field (tangential arrows around coil)
    if (showEField && absdBdt > 0.1) {
      const nArrows = 8;
      const direction = dBdt > 0 ? 1 : -1; // Lenz's law direction

      for (let i = 0; i < nArrows; i++) {
        const angle = (i / nArrows) * Math.PI * 2 + t * 0.5 * direction;
        const arrowR = coilR + 8;
        const ax = cx + Math.cos(angle) * arrowR;
        const ay = cy + Math.sin(angle) * arrowR;

        // Tangent direction
        const tx = -Math.sin(angle) * direction;
        const ty = Math.cos(angle) * direction;

        ctx.fillStyle = `rgba(239,68,68,${emfGlow * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(ax + tx * 6, ay + ty * 6);
        ctx.lineTo(ax - tx * 1 + ty * 3, ay - ty * 1 - tx * 3);
        ctx.lineTo(ax - tx * 1 - ty * 3, ay - ty * 1 + tx * 3);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = `rgba(239,68,68,${emfGlow})`;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Induced E", cx, cy + coilR + 28);
    }

    // EMF indicator
    const emfValue = absdBdt * 10;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(cx - 50, cy + coilR + 36, 100, 22, 6);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`EMF = ${emfValue.toFixed(1)} V`, cx, cy + coilR + 52);

    // Annotation
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Changing B induces circulating E", cx, H - 12);
  }

  // --- Maxwell's Equations Panel ---
  function drawMaxwellPanel(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    activeEq: number,
  ) {
    const panelX = W * 0.6;
    const panelY = 12;
    const panelW = W * 0.38;
    const panelH = 165;

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("MAXWELL'S EQUATIONS", panelX + 12, panelY + 20);

    const equations = [
      { name: "Gauss (E)", text: "\u222E E\u00B7dA = Q/\u03B5\u2080", color: "#ef4444" },
      { name: "Gauss (B)", text: "\u222E B\u00B7dA = 0", color: "#3b82f6" },
      { name: "Faraday", text: "\u222E E\u00B7dl = -d\u03A6_B/dt", color: "#f59e0b" },
      { name: "Amp-Max", text: "\u222E B\u00B7dl = \u03BC\u2080I + \u03BC\u2080\u03B5\u2080 d\u03A6_E/dt", color: "#22c55e" },
    ];

    let ey = panelY + 38;
    for (let i = 0; i < equations.length; i++) {
      const eq = equations[i];
      const isActive = activeEq === i || activeEq === -1;
      const glowPulse = isActive ? 0.3 + 0.2 * Math.sin(t * 3) : 0;

      // Background highlight for active equation
      if (isActive) {
        ctx.fillStyle = `rgba(255,255,255,${0.04 + glowPulse * 0.04})`;
        ctx.beginPath();
        ctx.roundRect(panelX + 6, ey - 12, panelW - 12, 28, 4);
        ctx.fill();

        // Glow border
        ctx.strokeStyle = `${eq.color}${Math.round((0.3 + glowPulse) * 255).toString(16).padStart(2, "0")}`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Equation name
      ctx.fillStyle = isActive ? eq.color : "rgba(255,255,255,0.3)";
      ctx.font = `${isActive ? "bold " : ""}10px ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillText(eq.name, panelX + 12, ey);

      // Equation text
      ctx.fillStyle = isActive ? "#ffffff" : "rgba(255,255,255,0.25)";
      ctx.font = `${isActive ? "bold " : ""}10px ui-monospace, monospace`;
      ctx.textAlign = "right";

      // Truncate if needed
      const maxTextW = panelW - 90;
      let text = eq.text;
      while (ctx.measureText(text).width > maxTextW && text.length > 10) {
        text = text.slice(0, -1);
      }
      ctx.fillText(text, panelX + panelW - 12, ey);

      // Active indicator dot
      if (isActive) {
        ctx.fillStyle = eq.color;
        ctx.shadowColor = eq.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(panelX + 8, ey - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ey += 30;
    }
  }

  // --- Data Panel ---
  function drawDataPanel(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    charge: number,
  ) {
    const panelX = W * 0.6;
    const panelY = 185;

    if (mode === "charging") {
      const Q = charge * C * maxVoltage;
      const eField = charge * maxVoltage / plateSep;
      const Ic = (1 - charge) * maxVoltage / R * chargeRate;
      const Id = Ic; // In the gap, displacement current equals conduction current
      const dPhiEdt = Id / epsilon0;

      drawInfoPanel(ctx, panelX, panelY, W * 0.38, 130, "DISPLACEMENT CURRENT", [
        { label: "Q (charge)", value: `${(Q * 1e9).toFixed(2)} nC`, color: "#ef4444" },
        { label: "E-field", value: `${(eField).toFixed(0)} V/m`, color: "#fb923c" },
        { label: "I_c (cond)", value: `${(Ic * 1e3).toFixed(2)} mA`, color: "#22c55e" },
        { label: "I_d (disp)", value: `${(Id * 1e3).toFixed(2)} mA`, color: "#3b82f6" },
        { label: "d\u03A6_E/dt", value: `${dPhiEdt.toExponential(1)}`, color: "#a78bfa" },
        { label: "Charged", value: `${(charge * 100).toFixed(0)}%`, color: "#f59e0b" },
      ]);
    } else if (mode === "emwave") {
      const waveAmplitude = H * 0.25;
      const EMax = waveAmplitude;
      const BMax = EMax / 3e8;

      drawInfoPanel(ctx, panelX, panelY, W * 0.38, 100, "EM WAVE DATA", [
        { label: "E_0", value: `${EMax.toFixed(0)} V/m`, color: "#ef4444" },
        { label: "B_0 = E/c", value: `${BMax.toExponential(2)} T`, color: "#3b82f6" },
        { label: "c", value: "3.00e8 m/s", color: "#f59e0b" },
        { label: "Coupled", value: "E \u2194 B", color: "#a78bfa" },
      ]);
    } else if (mode === "faraday") {
      const bMag = Math.sin(t * chargeRate * 2);
      const dBdt = Math.cos(t * chargeRate * 2) * chargeRate * 2;
      const emf = Math.abs(dBdt) * 10;
      const fluxB = bMag * Math.PI * 0.05 * 0.05;

      drawInfoPanel(ctx, panelX, panelY, W * 0.38, 100, "FARADAY DATA", [
        { label: "B(t)", value: `${bMag.toFixed(3)} T`, color: "#3b82f6" },
        { label: "\u03A6_B", value: `${(fluxB * 1e3).toFixed(3)} mWb`, color: "#60a5fa" },
        { label: "dB/dt", value: `${dBdt.toFixed(2)} T/s`, color: "#f59e0b" },
        { label: "EMF", value: `${emf.toFixed(1)} V`, color: "#22c55e" },
      ]);
    }
  }

  // --- Animation Loop ---
  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;

    // Update particles
    particlesRef.current.update(dt);

    // Update charging state
    if (mode === "charging") {
      if (chargingRef.current) {
        chargeRef.current = Math.min(1, chargeRef.current + dt * 0.3 * chargeRate);
        if (chargeRef.current >= 1) {
          chargingRef.current = false;
        }
      }
    }

    // Update current dots
    const dots = currentDotsRef.current;
    const chargingFactor = mode === "charging" ? (1 - chargeRef.current) * chargeRate : 0;
    for (const dot of dots) {
      dot.progress += dt * dot.speed * chargingFactor;
      if (dot.progress > 1) dot.progress -= 1;
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, mode, chargeRate]);

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

  // Reset charge when mode changes
  useEffect(() => {
    chargeRef.current = 0;
    chargingRef.current = true;
    timeRef.current = 0;
  }, [mode]);

  const resetSim = () => {
    chargeRef.current = 0;
    chargingRef.current = true;
    timeRef.current = 0;
    particlesRef.current.clear();
    popupsRef.current = [];
  };

  // Challenge mode
  const generateQuestion = useCallback(() => {
    const equationNames = [
      "Gauss's Law (E)",
      "Gauss's Law (B)",
      "Faraday's Law",
      "Ampere-Maxwell Law",
    ];
    const scenarios = [
      {
        q: "Which equation explains that electric field lines start and end on charges?",
        correct: "Gauss's Law (E)",
      },
      {
        q: "Which equation states there are no magnetic monopoles?",
        correct: "Gauss's Law (B)",
      },
      {
        q: "Which equation describes how a changing magnetic field creates an electric field?",
        correct: "Faraday's Law",
      },
      {
        q: "Which equation includes the displacement current term?",
        correct: "Ampere-Maxwell Law",
      },
      {
        q: "Which equation was modified by Maxwell to include displacement current?",
        correct: "Ampere-Maxwell Law",
      },
      {
        q: "Which equation predicts that a changing E-field creates a B-field?",
        correct: "Ampere-Maxwell Law",
      },
      {
        q: "Which equation is the basis for electromagnetic induction?",
        correct: "Faraday's Law",
      },
      {
        q: "Which equation shows that the net magnetic flux through any closed surface is zero?",
        correct: "Gauss's Law (B)",
      },
    ];

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    const shuffled = [...equationNames].sort(() => Math.random() - 0.5);

    challengeQuestionRef.current = {
      equation: equationNames.indexOf(scenario.correct),
      label: scenario.q,
      options: shuffled,
      correct: scenario.correct,
    };
    setChallengeQuestion(scenario.q);
    setChallengeFeedback(null);
  }, []);

  const answerChallenge = (answer: string) => {
    if (!challengeQuestionRef.current) return;
    const correct = answer === challengeQuestionRef.current.correct;

    const result = {
      points: correct ? 3 : 0,
      tier: correct ? ("perfect" as const) : ("miss" as const),
      label: correct ? "Correct!" : `Wrong! ${challengeQuestionRef.current.correct}`,
    };

    const newState = updateChallengeState(challengeStateRef.current, result);
    challengeStateRef.current = newState;
    setChallengeScore(newState.score);
    setChallengeAttempts(newState.attempts);

    if (correct) {
      playSFX("correct");
      playScore(3);
      const canvas = canvasRef.current;
      if (canvas) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, 15);
      }
    } else {
      playSFX("incorrect");
    }

    popupsRef.current.push({
      text: result.label,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 3 : 150,
      startTime: performance.now(),
    });

    setChallengeFeedback(result.label);

    setTimeout(() => {
      generateQuestion();
    }, 1500);
  };

  const startChallenge = () => {
    setChallengeActive(true);
    challengeStateRef.current = createChallengeState();
    challengeStateRef.current.active = true;
    challengeStateRef.current.description = "Identify Maxwell's Equations";
    setChallengeScore(0);
    setChallengeAttempts(0);
    generateQuestion();
    playSFX("powerup");
  };

  const stopChallenge = () => {
    setChallengeActive(false);
    challengeQuestionRef.current = null;
    setChallengeFeedback(null);
    setChallengeQuestion("");
    challengeStateRef.current = createChallengeState();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Mode Selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2">
          Simulation Mode
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMode("charging"); resetSim(); }}
            className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
              mode === "charging"
                ? "bg-green-600 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Charging Capacitor
          </button>
          <button
            onClick={() => { setMode("emwave"); resetSim(); }}
            className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
              mode === "emwave"
                ? "bg-purple-600 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            EM Wave
          </button>
          <button
            onClick={() => { setMode("faraday"); resetSim(); }}
            className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
              mode === "faraday"
                ? "bg-amber-600 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Faraday&apos;s Law
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {mode === "charging" ? "Charge Rate" : mode === "emwave" ? "Wave Speed" : "dB/dt Rate"}
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={chargeRate}
              onChange={(e) => setChargeRate(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {chargeRate.toFixed(1)}x
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => setShowEField(!showEField)}
            className={`w-full h-8 rounded text-xs font-medium transition-colors ${
              showEField
                ? "bg-red-500 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            E-field {showEField ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => setShowBField(!showBField)}
            className={`w-full h-8 rounded text-xs font-medium transition-colors ${
              showBField
                ? "bg-blue-500 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            B-field {showBField ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => setShowCurrent(!showCurrent)}
            className={`w-full h-8 rounded text-xs font-medium transition-colors ${
              showCurrent
                ? "bg-green-500 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            Current {showCurrent ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => {
              if (!isRunning) lastTsRef.current = null;
              setIsRunning(!isRunning);
            }}
            className="w-full h-8 rounded-lg bg-purple-600 text-white text-xs font-medium"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={resetSim}
            className="w-full h-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Challenge Mode */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Challenge: Identify the Equation
          </h3>
          {!challengeActive ? (
            <button
              onClick={startChallenge}
              className="h-8 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
            >
              Start Challenge
            </button>
          ) : (
            <button
              onClick={stopChallenge}
              className="h-8 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              End ({challengeScore} pts / {challengeAttempts})
            </button>
          )}
        </div>

        {challengeActive && challengeQuestionRef.current && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 text-center">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {challengeQuestion}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {challengeQuestionRef.current.options.map((option) => (
                <button
                  key={option}
                  onClick={() => answerChallenge(option)}
                  disabled={!!challengeFeedback}
                  className="h-10 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] disabled:opacity-50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {option}
                </button>
              ))}
            </div>
            {challengeFeedback && (
              <p
                className={`text-sm font-medium text-center ${
                  challengeFeedback === "Correct!"
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {challengeFeedback}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Key Equations: All 4 Maxwell's Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Maxwell&apos;s Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className={`rounded-lg px-3 py-2 transition-colors ${
            getActiveEquation() === 0 || getActiveEquation() === -1
              ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              : "bg-gray-50 dark:bg-gray-800"
          }`}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
              Gauss&apos;s Law (E)
            </div>
            <SimMath math="\oint \vec{E} \cdot d\vec{A} = \frac{Q_{\text{enc}}}{\varepsilon_0}" />
          </div>
          <div className={`rounded-lg px-3 py-2 transition-colors ${
            getActiveEquation() === 1 || getActiveEquation() === -1
              ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
              : "bg-gray-50 dark:bg-gray-800"
          }`}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
              Gauss&apos;s Law (B)
            </div>
            <SimMath math="\oint \vec{B} \cdot d\vec{A} = 0" />
          </div>
          <div className={`rounded-lg px-3 py-2 transition-colors ${
            getActiveEquation() === 2 || getActiveEquation() === -1
              ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
              : "bg-gray-50 dark:bg-gray-800"
          }`}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
              Faraday&apos;s Law
            </div>
            <SimMath math="\oint \vec{E} \cdot d\vec{l} = -\frac{d\Phi_B}{dt}" />
          </div>
          <div className={`rounded-lg px-3 py-2 transition-colors ${
            getActiveEquation() === 3 || getActiveEquation() === -1
              ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
              : "bg-gray-50 dark:bg-gray-800"
          }`}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
              Ampere-Maxwell Law
            </div>
            <SimMath math="\oint \vec{B} \cdot d\vec{l} = \mu_0 I + \mu_0 \varepsilon_0 \frac{d\Phi_E}{dt}" />
          </div>
        </div>
      </div>

      {/* Mode description */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {mode === "charging" && "Mode: Charging Capacitor (Ampere-Maxwell Law)"}
          {mode === "emwave" && "Mode: EM Wave Propagation (Coupled E & B)"}
          {mode === "faraday" && "Mode: Faraday's Law Review (Changing B creates E)"}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {mode === "charging" &&
            "A parallel-plate capacitor charges through a circuit. Conduction current flows through the wires, while displacement current (from the changing E-field) flows between the plates. Maxwell added the displacement current term to Ampere's law, completing the symmetry of electromagnetism."}
          {mode === "emwave" &&
            "A changing E-field creates a B-field (Ampere-Maxwell), and a changing B-field creates an E-field (Faraday). This self-sustaining cycle propagates as an electromagnetic wave at the speed of light c = 1/sqrt(mu0*eps0)."}
          {mode === "faraday" &&
            "A time-varying magnetic field induces a circulating electric field. The induced EMF is proportional to the rate of change of magnetic flux. This is the basis of electromagnetic induction and is described by Faraday's law."}
        </p>
      </div>
    </div>
  );
}
