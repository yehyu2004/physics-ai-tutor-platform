"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { SimMath } from "@/components/simulations/SimMath";

interface Cart {
  x: number;
  vx: number;
  mass: number;
  color: string;
  glow: string;
  label: string;
}

interface Challenge {
  description: string;
  check: (v1f: number, v2f: number) => number; // returns score 0-3
}

interface CollisionResult {
  p1i: number;
  p2i: number;
  p1f: number;
  p2f: number;
  ke1i: number;
  ke2i: number;
  ke1f: number;
  ke2f: number;
  v1f: number;
  v2f: number;
}

// Heat particle for energy loss visualization
interface HeatParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

function generateChallenge(m1: number, m2: number): Challenge {
  const challenges: Challenge[] = [
    {
      description: `Make Cart B stop completely after collision`,
      check: (_v1f: number, v2f: number) => {
        const abs = Math.abs(v2f);
        if (abs < 0.01) return 3;
        if (abs < 0.3) return 2;
        if (abs < 0.8) return 1;
        return 0;
      },
    },
    {
      description: `Make Cart A stop completely after collision`,
      check: (v1f: number) => {
        const abs = Math.abs(v1f);
        if (abs < 0.01) return 3;
        if (abs < 0.3) return 2;
        if (abs < 0.8) return 1;
        return 0;
      },
    },
    {
      description: `Make both carts move at the same speed after collision`,
      check: (v1f: number, v2f: number) => {
        const diff = Math.abs(Math.abs(v1f) - Math.abs(v2f));
        const avg = (Math.abs(v1f) + Math.abs(v2f)) / 2;
        if (avg < 0.01) return 0;
        const ratio = diff / avg;
        if (ratio < 0.02) return 3;
        if (ratio < 0.1) return 2;
        if (ratio < 0.25) return 1;
        return 0;
      },
    },
    {
      description: `Make total KE loss greater than 50%`,
      check: (v1f: number, v2f: number) => {
        // We need initial KE too - use a trick: check if final KE is small
        const kef = 0.5 * m1 * v1f * v1f + 0.5 * m2 * v2f * v2f;
        // This will be checked against initial in the scoring
        if (kef < 0.01) return 3;
        return -1; // special: needs context
      },
    },
    {
      description: `Make Cart B move faster than 5 m/s after collision`,
      check: (_v1f: number, v2f: number) => {
        const abs = Math.abs(v2f);
        if (abs >= 5.0) return 3;
        if (abs >= 4.5) return 2;
        if (abs >= 3.75) return 1;
        return 0;
      },
    },
    {
      description: `Make both carts move to the right after collision`,
      check: (v1f: number, v2f: number) => {
        if (v1f > 0.01 && v2f > 0.01) return 3;
        if (v1f > -0.1 && v2f > -0.1) return 2;
        if (v1f > -0.5 && v2f > -0.5) return 1;
        return 0;
      },
    },
  ];
  return challenges[Math.floor(Math.random() * challenges.length)];
}

