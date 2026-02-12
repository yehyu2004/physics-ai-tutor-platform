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
import { SimMath } from "@/components/simulations/SimMath";

interface Vec {
  x: number;
  y: number;
  color: string;
  label: string;
}

type ChallengeMode = "free" | "match" | "timed";

interface TargetResultant {
  x: number;
  y: number;
}

export default function VectorAddition() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vectors, setVectors] = useState<Vec[]>([
    { x: 120, y: -80, color: "#ef4444", label: "A" },
    { x: 80, y: 60, color: "#3b82f6", label: "B" },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [showComponents, setShowComponents] = useState(true);
  const [showCrossProduct, setShowCrossProduct] = useState(false);

  // Challenge state
  const [mode, setMode] = useState<ChallengeMode>("free");
  const [challenge, setChallenge] = useState<ChallengeState>(createChallengeState());
  const [target, setTarget] = useState<TargetResultant | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const popupsRef = useRef<ScorePopup[]>([]);
  const particleSystemRef = useRef(new ParticleSystem());

  // Timer state
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const [timedScore, setTimedScore] = useState(0);
  const [timedSolved, setTimedSolved] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animation
  const animRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);
  const pulseRef = useRef(0);

  const generateTarget = useCallback(() => {
    // Generate a target resultant that's achievable with 2 vectors
    const tx = Math.round((Math.random() - 0.5) * 300);
    const ty = Math.round((Math.random() - 0.5) * 250);
    setTarget({ x: tx, y: ty });
    setSubmitted(false);
    // Reset vectors to random starting positions
    setVectors([
      {
        x: 50 + Math.round(Math.random() * 100),
        y: -20 - Math.round(Math.random() * 80),
        color: "#ef4444",
        label: "A",
      },
      {
        x: 30 + Math.round(Math.random() * 80),
        y: 20 + Math.round(Math.random() * 60),
        color: "#3b82f6",
        label: "B",
      },
    ]);
  }, []);

  const checkAnswer = useCallback(() => {
    if (!target || submitted) return;
    setSubmitted(true);

    const rx = vectors.reduce((s, v) => s + v.x, 0);
    const ry = vectors.reduce((s, v) => s + v.y, 0);

    const dx = rx - target.x;
    const dy = ry - (-target.y); // target.y is in canvas coords (inverted)
    const error = Math.sqrt(dx * dx + dy * dy);
    const targetMag = Math.sqrt(target.x * target.x + target.y * target.y);

    calculateAccuracy(0, error, Math.max(targetMag, 50));

    // Invert: smaller error = better score
    let finalResult;
    if (error < 15) {
      finalResult = { points: 3, tier: "perfect" as const, label: "Perfect!" };
    } else if (error < 35) {
      finalResult = { points: 2, tier: "great" as const, label: "Great!" };
    } else if (error < 60) {
      finalResult = { points: 2, tier: "good" as const, label: "Good!" };
    } else if (error < 100) {
      finalResult = { points: 1, tier: "close" as const, label: "Close!" };
    } else {
      finalResult = { points: 0, tier: "miss" as const, label: "Try Again" };
    }

    setChallenge((prev) => updateChallengeState(prev, finalResult));

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${finalResult.label} (err: ${error.toFixed(0)}px)`,
        points: finalResult.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
      if (finalResult.points >= 2) {
        particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height * 0.4, 20);
      }
    }

    if (finalResult.points > 0) {
      playSFX("correct");
      playScore(finalResult.points);
    } else {
      playSFX("incorrect");
    }

    // In timed mode, auto-advance
    if (mode === "timed" && finalResult.points > 0) {
      setTimedScore((prev) => prev + finalResult.points);
      setTimedSolved((prev) => prev + 1);
      setTimeout(() => generateTarget(), 800);
    }
  }, [target, submitted, vectors, mode, generateTarget]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const ox = W * 0.3;
    const oy = H * 0.55;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = ox % 40; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = oy % 40; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(W, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, H);
    ctx.stroke();

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.fillText("x", W - 15, oy - 8);
    ctx.fillText("y", ox + 12, 15);

    const drawArrowFn = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      color: string,
      label: string,
      lw: number
    ) => {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // Arrowhead
      const nx = dx / mag;
      const ny = dy / mag;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - nx * 12 - ny * 5, toY - ny * 12 + nx * 5);
      ctx.lineTo(toX - nx * 12 + ny * 5, toY - ny * 12 - nx * 5);
      ctx.closePath();
      ctx.fill();

      // Label
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      ctx.font = "bold 14px system-ui";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX - ny * 18, midY + nx * 18);
    };

    // Target resultant (in challenge modes)
    if (target && (mode === "match" || mode === "timed")) {
      const targetTipX = ox + target.x;
      const targetTipY = oy - target.y;

      // Pulsing target marker
      drawTarget(ctx, targetTipX, targetTipY, 18, "#f59e0b", pulseRef.current);

      // Target arrow (dashed)
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(targetTipX, targetTipY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Target label
      const tMag = Math.sqrt(target.x * target.x + target.y * target.y);
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText(
        `Target: (${target.x}, ${target.y}) |T|=${tMag.toFixed(0)}`,
        targetTipX + 22,
        targetTipY - 5
      );
    }

    // Components (dashed)
    if (showComponents) {
      vectors.forEach((v) => {
        ctx.strokeStyle = v.color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        // x-component
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + v.x, oy);
        ctx.stroke();
        // y-component
        ctx.beginPath();
        ctx.moveTo(ox + v.x, oy);
        ctx.lineTo(ox + v.x, oy + v.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
    }

    // Draw individual vectors from origin
    vectors.forEach((v) => {
      drawArrowFn(ox, oy, ox + v.x, oy + v.y, v.color, v.label, 3);

      // Dot at tip (drag handle)
      const tipX = ox + v.x;
      const tipY = oy + v.y;

      // Glow on drag handle
      const handleGlow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 14);
      handleGlow.addColorStop(0, v.color);
      handleGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = handleGlow;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 14, 0, Math.PI * 2);
      ctx.fill();

      // Solid dot
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Grip indicator
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2299", tipX, tipY);
    });

    // Resultant (tail-to-tip method shown)
    const rx = vectors.reduce((s, v) => s + v.x, 0);
    const ry = vectors.reduce((s, v) => s + v.y, 0);

    // Show tail-to-tip
    ctx.globalAlpha = 0.25;
    let tipX = ox;
    let tipY = oy;
    vectors.forEach((v) => {
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + v.x, tipY + v.y);
      ctx.stroke();
      tipX += v.x;
      tipY += v.y;
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Resultant
    drawArrowFn(ox, oy, ox + rx, oy + ry, "#a855f7", "R", 3.5);

    // Glow on resultant tip
    const rGlow = ctx.createRadialGradient(ox + rx, oy + ry, 0, ox + rx, oy + ry, 20);
    rGlow.addColorStop(0, "rgba(168,85,247,0.3)");
    rGlow.addColorStop(1, "rgba(168,85,247,0)");
    ctx.fillStyle = rGlow;
    ctx.beginPath();
    ctx.arc(ox + rx, oy + ry, 20, 0, Math.PI * 2);
    ctx.fill();

    // Cross product visualization (3D perspective)
    if (showCrossProduct && vectors.length >= 2) {
      const a = vectors[0];
      const b = vectors[1];
      // Cross product in 2D: A x B = Ax*By - Ay*Bx (z-component only)
      const crossZ = a.x * b.y - a.y * b.x;
      const crossMag = Math.abs(crossZ);
      const crossSign = crossZ > 0 ? 1 : -1;

      // Draw parallelogram area
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = crossSign > 0 ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + a.x, oy + a.y);
      ctx.lineTo(ox + a.x + b.x, oy + a.y + b.y);
      ctx.lineTo(ox + b.x, oy + b.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // Parallelogram outline
      ctx.strokeStyle = crossSign > 0 ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(ox + a.x, oy + a.y);
      ctx.lineTo(ox + a.x + b.x, oy + a.y + b.y);
      ctx.lineTo(ox + b.x, oy + b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Z-axis indicator (perspective arrow going "out of" or "into" screen)
      const centerX = ox;
      const centerY = oy;
      if (crossSign > 0) {
        // Out of screen (dot)
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(centerX - 20, centerY - 20, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX - 20, centerY - 20, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(centerX - 20, centerY - 20, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Into screen (cross)
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX - 20, centerY - 20, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX - 25, centerY - 25);
        ctx.lineTo(centerX - 15, centerY - 15);
        ctx.moveTo(centerX - 15, centerY - 25);
        ctx.lineTo(centerX - 25, centerY - 15);
        ctx.stroke();
      }

      // Cross product label
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = crossSign > 0 ? "#22c55e" : "#ef4444";
      ctx.textAlign = "left";
      ctx.fillText(
        `A x B = ${(-crossZ).toFixed(0)} z-hat  (${crossSign > 0 ? "into" : "out of"} screen)`,
        centerX - 20,
        centerY - 36
      );
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(`|A x B| = ${crossMag.toFixed(0)} (area)`, centerX - 20, centerY - 48);
    }

    // Info panel
    const rMag = Math.sqrt(rx * rx + ry * ry);
    const rAngle = (Math.atan2(-ry, rx) * 180) / Math.PI;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 220, 12, 208, 120 + (showCrossProduct ? 20 : 0), 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("VECTOR DATA", W - 208, 20);

    ctx.font = "11px ui-monospace";
    vectors.forEach((v, i) => {
      const mag = Math.sqrt(v.x * v.x + v.y * v.y);
      const ang = (Math.atan2(-v.y, v.x) * 180) / Math.PI;
      ctx.fillStyle = v.color;
      ctx.fillText(
        `${v.label}: (${v.x.toFixed(0)}, ${(-v.y).toFixed(0)})  |${v.label}|=${mag.toFixed(0)}  \u03B8=${ang.toFixed(0)}\u00B0`,
        W - 208,
        38 + i * 18
      );
    });
    ctx.fillStyle = "#a855f7";
    ctx.fillText(
      `R: (${rx.toFixed(0)}, ${(-ry).toFixed(0)})  |R|=${rMag.toFixed(0)}  \u03B8=${rAngle.toFixed(0)}\u00B0`,
      W - 208,
      38 + vectors.length * 18
    );

    // Dot product
    if (vectors.length >= 2) {
      const dot = vectors[0].x * vectors[1].x + vectors[0].y * vectors[1].y;
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`A\u00B7B = ${dot.toFixed(0)}`, W - 208, 38 + (vectors.length + 1) * 18);

      if (showCrossProduct) {
        const crossZ = vectors[0].x * vectors[1].y - vectors[0].y * vectors[1].x;
        ctx.fillStyle = "#22c55e";
        ctx.fillText(
          `A\u00D7B = ${(-crossZ).toFixed(0)} z\u0302`,
          W - 208,
          38 + (vectors.length + 2) * 18
        );
      }
    }

    // Scoreboard (challenge modes)
    if (mode === "match" || mode === "timed") {
      renderScoreboard(ctx, 12, 12, 140, 100, challenge);
    }

    // Timed mode timer display
    if (mode === "timed" && timerActive) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, 120, 140, 50, 8);
      ctx.fill();

      ctx.font = "bold 20px ui-monospace, monospace";
      ctx.fillStyle = timeLeft <= 5 ? "#ef4444" : "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText(`${timeLeft}s`, 82, 145);

      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`Solved: ${timedSolved}`, 82, 162);
    }

    // Accuracy indicator (how close resultant is to target)
    if (target && (mode === "match" || mode === "timed") && !submitted) {
      const errX = rx - target.x;
      const errY = ry - (-target.y);
      const err = Math.sqrt(errX * errX + errY * errY);
      const maxErr = 200;
      const accuracy = Math.max(0, Math.min(100, 100 - (err / maxErr) * 100));

      // Accuracy bar at bottom of canvas
      const barX = W * 0.35;
      const barY = H - 20;
      const barW = W * 0.3;
      const barH = 8;

      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.fill();

      const fillW = (accuracy / 100) * barW;
      const barColor =
        accuracy > 80 ? "#22c55e" : accuracy > 50 ? "#f59e0b" : "#ef4444";
      if (fillW > 0) {
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, fillW, barH, 4);
        ctx.fill();
      }

      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = barColor;
      ctx.textAlign = "center";
      ctx.fillText(`Accuracy: ${accuracy.toFixed(0)}%`, barX + barW / 2, barY - 5);
    }

    // Render particles
    particleSystemRef.current.draw(ctx);

    // Render popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Instructions
    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "left";
    ctx.fillText("Drag arrow tips to reposition vectors", 15, H - 8);
  }, [vectors, showComponents, showCrossProduct, mode, target, submitted, challenge, timeLeft, timerActive, timedSolved]);

  // Animation loop
  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) lastTsRef.current = now;
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    pulseRef.current = ((now / 1000) % 1);

    particleSystemRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

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

  // Timer for timed mode
  useEffect(() => {
    if (mode === "timed" && timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            playSFX("fail");
            return 0;
          }
          if (prev <= 6) playSFX("tick");
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [mode, timerActive, timeLeft]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ox = canvas.width * 0.3;
    const oy = canvas.height * 0.55;

    for (let i = 0; i < vectors.length; i++) {
      const tipX = ox + vectors[i].x;
      const tipY = oy + vectors[i].y;
      if (Math.sqrt((mx - tipX) ** 2 + (my - tipY) ** 2) < 18) {
        setDragging(i);
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ox = canvas.width * 0.3;
    const oy = canvas.height * 0.55;

    setVectors((prev) =>
      prev.map((v, i) => (i === dragging ? { ...v, x: mx - ox, y: my - oy } : v))
    );
  };

  const handleMouseUp = () => setDragging(null);

  const addVector = () => {
    const colors = ["#22c55e", "#f59e0b", "#ec4899", "#06b6d4"];
    const labels = ["C", "D", "E", "F"];
    const idx = vectors.length - 2;
    if (idx >= colors.length) return;
    setVectors((prev) => [
      ...prev,
      {
        x: 60 + Math.random() * 80,
        y: -40 - Math.random() * 60,
        color: colors[idx],
        label: labels[idx],
      },
    ]);
  };

  const switchMode = (newMode: ChallengeMode) => {
    setMode(newMode);
    setChallenge(createChallengeState());
    setTarget(null);
    setSubmitted(false);
    setTimerActive(false);
    setTimeLeft(30);
    setTimedScore(0);
    setTimedSolved(0);
    popupsRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);

    if (newMode === "match") {
      generateTarget();
    }
    if (newMode === "timed") {
      generateTarget();
      setTimeLeft(30);
      setTimerActive(true);
    }
    if (newMode === "free") {
      setVectors([
        { x: 120, y: -80, color: "#ef4444", label: "A" },
        { x: 80, y: 60, color: "#3b82f6", label: "B" },
      ]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => switchMode("free")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "free"
              ? "bg-blue-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Free Exploration
        </button>
        <button
          onClick={() => switchMode("match")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "match"
              ? "bg-amber-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Match the Resultant
        </button>
        <button
          onClick={() => switchMode("timed")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "timed"
              ? "bg-red-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Timed Challenge
        </button>
      </div>

      {/* Challenge controls */}
      {mode === "match" && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
            Match the Resultant
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            Drag the vector tips so that the resultant R matches the yellow target. The accuracy bar
            at the bottom shows how close you are.
          </p>
          <div className="flex items-center gap-3">
            {!submitted ? (
              <button
                onClick={checkAnswer}
                className="px-6 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
              >
                Submit Answer
              </button>
            ) : (
              <button
                onClick={generateTarget}
                className="px-6 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
              >
                Next Challenge
              </button>
            )}
            <span className="text-sm font-mono text-amber-600 dark:text-amber-400">
              Score: {challenge.score} | Streak: {challenge.streak}
            </span>
          </div>
        </div>
      )}

      {mode === "timed" && (
        <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-4">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
            Timed Challenge
          </h3>
          {timerActive ? (
            <>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                Match as many targets as possible before time runs out! The answer auto-submits when
                close enough.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={checkAnswer}
                  disabled={submitted}
                  className="px-6 h-10 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white text-sm font-medium transition-colors"
                >
                  Submit
                </button>
                <span className="text-sm font-mono text-red-600 dark:text-red-400">
                  Time: {timeLeft}s | Solved: {timedSolved} | Score: {timedScore}
                </span>
              </div>
            </>
          ) : timeLeft === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700 dark:text-red-300">
                Time is up! You solved {timedSolved} challenges and scored {timedScore} points.
              </p>
              <button
                onClick={() => switchMode("timed")}
                className="px-6 h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                Play Again
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                generateTarget();
                setTimeLeft(30);
                setTimerActive(true);
                setTimedScore(0);
                setTimedSolved(0);
              }}
              className="px-6 h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
            >
              Start Timer
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowComponents(!showComponents)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showComponents
              ? "bg-blue-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Components {showComponents ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => setShowCrossProduct(!showCrossProduct)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showCrossProduct
              ? "bg-green-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Cross Product {showCrossProduct ? "ON" : "OFF"}
        </button>
        {mode === "free" && (
          <>
            <button
              onClick={addVector}
              disabled={vectors.length >= 6}
              className="px-4 h-10 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors"
            >
              + Add Vector
            </button>
            <button
              onClick={() =>
                setVectors(vectors.slice(0, Math.max(2, vectors.length - 1)))
              }
              disabled={vectors.length <= 2}
              className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors disabled:opacity-40"
            >
              Remove Last
            </button>
            <button
              onClick={() =>
                setVectors([
                  { x: 120, y: -80, color: "#ef4444", label: "A" },
                  { x: 80, y: 60, color: "#3b82f6", label: "B" },
                ])
              }
              className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Reset
            </button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Vector Operations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            R = A + B (component-wise)
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            |R| = sqrt(Rx^2 + Ry^2)
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            A*B = |A||B|cos(theta)
          </div>
          {showCrossProduct && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              A x B = |A||B|sin(theta) z-hat
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\vec{R} = \vec{A} + \vec{B}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="R = \sqrt{R_x^2 + R_y^2}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\theta = \arctan(R_y/R_x)" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Drag vector tips to change magnitude and direction. Use component view to see x and y projections.
      </p>
    </div>
  );
}
