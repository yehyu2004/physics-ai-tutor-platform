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
import { createDragHandler, getCanvasMousePos } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

type GameMode = "sandbox" | "target_omega" | "platform";

interface PlatformWeight {
  id: number;
  r: number; // distance from center (fraction 0-1)
  angle: number; // angle on platform
  mass: number;
}

export default function AngularMomentum() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [armExtension, setArmExtension] = useState(1.0);
  const [initialOmega, setInitialOmega] = useState(2);
  const [isRunning, setIsRunning] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");

  const angleRef = useRef(0);
  const timeRef = useRef(0);
  const isDraggingArmsRef = useRef(false);
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);

  // Target omega challenge
  const targetOmegaRef = useRef(5.0);
  const targetReachedRef = useRef(false);

  // Platform mode
  const [platformWeights, setPlatformWeights] = useState<PlatformWeight[]>([]);
  const nextWeightIdRef = useRef(1);
  const platformBaseI = 5.0; // base moment of inertia of the platform itself
  const platformOmegaRef = useRef(3.0); // initial omega for platform
  const platformLRef = useRef(0); // conserved angular momentum for platform

  // Moment of inertia model
  const getI = useCallback(
    (ext: number) => {
      return 3 + ext * 5.5;
    },
    []
  );

  // Platform mode I calculation
  const getPlatformI = useCallback(
    (weights: PlatformWeight[]) => {
      let I = platformBaseI;
      for (const w of weights) {
        // I = m * r^2 (r in range 0 to 1, scaled to physical units)
        const rPhysical = w.r * 2; // meters
        I += w.mass * rPhysical * rPhysical;
      }
      return I;
    },
    []
  );

  // L = I_initial * omega_initial (conserved)
  const I_initial = getI(1.0);
  const L = I_initial * initialOmega;

  const getCurrentOmega = useCallback(
    (ext: number) => {
      const I = getI(ext);
      return L / I;
    },
    [L, getI]
  );

  // Generate new target omega
  const generateTarget = useCallback(() => {
    targetOmegaRef.current = 3 + Math.random() * 8;
    targetReachedRef.current = false;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (let i = 0; i < 40; i++) {
      const sx = (37 * (i + 1) * 7) % W;
      const sy = (37 * (i + 1) * 13) % H;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 4) * 0.08})`;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 1.2 : 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const angle = angleRef.current;

    if (gameMode === "platform") {
      // --- PLATFORM MODE ---
      const cx = W * 0.35;
      const cy = H * 0.45;
      const platformR = 120;

      const I = getPlatformI(platformWeights);
      const omega = platformLRef.current > 0 ? platformLRef.current / I : platformOmegaRef.current;

      // Platform disc
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Platform body
      const discGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, platformR);
      discGrad.addColorStop(0, "#334155");
      discGrad.addColorStop(0.8, "#1e293b");
      discGrad.addColorStop(1, "#475569");
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(0, 0, platformR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Spokes
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * platformR, Math.sin(a) * platformR);
        ctx.stroke();
      }

      // Concentric rings (distance guides)
      for (let r = 0.25; r <= 1; r += 0.25) {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, r * platformR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw weights on platform
      for (const w of platformWeights) {
        const wx = Math.cos(w.angle) * w.r * platformR;
        const wy = Math.sin(w.angle) * w.r * platformR;
        const wSize = 8 + w.mass * 3;

        // Glow
        const glow = ctx.createRadialGradient(wx, wy, 0, wx, wy, wSize + 8);
        glow.addColorStop(0, "rgba(251,191,36,0.3)");
        glow.addColorStop(1, "rgba(251,191,36,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(wx, wy, wSize + 8, 0, Math.PI * 2);
        ctx.fill();

        // Weight
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.arc(wx, wy, wSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Mass label
        ctx.fillStyle = "#1e1b4b";
        ctx.font = "bold 9px ui-monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${w.mass}`, wx, wy);
        ctx.textBaseline = "alphabetic";
      }

      // Center axle
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Reference mark
      const markX = cx + Math.cos(angle) * platformR;
      const markY = cy + Math.sin(angle) * platformR;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(markX, markY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Speed indicator arcs
      const speedArcs = Math.min(Math.floor(Math.abs(omega) / 1.5), 8);
      for (let i = 0; i < speedArcs; i++) {
        ctx.strokeStyle = `rgba(251,191,36,${0.1 + i * 0.05})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, platformR + 10 + i * 8, angle + i * 0.5, angle + i * 0.5 + 0.8);
        ctx.stroke();
      }

      // Platform info panel
      const panelX = W * 0.58;
      const panelW2 = W * 0.38;

      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.roundRect(panelX, 20, panelW2, H - 40, 10);
      ctx.fill();

      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("SPINNING PLATFORM", panelX + 15, 45);

      let y = 70;
      const lineH2 = 24;

      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`L = ${platformLRef.current.toFixed(1)} kg m^2/s`, panelX + 15, y);
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("(conserved)", panelX + 170, y);
      y += lineH2 + 5;

      ctx.font = "13px ui-monospace, monospace";
      ctx.fillStyle = "#a78bfa";
      ctx.fillText(`I = ${I.toFixed(2)} kg m^2`, panelX + 15, y);
      y += lineH2;

      ctx.fillStyle = "#22c55e";
      ctx.fillText(`omega = ${omega.toFixed(2)} rad/s`, panelX + 15, y);
      y += lineH2;

      const KE = 0.5 * I * omega * omega;
      ctx.fillStyle = "#3b82f6";
      ctx.fillText(`KE_rot = ${KE.toFixed(1)} J`, panelX + 15, y);
      y += lineH2;

      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Weights: ${platformWeights.length}`, panelX + 15, y);
      y += lineH2 + 10;

      // Instruction
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("Click platform to add weight", panelX + 15, y);
      ctx.fillText("Right-click to remove weight", panelX + 15, y + 14);

      // Bars
      y += 30;
      const barW2 = panelW2 - 40;
      const barH2 = 14;

      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#a78bfa";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2 * Math.min(I / 20, 1), barH2, 4);
      ctx.fill();
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("I", panelX + 15 + barW2 + 5, y + 11);
      y += barH2 + 6;

      ctx.fillStyle = "#052e16";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      const maxOmegaP = platformLRef.current / platformBaseI;
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2 * Math.min(omega / (maxOmegaP || 1), 1), barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("omega", panelX + 15 + barW2 + 5, y + 11);
    } else {
      // --- SKATER MODE (sandbox or target_omega) ---
      const omega = getCurrentOmega(armExtension);
      const I = getI(armExtension);

      const cx = W * 0.35;
      const cy = H * 0.45;

      // Ice rink circle
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 120, 0, Math.PI * 2);
      ctx.stroke();

      // Rotation indicator ring
      ctx.strokeStyle = `rgba(139,92,246,${0.2 + Math.abs(Math.sin(angle)) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, 100, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw skater (top view, rotating)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Body (center disc)
      const bodyRadius = 18;
      const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, bodyRadius);
      bodyGrad.addColorStop(0, "#a78bfa");
      bodyGrad.addColorStop(1, "#7c3aed");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, bodyRadius, 0, Math.PI * 2);
      ctx.fill();

      // Glow
      const glow = ctx.createRadialGradient(0, 0, bodyRadius, 0, 0, bodyRadius + 15);
      glow.addColorStop(0, "rgba(167,139,250,0.3)");
      glow.addColorStop(1, "rgba(167,139,250,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, bodyRadius + 15, 0, Math.PI * 2);
      ctx.fill();

      // Arms
      const armLen = 20 + armExtension * 55;
      const armWidth = 6;

      // Arm draggable highlight
      if (isDraggingArmsRef.current) {
        ctx.strokeStyle = "rgba(251,191,36,0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, armLen + 10, -0.3, 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, armLen + 10, Math.PI - 0.3, Math.PI + 0.3);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = "#c4b5fd";
      // Left arm
      ctx.beginPath();
      ctx.roundRect(-armLen, -armWidth / 2, armLen - bodyRadius + 5, armWidth, 3);
      ctx.fill();
      // Right arm
      ctx.beginPath();
      ctx.roundRect(bodyRadius - 5, -armWidth / 2, armLen - bodyRadius + 5, armWidth, 3);
      ctx.fill();

      // Hands
      ctx.fillStyle = "#ddd6fe";
      ctx.beginPath();
      ctx.arc(-armLen, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(armLen, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      // Head indicator
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(0, -bodyRadius - 5, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Speed indicator arcs
      const speedArcs = Math.min(Math.floor(omega / 2), 8);
      for (let i = 0; i < speedArcs; i++) {
        ctx.strokeStyle = `rgba(167,139,250,${0.15 + i * 0.05})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 85 + i * 8, angle + i * 0.5, angle + i * 0.5 + 0.8);
        ctx.stroke();
      }

      // Drag hint
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Drag hands to extend/tuck arms", cx, cy + 140);

      // --- Right side: Info panel ---
      const panelX = W * 0.58;
      const panelW = W * 0.38;

      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.roundRect(panelX, 20, panelW, H - 40, 10);
      ctx.fill();

      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("ANGULAR MOMENTUM", panelX + 15, 45);

      const lineH = 28;
      let y = 70;

      // L (conserved)
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`L = ${L.toFixed(1)} kg m^2/s`, panelX + 15, y);
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("(conserved)", panelX + 15 + 170, y);
      y += lineH + 5;

      // I
      ctx.font = "13px ui-monospace, monospace";
      ctx.fillStyle = "#a78bfa";
      ctx.fillText(`I = ${I.toFixed(2)} kg m^2`, panelX + 15, y);
      y += lineH;

      // omega
      ctx.fillStyle = "#22c55e";
      ctx.fillText(`omega = ${omega.toFixed(2)} rad/s`, panelX + 15, y);
      y += lineH;

      // KE_rot
      const KE = 0.5 * I * omega * omega;
      ctx.fillStyle = "#3b82f6";
      ctx.fillText(`KE_rot = ${KE.toFixed(1)} J`, panelX + 15, y);
      y += lineH;

      // Period
      const period = omega > 0 ? (2 * Math.PI) / omega : Infinity;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`T = ${period < 100 ? period.toFixed(2) : "---"} s`, panelX + 15, y);
      y += lineH + 10;

      // Target omega display
      if (gameMode === "target_omega" && challengeRef.current.active) {
        ctx.fillStyle = "rgba(245,158,11,0.1)";
        ctx.beginPath();
        ctx.roundRect(panelX + 10, y - 10, panelW - 20, 35, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(245,158,11,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = "bold 12px ui-monospace, monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`TARGET: omega = ${targetOmegaRef.current.toFixed(1)} rad/s`, panelX + 18, y + 6);

        const diff = Math.abs(omega - targetOmegaRef.current);
        const diffColor = diff < 0.2 ? "#22c55e" : diff < 0.5 ? "#f59e0b" : "#ef4444";
        ctx.fillStyle = diffColor;
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(`diff = ${diff.toFixed(2)} rad/s`, panelX + 18, y + 20);
        y += 40;
      }

      // Bar visualizations
      const barW2 = panelW - 40;
      const barH2 = 16;

      // I bar
      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#a78bfa";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2 * (I / 10), barH2, 4);
      ctx.fill();
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.fillText("I", panelX + 15 + barW2 + 5, y + 12);
      y += barH2 + 8;

      // omega bar
      ctx.fillStyle = "#052e16";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      const maxOmega = L / 3;
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2 * Math.min(omega / maxOmega, 1), barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("omega", panelX + 15 + barW2 + 5, y + 12);

      // Target line on omega bar
      if (gameMode === "target_omega" && challengeRef.current.active) {
        const targetX = panelX + 15 + barW2 * Math.min(targetOmegaRef.current / maxOmega, 1);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetX, y - 3);
        ctx.lineTo(targetX, y + barH2 + 3);
        ctx.stroke();
        // Target triangle
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.moveTo(targetX, y - 3);
        ctx.lineTo(targetX - 4, y - 8);
        ctx.lineTo(targetX + 4, y - 8);
        ctx.closePath();
        ctx.fill();
      }
      y += barH2 + 8;

      // KE bar
      ctx.fillStyle = "#172554";
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2, barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#3b82f6";
      const maxKE = 0.5 * 3 * maxOmega * maxOmega;
      ctx.beginPath();
      ctx.roundRect(panelX + 15, y, barW2 * Math.min(KE / maxKE, 1), barH2, 4);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("KE", panelX + 15 + barW2 + 5, y + 12);
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // Challenge scoreboard
    if (challengeRef.current.active) {
      renderScoreboard(ctx, W - 180, 12, 160, 120, challengeRef.current);
    }

    // Score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [armExtension, getCurrentOmega, getI, L, gameMode, platformWeights, getPlatformI]);

  const animate = useCallback(() => {
    const dt = 0.016;
    timeRef.current += dt;

    if (gameMode === "platform") {
      const I = getPlatformI(platformWeights);
      const omega = platformLRef.current > 0 ? platformLRef.current / I : platformOmegaRef.current;
      angleRef.current += omega * dt;
    } else {
      const omega = getCurrentOmega(armExtension);
      angleRef.current += omega * dt;
    }

    particlesRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [armExtension, getCurrentOmega, draw, gameMode, platformWeights, getPlatformI]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.5, 440);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Mouse interaction for dragging arms and platform clicks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const W = canvas.width;
        const H = canvas.height;

        if (gameMode === "platform") {
          // In platform mode, clicks handled separately
          return false;
        }

        // Check if clicking near hands (for arm dragging)
        const cx = W * 0.35;
        const cy = H * 0.45;
        const angle = angleRef.current;

        // Transform click to skater-local coords
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(-angle) - dy * Math.sin(-angle);
        const localY = dx * Math.sin(-angle) + dy * Math.cos(-angle);
        const distFromCenter = Math.sqrt(localX * localX + localY * localY);

        // Allow dragging if near either hand or the arm area
        if (distFromCenter > 15 && distFromCenter < 90) {
          isDraggingArmsRef.current = true;
          return true;
        }
        return false;
      },
      onDrag: (x, y) => {
        if (!isDraggingArmsRef.current) return;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W * 0.35;
        const cy = H * 0.45;

        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Map distance from center to arm extension
        // 20px = fully tucked, 75px = fully extended
        const newExt = Math.max(0, Math.min(1, (dist - 20) / 55));
        setArmExtension(newExt);
      },
      onDragEnd: () => {
        if (isDraggingArmsRef.current) {
          isDraggingArmsRef.current = false;

          // Check if we hit the target in target_omega mode
          if (gameMode === "target_omega" && challengeRef.current.active && !targetReachedRef.current) {
            const omega = getCurrentOmega(armExtension);
            const diff = Math.abs(omega - targetOmegaRef.current);
            if (diff < 0.5) {
              targetReachedRef.current = true;
              const result = calculateAccuracy(omega, targetOmegaRef.current, 2.0);
              challengeRef.current = updateChallengeState(challengeRef.current, result);
              popupsRef.current.push({
                text: result.label,
                points: result.points,
                x: canvas.width / 2,
                y: canvas.height / 2,
                startTime: performance.now(),
              });
              if (result.points > 0) {
                playScore(result.points);
                particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 15);
              } else {
                playSFX("incorrect");
              }
              // Generate new target after delay
              setTimeout(() => {
                generateTarget();
              }, 1500);
            }
          }
        }
      },
      onClick: (x, y) => {
        if (gameMode !== "platform") return;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W * 0.35;
        const cy = H * 0.45;
        const platformR = 120;

        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < platformR && dist > 12) {
          // Initialize L if this is the first weight being placed
          if (platformWeights.length === 0 && platformLRef.current === 0) {
            const I0 = getPlatformI([]);
            platformLRef.current = I0 * platformOmegaRef.current;
          }

          // Convert click position to platform-local coordinates
          const relAngle = Math.atan2(dy, dx) - angleRef.current;
          const r = dist / platformR;

          const newWeight: PlatformWeight = {
            id: nextWeightIdRef.current++,
            r: Math.min(r, 0.95),
            angle: relAngle,
            mass: 2,
          };

          setPlatformWeights((prev) => [...prev, newWeight]);
          playSFX("drop");
        }
      },
    });

    // Right-click to remove weights in platform mode
    const handleContextMenu = (e: MouseEvent) => {
      if (gameMode !== "platform") return;
      e.preventDefault();
      const pos = getCanvasMousePos(canvas, e);
      const W = canvas.width;
      const H = canvas.height;
      const cx = W * 0.35;
      const cy = H * 0.45;
      const platformR = 120;

      // Find nearest weight
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < platformWeights.length; i++) {
        const w = platformWeights[i];
        const wa = w.angle + angleRef.current;
        const wx = cx + Math.cos(wa) * w.r * platformR;
        const wy = cy + Math.sin(wa) * w.r * platformR;
        const d = Math.sqrt((pos.x - wx) ** 2 + (pos.y - wy) ** 2);
        if (d < 20 && d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      if (nearestIdx >= 0) {
        setPlatformWeights((prev) => prev.filter((_, i) => i !== nearestIdx));
        playSFX("pop");
      }
    };

    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      cleanup();
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [armExtension, gameMode, getCurrentOmega, platformWeights, generateTarget, getPlatformI]);

  // Submit target omega check with button
  const checkTargetOmega = () => {
    if (gameMode !== "target_omega" || !challengeRef.current.active) return;
    const omega = getCurrentOmega(armExtension);
    const result = calculateAccuracy(omega, targetOmegaRef.current, 2.0);
    challengeRef.current = updateChallengeState(challengeRef.current, result);
    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
    }
    if (result.points > 0) {
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 15);
    } else {
      playSFX("incorrect");
    }
    setTimeout(() => generateTarget(), 1500);
  };

  const startTargetChallenge = () => {
    setGameMode("target_omega");
    setArmExtension(1.0);
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Hit the target angular velocity",
    };
    generateTarget();
    playSFX("powerup");
  };

  const startPlatformMode = () => {
    setGameMode("platform");
    setPlatformWeights([]);
    const I0 = platformBaseI;
    platformOmegaRef.current = 3.0;
    platformLRef.current = I0 * platformOmegaRef.current;
    angleRef.current = 0;
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Add/remove weights to control spin",
    };
    playSFX("powerup");
  };

  const backToSandbox = () => {
    setGameMode("sandbox");
    challengeRef.current = createChallengeState();
    setArmExtension(1.0);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {gameMode !== "platform" && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Arm Extension
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={armExtension}
                  onChange={(e) => setArmExtension(Number(e.target.value))}
                  className="flex-1 accent-purple-500"
                />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
                  {(armExtension * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Initial omega (rad/s)
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.1}
                  value={initialOmega}
                  onChange={(e) => setInitialOmega(Number(e.target.value))}
                  className="flex-1 accent-green-500"
                />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
                  {initialOmega.toFixed(1)}
                </span>
              </div>
            </div>
          </>
        )}
        {gameMode === "target_omega" && challengeRef.current.active && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-end">
            <button
              onClick={checkTargetOmega}
              className="w-full h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
            >
              Check omega
            </button>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              angleRef.current = 0;
              timeRef.current = 0;
              draw();
            }}
            className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mode
          </label>
          <div className="flex gap-1.5">
            <button
              onClick={backToSandbox}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                gameMode === "sandbox"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Sandbox
            </button>
            <button
              onClick={startTargetChallenge}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                gameMode === "target_omega"
                  ? "bg-amber-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Target
            </button>
            <button
              onClick={startPlatformMode}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                gameMode === "platform"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Platform
            </button>
          </div>
        </div>
      </div>
      {gameMode === "target_omega" && challengeRef.current.active && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Target omega Challenge
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Drag the skater&apos;s arms (or use the slider) to reach the target angular velocity.
            Conservation of angular momentum: I*omega = const. Tuck arms to spin faster!
          </p>
          <div className="mt-2 flex gap-4 text-xs font-mono text-amber-700 dark:text-amber-400">
            <span>Score: {challengeRef.current.score}</span>
            <span>Attempts: {challengeRef.current.attempts}</span>
            <span>Best streak: {challengeRef.current.bestStreak}</span>
          </div>
        </div>
      )}
      {gameMode === "platform" && (
        <div className="rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
            Spinning Platform
          </h3>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Click on the platform to place weights. Right-click to remove them.
            Watch how adding mass far from the center changes the angular velocity
            while angular momentum stays conserved!
          </p>
          <div className="mt-2 flex gap-4 text-xs font-mono text-blue-700 dark:text-blue-400">
            <span>Weights: {platformWeights.length}</span>
            <span>L = {platformLRef.current.toFixed(1)} kg m^2/s</span>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="L = I\omega = \text{const}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="KE = \frac{1}{2}I\omega^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="I_1\omega_1 = I_2\omega_2" />
          </div>
        </div>
      </div>
    </div>
  );
}
