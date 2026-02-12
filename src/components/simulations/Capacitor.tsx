"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  calculateAccuracy,
  renderScorePopup,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawMeter } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

// Charge particle on a plate
interface ChargeParticle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  sign: 1 | -1; // +1 or -1
  alpha: number;
  scale: number;
}

export default function Capacitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [separation, setSeparation] = useState(0.02); // meters
  const [plateArea, setPlateArea] = useState(0.01); // m^2
  const [voltage, setVoltage] = useState(100); // Volts
  const [dielectric, setDielectric] = useState(1); // relative permittivity
  const [challengeMode, setChallengeMode] = useState(false);

  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(new ParticleSystem());
  const chargeParticlesRef = useRef<ChargeParticle[]>([]);

  // Drag state
  const dragRef = useRef<{
    target: "leftPlate" | "rightPlate" | "dielectric" | null;
    offsetX: number;
  }>({ target: null, offsetX: 0 });
  const dielectricInsertRef = useRef(0); // 0 = fully out, 1 = fully in
  const [dielectricInserted, setDielectricInserted] = useState(false);
  const dielectricDragYRef = useRef<number | null>(null);

  // Challenge state
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const challengeTargetRef = useRef({ targetC: 0, targetLabel: "" });
  const popupsRef = useRef<ScorePopup[]>([]);
  const [challengeScore, setChallengeScore] = useState(0);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const [challengeTargetLabel, setChallengeTargetLabel] = useState("");

  // Layout positions stored for interaction
  const layoutRef = useRef({
    leftPlateX: 0,
    rightPlateX: 0,
    plateW: 8,
    capCY: 0,
    plateH: 0,
    gapW: 0,
    capCX: 0,
  });

  const epsilon0 = 8.854e-12;

  // Effective dielectric depends on insertion fraction
  const effectiveDielectric = dielectricInserted
    ? 1 + (dielectric - 1) * dielectricInsertRef.current
    : 1;
  const capacitance = effectiveDielectric * epsilon0 * plateArea / separation;
  const charge = capacitance * voltage;
  const eField = voltage / separation;
  const energy = 0.5 * capacitance * voltage * voltage;
  const sigmaDensity = charge / plateArea;

  // Generate charge particles based on charge amount
  const updateChargeParticles = useCallback(() => {
    const count = Math.min(Math.floor(Math.abs(charge) * 1e10) + 3, 14);
    const L = layoutRef.current;
    const particles = chargeParticlesRef.current;

    // Adjust count
    while (particles.length < count * 2) {
      const sign = particles.length % 2 === 0 ? 1 : -1;
      const idx = Math.floor(particles.length / 2);
      const slotY = L.capCY - L.plateH / 2 + (L.plateH / (count + 1)) * (idx + 1);
      particles.push({
        x: sign === 1 ? L.leftPlateX - 60 : L.rightPlateX + L.plateW + 60,
        y: slotY,
        targetX: sign === 1 ? L.leftPlateX - 12 : L.rightPlateX + L.plateW + 12,
        targetY: slotY,
        sign: sign as 1 | -1,
        alpha: 0,
        scale: 0,
      });
    }
    while (particles.length > count * 2) {
      particles.pop();
    }

    // Update target positions
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const idx = Math.floor(i / 2);
      const slotY = L.capCY - L.plateH / 2 + (L.plateH / (count + 1)) * (idx + 1);
      p.targetX = p.sign === 1 ? L.leftPlateX - 12 : L.rightPlateX + L.plateW + 12;
      p.targetY = slotY;
    }
  }, [charge]);

  // Generate a new challenge target
  const generateChallenge = useCallback(() => {
    // Random target capacitance between 1 and 50 pF
    const targetC = (1 + Math.random() * 49) * 1e-12;
    const targetLabel = `${(targetC * 1e12).toFixed(1)} pF`;
    challengeTargetRef.current = {
      targetC,
      targetLabel,
    };
    setChallengeTargetLabel(targetLabel);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const time = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // --- Capacitor visualization ---
    const capCX = W * 0.35;
    const capCY = H * 0.5;
    const plateH = H * 0.55;
    const plateW = 8;
    const gapW = 40 + separation * 4000; // visual gap scales with separation

    const leftPlateX = capCX - gapW / 2;
    const rightPlateX = capCX + gapW / 2;

    // Store for interaction
    layoutRef.current = { leftPlateX, rightPlateX, plateW, capCY, plateH, gapW, capCX };

    // --- Drag handles on plates ---
    const dragging = dragRef.current.target;

    // Draw drag handle indicators (arrows on plates)
    const handleAlpha = 0.3 + 0.2 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(255,255,255,${handleAlpha})`;
    ctx.font = "16px ui-monospace, monospace";
    ctx.textAlign = "center";
    // Left plate drag handle
    ctx.fillText("\u2194", leftPlateX + plateW / 2, capCY + plateH / 2 + 16);
    // Right plate drag handle
    ctx.fillText("\u2194", rightPlateX + plateW / 2, capCY + plateH / 2 + 16);

    // Drag highlight
    if (dragging === "leftPlate") {
      ctx.strokeStyle = "rgba(239,68,68,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(leftPlateX - 4, capCY - plateH / 2 - 4, plateW + 8, plateH + 24);
      ctx.setLineDash([]);
    }
    if (dragging === "rightPlate") {
      ctx.strokeStyle = "rgba(59,130,246,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rightPlateX - 4, capCY - plateH / 2 - 4, plateW + 8, plateH + 24);
      ctx.setLineDash([]);
    }

    // Dielectric material (draggable slab between plates)
    const diInsert = dielectricInsertRef.current;
    if (dielectric > 1 && (dielectricInserted || diInsert > 0)) {
      const dielW = gapW - plateW * 2 - 4;
      const dielH = plateH * diInsert;
      const dielX = leftPlateX + plateW + 2;
      const dielY = capCY + plateH / 2 - dielH;

      // Dielectric slab with gradient
      const dielGrad = ctx.createLinearGradient(dielX, dielY, dielX + dielW, dielY);
      dielGrad.addColorStop(0, `rgba(167,139,250,${0.15 + (dielectric - 1) * 0.03})`);
      dielGrad.addColorStop(0.5, `rgba(167,139,250,${0.25 + (dielectric - 1) * 0.04})`);
      dielGrad.addColorStop(1, `rgba(167,139,250,${0.15 + (dielectric - 1) * 0.03})`);
      ctx.fillStyle = dielGrad;
      ctx.beginPath();
      ctx.roundRect(dielX, dielY, dielW, dielH, 4);
      ctx.fill();

      // Dielectric border
      ctx.strokeStyle = `rgba(167,139,250,${0.4 + diInsert * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(dielX, dielY, dielW, dielH);
      ctx.setLineDash([]);

      // Polarization arrows inside dielectric
      if (diInsert > 0.3) {
        const polRows = Math.floor(dielH / 22);
        const polCols = Math.max(1, Math.floor(dielW / 20));
        for (let r = 0; r < polRows; r++) {
          for (let c = 0; c < polCols; c++) {
            const px = dielX + (dielW / (polCols + 1)) * (c + 1);
            const py = dielY + (dielH / (polRows + 1)) * (r + 1);
            const arrowAlpha = 0.3 + 0.2 * Math.sin(time * 2 + r + c);
            ctx.strokeStyle = `rgba(167,139,250,${arrowAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px - 5, py);
            ctx.lineTo(px + 5, py);
            ctx.stroke();
            // Arrow head pointing right (towards +)
            ctx.fillStyle = `rgba(167,139,250,${arrowAlpha})`;
            ctx.beginPath();
            ctx.moveTo(px - 6, py);
            ctx.lineTo(px - 3, py - 2);
            ctx.lineTo(px - 3, py + 2);
            ctx.closePath();
            ctx.fill();
            // + on right side
            ctx.font = "7px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText("+", px + 7, py + 3);
            ctx.fillText("-", px - 8, py + 3);
          }
        }
      }

      // Dielectric label
      ctx.fillStyle = "#a78bfa";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      if (diInsert > 0.2) {
        ctx.fillText(`\u03BA=${dielectric.toFixed(1)}`, capCX, capCY + plateH / 2 + 18);
      }

      // Drag handle for dielectric (below plates)
      if (!dielectricInserted || diInsert < 1) {
        const handleY = capCY + plateH / 2 + 30;
        ctx.fillStyle = `rgba(167,139,250,${handleAlpha})`;
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("\u2195 drag dielectric", capCX, handleY);
      }
    } else if (dielectric > 1 && !dielectricInserted) {
      // Show dielectric waiting to be dragged in (below the capacitor)
      const waitY = capCY + plateH / 2 + 35;
      const dielW = gapW - plateW * 2 - 4;
      ctx.fillStyle = `rgba(167,139,250,${0.15 + 0.05 * Math.sin(time * 2)})`;
      ctx.beginPath();
      ctx.roundRect(leftPlateX + plateW + 2, waitY, dielW, 20, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(167,139,250,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(leftPlateX + plateW + 2, waitY, dielW, 20);

      ctx.fillStyle = "#a78bfa";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`\u2191 drag \u03BA=${dielectric.toFixed(1)} in`, capCX, waitY + 14);
    }

    // Left plate (positive) - red
    const leftGrad = ctx.createLinearGradient(leftPlateX, 0, leftPlateX + plateW, 0);
    leftGrad.addColorStop(0, "#dc2626");
    leftGrad.addColorStop(1, "#ef4444");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(leftPlateX, capCY - plateH / 2, plateW, plateH);
    ctx.strokeStyle = dragging === "leftPlate" ? "#fca5a5" : "rgba(252,165,165,0.6)";
    ctx.lineWidth = dragging === "leftPlate" ? 2 : 1;
    ctx.strokeRect(leftPlateX, capCY - plateH / 2, plateW, plateH);

    // Right plate (negative) - blue
    const rightGrad = ctx.createLinearGradient(rightPlateX, 0, rightPlateX + plateW, 0);
    rightGrad.addColorStop(0, "#2563eb");
    rightGrad.addColorStop(1, "#3b82f6");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(rightPlateX, capCY - plateH / 2, plateW, plateH);
    ctx.strokeStyle = dragging === "rightPlate" ? "#93c5fd" : "rgba(147,197,253,0.6)";
    ctx.lineWidth = dragging === "rightPlate" ? 2 : 1;
    ctx.strokeRect(rightPlateX, capCY - plateH / 2, plateW, plateH);

    // --- Animated charge particles on plates ---
    const cParticles = chargeParticlesRef.current;
    for (const cp of cParticles) {
      // Animate toward target
      cp.x += (cp.targetX - cp.x) * 0.08;
      cp.y += (cp.targetY - cp.y) * 0.08;
      cp.alpha = Math.min(1, cp.alpha + 0.03);
      cp.scale = Math.min(1, cp.scale + 0.04);

      const wobble = Math.sin(time * 3 + cp.targetY * 0.1) * 1.5;

      if (cp.sign === 1) {
        // Positive charges (red glow)
        const glow = ctx.createRadialGradient(
          cp.x + wobble, cp.y, 0,
          cp.x + wobble, cp.y, 8 * cp.scale
        );
        glow.addColorStop(0, `rgba(239,68,68,${cp.alpha * 0.8})`);
        glow.addColorStop(1, `rgba(239,68,68,0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cp.x + wobble, cp.y, 8 * cp.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(252,165,165,${cp.alpha})`;
        ctx.font = `bold ${Math.round(11 * cp.scale)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillText("+", cp.x + wobble, cp.y + 4);
      } else {
        // Negative charges (blue glow)
        const glow = ctx.createRadialGradient(
          cp.x + wobble, cp.y, 0,
          cp.x + wobble, cp.y, 8 * cp.scale
        );
        glow.addColorStop(0, `rgba(59,130,246,${cp.alpha * 0.8})`);
        glow.addColorStop(1, `rgba(59,130,246,0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cp.x + wobble, cp.y, 8 * cp.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(147,197,253,${cp.alpha})`;
        ctx.font = `bold ${Math.round(11 * cp.scale)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillText("\u2212", cp.x + wobble, cp.y + 4);
      }
    }

    // --- Enhanced E-field lines between plates ---
    const fieldRows = Math.min(Math.floor(plateH / 20), 14);
    const fieldStrength = Math.min(eField / 10000, 1); // normalized

    for (let i = 0; i < fieldRows; i++) {
      const ay = capCY - plateH / 2 + (plateH / (fieldRows + 1)) * (i + 1);
      const ax1 = leftPlateX + plateW + 4;
      const ax2 = rightPlateX - 4;
      const fieldLen = ax2 - ax1;

      // Draw continuous field line with animated glow
      const lineAlpha = 0.15 + fieldStrength * 0.35;
      ctx.strokeStyle = `rgba(251,191,36,${lineAlpha})`;
      ctx.lineWidth = 1 + fieldStrength;
      ctx.shadowColor = "rgba(251,191,36,0.3)";
      ctx.shadowBlur = 4 * fieldStrength;
      ctx.beginPath();
      ctx.moveTo(ax1, ay);
      ctx.lineTo(ax2, ay);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Animated charge carriers flowing along field lines
      const speed = 40 + fieldStrength * 80;
      const segLen = 18;
      const offset = (time * speed) % segLen;
      for (let ax = ax1 + offset; ax < ax2 - 8; ax += segLen) {
        const t2 = (ax - ax1) / fieldLen;
        const alpha = (0.4 + 0.4 * Math.sin(time * 3 + i * 0.5)) * (1 - 0.3 * Math.abs(t2 - 0.5));
        ctx.fillStyle = `rgba(251,191,36,${alpha})`;

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(ax + 6, ay);
        ctx.lineTo(ax + 1, ay - 3);
        ctx.lineTo(ax + 1, ay + 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    // E label
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`E = ${(eField / 1000).toFixed(1)} kV/m`, capCX, capCY - plateH / 2 - 12);

    // Wires
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftPlateX, capCY - plateH / 2);
    ctx.lineTo(leftPlateX - 40, capCY - plateH / 2);
    ctx.lineTo(leftPlateX - 40, capCY - plateH / 2 - 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightPlateX + plateW, capCY - plateH / 2);
    ctx.lineTo(rightPlateX + plateW + 40, capCY - plateH / 2);
    ctx.lineTo(rightPlateX + plateW + 40, capCY - plateH / 2 - 30);
    ctx.stroke();

    // Animated current dots on wires
    const dotSpeed = 30;
    const dotOffset = (time * dotSpeed) % 15;
    ctx.fillStyle = `rgba(251,191,36,${0.4 + 0.3 * Math.sin(time * 4)})`;
    for (let d = dotOffset; d < 40; d += 15) {
      ctx.beginPath();
      ctx.arc(leftPlateX - d, capCY - plateH / 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rightPlateX + plateW + d, capCY - plateH / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Battery symbol
    const batX = capCX;
    const batY = capCY - plateH / 2 - 40;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftPlateX - 40, batY);
    ctx.lineTo(batX - 8, batY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightPlateX + plateW + 40, batY);
    ctx.lineTo(batX + 8, batY);
    ctx.stroke();
    // Battery lines
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(batX - 8, batY - 10);
    ctx.lineTo(batX - 8, batY + 10);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(batX + 8, batY - 15);
    ctx.lineTo(batX + 8, batY + 15);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${voltage}V`, batX, batY - 18);

    // --- Right: Info panel ---
    const panelX = W * 0.6;
    const panelW2 = W * 0.37;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(panelX, 15, panelW2, challengeMode ? H - 30 : H - 30, 10);
    ctx.fill();

    let y = 40;
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CAPACITOR DATA", panelX + 15, y);
    y += 28;

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`C = ${(capacitance * 1e12).toFixed(2)} pF`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#ef4444";
    ctx.fillText(`Q = ${(charge * 1e9).toFixed(3)} nC`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`E = ${eField.toFixed(0)} V/m`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#22c55e";
    ctx.fillText(`U = ${(energy * 1e9).toFixed(3)} nJ`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`\u03C3 = ${(sigmaDensity * 1e9).toFixed(3)} nC/m\u00B2`, panelX + 15, y);
    y += 28;

    // Parameters
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`d = ${(separation * 1000).toFixed(1)} mm`, panelX + 15, y);
    y += 16;
    ctx.fillText(`A = ${(plateArea * 10000).toFixed(1)} cm\u00B2`, panelX + 15, y);
    y += 16;
    ctx.fillText(`V = ${voltage} V`, panelX + 15, y);
    y += 16;
    ctx.fillText(`\u03BA = ${effectiveDielectric.toFixed(2)}`, panelX + 15, y);
    y += 24;

    // --- Energy storage meter ---
    const barW2 = panelW2 - 40;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText("ENERGY STORED", panelX + 15, y);
    y += 14;

    const maxU = 0.5 * (10 * epsilon0 * 0.05 / 0.005) * 500 * 500;
    const energyFrac = Math.min(energy / maxU, 1);

    // Energy bar background
    ctx.fillStyle = "rgba(34,197,94,0.1)";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2, 18, 4);
    ctx.fill();

    // Energy bar fill with gradient
    if (energyFrac > 0) {
      const eGrad = ctx.createLinearGradient(panelX + 15, 0, panelX + 15 + barW2 * energyFrac, 0);
      eGrad.addColorStop(0, "#22c55e");
      eGrad.addColorStop(1, "#4ade80");
      ctx.fillStyle = eGrad;
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2 * energyFrac, 18, 4);
      ctx.fill();

      // Glow on energy bar
      ctx.shadowColor = "rgba(34,197,94,0.5)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Energy value inside bar
    ctx.fillStyle = energyFrac > 0.3 ? "#ffffff" : "#22c55e";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`U = ${(energy * 1e9).toFixed(2)} nJ`, panelX + 15 + barW2 / 2, y + 13);
    ctx.textAlign = "left";
    y += 26;

    // Capacitance bar
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText("CAPACITANCE", panelX + 15, y);
    y += 14;

    const maxC = 10 * epsilon0 * 0.05 / 0.005;
    drawMeter(ctx, panelX + 15, y, barW2, 12, capacitance, maxC, "#3b82f6",
      `${(capacitance * 1e12).toFixed(1)} pF`);
    y += 22;

    // --- Challenge mode panel ---
    if (challengeMode) {
      const cs = challengeRef.current;
      const target = challengeTargetRef.current;

      y += 4;
      ctx.fillStyle = "rgba(245,158,11,0.1)";
      ctx.beginPath();
      ctx.roundRect(panelX + 10, y, panelW2 - 20, 80, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(245,158,11,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("CHALLENGE MODE", panelX + panelW2 / 2, y + 16);

      ctx.fillStyle = "#ffffff";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`Match: ${target.targetLabel}`, panelX + panelW2 / 2, y + 32);

      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Current: ${(capacitance * 1e12).toFixed(1)} pF`, panelX + panelW2 / 2, y + 46);

      // Score display
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillText(`Score: ${cs.score}`, panelX + panelW2 / 2 - 40, y + 66);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`(${cs.attempts} tries)`, panelX + panelW2 / 2 + 40, y + 66);

      ctx.textAlign = "left";
    }

    // --- Particle system ---
    particlesRef.current.draw(ctx);

    // --- Score popups ---
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Instruction text at bottom
    if (!challengeMode) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Drag plates to change separation | Drag dielectric to insert", W * 0.35, H - 10);
    }
  }, [separation, plateArea, voltage, dielectric, dielectricInserted, effectiveDielectric, capacitance, charge, eField, energy, sigmaDensity, challengeMode]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;

    // Update particle system
    particlesRef.current.update(dt);

    // Update charge particles
    updateChargeParticles();

    // Animate dielectric insertion
    if (dielectricInserted && dielectricInsertRef.current < 1) {
      dielectricInsertRef.current = Math.min(1, dielectricInsertRef.current + dt * 2);
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, updateChargeParticles, dielectricInserted]);

  // Canvas setup and interaction
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

    // Set up drag handlers
    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const L = layoutRef.current;
        const plateHitW = 30; // expanded hit area

        // Check left plate
        if (
          x >= L.leftPlateX - plateHitW / 2 &&
          x <= L.leftPlateX + L.plateW + plateHitW / 2 &&
          y >= L.capCY - L.plateH / 2 - 10 &&
          y <= L.capCY + L.plateH / 2 + 20
        ) {
          dragRef.current = { target: "leftPlate", offsetX: x - L.leftPlateX };
          playSFX("click");
          return true;
        }

        // Check right plate
        if (
          x >= L.rightPlateX - plateHitW / 2 &&
          x <= L.rightPlateX + L.plateW + plateHitW / 2 &&
          y >= L.capCY - L.plateH / 2 - 10 &&
          y <= L.capCY + L.plateH / 2 + 20
        ) {
          dragRef.current = { target: "rightPlate", offsetX: x - L.rightPlateX };
          playSFX("click");
          return true;
        }

        // Check dielectric region (below plates or between plates)
        if (dielectric > 1) {
          const dielRegion =
            x >= L.leftPlateX + L.plateW &&
            x <= L.rightPlateX &&
            y >= L.capCY - L.plateH / 2 - 20 &&
            y <= L.capCY + L.plateH / 2 + 50;
          if (dielRegion) {
            dragRef.current = { target: "dielectric", offsetX: 0 };
            dielectricDragYRef.current = y;
            playSFX("click");
            return true;
          }
        }

        return false;
      },
      onDrag: (x, y) => {
        const L = layoutRef.current;
        const target = dragRef.current.target;

        if (target === "leftPlate" || target === "rightPlate") {
          // Calculate new separation from plate positions
          const center = L.capCX;
          let newGapW: number;

          if (target === "leftPlate") {
            const newLeftX = x - dragRef.current.offsetX;
            newGapW = (center - newLeftX) * 2;
          } else {
            const newRightX = x - dragRef.current.offsetX;
            newGapW = (newRightX - center) * 2;
          }

          // Convert visual gap to separation in meters
          const newSep = Math.max(0.005, Math.min(0.05, (newGapW - 40) / 4000));
          setSeparation(newSep);
        }

        if (target === "dielectric" && dielectricDragYRef.current !== null) {
          // Drag dielectric in/out based on vertical drag
          const dragDelta = dielectricDragYRef.current - y;
          const insertFrac = Math.max(0, Math.min(1, dragDelta / (L.plateH * 0.8)));
          dielectricInsertRef.current = insertFrac;
          if (insertFrac > 0.8 && !dielectricInserted) {
            setDielectricInserted(true);
            dielectricInsertRef.current = 1;
            playSFX("powerup");
            particlesRef.current.emitGlow(L.capCX, L.capCY, 10, "#a78bfa");
          }
        }
      },
      onDragEnd: () => {
        if (dragRef.current.target === "dielectric") {
          if (dielectricInsertRef.current < 0.5) {
            dielectricInsertRef.current = 0;
            setDielectricInserted(false);
          } else {
            dielectricInsertRef.current = 1;
            setDielectricInserted(true);
          }
        }
        dragRef.current = { target: null, offsetX: 0 };
        dielectricDragYRef.current = null;
      },
    });

    return () => {
      window.removeEventListener("resize", resize);
      cleanup();
    };
  }, [draw, updateChargeParticles, dielectricInserted, dielectric]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // Initialize challenge when mode toggled
  useEffect(() => {
    if (challengeMode) {
      challengeRef.current = createChallengeState();
      setChallengeScore(0);
      setChallengeAttempts(0);
      generateChallenge();
    }
  }, [challengeMode, generateChallenge]);

  // Reset dielectric when kappa changes
  useEffect(() => {
    if (dielectric <= 1) {
      setDielectricInserted(false);
      dielectricInsertRef.current = 0;
    }
  }, [dielectric]);

  const handleChallengeCheck = () => {
    // Check if current capacitance matches target
    const target = challengeTargetRef.current.targetC;
    const result = calculateAccuracy(capacitance, target, target * 2);
    const newState = updateChallengeState(challengeRef.current, result);
    challengeRef.current = newState;
    setChallengeScore(newState.score);
    setChallengeAttempts(newState.attempts);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.clientWidth * 0.35,
        y: canvas.clientHeight * 0.3,
        startTime: performance.now(),
      });
    }

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (canvas) {
        particlesRef.current.emitConfetti(canvas.clientWidth * 0.35, canvas.clientHeight * 0.3, 25);
      }
    } else {
      playSFX("incorrect");
    }

    setTimeout(generateChallenge, 1200);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-grab active:cursor-grabbing" />
      </div>

      {/* Challenge mode controls */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Challenge Mode</h3>
          <button
            onClick={() => setChallengeMode(!challengeMode)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              challengeMode
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {challengeMode ? "ON" : "OFF"}
          </button>
        </div>
        {challengeMode && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Adjust sliders and drag plates to match target capacitance:{" "}
              <span className="font-bold text-amber-500">
                {challengeTargetLabel}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleChallengeCheck}
                className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
              >
                Check My Answer
              </button>
              <button
                onClick={generateChallenge}
                className="h-9 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Skip
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-green-500 font-bold">Score: {challengeScore}</span>
              <span className="text-gray-400">Attempts: {challengeAttempts}</span>
              {challengeRef.current.streak > 0 && (
                <span className="text-amber-500 font-bold">
                  Streak: {challengeRef.current.streak}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Separation (mm)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={5}
              max={50}
              value={separation * 1000}
              onChange={(e) => setSeparation(Number(e.target.value) / 1000)}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {(separation * 1000).toFixed(0)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Area (cm^2)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={10}
              max={500}
              value={plateArea * 10000}
              onChange={(e) => setPlateArea(Number(e.target.value) / 10000)}
              className="flex-1 accent-green-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {(plateArea * 10000).toFixed(0)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Voltage (V)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={voltage}
              onChange={(e) => setVoltage(Number(e.target.value))}
              className="flex-1 accent-yellow-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {voltage}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Dielectric (κ)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={1}
              max={10}
              step={0.1}
              value={dielectric}
              onChange={(e) => setDielectric(Number(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {dielectric.toFixed(1)}
            </span>
          </div>
          {dielectric > 1 && (
            <div className="mt-1 flex items-center gap-1">
              <span
                className={`text-[10px] ${
                  dielectricInserted
                    ? "text-purple-400 font-bold"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {dielectricInserted ? "Inserted" : "Drag to insert"}
              </span>
              {dielectricInserted && (
                <button
                  onClick={() => {
                    setDielectricInserted(false);
                    dielectricInsertRef.current = 0;
                    playSFX("pop");
                  }}
                  className="text-[10px] text-gray-400 hover:text-red-400 ml-auto"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="C = \kappa\varepsilon_0 \frac{A}{d}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="Q = CV" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E = V/d" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="U = \frac{1}{2}CV^2" /></div>
        </div>
      </div>
    </div>
  );
}
