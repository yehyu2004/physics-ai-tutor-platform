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

type SimMode = "sandbox" | "quiz" | "critical" | "stack";

interface StackedBlock {
  mass: number;
  color: string;
  posMeters: number;
  vel: number;
  size: number;
  label: string;
}

const BLOCK_COLORS = [
  { fill: ["#3b82f6", "#1d4ed8"], label: "A" },
  { fill: ["#22c55e", "#15803d"], label: "B" },
  { fill: ["#f59e0b", "#d97706"], label: "C" },
  { fill: ["#ec4899", "#be185d"], label: "D" },
  { fill: ["#a855f7", "#7c3aed"], label: "E" },
];

export default function InclinedPlane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [angle, setAngle] = useState(30);
  const [mass, setMass] = useState(5);
  const [friction, setFriction] = useState(0.3);
  const [showComponents, setShowComponents] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<SimMode>("sandbox");
  const [quizPrediction, setQuizPrediction] = useState<"slides" | "stays" | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [criticalGuess, setCriticalGuess] = useState("");
  const [criticalSubmitted, setCriticalSubmitted] = useState(false);

  const animRef = useRef<number>(0);
  const posRef = useRef(0);
  const velRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const stackedBlocksRef = useRef<StackedBlock[]>([]);
  const isDraggingAngleRef = useRef(false);
  const pxPerMeter = 50;

  const g = 9.8;

  // Randomize quiz parameters
  const randomizeQuiz = useCallback(() => {
    const newAngle = 10 + Math.round(Math.random() * 60);
    const newFriction = Math.round((0.1 + Math.random() * 0.8) * 20) / 20;
    setAngle(newAngle);
    setFriction(newFriction);
    setQuizPrediction(null);
    setQuizSubmitted(false);
    posRef.current = 0;
    velRef.current = 0;
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

    const rad = (angle * Math.PI) / 180;
    const margin = 60;

    // Ramp geometry
    const rampBaseX = margin;
    const rampBaseY = H - margin;
    const rampLen = Math.min(W * 0.65, (H * 0.75) / Math.sin(Math.max(rad, 0.1)));
    const rampTopX = rampBaseX + rampLen * Math.cos(rad);
    const rampTopY = rampBaseY - rampLen * Math.sin(rad);

    // Ground
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, rampBaseY, W, H - rampBaseY);

    // Ramp surface (triangle)
    const rampGrad = ctx.createLinearGradient(rampBaseX, rampBaseY, rampTopX, rampTopY);
    rampGrad.addColorStop(0, "#334155");
    rampGrad.addColorStop(1, "#475569");
    ctx.fillStyle = rampGrad;
    ctx.beginPath();
    ctx.moveTo(rampBaseX, rampBaseY);
    ctx.lineTo(rampTopX, rampTopY);
    ctx.lineTo(rampTopX, rampBaseY);
    ctx.closePath();
    ctx.fill();

    // Friction texture (small lines on ramp surface)
    if (friction > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(friction * 0.15, 0.1)})`;
      ctx.lineWidth = 1;
      const frictionLines = Math.round(friction * 20);
      for (let i = 0; i < frictionLines; i++) {
        const t = (i + 0.5) / frictionLines;
        const lx = rampBaseX + (rampTopX - rampBaseX) * t;
        const ly = rampBaseY + (rampTopY - rampBaseY) * t;
        const perpX = Math.sin(rad) * 8;
        const perpY = Math.cos(rad) * 8;
        ctx.beginPath();
        ctx.moveTo(lx - perpX, ly + perpY);
        ctx.lineTo(lx + perpX, ly - perpY);
        ctx.stroke();
      }
    }

    // Ramp surface line
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rampBaseX, rampBaseY);
    ctx.lineTo(rampTopX, rampTopY);
    ctx.stroke();

    // Angle arc
    ctx.strokeStyle = "rgba(251,191,36,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rampTopX, rampBaseY, 35, Math.PI, Math.PI + rad, false);
    ctx.stroke();
    ctx.font = "13px ui-monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.fillText(`${angle}\u00B0`, rampTopX - 48, rampBaseY - 10);

    // Critical angle indicator
    if (mode === "critical" || mode === "quiz") {
      const criticalAngle = Math.atan(friction) * 180 / Math.PI;
      const criticalRad = criticalAngle * Math.PI / 180;

      // Show critical angle line (subtle)
      if (mode === "critical" && criticalSubmitted) {
        ctx.strokeStyle = "rgba(34,197,94,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(rampTopX, rampBaseY);
        const cLineLen = rampLen * 0.9;
        ctx.lineTo(
          rampTopX - cLineLen * Math.cos(Math.PI - criticalRad),
          rampBaseY - cLineLen * Math.sin(criticalRad)
        );
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "left";
        ctx.fillText(
          `Critical: ${criticalAngle.toFixed(1)}\u00B0`,
          rampTopX - cLineLen * Math.cos(Math.PI - criticalRad) - 5,
          rampBaseY - cLineLen * Math.sin(criticalRad) - 8
        );
      }
    }

    // Draw all blocks (stacked or single)
    const drawBlock = (
      blockPosPx: number,
      blockMass: number,
      blockSize: number,
      colors: string[],
      label: string,
      index: number,
    ) => {
      const usableRampPx = Math.max(rampLen - 80, 10);
      const clampedPos = Math.min(Math.max(blockPosPx, 0), usableRampPx);
      const downUx = Math.cos(rad);
      const downUy = Math.sin(rad);
      const startOffsetPx = 30 + index * (blockSize + 4);
      const bx = rampTopX - downUx * startOffsetPx + downUx * clampedPos;
      const by = rampTopY + downUy * startOffsetPx + downUy * clampedPos;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-rad);
      ctx.translate(0, -blockSize / 2);

      // Block shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(-blockSize / 2 + 3, 3, blockSize, blockSize, 4);
      ctx.fill();

      // Block
      const blockGrad = ctx.createLinearGradient(-blockSize / 2, 0, blockSize / 2, blockSize);
      blockGrad.addColorStop(0, colors[0]);
      blockGrad.addColorStop(1, colors[1]);
      ctx.fillStyle = blockGrad;
      ctx.beginPath();
      ctx.roundRect(-blockSize / 2, 0, blockSize, blockSize, 4);
      ctx.fill();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${blockMass}kg`, 0, blockSize / 2 - 5);
      if (label) {
        ctx.font = "bold 8px ui-monospace";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(label, 0, blockSize / 2 + 7);
      }

      ctx.restore();

      return { bx, by };
    };

    // Main block or stacked blocks
    if (mode === "stack") {
      const blocks = stackedBlocksRef.current;
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const blockColor = BLOCK_COLORS[i % BLOCK_COLORS.length];
        drawBlock(
          block.posMeters * pxPerMeter,
          block.mass,
          block.size,
          blockColor.fill,
          blockColor.label,
          i,
        );
      }
    }

    // Draw main block (always visible except pure stack mode with blocks)
    const usableRampPx = Math.max(rampLen - 80, 10);
    const blockPosPx = Math.min(Math.max(posRef.current * pxPerMeter, 0), usableRampPx);
    const downUx = Math.cos(rad);
    const downUy = Math.sin(rad);
    const startOffsetPx = 30;
    const bx = rampTopX - downUx * startOffsetPx + downUx * blockPosPx;
    const by = rampTopY + downUy * startOffsetPx + downUy * blockPosPx;
    const blockSize = 36;

    if (mode !== "stack" || stackedBlocksRef.current.length === 0) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-rad);
      ctx.translate(0, -blockSize / 2);

      // Block shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(-blockSize / 2 + 3, 3, blockSize, blockSize, 4);
      ctx.fill();

      // Block
      const blockGrad = ctx.createLinearGradient(-blockSize / 2, 0, blockSize / 2, blockSize);
      blockGrad.addColorStop(0, "#3b82f6");
      blockGrad.addColorStop(1, "#1d4ed8");
      ctx.fillStyle = blockGrad;
      ctx.beginPath();
      ctx.roundRect(-blockSize / 2, 0, blockSize, blockSize, 4);
      ctx.fill();

      // Mass label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${mass}kg`, 0, blockSize / 2);

      ctx.restore();
    }

    // Force vectors
    if (showComponents && (mode !== "stack" || stackedBlocksRef.current.length === 0)) {
      const forceScale = 2;
      const mg = mass * g * forceScale;
      const mgSin = mg * Math.sin(rad);
      const mgCos = mg * Math.cos(rad);
      const fFriction = friction * mass * g * Math.cos(rad) * forceScale;
      const normal = mgCos;

      // Weight (mg) - straight down
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by + mg);
      ctx.stroke();
      drawArrowHead(ctx, bx, by + mg, 0, 1, "#ef4444");
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("mg", bx + 8, by + mg - 5);

      // mg sin(theta) - along ramp downward
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + mgSin * Math.cos(rad), by + mgSin * Math.sin(rad));
      ctx.stroke();
      ctx.setLineDash([]);
      drawArrowHead(ctx, bx + mgSin * Math.cos(rad), by + mgSin * Math.sin(rad), Math.cos(rad), Math.sin(rad), "#f97316");
      ctx.fillStyle = "#f97316";
      ctx.fillText("mg sin\u03b8", bx + mgSin * Math.cos(rad) + 5, by + mgSin * Math.sin(rad));

      // mg cos(theta) - perpendicular to ramp into surface
      const perpX = Math.sin(rad);
      const perpY = Math.cos(rad);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + perpX * mgCos, by + perpY * mgCos);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a855f7";
      ctx.textAlign = "left";
      ctx.fillText("mg cos\u03b8", bx + perpX * mgCos + 6, by + perpY * mgCos);

      // Normal force - perpendicular to ramp away from surface
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - perpX * normal, by - perpY * normal);
      ctx.stroke();
      drawArrowHead(ctx, bx - perpX * normal, by - perpY * normal, -perpX, -perpY, "#22c55e");
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "right";
      ctx.fillText("N", bx - perpX * normal - 5, by - perpY * normal - 5);

      // Friction force - along ramp upward (opposing motion)
      if (friction > 0) {
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - fFriction * Math.cos(rad), by - fFriction * Math.sin(rad));
        ctx.stroke();
        drawArrowHead(ctx, bx - fFriction * Math.cos(rad), by - fFriction * Math.sin(rad), -Math.cos(rad), -Math.sin(rad), "#eab308");
        ctx.fillStyle = "#eab308";
        ctx.textAlign = "left";
        ctx.fillText("f", bx - fFriction * Math.cos(rad) - 15, by - fFriction * Math.sin(rad) - 10);
      }
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now),
    );

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 200, 12, 188, friction > 0 ? 105 : 85, 8);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const legendItems = [
      { color: "#ef4444", label: "Weight (mg)" },
      { color: "#22c55e", label: "Normal force (N)" },
      { color: "#f97316", label: "mg sin(\u03b8)" },
    ];
    if (friction > 0) legendItems.push({ color: "#eab308", label: `Friction (\u03bc=${friction})` });

    legendItems.forEach((item, i) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(W - 188, 22 + i * 20, 12, 3);
      ctx.fillText(item.label, W - 170, 17 + i * 20);
    });

    // Net acceleration info
    const rawAccel = g * (Math.sin(rad) - friction * Math.cos(rad));
    const isStatic = rawAccel <= 0;
    const displayAccel = isStatic ? 0 : rawAccel;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const accelPanelH = isStatic ? 75 : 55;
    ctx.beginPath();
    ctx.roundRect(12, 12, 220, accelPanelH, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("NET ACCELERATION", 22, 20);
    ctx.font = "14px ui-monospace";
    ctx.fillStyle = isStatic ? "#fbbf24" : "#22c55e";
    ctx.fillText(`a = ${displayAccel.toFixed(2)} m/s\u00B2`, 22, 40);
    ctx.font = "10px system-ui";
    ctx.fillStyle = "#64748b";
    if (isStatic) {
      ctx.fillText("Static: friction sufficient", 22, 56);
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#475569";
      ctx.fillText(`(g sin\u03b8 \u2212 \u03bcg cos\u03b8 = ${rawAccel.toFixed(2)} m/s\u00B2)`, 22, 68);
    } else {
      ctx.fillText("Block slides down", 22, 56);
    }

    // Friction meter
    if (friction > 0) {
      const mgSinVal = mass * g * Math.sin(rad);
      const maxFrictionForce = friction * mass * g * Math.cos(rad);
      drawMeter(
        ctx, 12, accelPanelH + 20, 220, 10,
        mgSinVal, maxFrictionForce,
        mgSinVal > maxFrictionForce ? "#ef4444" : "#22c55e",
        `mg sin\u03b8 / \u03bcmg cos\u03b8 = ${(mgSinVal / Math.max(maxFrictionForce, 0.01)).toFixed(2)}`
      );
    }

    // Challenge scoreboards
    if (mode === "quiz" || mode === "critical") {
      renderScoreboard(ctx, 12, H - 120, 150, 110, challengeRef.current);
    }

    // Quiz result indicator
    if (mode === "quiz" && quizSubmitted) {
      const actualSlides = rawAccel > 0;
      const correct = (quizPrediction === "slides" && actualSlides) || (quizPrediction === "stays" && !actualSlides);

      ctx.fillStyle = correct ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)";
      ctx.beginPath();
      const resultW = 180;
      ctx.roundRect(W / 2 - resultW / 2, 40, resultW, 35, 8);
      ctx.fill();
      ctx.strokeStyle = correct ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = correct ? "#22c55e" : "#ef4444";
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(correct ? "CORRECT!" : "WRONG!", W / 2, 48);
      ctx.font = "10px ui-monospace";
      ctx.fillText(actualSlides ? "It slides!" : "It stays!", W / 2, 64);
    }

    // Mode badge
    if (mode !== "sandbox") {
      const labels: Record<SimMode, string> = {
        sandbox: "",
        quiz: "WILL IT SLIDE?",
        critical: "FIND CRITICAL ANGLE",
        stack: "STACK MODE",
      };
      const badgeText = labels[mode];
      const badgeColor = mode === "quiz" ? "#3b82f6" : mode === "critical" ? "#f59e0b" : "#a855f7";
      ctx.fillStyle = `${badgeColor}33`;
      ctx.beginPath();
      const badgeW = ctx.measureText(badgeText).width + 20;
      ctx.roundRect(W / 2 - badgeW / 2, H - 30, badgeW, 22, 6);
      ctx.fill();
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = badgeColor;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(badgeText, W / 2, H - 25);
    }

    // Drag hint for sandbox
    if (mode === "sandbox" && !isRunning) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "10px ui-monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("Drag ramp endpoint to change angle", W / 2, H - 15);
    }
  }, [angle, mass, friction, showComponents, mode, quizPrediction, quizSubmitted, criticalSubmitted, isRunning]);

  function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * 8 - dy * 4, y - dy * 8 + dx * 4);
    ctx.lineTo(x - dx * 8 + dy * 4, y - dy * 8 - dx * 4);
    ctx.closePath();
    ctx.fill();
  }

  const animate = useCallback(() => {
    const rad = (angle * Math.PI) / 180;
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    // Update particles
    particlesRef.current.update(dt);

    // Update main block
    const driveAccel = g * (Math.sin(rad) - friction * Math.cos(rad));
    if (driveAccel > 0) {
      velRef.current += driveAccel * dt;
      posRef.current += velRef.current * dt;

      // Emit trail particles while sliding
      if (Math.random() < 0.3) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rampLen = Math.min(canvas.width * 0.65, (canvas.height - 60) * 0.75 / Math.sin(Math.max(rad, 0.1)));
          const usableRampPx = Math.max(rampLen - 80, 10);
          const blockPosPx = Math.min(Math.max(posRef.current * pxPerMeter, 0), usableRampPx);
          const downUx = Math.cos(rad);
          const downUy = Math.sin(rad);
          const margin = 60;
          const rampBaseX = margin;
          const rampBaseY = canvas.height - margin;
          const rampTopX = rampBaseX + rampLen * Math.cos(rad);
          const rampTopY = rampBaseY - rampLen * Math.sin(rad);
          const startOffsetPx = 30;
          const bx2 = rampTopX - downUx * startOffsetPx + downUx * blockPosPx;
          const by2 = rampTopY + downUy * startOffsetPx + downUy * blockPosPx;
          particlesRef.current.emitSparks(bx2, by2, 2, "#fbbf24");
        }
      }

      // Check if block reached bottom of ramp
      const canvas = canvasRef.current;
      if (canvas) {
        const rampLen = Math.min(canvas.width * 0.65, (canvas.height - 60) * 0.75 / Math.sin(Math.max(rad, 0.1)));
        const usableRampPx = Math.max(rampLen - 80, 10);
        const maxPosMeters = usableRampPx / pxPerMeter;
        if (posRef.current >= maxPosMeters) {
          posRef.current = maxPosMeters;
          velRef.current = 0;
          setIsRunning(false);
          particlesRef.current.emitSparks(
            canvas.width * 0.65,
            canvas.height - 60,
            20,
            "#fbbf24"
          );
          playSFX("collision");
          draw();
          return;
        }
      }
    } else {
      velRef.current = 0;
    }

    // Update stacked blocks
    if (mode === "stack") {
      for (const block of stackedBlocksRef.current) {
        const blockAccel = g * (Math.sin(rad) - friction * Math.cos(rad));
        if (blockAccel > 0) {
          block.vel += blockAccel * dt;
          block.posMeters += block.vel * dt;
        } else {
          block.vel = 0;
        }
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [angle, friction, draw, mode]);

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

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      draw();
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate, draw]);

  // Drag to set angle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        if (isRunning) return false;
        const margin = 60;
        const rampBaseY = canvas.height - margin;
        const rad = (angle * Math.PI) / 180;
        const rampLen = Math.min(canvas.width * 0.65, (canvas.height * 0.75) / Math.sin(Math.max(rad, 0.1)));
        const rampBaseX = margin;
        const rampTopX = rampBaseX + rampLen * Math.cos(rad);
        const rampTopY = rampBaseY - rampLen * Math.sin(rad);

        // Check if near the ramp top endpoint
        const dist = Math.sqrt((x - rampTopX) ** 2 + (y - rampTopY) ** 2);
        if (dist < 40) {
          isDraggingAngleRef.current = true;
          return true;
        }
        return false;
      },
      onDrag: (x, y) => {
        if (!isDraggingAngleRef.current) return;
        const margin = 60;
        const rampBaseY = canvas.height - margin;
        const pivotX = margin + Math.min(canvas.width * 0.65, canvas.height * 0.75) * Math.cos((angle * Math.PI) / 180);
        // Calculate angle from pivot point (bottom-right of ramp)
        const dx = pivotX - x;
        const dy = rampBaseY - y;
        let newAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        newAngle = Math.max(5, Math.min(75, Math.round(newAngle)));
        setAngle(newAngle);
        posRef.current = 0;
        velRef.current = 0;
      },
      onDragEnd: () => {
        isDraggingAngleRef.current = false;
      },
    });

    return cleanup;
  }, [angle, isRunning]);

  const reset = () => {
    posRef.current = 0;
    velRef.current = 0;
    lastTsRef.current = null;
    particlesRef.current.clear();
    for (const block of stackedBlocksRef.current) {
      block.posMeters = 0;
      block.vel = 0;
    }
    draw();
  };

  const switchMode = (newMode: SimMode) => {
    reset();
    setMode(newMode);
    setIsRunning(false);
    challengeRef.current = createChallengeState();
    scorePopupsRef.current = [];
    setQuizPrediction(null);
    setQuizSubmitted(false);
    setCriticalGuess("");
    setCriticalSubmitted(false);
    stackedBlocksRef.current = [];
    if (newMode === "quiz") {
      randomizeQuiz();
    }
    if (newMode === "stack") {
      // Start with one block
      stackedBlocksRef.current = [{
        mass: 3,
        color: BLOCK_COLORS[0].fill[0],
        posMeters: 0,
        vel: 0,
        size: 30,
        label: "A",
      }];
    }
  };

  const submitQuizAnswer = () => {
    if (!quizPrediction) return;
    const rad = (angle * Math.PI) / 180;
    const rawAccel = g * (Math.sin(rad) - friction * Math.cos(rad));
    const actualSlides = rawAccel > 0;
    const correct = (quizPrediction === "slides" && actualSlides) || (quizPrediction === "stays" && !actualSlides);

    const points = correct ? 3 : 0;
    const result = {
      points,
      tier: correct ? "perfect" as const : "miss" as const,
      label: correct ? "Correct!" : "Wrong!",
    };
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / 2 : 300;
    const cy = canvas ? canvas.height / 2 : 200;
    scorePopupsRef.current.push({
      text: result.label,
      points,
      x: cx,
      y: cy - 40,
      startTime: performance.now(),
    });

    if (correct) {
      playSFX("correct");
      playScore(3);
      particlesRef.current.emitConfetti(cx, cy, 25);
    } else {
      playSFX("incorrect");
    }

    setQuizSubmitted(true);

    // Show the actual sliding
    if (actualSlides) {
      setTimeout(() => {
        lastTsRef.current = null;
        setIsRunning(true);
      }, 500);
    }

    // Next question after delay
    setTimeout(() => {
      randomizeQuiz();
      reset();
    }, 3000);
  };

  const submitCriticalAngle = () => {
    const predicted = parseFloat(criticalGuess);
    if (isNaN(predicted) || predicted < 0 || predicted > 90) return;

    const actualCritical = Math.atan(friction) * 180 / Math.PI;
    const error = Math.abs(predicted - actualCritical);

    let points = 0;
    let label = "Try Again";
    if (error < 0.5) {
      points = 3;
      label = "Perfect!";
    } else if (error < 1.5) {
      points = 2;
      label = "Great!";
    } else if (error < 3) {
      points = 2;
      label = "Good!";
    } else if (error < 5) {
      points = 1;
      label = "Close!";
    }

    const result = {
      points,
      tier: points >= 3 ? "perfect" as const : points >= 2 ? "good" as const : points >= 1 ? "close" as const : "miss" as const,
      label,
    };
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / 2 : 300;
    const cy = canvas ? canvas.height / 2 : 200;
    scorePopupsRef.current.push({
      text: `${label} (${actualCritical.toFixed(1)}\u00B0)`,
      points,
      x: cx,
      y: cy - 40,
      startTime: performance.now(),
    });

    if (points > 0) {
      playSFX("correct");
      playScore(points);
    } else {
      playSFX("incorrect");
    }

    setCriticalSubmitted(true);

    // Set angle to critical to demonstrate
    setTimeout(() => {
      setAngle(Math.round(actualCritical));
    }, 500);

    // New friction for next round
    setTimeout(() => {
      const newFriction = Math.round((0.1 + Math.random() * 0.8) * 20) / 20;
      setFriction(newFriction);
      setCriticalGuess("");
      setCriticalSubmitted(false);
      setAngle(30);
      reset();
    }, 3000);
  };

  const addStackBlock = () => {
    const count = stackedBlocksRef.current.length;
    if (count >= 5) return;
    const newMass = 1 + Math.round(Math.random() * 9);
    stackedBlocksRef.current.push({
      mass: newMass,
      color: BLOCK_COLORS[count % BLOCK_COLORS.length].fill[0],
      posMeters: 0,
      vel: 0,
      size: 26 + Math.random() * 10,
      label: BLOCK_COLORS[count % BLOCK_COLORS.length].label,
    });
    playSFX("pop");
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-grab" />
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Game Mode
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => switchMode("sandbox")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "sandbox"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Sandbox
          </button>
          <button
            onClick={() => switchMode("quiz")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "quiz"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Will It Slide?
          </button>
          <button
            onClick={() => switchMode("critical")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "critical"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Critical Angle
          </button>
          <button
            onClick={() => switchMode("stack")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "stack"
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Stack Objects
          </button>
        </div>
        {mode === "quiz" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Given the angle and friction coefficient, predict whether the block will slide or stay put. 3 points for correct answers!
          </p>
        )}
        {mode === "critical" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Find the exact angle where the block begins to slide. The critical angle is arctan(mu). Enter your prediction in degrees.
          </p>
        )}
        {mode === "stack" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Place multiple objects on the ramp and watch them slide together. Add up to 5 blocks.
          </p>
        )}
      </div>

      {/* Quiz prediction */}
      {mode === "quiz" && !quizSubmitted && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Angle: {angle}&deg; | Friction (&mu;): {friction.toFixed(2)} -- Will the block slide?
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setQuizPrediction("slides")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                quizPrediction === "slides"
                  ? "bg-red-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              It Slides!
            </button>
            <button
              onClick={() => setQuizPrediction("stays")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                quizPrediction === "stays"
                  ? "bg-green-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              It Stays!
            </button>
            <button
              onClick={submitQuizAnswer}
              disabled={!quizPrediction}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Critical angle input */}
      {mode === "critical" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Friction (&mu;): {friction.toFixed(2)} -- Critical angle = ? degrees
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              max="90"
              value={criticalGuess}
              onChange={(e) => setCriticalGuess(e.target.value)}
              disabled={criticalSubmitted}
              placeholder="Enter critical angle..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono"
            />
            <button
              onClick={submitCriticalAngle}
              disabled={criticalSubmitted || !criticalGuess}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors"
            >
              {criticalSubmitted ? "Submitted" : "Check"}
            </button>
          </div>
          {criticalSubmitted && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              New friction value coming in 3 seconds...
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ramp Angle</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={5} max={75} value={angle}
              onChange={(e) => { setAngle(Number(e.target.value)); reset(); }}
              disabled={mode === "quiz"}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{angle}&deg;</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={20} value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{mass} kg</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Friction (&mu;)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={1} step={0.05} value={friction}
              onChange={(e) => { setFriction(Number(e.target.value)); reset(); }}
              disabled={mode === "quiz" || mode === "critical"}
              className="flex-1 accent-yellow-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{friction.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setShowComponents(!showComponents)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showComponents ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Forces
          </button>
          {mode === "stack" ? (
            <button onClick={addStackBlock}
              disabled={stackedBlocksRef.current.length >= 5}
              className="h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors">
              + Block
            </button>
          ) : (
            <button onClick={() => {
              if (!isRunning) {
                lastTsRef.current = null;
                reset();
              }
              setIsRunning(!isRunning);
            }}
              className="h-10 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
              {isRunning ? "Stop" : "Slide"}
            </button>
          )}
        </div>
      </div>

      {/* Score and actions row */}
      {(mode === "quiz" || mode === "critical") && (
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
                {challengeRef.current.attempts} attempts
              </p>
              {challengeRef.current.streak > 0 && (
                <p className="text-xs text-amber-500 font-medium">
                  Streak: {challengeRef.current.streak}
                </p>
              )}
              {challengeRef.current.attempts > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Accuracy: {Math.round((challengeRef.current.score / (challengeRef.current.attempts * 3)) * 100)}%
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stack controls row */}
      {mode === "stack" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
              reset();
            }
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-10 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
            {isRunning ? "Stop" : "Slide All"}
          </button>
          <button onClick={() => { stackedBlocksRef.current = []; reset(); draw(); }}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Clear Blocks
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
            {stackedBlocksRef.current.length}/5 blocks
          </span>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="a = g(\sin\theta - \mu\cos\theta)" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="N = mg\cos\theta" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\theta_c = \arctan(\mu)" /></div>
        </div>
      </div>
    </div>
  );
}
