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

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  glow: string;
}

type CollisionType = "head-on" | "oblique";

export default function Collisions() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [mass1, setMass1] = useState(3);
  const [mass2, setMass2] = useState(3);
  const [v1, setV1] = useState(4);
  const [v2, setV2] = useState(-2);
  const [elasticity, setElasticity] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [hasCollided, setHasCollided] = useState(false);
  const [collisionType, setCollisionType] = useState<CollisionType>("head-on");

  // Prediction mode
  const [challengeMode, setChallengeMode] = useState(false);
  const [predV1, setPredV1] = useState("");
  const [predV2, setPredV2] = useState("");
  const [showPredictionInput, setShowPredictionInput] = useState(false);
  const [predictionSubmitted, setPredictionSubmitted] = useState(false);

  // Scoring
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Particles
  const particlesRef = useRef(new ParticleSystem());
  const collisionFlashRef = useRef(0);

  const ballsRef = useRef<Ball[]>([]);
  const trailsRef = useRef<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);

  // Oblique angle for 2D collisions
  const [obliqueAngle, setObliqueAngle] = useState(30);

  // Pre-collision initial velocities for momentum bar animation
  const initialMomentumRef = useRef({ p: 0, ke: 0 });
  const momentumAnimRef = useRef(0);

  const computeFinalVelocities = useCallback(() => {
    const m1 = mass1;
    const m2 = mass2;
    const e = elasticity;

    if (collisionType === "head-on") {
      const u1 = v1;
      const u2 = v2;
      const v1f = ((m1 - e * m2) * u1 + (1 + e) * m2 * u2) / (m1 + m2);
      const v2f = ((m2 - e * m1) * u2 + (1 + e) * m1 * u1) / (m1 + m2);
      return { v1x: v1f, v1y: 0, v2x: v2f, v2y: 0 };
    } else {
      // Oblique collision: ball 2 stationary, ball 1 approaches at angle
      const angleRad = (obliqueAngle * Math.PI) / 180;
      const u1x = v1;
      const u1y = 0;
      const u2x = v2;
      const u2y = 0;

      // Along line of centers (rotated by obliqueAngle)
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      // Project velocities onto collision axis
      const u1n = u1x * cos + u1y * sin;
      const u1t = -u1x * sin + u1y * cos;
      const u2n = u2x * cos + u2y * sin;
      const u2t = -u2x * sin + u2y * cos;

      // 1D collision along normal
      const v1n = ((m1 - e * m2) * u1n + (1 + e) * m2 * u2n) / (m1 + m2);
      const v2n = ((m2 - e * m1) * u2n + (1 + e) * m1 * u1n) / (m1 + m2);

      // Tangential components unchanged
      const v1t = u1t;
      const v2t = u2t;

      // Convert back
      const v1xf = v1n * cos - v1t * sin;
      const v1yf = v1n * sin + v1t * cos;
      const v2xf = v2n * cos - v2t * sin;
      const v2yf = v2n * sin + v2t * cos;

      return { v1x: v1xf, v1y: v1yf, v2x: v2xf, v2y: v2yf };
    }
  }, [mass1, mass2, v1, v2, elasticity, collisionType, obliqueAngle]);

  const initBalls = useCallback(() => {
    const velScale = 0.02;
    if (collisionType === "head-on") {
      ballsRef.current = [
        { x: 0.25, y: 0.5, vx: v1 * velScale, vy: 0, mass: mass1, color: "#ef4444", glow: "rgba(239,68,68,0.3)" },
        { x: 0.75, y: 0.5, vx: v2 * velScale, vy: 0, mass: mass2, color: "#3b82f6", glow: "rgba(59,130,246,0.3)" },
      ];
    } else {
      // Oblique: offset y positions
      ballsRef.current = [
        { x: 0.2, y: 0.4, vx: v1 * velScale, vy: 0, mass: mass1, color: "#ef4444", glow: "rgba(239,68,68,0.3)" },
        { x: 0.7, y: 0.55, vx: v2 * velScale, vy: 0, mass: mass2, color: "#3b82f6", glow: "rgba(59,130,246,0.3)" },
      ];
    }
    trailsRef.current = [];
    setHasCollided(false);
    collisionFlashRef.current = 0;
    initialMomentumRef.current = {
      p: mass1 * v1 + mass2 * v2,
      ke: 0.5 * mass1 * v1 * v1 + 0.5 * mass2 * v2 * v2,
    };
    momentumAnimRef.current = 0;
  }, [mass1, mass2, v1, v2, collisionType]);

  useEffect(() => {
    initBalls();
  }, [initBalls]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const balls = ballsRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const is2D = collisionType === "oblique";
    const trackY = is2D ? H * 0.38 : H * 0.4;
    const margin = 50;

    // Collision flash overlay
    if (collisionFlashRef.current > 0) {
      ctx.fillStyle = `rgba(255,255,255,${collisionFlashRef.current * 0.15})`;
      ctx.fillRect(0, 0, W, H);
      collisionFlashRef.current = Math.max(0, collisionFlashRef.current - 0.03);
    }

    // Track
    if (!is2D) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(margin, trackY + 20, W - margin * 2, 6);
    } else {
      // 2D arena
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      // Grid lines
      for (let gx = margin; gx <= W - margin; gx += 60) {
        ctx.beginPath();
        ctx.moveTo(gx, 30);
        ctx.lineTo(gx, H * 0.6);
        ctx.stroke();
      }
      for (let gy = 30; gy <= H * 0.6; gy += 60) {
        ctx.beginPath();
        ctx.moveTo(margin, gy);
        ctx.lineTo(W - margin, gy);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Arena border
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin, 30, W - margin * 2, H * 0.6 - 30);
    }

    // Trail
    const trails = trailsRef.current;
    if (trails.length > 1) {
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath();
      trails.forEach((t, i) => {
        const sx = margin + t.x1 * (W - margin * 2);
        const sy = is2D ? 30 + t.y1 * (H * 0.6 - 30) : trackY;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      ctx.strokeStyle = "#3b82f6";
      ctx.beginPath();
      trails.forEach((t, i) => {
        const sx = margin + t.x2 * (W - margin * 2);
        const sy = is2D ? 30 + t.y2 * (H * 0.6 - 30) : trackY;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw balls
    balls.forEach((ball, idx) => {
      const bx = margin + ball.x * (W - margin * 2);
      const by = is2D ? 30 + ball.y * (H * 0.6 - 30) : trackY;
      const radius = 14 + ball.mass * 2;

      // Glow
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, radius * 2);
      glow.addColorStop(0, ball.glow);
      glow.addColorStop(1, ball.color === "#ef4444" ? "rgba(239,68,68,0)" : "rgba(59,130,246,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bx, by, radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      const grad = ctx.createRadialGradient(bx - 3, by - 3, 0, bx, by, radius);
      grad.addColorStop(0, idx === 0 ? "#fca5a5" : "#93c5fd");
      grad.addColorStop(1, ball.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();

      // Mass label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${ball.mass}kg`, bx, by + 1);

      // Velocity arrow
      const velScale = 800;
      const arrLenX = ball.vx * velScale;
      const arrLenY = ball.vy * velScale;
      const arrLen = Math.sqrt(arrLenX * arrLenX + arrLenY * arrLenY);
      if (arrLen > 3) {
        const arrowY = is2D ? by : by - radius - 12;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(34,197,94,0.4)";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        if (is2D) {
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + arrLenX, by + arrLenY);
        } else {
          ctx.moveTo(bx, arrowY);
          ctx.lineTo(bx + arrLenX, arrowY);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Arrowhead
        const endX = is2D ? bx + arrLenX : bx + arrLenX;
        const endY = is2D ? by + arrLenY : arrowY;
        const nx = is2D ? arrLenX / arrLen : (arrLenX > 0 ? 1 : -1);
        const ny = is2D ? arrLenY / arrLen : 0;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - nx * 6 - ny * 4, endY - ny * 6 + nx * 4);
        ctx.lineTo(endX - nx * 6 + ny * 4, endY - ny * 6 - nx * 4);
        ctx.closePath();
        ctx.fill();

        const speed = Math.sqrt((ball.vx / 0.02) ** 2 + (ball.vy / 0.02) ** 2);
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        if (is2D) {
          ctx.fillText(`${speed.toFixed(1)} m/s`, bx + arrLenX / 2, by + arrLenY / 2 - 8);
        } else {
          ctx.fillText(`${speed.toFixed(1)} m/s`, bx + arrLenX / 2, arrowY - 6);
        }
      }

      // Label
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = ball.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`Ball ${idx + 1}`, bx, (is2D ? by : trackY) + radius + 8);
    });

    // Momentum and energy display
    const p1x = balls[0].mass * balls[0].vx / 0.02;
    const p1y = balls[0].mass * balls[0].vy / 0.02;
    const p2x = balls[1].mass * balls[1].vx / 0.02;
    const p2y = balls[1].mass * balls[1].vy / 0.02;
    const p1 = is2D ? Math.sqrt(p1x * p1x + p1y * p1y) * Math.sign(p1x || 1) : p1x;
    const p2 = is2D ? Math.sqrt(p2x * p2x + p2y * p2y) * Math.sign(p2x || 1) : p2x;
    const totalPx = p1x + p2x;
    const totalPy = p1y + p2y;
    const totalP = is2D ? Math.sqrt(totalPx * totalPx + totalPy * totalPy) : totalPx + totalPy;
    const speed1 = Math.sqrt((balls[0].vx / 0.02) ** 2 + (balls[0].vy / 0.02) ** 2);
    const speed2 = Math.sqrt((balls[1].vx / 0.02) ** 2 + (balls[1].vy / 0.02) ** 2);
    const ke1 = 0.5 * balls[0].mass * speed1 * speed1;
    const ke2 = 0.5 * balls[1].mass * speed2 * speed2;
    const totalKE = ke1 + ke2;

    const infoY = is2D ? H * 0.65 : H * 0.65;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(margin, infoY, W - margin * 2, H - infoY - 15, 8);
    ctx.fill();

    // Momentum bars
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("MOMENTUM", margin + 15, infoY + 10);

    const barX = margin + 15;
    const barW = (W - margin * 2 - 30) * 0.4;
    const barMidX = barX + barW / 2;
    const mBarY = infoY + 28;
    const maxP = Math.max(Math.abs(p1), Math.abs(p2), Math.abs(totalP), 10);

    // Animated momentum bars
    ctx.fillStyle = "#ef4444";
    const p1W = (p1 / maxP) * (barW / 2);
    ctx.beginPath();
    ctx.roundRect(barMidX, mBarY, p1W, 10, 2);
    ctx.fill();
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#fca5a5";
    ctx.textAlign = "left";
    ctx.fillText(`p${is2D ? "" : ""}₁ = ${p1.toFixed(1)}`, barX, mBarY + 1);

    ctx.fillStyle = "#3b82f6";
    const p2W = (p2 / maxP) * (barW / 2);
    ctx.beginPath();
    ctx.roundRect(barMidX, mBarY + 16, p2W, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`p₂ = ${p2.toFixed(1)}`, barX, mBarY + 17);

    ctx.fillStyle = "#a855f7";
    const tpW = (totalP / maxP) * (barW / 2);
    ctx.beginPath();
    ctx.roundRect(barMidX, mBarY + 32, tpW, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#d8b4fe";
    ctx.fillText(`\u03A3p = ${totalP.toFixed(1)}`, barX, mBarY + 33);

    // Center line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barMidX, mBarY - 2);
    ctx.lineTo(barMidX, mBarY + 44);
    ctx.stroke();

    // Energy section with animated bars
    const eX = margin + 15 + (W - margin * 2 - 30) * 0.5;
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("KINETIC ENERGY", eX, infoY + 10);

    const eBarX = eX;
    const eBarW = (W - margin * 2 - 30) * 0.4;
    const eBarY = infoY + 28;
    const maxKE = Math.max(totalKE, initialMomentumRef.current.ke, 10);

    // KE1 bar with glow effect
    const ke1BarW = (ke1 / maxKE) * eBarW;
    if (ke1BarW > 0) {
      ctx.shadowColor = "rgba(239,68,68,0.4)";
      ctx.shadowBlur = 4;
    }
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(eBarX, eBarY, ke1BarW, 10, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fca5a5";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`KE\u2081 = ${ke1.toFixed(1)}`, eBarX + eBarW + 8, eBarY + 1);

    // KE2 bar
    const ke2BarW = (ke2 / maxKE) * eBarW;
    if (ke2BarW > 0) {
      ctx.shadowColor = "rgba(59,130,246,0.4)";
      ctx.shadowBlur = 4;
    }
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(eBarX, eBarY + 16, ke2BarW, 10, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`KE\u2082 = ${ke2.toFixed(1)}`, eBarX + eBarW + 8, eBarY + 17);

    // Total KE with initial KE reference line
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.roundRect(eBarX, eBarY + 32, (totalKE / maxKE) * eBarW, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#fcd34d";
    ctx.fillText(`\u03A3KE = ${totalKE.toFixed(1)}`, eBarX + eBarW + 8, eBarY + 33);

    // Initial KE reference line
    if (hasCollided && initialMomentumRef.current.ke > 0) {
      const refLineX = eBarX + (initialMomentumRef.current.ke / maxKE) * eBarW;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(refLineX, eBarY + 30);
      ctx.lineTo(refLineX, eBarY + 44);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "8px ui-monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "center";
      ctx.fillText("initial", refLineX, eBarY + 52);
      ctx.textAlign = "left";

      // Energy loss indicator
      const loss = ((1 - totalKE / initialMomentumRef.current.ke) * 100);
      if (Math.abs(loss) > 0.5) {
        ctx.fillStyle = loss > 0 ? "#ef4444" : "#22c55e";
        ctx.font = "bold 9px ui-monospace";
        ctx.fillText(`${loss > 0 ? "-" : "+"}${Math.abs(loss).toFixed(0)}%`, eBarX + eBarW + 8, eBarY + 48);
      }
    }

    // Collision type badge
    if (hasCollided) {
      ctx.fillStyle = "rgba(34,197,94,0.2)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 50, 12, 100, 28, 6);
      ctx.fill();
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("COLLIDED!", W / 2, 26);
    }

    // Challenge scoreboard
    if (challengeMode) {
      renderScoreboard(ctx, 10, 10, 140, 110, challengeRef.current);
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now)
    );
  }, [hasCollided, challengeMode, collisionType]);

  const scorePrediction = useCallback(() => {
    const finals = computeFinalVelocities();
    const predV1Num = parseFloat(predV1);
    const predV2Num = parseFloat(predV2);

    if (isNaN(predV1Num) || isNaN(predV2Num)) return;

    const actualV1f = finals.v1x;
    const actualV2f = finals.v2x;

    const tolerance = Math.max(Math.abs(v1), Math.abs(v2), 2);
    const result1 = calculateAccuracy(predV1Num, actualV1f, tolerance);
    const result2 = calculateAccuracy(predV2Num, actualV2f, tolerance);

    const combinedPoints = result1.points + result2.points;
    const combinedTier = combinedPoints >= 5 ? "perfect" as const : combinedPoints >= 3 ? "good" as const : combinedPoints >= 1 ? "close" as const : "miss" as const;
    const combinedResult = {
      points: combinedPoints,
      tier: combinedTier,
      label: combinedPoints >= 5 ? "Excellent!" : combinedPoints >= 3 ? "Good!" : combinedPoints >= 1 ? "Close!" : "Try Again",
    };

    const newState = updateChallengeState(challengeRef.current, combinedResult);
    challengeRef.current = newState;
    setChallengeState(newState);

    // Popup
    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: combinedResult.label,
        points: combinedResult.points,
        x: canvas.width / 2,
        y: canvas.height * 0.3,
        startTime: performance.now(),
      });
    }

    // Sound
    if (combinedPoints >= 4) {
      playScore(combinedPoints);
      playSFX("success");
      if (canvas) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height * 0.3, 25);
      }
    } else if (combinedPoints > 0) {
      playSFX("correct");
    } else {
      playSFX("incorrect");
    }
  }, [predV1, predV2, computeFinalVelocities, v1, v2]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) lastTsRef.current = now;
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    const balls = ballsRef.current;
    const b1 = balls[0];
    const b2 = balls[1];
    const is2D = collisionType === "oblique";

    b1.x += b1.vx;
    b1.y += b1.vy;
    b2.x += b2.vx;
    b2.y += b2.vy;

    // Collision detection
    const canvas = canvasRef.current;
    const W = canvas?.width ?? 800;
    const H = canvas?.height ?? 440;
    const r1 = (14 + b1.mass * 2) / (W - 100);
    const r2 = (14 + b2.mass * 2) / (W - 100);

    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Relative velocity along collision normal
    const nx = dist > 0 ? dx / dist : 1;
    const ny = dist > 0 ? dy / dist : 0;
    const relVn = (b1.vx - b2.vx) * nx + (b1.vy - b2.vy) * ny;

    if (dist < (r1 + r2) && relVn > 0 && !hasCollided) {
      const m1 = b1.mass;
      const m2 = b2.mass;
      const e = elasticity;

      if (is2D) {
        // 2D collision using normal/tangential decomposition
        const u1n = b1.vx * nx + b1.vy * ny;
        const u1t = -b1.vx * ny + b1.vy * nx;
        const u2n = b2.vx * nx + b2.vy * ny;
        const u2t = -b2.vx * ny + b2.vy * nx;

        const v1n = ((m1 - e * m2) * u1n + (1 + e) * m2 * u2n) / (m1 + m2);
        const v2n = ((m2 - e * m1) * u2n + (1 + e) * m1 * u1n) / (m1 + m2);

        b1.vx = v1n * nx - u1t * ny;
        b1.vy = v1n * ny + u1t * nx;
        b2.vx = v2n * nx - u2t * ny;
        b2.vy = v2n * ny + u2t * nx;
      } else {
        // 1D collision
        const u1 = b1.vx;
        const u2 = b2.vx;
        b1.vx = ((m1 - e * m2) * u1 + (1 + e) * m2 * u2) / (m1 + m2);
        b2.vx = ((m2 - e * m1) * u2 + (1 + e) * m1 * u1) / (m1 + m2);
      }

      setHasCollided(true);

      // Collision effects
      const collisionX = 50 + ((b1.x + b2.x) / 2) * (W - 100);
      const collisionY = is2D
        ? 30 + ((b1.y + b2.y) / 2) * (H * 0.6 - 30)
        : H * 0.4;

      // Particle sparks
      const impactSpeed = Math.abs(relVn) / 0.02;
      const sparkCount = Math.min(40, Math.round(impactSpeed * 3));
      particlesRef.current.emitSparks(collisionX, collisionY, sparkCount, "#fbbf24");
      particlesRef.current.emitSparks(collisionX, collisionY, Math.round(sparkCount / 2), "#ef4444");
      particlesRef.current.emitSparks(collisionX, collisionY, Math.round(sparkCount / 2), "#3b82f6");
      particlesRef.current.emitGlow(collisionX, collisionY, 8, "#ffffff");

      // Screen flash
      collisionFlashRef.current = 1;

      // Sound
      playSFX("collision");

      // Score prediction if in challenge mode
      if (challengeMode && predictionSubmitted) {
        scorePrediction();
      }

      // Separate
      const overlap = (r1 + r2) - dist;
      b1.x -= nx * overlap / 2;
      b1.y -= ny * overlap / 2;
      b2.x += nx * overlap / 2;
      b2.y += ny * overlap / 2;
    }

    // Wall bounces
    if (is2D) {
      const yMin = 0.02;
      const yMax = 0.98;
      if (b1.x < 0.02) { b1.x = 0.02; b1.vx = Math.abs(b1.vx); }
      if (b1.x > 0.98) { b1.x = 0.98; b1.vx = -Math.abs(b1.vx); }
      if (b1.y < yMin) { b1.y = yMin; b1.vy = Math.abs(b1.vy); }
      if (b1.y > yMax) { b1.y = yMax; b1.vy = -Math.abs(b1.vy); }
      if (b2.x < 0.02) { b2.x = 0.02; b2.vx = Math.abs(b2.vx); }
      if (b2.x > 0.98) { b2.x = 0.98; b2.vx = -Math.abs(b2.vx); }
      if (b2.y < yMin) { b2.y = yMin; b2.vy = Math.abs(b2.vy); }
      if (b2.y > yMax) { b2.y = yMax; b2.vy = -Math.abs(b2.vy); }
    } else {
      if (b1.x < 0.02) { b1.x = 0.02; b1.vx = Math.abs(b1.vx); }
      if (b1.x > 0.98) { b1.x = 0.98; b1.vx = -Math.abs(b1.vx); }
      if (b2.x < 0.02) { b2.x = 0.02; b2.vx = Math.abs(b2.vx); }
      if (b2.x > 0.98) { b2.x = 0.98; b2.vx = -Math.abs(b2.vx); }
    }

    trailsRef.current.push({ x1: b1.x, y1: b1.y, x2: b2.x, y2: b2.y });
    if (trailsRef.current.length > 300) trailsRef.current.shift();

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [elasticity, draw, collisionType, hasCollided, challengeMode, predictionSubmitted, scorePrediction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 460);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      lastTsRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    initBalls();
    setIsRunning(false);
    setPredictionSubmitted(false);
    setShowPredictionInput(challengeMode);
    setPredV1("");
    setPredV2("");
    cancelAnimationFrame(animRef.current);
    lastTsRef.current = null;
    particlesRef.current.clear();
  };

  useEffect(() => {
    draw();
  }, [draw]);

  const handleStartChallenge = () => {
    setChallengeMode(true);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = true;
    setChallengeState(challengeRef.current);
    setShowPredictionInput(true);
    reset();
  };

  const handleSubmitPrediction = () => {
    if (predV1.trim() === "" || predV2.trim() === "") return;
    setPredictionSubmitted(true);
    setShowPredictionInput(false);
    playSFX("click");
    // Auto-start
    initBalls();
    setIsRunning(true);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Prediction Mode Input */}
      {challengeMode && showPredictionInput && !isRunning && (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 dark:text-amber-400 text-sm font-bold uppercase tracking-wider">Predict Final Velocities</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">(after collision)</span>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>Ball 1: m={mass1}kg, v={v1} m/s | Ball 2: m={mass2}kg, v={v2} m/s | e={elasticity.toFixed(1)}</p>
            <p className="font-mono text-gray-500 dark:text-gray-500">
              Use: v1&apos; = [(m1 - e*m2)*v1 + (1+e)*m2*v2] / (m1+m2)
            </p>
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs font-medium text-red-500">v1&apos; (m/s)</label>
              <input
                type="number"
                step="0.1"
                value={predV1}
                onChange={(e) => setPredV1(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="?"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-blue-500">v2&apos; (m/s)</label>
              <input
                type="number"
                step="0.1"
                value={predV2}
                onChange={(e) => setPredV2(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="?"
              />
            </div>
            <button
              onClick={handleSubmitPrediction}
              disabled={predV1.trim() === "" || predV2.trim() === ""}
              className="h-10 px-6 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              Submit & Run
            </button>
          </div>
        </div>
      )}

      {/* Prediction result after collision */}
      {challengeMode && predictionSubmitted && hasCollided && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Prediction Results</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 space-y-1">
              <div className="text-red-500 font-medium">Ball 1 (v1&apos;)</div>
              <div className="font-mono text-gray-600 dark:text-gray-400">
                Predicted: <span className="text-gray-900 dark:text-gray-100">{predV1}</span> m/s
              </div>
              <div className="font-mono text-gray-600 dark:text-gray-400">
                Actual: <span className="text-green-500 font-bold">{computeFinalVelocities().v1x.toFixed(2)}</span> m/s
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 space-y-1">
              <div className="text-blue-500 font-medium">Ball 2 (v2&apos;)</div>
              <div className="font-mono text-gray-600 dark:text-gray-400">
                Predicted: <span className="text-gray-900 dark:text-gray-100">{predV2}</span> m/s
              </div>
              <div className="font-mono text-gray-600 dark:text-gray-400">
                Actual: <span className="text-green-500 font-bold">{computeFinalVelocities().v2x.toFixed(2)}</span> m/s
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={reset}
              className="px-4 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
            >
              Next Problem
            </button>
            <div className="flex items-center gap-2 ml-auto text-sm text-gray-500 dark:text-gray-400">
              <span>Score: <strong className="text-white">{challengeState.score}</strong></span>
              <span>|</span>
              <span>Streak: <strong className="text-amber-400">{challengeState.streak}</strong></span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Mass 1</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} value={mass1}
              onChange={(e) => { setMass1(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{mass1}kg</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Vel 1</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={-8} max={8} step={0.5} value={v1}
              onChange={(e) => { setV1(Number(e.target.value)); reset(); }}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{v1}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Mass 2</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} value={mass2}
              onChange={(e) => { setMass2(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{mass2}kg</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Vel 2</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={-8} max={8} step={0.5} value={v2}
              onChange={(e) => { setV2(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{v2}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-purple-500 uppercase tracking-wider">Elasticity</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={1} step={0.1} value={elasticity}
              onChange={(e) => { setElasticity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{elasticity.toFixed(1)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) initBalls();
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-xs transition-colors">
            {isRunning ? "Pause" : "Go"}
          </button>
          <button onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium">
            Reset
          </button>
        </div>
      </div>

      {/* Collision type & oblique angle */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type:</span>
        <button
          onClick={() => { setCollisionType("head-on"); reset(); }}
          className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors border ${
            collisionType === "head-on"
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Head-on (1D)
        </button>
        <button
          onClick={() => { setCollisionType("oblique"); reset(); }}
          className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors border ${
            collisionType === "oblique"
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Oblique (2D)
        </button>
        {collisionType === "oblique" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Angle:</span>
            <input type="range" min={10} max={80} value={obliqueAngle}
              onChange={(e) => { setObliqueAngle(Number(e.target.value)); reset(); }}
              className="w-24 accent-green-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{obliqueAngle}&deg;</span>
          </div>
        )}
        <div className="h-9 w-px bg-gray-200 dark:bg-gray-700" />
        {!challengeMode ? (
          <button
            onClick={handleStartChallenge}
            className="px-4 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
          >
            Challenge Mode
          </button>
        ) : (
          <button
            onClick={() => { setChallengeMode(false); setPredictionSubmitted(false); setShowPredictionInput(false); }}
            className="px-4 h-9 rounded-lg border border-amber-500 text-amber-500 hover:bg-amber-500/10 font-medium text-sm transition-colors"
          >
            Exit Challenge
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Conservation Laws</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">m₁v₁ + m₂v₂ = m₁v₁&apos; + m₂v₂&apos;</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">e = |v₂&apos;−v₁&apos;| / |v₁−v₂|</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">e=1: elastic, e=0: inelastic</div>
        </div>
      </div>
    </div>
  );
}