export default function CollisionLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [mass1, setMass1] = useState(4);
  const [mass2, setMass2] = useState(4);
  const [v1, setV1] = useState(5);
  const [v2, setV2] = useState(-3);
  const [restitution, setRestitution] = useState(1.0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasCollided, setHasCollided] = useState(false);
  const [collisionResult, setCollisionResult] = useState<CollisionResult | null>(null);

  // Challenge mode
  const [challengeMode, setChallengeMode] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeScore, setChallengeScore] = useState<number | null>(null);
  const [totalScore, setTotalScore] = useState(0);

  // Prediction mode
  const [predictionMode, setPredictionMode] = useState(false);
  const [predV1, setPredV1] = useState("");
  const [predV2, setPredV2] = useState("");
  const [showPredictionResult, setShowPredictionResult] = useState(false);

  const cartsRef = useRef<Cart[]>([]);
  const initialKERef = useRef({ ke1: 0, ke2: 0 });
  const initialPRef = useRef({ p1: 0, p2: 0 });
  const particleSystemRef = useRef(new ParticleSystem());
  const heatParticlesRef = useRef<HeatParticle[]>([]);
  const collisionPointRef = useRef<{ x: number; y: number } | null>(null);
  const glowPulseRef = useRef(0);

  const initCarts = useCallback(() => {
    cartsRef.current = [
      {
        x: 0.25,
        vx: v1 * 0.015,
        mass: mass1,
        color: "#ef4444",
        glow: "rgba(239,68,68,0.3)",
        label: "A",
      },
      {
        x: 0.75,
        vx: v2 * 0.015,
        mass: mass2,
        color: "#3b82f6",
        glow: "rgba(59,130,246,0.3)",
        label: "B",
      },
    ];
    initialKERef.current = {
      ke1: 0.5 * mass1 * v1 * v1,
      ke2: 0.5 * mass2 * v2 * v2,
    };
    initialPRef.current = {
      p1: mass1 * v1,
      p2: mass2 * v2,
    };
    setHasCollided(false);
    setCollisionResult(null);
    setChallengeScore(null);
    setShowPredictionResult(false);
    particleSystemRef.current.clear();
    heatParticlesRef.current = [];
    collisionPointRef.current = null;
  }, [mass1, mass2, v1, v2]);

  useEffect(() => {
    initCarts();
  }, [initCarts]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const carts = cartsRef.current;
    if (carts.length < 2) return;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const trackY = H * 0.38;
    const margin = 60;
    const trackWidth = W - margin * 2;

    // Track surface
    const trackGrad = ctx.createLinearGradient(0, trackY + 15, 0, trackY + 35);
    trackGrad.addColorStop(0, "#334155");
    trackGrad.addColorStop(0.5, "#475569");
    trackGrad.addColorStop(1, "#334155");
    ctx.fillStyle = trackGrad;
    ctx.beginPath();
    ctx.roundRect(margin - 10, trackY + 15, trackWidth + 20, 20, 4);
    ctx.fill();

    // Track tick marks
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "rgba(148,163,184,0.4)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const numTicks = 20;
    for (let i = 0; i <= numTicks; i++) {
      const tx = margin + (i / numTicks) * trackWidth;
      const tickH = i % 5 === 0 ? 8 : 4;
      ctx.beginPath();
      ctx.moveTo(tx, trackY + 35);
      ctx.lineTo(tx, trackY + 35 + tickH);
      ctx.stroke();
      if (i % 5 === 0) {
        ctx.fillText(`${i}`, tx, trackY + 45);
      }
    }

    // Glow pulse
    glowPulseRef.current += 0.03;
    const glowPulse = 0.8 + 0.2 * Math.sin(glowPulseRef.current);

    // Draw carts
    carts.forEach((cart, idx) => {
      const cx = margin + cart.x * trackWidth;
      const cartW = 30 + cart.mass * 3;
      const cartH = 28 + cart.mass * 1.5;
      const cartTop = trackY + 15 - cartH;

      // Cart glow (enhanced pulsing)
      const glow = ctx.createRadialGradient(cx, cartTop + cartH / 2, 0, cx, cartTop + cartH / 2, cartW * 1.8);
      const glowAlpha = (isRunning ? 0.4 : 0.25) * glowPulse;
      glow.addColorStop(0, idx === 0 ? `rgba(239,68,68,${glowAlpha})` : `rgba(59,130,246,${glowAlpha})`);
      glow.addColorStop(1, idx === 0 ? "rgba(239,68,68,0)" : "rgba(59,130,246,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cartTop + cartH / 2, cartW * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Speed lines (when moving fast)
      const realVel = cart.vx / 0.015;
      if (isRunning && Math.abs(realVel) > 2) {
        const dir = realVel > 0 ? -1 : 1;
        const numLines = Math.min(5, Math.floor(Math.abs(realVel) / 2));
        for (let li = 0; li < numLines; li++) {
          const lineX = cx + dir * (cartW / 2 + 5 + li * 8);
          const lineY = cartTop + cartH * 0.3 + (li % 3) * 6;
          const lineLen = 8 + Math.abs(realVel) * 1.5;
          ctx.strokeStyle = `rgba(255,255,255,${0.08 + 0.04 * (numLines - li)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineX, lineY);
          ctx.lineTo(lineX + dir * lineLen, lineY);
          ctx.stroke();
        }
      }

      // Cart body
      const cartGrad = ctx.createLinearGradient(cx - cartW / 2, cartTop, cx - cartW / 2, cartTop + cartH);
      cartGrad.addColorStop(0, idx === 0 ? "#fca5a5" : "#93c5fd");
      cartGrad.addColorStop(1, cart.color);
      ctx.fillStyle = cartGrad;
      ctx.beginPath();
      ctx.roundRect(cx - cartW / 2, cartTop, cartW, cartH, 5);
      ctx.fill();

      ctx.strokeStyle = idx === 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Wheels
      const wheelR = 5;
      const wheelY = trackY + 15 + 2;
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.5;
      [-cartW / 3, cartW / 3].forEach((offset) => {
        ctx.beginPath();
        ctx.arc(cx + offset, wheelY, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Mass label on cart
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${cart.mass}kg`, cx, cartTop + cartH / 2);

      // Cart label below
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = cart.color;
      ctx.textBaseline = "top";
      ctx.fillText(`Cart ${cart.label}`, cx, trackY + 55);

      // Velocity arrow above cart
      const arrScale = 6;
      const arrLen = realVel * arrScale;
      const arrY = cartTop - 18;

      if (Math.abs(arrLen) > 2) {
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(34,197,94,0.4)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(cx, arrY);
        ctx.lineTo(cx + arrLen, arrY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Arrowhead
        const dir = arrLen > 0 ? 1 : -1;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(cx + arrLen, arrY);
        ctx.lineTo(cx + arrLen - dir * 8, arrY - 5);
        ctx.lineTo(cx + arrLen - dir * 8, arrY + 5);
        ctx.closePath();
        ctx.fill();

        // Velocity label
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${realVel.toFixed(1)} m/s`, cx + arrLen / 2, arrY - 6);
      }

      // Momentum arrows (below track)
      const momentum = cart.mass * realVel;
      const pArrScale = 2;
      const pArrLen = momentum * pArrScale;
      const pArrY = trackY + 75;

      if (Math.abs(pArrLen) > 2) {
        const pColor = idx === 0 ? "#f87171" : "#60a5fa";
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.moveTo(cx, pArrY);
        ctx.lineTo(cx + pArrLen, pArrY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Arrowhead
        const dir = pArrLen > 0 ? 1 : -1;
        ctx.fillStyle = pColor;
        ctx.beginPath();
        ctx.moveTo(cx + pArrLen, pArrY);
        ctx.lineTo(cx + pArrLen - dir * 6, pArrY - 4);
        ctx.lineTo(cx + pArrLen - dir * 6, pArrY + 4);
        ctx.closePath();
        ctx.fill();

        // Momentum label
        ctx.font = "9px ui-monospace";
        ctx.fillStyle = pColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`p=${momentum.toFixed(1)}`, cx + pArrLen / 2, pArrY + 5);
      }
    });

    // Draw heat particles (energy dissipation visualization)
    for (const hp of heatParticlesRef.current) {
      const alpha = hp.life / hp.maxLife;
      ctx.fillStyle = `rgba(255,${100 + Math.floor(100 * alpha)},50,${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, hp.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw particle system (sparks)
    particleSystemRef.current.draw(ctx);

    // Collision flash
    if (hasCollided) {
      ctx.fillStyle = "rgba(34,197,94,0.15)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 55, 10, 110, 28, 6);
      ctx.fill();
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("COLLIDED!", W / 2, 24);
    }

    // Info panel
    const infoY = H * 0.55;
    const infoH = H - infoY - 10;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(margin - 10, infoY, trackWidth + 20, infoH, 8);
    ctx.fill();

    const c1 = carts[0];
    const c2 = carts[1];
    const curV1 = c1.vx / 0.015;
    const curV2 = c2.vx / 0.015;
    const curP1 = c1.mass * curV1;
    const curP2 = c2.mass * curV2;
    const curTotalP = curP1 + curP2;
    const curKE1 = 0.5 * c1.mass * curV1 * curV1;
    const curKE2 = 0.5 * c2.mass * curV2 * curV2;
    const curTotalKE = curKE1 + curKE2;

    // Momentum section
    const mSecX = margin + 5;
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("MOMENTUM (kg m/s)", mSecX, infoY + 10);

    const barStartX = mSecX;
    const barAreaW = trackWidth * 0.35;
    const barMidX = barStartX + barAreaW / 2;
    const mBarY = infoY + 28;
    const maxP = Math.max(
      Math.abs(curP1),
      Math.abs(curP2),
      Math.abs(curTotalP),
      Math.abs(initialPRef.current.p1),
      Math.abs(initialPRef.current.p2),
      10
    );

    // Draw momentum bars - before/after if collided
    const drawMBar = (y: number, val: number, color: string, label: string) => {
      const bw = (val / maxP) * (barAreaW / 2);
      ctx.fillStyle = color;
      if (Math.abs(bw) > 0.5) {
        ctx.beginPath();
        ctx.roundRect(barMidX, y, bw, 9, 2);
        ctx.fill();
      }
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(`${label} = ${val.toFixed(1)}`, barStartX, y + 1);
    };

    drawMBar(mBarY, curP1, "#ef4444", "p_A");
    drawMBar(mBarY + 14, curP2, "#3b82f6", "p_B");
    drawMBar(mBarY + 28, curTotalP, "#a855f7", "p_tot");

    // Center line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barMidX, mBarY - 2);
    ctx.lineTo(barMidX, mBarY + 40);
    ctx.stroke();

    // Before/After comparison if collided
    if (collisionResult) {
      const compX = mSecX;
      const compY = mBarY + 48;
      ctx.font = "bold 9px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("BEFORE", compX, compY);
      ctx.fillText("AFTER", compX + barAreaW * 0.55, compY);

      ctx.font = "9px ui-monospace";
      const bfY = compY + 13;
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText(
        `p = ${(collisionResult.p1i + collisionResult.p2i).toFixed(1)}`,
        compX,
        bfY
      );
      ctx.fillText(
        `p = ${(collisionResult.p1f + collisionResult.p2f).toFixed(1)}`,
        compX + barAreaW * 0.55,
        bfY
      );

      // Conservation check
      const pBefore = collisionResult.p1i + collisionResult.p2i;
      const pAfter = collisionResult.p1f + collisionResult.p2f;
      const pConserved = Math.abs(pBefore - pAfter) < 0.01;
      ctx.fillStyle = pConserved ? "#22c55e" : "#ef4444";
      ctx.fillText(
        pConserved ? "Conserved" : "Error!",
        compX + barAreaW * 0.55 + 80,
        bfY
      );
    }

    // Energy section
    const eSecX = margin + 5 + trackWidth * 0.45;
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("KINETIC ENERGY (J)", eSecX, infoY + 10);

    const eBarX = eSecX;
    const eBarW = trackWidth * 0.35;
    const eBarY = infoY + 28;
    const initialTotalKE = initialKERef.current.ke1 + initialKERef.current.ke2;
    const maxKE = Math.max(curTotalKE, initialTotalKE, 10);

    const drawEBar = (y: number, val: number, color: string, label: string) => {
      const bw = (val / maxKE) * eBarW;
      if (bw > 0.5) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(eBarX, y, bw, 9, 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${label} = ${val.toFixed(1)}`, eBarX + eBarW + 8, y + 1);
    };

    drawEBar(eBarY, curKE1, "#ef4444", "KE_A");
    drawEBar(eBarY + 14, curKE2, "#3b82f6", "KE_B");
    drawEBar(eBarY + 28, curTotalKE, "#f59e0b", "KE_tot");

    // Before/After KE comparison
    if (collisionResult) {
      const compX = eSecX;
      const compY = eBarY + 48;
      ctx.font = "bold 9px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("BEFORE", compX, compY);
      ctx.fillText("AFTER", compX + eBarW * 0.55, compY);

      ctx.font = "9px ui-monospace";
      const bfY = compY + 13;
      const keBefore = collisionResult.ke1i + collisionResult.ke2i;
      const keAfter = collisionResult.ke1f + collisionResult.ke2f;
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText(`KE = ${keBefore.toFixed(1)}`, compX, bfY);
      ctx.fillText(`KE = ${keAfter.toFixed(1)}`, compX + eBarW * 0.55, bfY);

      const keLoss = keBefore > 0 ? ((keBefore - keAfter) / keBefore) * 100 : 0;
      ctx.fillStyle = keLoss < 0.1 ? "#22c55e" : "#f59e0b";
      ctx.fillText(
        keLoss < 0.1 ? "Conserved" : `Loss: ${keLoss.toFixed(1)}%`,
        compX + eBarW * 0.55 + 80,
        bfY
      );

      // Energy loss indicator (heat dissipated)
      if (keLoss > 0.1) {
        const lostE = keBefore - keAfter;
        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "#f97316";
        ctx.fillText(`Heat: ${lostE.toFixed(1)} J`, compX + eBarW * 0.55 + 80, bfY + 14);
      }
    }

    // Momentum bar chart (before/after visual) at the bottom right
    if (collisionResult) {
      const chartX = eSecX;
      const chartY = eBarY + 80;
      const chartW = eBarW + 60;
      const chartH = infoH - (chartY - infoY) - 15;

      if (chartH > 25) {
        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "left";
        ctx.fillText("MOMENTUM BAR CHART", chartX, chartY);

        const pBefore = collisionResult.p1i + collisionResult.p2i;
        const pAfter = collisionResult.p1f + collisionResult.p2f;
        const maxBar = Math.max(Math.abs(pBefore), Math.abs(pAfter), 1);
        const barH2 = Math.min(chartH - 18, 16);
        const barY1 = chartY + 14;
        const barY2 = barY1 + barH2 + 4;
        const barMaxW2 = chartW * 0.5;
        const barCenterX = chartX + chartW * 0.35;

        // Before bar
        ctx.fillStyle = "#a855f7";
        const bw1 = (pBefore / maxBar) * barMaxW2;
        if (Math.abs(bw1) > 0.5) {
          ctx.beginPath();
          ctx.roundRect(barCenterX, barY1, bw1, barH2, 3);
          ctx.fill();
        }
        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "#d8b4fe";
        ctx.textAlign = "right";
        ctx.fillText(`Before: ${pBefore.toFixed(1)}`, barCenterX - 5, barY1 + barH2 / 2 + 3);

        // After bar
        ctx.fillStyle = "#22c55e";
        const bw2 = (pAfter / maxBar) * barMaxW2;
        if (Math.abs(bw2) > 0.5) {
          ctx.beginPath();
          ctx.roundRect(barCenterX, barY2, bw2, barH2, 3);
          ctx.fill();
        }
        ctx.fillStyle = "#86efac";
        ctx.textAlign = "right";
        ctx.fillText(`After: ${pAfter.toFixed(1)}`, barCenterX - 5, barY2 + barH2 / 2 + 3);

        // Center line
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barCenterX, barY1 - 2);
        ctx.lineTo(barCenterX, barY2 + barH2 + 2);
        ctx.stroke();
      }
    }
  }, [hasCollided, collisionResult, isRunning]);

  const animate = useCallback(() => {
    const carts = cartsRef.current;
    if (carts.length < 2) return;
    const c1 = carts[0];
    const c2 = carts[1];

    c1.x += c1.vx;
    c2.x += c2.vx;

    // Update heat particles
    heatParticlesRef.current = heatParticlesRef.current.filter((hp) => {
      hp.x += hp.vx * 0.016;
      hp.y += hp.vy * 0.016;
      hp.vy -= 30 * 0.016; // float upward
      hp.life -= 0.016;
      return hp.life > 0;
    });

    // Update spark particles
    particleSystemRef.current.update(0.016);

    // Collision detection
    const W = canvasRef.current?.width || 800;
    const trackWidth = W - 120;
    const r1 = ((30 + c1.mass * 3) / 2) / trackWidth;
    const r2 = ((30 + c2.mass * 3) / 2) / trackWidth;
    const dist = Math.abs(c2.x - c1.x);

    if (dist < (r1 + r2) && c1.vx - c2.vx > 0 && !hasCollided) {
      const m1 = c1.mass;
      const m2 = c2.mass;
      const u1 = c1.vx;
      const u2 = c2.vx;
      const e = restitution;

      // General collision formula with coefficient of restitution
      const v1New = ((m1 - e * m2) * u1 + (1 + e) * m2 * u2) / (m1 + m2);
      const v2New = ((m2 - e * m1) * u2 + (1 + e) * m1 * u1) / (m1 + m2);

      // Record result
      const realU1 = u1 / 0.015;
      const realU2 = u2 / 0.015;
      const realV1 = v1New / 0.015;
      const realV2 = v2New / 0.015;

      const result: CollisionResult = {
        p1i: m1 * realU1,
        p2i: m2 * realU2,
        p1f: m1 * realV1,
        p2f: m2 * realV2,
        ke1i: 0.5 * m1 * realU1 * realU1,
        ke2i: 0.5 * m2 * realU2 * realU2,
        ke1f: 0.5 * m1 * realV1 * realV1,
        ke2f: 0.5 * m2 * realV2 * realV2,
        v1f: realV1,
        v2f: realV2,
      };

      c1.vx = v1New;
      c2.vx = v2New;

      // Separate to avoid re-collision
      const overlap = (r1 + r2) - dist;
      c1.x -= overlap / 2;
      c2.x += overlap / 2;

      setHasCollided(true);
      setCollisionResult(result);

      // Collision sound effect
      playSFX("collision");

      // Collision spark particles at collision point
      const canvasH = canvasRef.current?.height || 500;
      const collisionX = 60 + ((c1.x + c2.x) / 2) * trackWidth;
      const collisionY = canvasH * 0.38 + 15 - 20;
      collisionPointRef.current = { x: collisionX, y: collisionY };

      // Spark burst
      particleSystemRef.current.emitSparks(collisionX, collisionY, 20, "#fbbf24");
      particleSystemRef.current.emit(collisionX, collisionY, 12, "#ffffff", {
        speed: 180,
        speedVariance: 80,
        lifetime: 0.3,
        lifetimeVariance: 0.1,
        gravity: 0,
        size: 2,
        sizeVariance: 1,
        shape: "spark",
      });

      // Energy loss heat particles (if inelastic)
      const keLoss = (result.ke1i + result.ke2i) - (result.ke1f + result.ke2f);
      if (keLoss > 0.1) {
        const numHeat = Math.min(30, Math.floor(keLoss * 2));
        for (let i = 0; i < numHeat; i++) {
          heatParticlesRef.current.push({
            x: collisionX + (Math.random() - 0.5) * 30,
            y: collisionY + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 40,
            vy: -20 - Math.random() * 60,
            life: 1.0 + Math.random() * 1.5,
            maxLife: 1.0 + Math.random() * 1.5,
            size: 2 + Math.random() * 3,
          });
        }
      }

      // Challenge scoring
      if (challengeMode && challenge) {
        let score = challenge.check(realV1, realV2);
        // Handle the special KE loss challenge
        if (score === -1) {
          const keBefore = result.ke1i + result.ke2i;
          const keAfter = result.ke1f + result.ke2f;
          const lossPercent = keBefore > 0 ? ((keBefore - keAfter) / keBefore) * 100 : 0;
          if (lossPercent >= 50) score = 3;
          else if (lossPercent >= 40) score = 2;
          else if (lossPercent >= 30) score = 1;
          else score = 0;
        }
        setChallengeScore(score);
        setTotalScore((prev) => prev + score);

        // Score sound
        if (score >= 3) {
          playSFX("success");
          playScore(score);
        } else if (score > 0) {
          playSFX("correct");
          playScore(score);
        } else {
          playSFX("fail");
        }
      }

      // Show prediction comparison
      if (predictionMode && (predV1 !== "" || predV2 !== "")) {
        setShowPredictionResult(true);
      }
    }

    // Wall bounces
    if (c1.x < 0.02) { c1.x = 0.02; c1.vx = Math.abs(c1.vx); }
    if (c1.x > 0.98) { c1.x = 0.98; c1.vx = -Math.abs(c1.vx); }
    if (c2.x < 0.02) { c2.x = 0.02; c2.vx = Math.abs(c2.vx); }
    if (c2.x > 0.98) { c2.x = 0.98; c2.vx = -Math.abs(c2.vx); }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [restitution, draw, hasCollided, challengeMode, challenge, predictionMode, predV1, predV2]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.6), _isMobile ? 500 : 500);
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

  useEffect(() => {
    draw();
  }, [draw]);

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    initCarts();
    setIsRunning(false);
  };

  const runSim = () => {
    if (!isRunning) {
      initCarts();
      setIsRunning(true);
    } else {
      cancelAnimationFrame(animRef.current);
      setIsRunning(false);
    }
  };

  const newChallenge = () => {
    const ch = generateChallenge(mass1, mass2);
    setChallenge(ch);
    setChallengeScore(null);
    reset();
  };

  const collisionTypeLabel = restitution === 1 ? "Elastic" : restitution === 0 ? "Perfectly Inelastic" : "Partially Inelastic";

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Controls row 1: masses and velocities */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">
            Mass A (kg)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={mass1}
              onChange={(e) => {
                setMass1(Number(e.target.value));
                reset();
              }}
              disabled={isRunning}
              className="flex-1 accent-red-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2rem] text-right">
              {mass1}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">
            Vel A (m/s)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={v1}
              onChange={(e) => {
                setV1(Number(e.target.value));
                reset();
              }}
              disabled={isRunning}
              className="flex-1 accent-red-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {v1}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">
            Mass B (kg)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={mass2}
              onChange={(e) => {
                setMass2(Number(e.target.value));
                reset();
              }}
              disabled={isRunning}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2rem] text-right">
              {mass2}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">
            Vel B (m/s)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={v2}
              onChange={(e) => {
                setV2(Number(e.target.value));
                reset();
              }}
              disabled={isRunning}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {v2}
            </span>
          </div>
        </div>
      </div>

      {/* Controls row 2: restitution, collision type, buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-purple-500 uppercase tracking-wider">
            Restitution (e)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={restitution}
              onChange={(e) => {
                setRestitution(Number(e.target.value));
                reset();
              }}
              disabled={isRunning}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {restitution.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
            {collisionTypeLabel}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex flex-col justify-between">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mode Toggles
          </label>
          <div className="flex flex-col gap-1.5 mt-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={challengeMode}
                onChange={(e) => {
                  setChallengeMode(e.target.checked);
                  if (e.target.checked) {
                    newChallenge();
                  } else {
                    setChallenge(null);
                    setChallengeScore(null);
                  }
                }}
                disabled={isRunning}
                className="accent-amber-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Challenge</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={predictionMode}
                onChange={(e) => {
                  setPredictionMode(e.target.checked);
                  setPredV1("");
                  setPredV2("");
                  setShowPredictionResult(false);
                }}
                disabled={isRunning}
                className="accent-green-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Predict</span>
            </label>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={runSim}
            className="w-full h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Run"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => { reset(); setChallengeMode(false); }}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Prediction Mode inputs */}
      {predictionMode && !isRunning && !showPredictionResult && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
          <h3 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">
            Predict Final Velocities
          </h3>
          <p className="text-xs text-green-700 dark:text-green-300 mb-3">
            Enter your predicted final velocities before running the simulation.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-red-500">
                Cart A final v (m/s)
              </label>
              <input
                type="number"
                step={0.1}
                value={predV1}
                onChange={(e) => setPredV1(e.target.value)}
                placeholder="e.g. -2.5"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-blue-500">
                Cart B final v (m/s)
              </label>
              <input
                type="number"
                step={0.1}
                value={predV2}
                onChange={(e) => setPredV2(e.target.value)}
                placeholder="e.g. 4.0"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Prediction Results */}
      {showPredictionResult && collisionResult && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
          <h3 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-3">
            Prediction vs Actual
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-red-500 mb-1">Cart A Final Velocity</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Predicted</p>
                  <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                    {predV1 !== "" ? `${Number(predV1).toFixed(1)} m/s` : "---"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Actual</p>
                  <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                    {collisionResult.v1f.toFixed(1)} m/s
                  </p>
                </div>
              </div>
              {predV1 !== "" && (
                <p className="text-xs mt-1 font-mono text-gray-600 dark:text-gray-400">
                  Error: {Math.abs(Number(predV1) - collisionResult.v1f).toFixed(2)} m/s
                  ({collisionResult.v1f !== 0
                    ? `${((Math.abs(Number(predV1) - collisionResult.v1f) / Math.max(Math.abs(collisionResult.v1f), 0.01)) * 100).toFixed(1)}%`
                    : `${Math.abs(Number(predV1)).toFixed(2)} abs`})
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-blue-500 mb-1">Cart B Final Velocity</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Predicted</p>
                  <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                    {predV2 !== "" ? `${Number(predV2).toFixed(1)} m/s` : "---"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Actual</p>
                  <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                    {collisionResult.v2f.toFixed(1)} m/s
                  </p>
                </div>
              </div>
              {predV2 !== "" && (
                <p className="text-xs mt-1 font-mono text-gray-600 dark:text-gray-400">
                  Error: {Math.abs(Number(predV2) - collisionResult.v2f).toFixed(2)} m/s
                  ({collisionResult.v2f !== 0
                    ? `${((Math.abs(Number(predV2) - collisionResult.v2f) / Math.max(Math.abs(collisionResult.v2f), 0.01)) * 100).toFixed(1)}%`
                    : `${Math.abs(Number(predV2)).toFixed(2)} abs`})
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Challenge Mode */}
      {challengeMode && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Challenge Mode
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">
                Score: {totalScore}
              </span>
              <button
                onClick={newChallenge}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
              >
                New Challenge
              </button>
            </div>
          </div>
          {challenge && (
            <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2 mb-2">
              <p className="text-sm text-gray-800 dark:text-gray-200">
                {challenge.description}
              </p>
            </div>
          )}
          {challengeScore !== null && (
            <div
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                challengeScore === 3
                  ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                  : challengeScore >= 2
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                  : challengeScore >= 1
                  ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                  : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
              }`}
            >
              {challengeScore === 3
                ? "Perfect! +3 points"
                : challengeScore === 2
                ? "Close! Within 10%. +2 points"
                : challengeScore === 1
                ? "Not bad. Within 25%. +1 point"
                : "Not quite. Try again! +0 points"}
            </div>
          )}
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
            Scoring: Exact = 3 pts | Within 10% = 2 pts | Within 25% = 1 pt
          </p>
        </div>
      )}

      {/* After-collision data panel */}
      {collisionResult && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Collision Results
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Initial Momentum</p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                {(collisionResult.p1i + collisionResult.p2i).toFixed(2)} kg m/s
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Final Momentum</p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                {(collisionResult.p1f + collisionResult.p2f).toFixed(2)} kg m/s
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Initial KE</p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                {(collisionResult.ke1i + collisionResult.ke2i).toFixed(2)} J
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Final KE</p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                {(collisionResult.ke1f + collisionResult.ke2f).toFixed(2)} J
                {restitution < 1 && (
                  <span className="text-xs text-orange-500 ml-1">
                    (-{(((collisionResult.ke1i + collisionResult.ke2i) - (collisionResult.ke1f + collisionResult.ke2f))).toFixed(1)}J heat)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                Cart A: v = {v1} -&gt; {collisionResult.v1f.toFixed(2)} m/s
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                Cart B: v = {v2} -&gt; {collisionResult.v2f.toFixed(2)} m/s
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="p = mv" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="KE = \frac{1}{2}mv^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2'" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="e = \frac{|v_2' - v_1'|}{|v_1 - v_2|}" />
          </div>
        </div>
      </div>
    </div>
  );
}
