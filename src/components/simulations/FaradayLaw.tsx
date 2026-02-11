"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  createChallengeState,
  updateChallengeState,
  renderScoreboard,
  renderScorePopup,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawInfoPanel, drawMeter } from "@/lib/simulation/drawing";
import { createDragHandler, isPointInRect } from "@/lib/simulation/interaction";

export default function FaradayLaw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [coilTurns, setCoilTurns] = useState(5);
  const [isRunning, setIsRunning] = useState(true);
  const [magnetSpeed, setMagnetSpeed] = useState(1.0);
  const [mode, setMode] = useState<"auto" | "drag">("auto");
  const [challengeActive, setChallengeActive] = useState(false);

  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; emf: number; flux: number }[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());

  // Drag state
  const magnetPosRef = useRef({ x: 0, y: 0 });
  const prevMagnetXRef = useRef(0);
  const magnetVelRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Challenge state
  const targetEmfRef = useRef(10);
  const peakEmfRef = useRef(0);
  const challengeTimerRef = useRef(0);
  const challengeRoundActiveRef = useRef(false);

  // Spark accumulator
  const sparkAccRef = useRef(0);

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

    const coilX = W * 0.4;
    const coilY = H * 0.4;
    const coilH = 100;
    const coilW = 60;

    // Get magnet position
    let magnetX: number;
    let magnetY: number;
    if (mode === "drag" && isDraggingRef.current) {
      magnetX = magnetPosRef.current.x;
      magnetY = magnetPosRef.current.y;
    } else if (mode === "drag") {
      magnetX = magnetPosRef.current.x || coilX + 180;
      magnetY = magnetPosRef.current.y || coilY;
    } else {
      magnetX = coilX + Math.sin(t * magnetSpeed * 2) * 160;
      magnetY = coilY;
    }

    // Update stored position for drag mode
    magnetPosRef.current.x = magnetX;
    magnetPosRef.current.y = magnetY;

    // Velocity calculation
    const velocity = (magnetX - prevMagnetXRef.current) / 0.016;
    magnetVelRef.current = velocity;
    prevMagnetXRef.current = magnetX;

    // Flux calculation (depends on magnet distance from coil center)
    const dx = magnetX - coilX;
    const dy = magnetY - coilY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const flux = coilTurns * 100 / (1 + (dist / 60) * (dist / 60));
    const prevFlux =
      historyRef.current.length > 0
        ? historyRef.current[historyRef.current.length - 1].flux
        : flux;
    const emf = -(flux - prevFlux) / 0.016 * 0.01;
    const absEmf = Math.abs(emf);

    // ---- Draw magnetic field lines (background) ----
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const yOff = (i - 3.5) * 14;
      ctx.beginPath();
      for (let xp = magnetX - 120; xp < magnetX + 120; xp += 3) {
        const ddx = xp - magnetX;
        const fieldY = magnetY + yOff + ddx * ddx * 0.001 * (yOff > 0 ? 1 : -1);
        if (xp === magnetX - 120) ctx.moveTo(xp, fieldY);
        else ctx.lineTo(xp, fieldY);
      }
      ctx.stroke();
    }

    // ---- Coil ----
    const coilGlow = Math.min(1, absEmf / 15);
    ctx.strokeStyle = `rgba(245,158,11,${0.6 + coilGlow * 0.4})`;
    ctx.lineWidth = 3;
    if (coilGlow > 0.3) {
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = coilGlow * 20;
    }
    for (let i = 0; i < coilTurns; i++) {
      const offset = (i - coilTurns / 2) * 8;
      ctx.beginPath();
      ctx.ellipse(coilX + offset, coilY, coilW / 2, coilH / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Coil label
    ctx.fillStyle = "#f59e0b";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${coilTurns} turns`, coilX, coilY + coilH / 2 + 20);

    // ---- Magnet ----
    const magW = 80;
    const magH = 40;

    // Magnet glow when moving fast
    const speedFraction = Math.min(1, Math.abs(velocity) / 800);
    if (speedFraction > 0.2) {
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = speedFraction * 15;
    }

    // N pole
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(magnetX - magW / 2, magnetY - magH / 2, magW / 2, magH, [6, 0, 0, 6]);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", magnetX - magW / 4, magnetY);

    // S pole
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(magnetX, magnetY - magH / 2, magW / 2, magH, [0, 6, 6, 0]);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText("S", magnetX + magW / 4, magnetY);
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";

    // Drag hint in drag mode
    if (mode === "drag" && !isDraggingRef.current) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Drag the magnet!", magnetX, magnetY - magH / 2 - 12);
    }

    // ---- Speed indicator ----
    const speedBarX = 15;
    const speedBarY = 15;
    drawInfoPanel(ctx, speedBarX, speedBarY, 170, 78, "Magnet Velocity", [
      {
        label: "Speed",
        value: `${Math.abs(velocity).toFixed(0)} px/s`,
        color: speedFraction > 0.6 ? "#ef4444" : speedFraction > 0.3 ? "#f59e0b" : "#22c55e",
      },
      { label: "EMF", value: `${absEmf.toFixed(2)} V`, color: "#22c55e" },
      { label: "Flux", value: `${flux.toFixed(1)} Wb`, color: "#3b82f6" },
    ]);

    // Speed meter bar
    drawMeter(ctx, speedBarX + 10, speedBarY + 68, 150, 6, Math.abs(velocity), 800,
      speedFraction > 0.6 ? "#ef4444" : "#22c55e");

    // ---- Particle effects: electric sparks when EMF is high ----
    if (absEmf > 3) {
      sparkAccRef.current += absEmf * 0.15;
      if (sparkAccRef.current > 1) {
        const sparkCount = Math.min(8, Math.floor(sparkAccRef.current));
        // Spark at coil ends
        const sparkColor = absEmf > 10 ? "#fbbf24" : "#60a5fa";
        particlesRef.current.emitSparks(
          coilX + (Math.random() - 0.5) * coilTurns * 8,
          coilY + (Math.random() - 0.5) * coilH,
          sparkCount,
          sparkColor
        );
        sparkAccRef.current = 0;
      }
    }

    // High EMF glow on coil area
    if (absEmf > 5) {
      const glowIntensity = Math.min(0.3, (absEmf - 5) / 30);
      const grad = ctx.createRadialGradient(coilX, coilY, 10, coilX, coilY, 80);
      grad.addColorStop(0, `rgba(251,191,36,${glowIntensity})`);
      grad.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(coilX, coilY, 80, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // ---- EMF indicator (galvanometer) ----
    const galX = coilX;
    const galY = H * 0.82;
    const galR = 30;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.arc(galX, galY, galR + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(galX, galY, galR, Math.PI, 0);
    ctx.stroke();

    // Needle
    const clampedEmf = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, emf * 0.3));
    const needleAngle = Math.PI + clampedEmf;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(galX, galY);
    ctx.lineTo(
      galX + Math.cos(needleAngle) * (galR - 5),
      galY + Math.sin(needleAngle) * (galR - 5)
    );
    ctx.stroke();

    // Scale marks
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    for (let a = -4; a <= 4; a++) {
      const angle = Math.PI + (a / 4) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(
        galX + Math.cos(angle) * (galR - 3),
        galY + Math.sin(angle) * (galR - 3)
      );
      ctx.lineTo(
        galX + Math.cos(angle) * galR,
        galY + Math.sin(angle) * galR
      );
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("EMF", galX, galY + 12);

    // Wires connecting coil to galvanometer
    const wireGlow = Math.min(0.8, absEmf / 20);
    ctx.strokeStyle = `rgba(100,116,139,${0.6 + wireGlow * 0.4})`;
    ctx.lineWidth = 1.5;
    if (wireGlow > 0.3) {
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = wireGlow * 8;
    }
    ctx.beginPath();
    ctx.moveTo(coilX - coilTurns * 4, coilY + coilH / 2);
    ctx.lineTo(coilX - coilTurns * 4, galY);
    ctx.lineTo(galX - galR, galY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coilX + coilTurns * 4, coilY + coilH / 2);
    ctx.lineTo(coilX + coilTurns * 4, galY + 15);
    ctx.lineTo(galX + galR, galY + 15);
    ctx.lineTo(galX + galR, galY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ---- Graph on right side ----
    const graphX = W * 0.6;
    const graphW2 = W - graphX - 20;
    const graphH2 = H * 0.35;

    const history = historyRef.current;

    // Flux graph
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX, 15, graphW2, graphH2, 6);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText("Magnetic Flux \u03A6", graphX + 8, 30);

    if (history.length > 1) {
      const maxT2 = Math.max(t, 5);
      const maxFlux = coilTurns * 100 + 10;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + 5 + (history[i].t / maxT2) * (graphW2 - 10);
        const py = 15 + graphH2 - 5 - (history[i].flux / maxFlux) * (graphH2 - 20);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // EMF graph
    const emfGraphY = 20 + graphH2 + 15;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX, emfGraphY, graphW2, graphH2, 6);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#22c55e";
    ctx.fillText("Induced EMF (\u03B5 = \u2212d\u03A6/dt)", graphX + 8, emfGraphY + 15);

    if (history.length > 1) {
      const maxT2 = Math.max(t, 5);
      const maxEmf = coilTurns * 3 + 5;
      // Zero line
      const zeroY = emfGraphY + graphH2 / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX + 5, zeroY);
      ctx.lineTo(graphX + graphW2 - 5, zeroY);
      ctx.stroke();

      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + 5 + (history[i].t / maxT2) * (graphW2 - 10);
        const py = zeroY - (history[i].emf / maxEmf) * (graphH2 / 2 - 15);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // ---- Challenge mode overlay ----
    if (challengeRef.current.active) {
      // Scoreboard
      renderScoreboard(ctx, W - 170, H - 130, 155, 120, challengeRef.current);

      // Target EMF indicator
      const targetEmf = targetEmfRef.current;
      const peak = peakEmfRef.current;
      const cTimerLeft = Math.max(0, 5 - challengeTimerRef.current);

      // Target panel
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(graphX, emfGraphY + graphH2 + 15, graphW2, 50, 6);
      ctx.fill();

      ctx.font = "bold 12px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(`TARGET EMF: ${targetEmf.toFixed(1)} V`, graphX + 10, emfGraphY + graphH2 + 35);

      // Peak EMF bar
      drawMeter(ctx, graphX + 10, emfGraphY + graphH2 + 42, graphW2 - 20, 8,
        peak, targetEmf * 1.5,
        peak >= targetEmf * 0.9 ? "#22c55e" : "#3b82f6",
        `Peak: ${peak.toFixed(1)} V`);

      // Timer
      if (challengeRoundActiveRef.current) {
        ctx.fillStyle = cTimerLeft < 2 ? "#ef4444" : "#94a3b8";
        ctx.font = "10px ui-monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${cTimerLeft.toFixed(1)}s`, graphX + graphW2 - 5, emfGraphY + graphH2 + 35);
      }
    }

    // ---- Score popups ----
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [coilTurns, magnetSpeed, mode]);

  const animate = useCallback(() => {
    const dt = 0.016;
    timeRef.current += dt;
    const t = timeRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const coilX = canvas.width * 0.4;
    const coilY = canvas.height * 0.4;

    let magnetX: number;
    if (mode === "drag") {
      magnetX = magnetPosRef.current.x || coilX + 180;
    } else {
      magnetX = coilX + Math.sin(t * magnetSpeed * 2) * 160;
    }

    const magnetY = mode === "drag" ? (magnetPosRef.current.y || coilY) : coilY;
    const dx = magnetX - coilX;
    const dy = magnetY - coilY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const flux = coilTurns * 100 / (1 + (dist / 60) * (dist / 60));
    const prevFlux =
      historyRef.current.length > 0
        ? historyRef.current[historyRef.current.length - 1].flux
        : flux;
    const emf = -(flux - prevFlux) / 0.016 * 0.01;

    historyRef.current.push({ t, emf, flux });
    if (historyRef.current.length > 800) historyRef.current.shift();

    // Update particles
    particlesRef.current.update(dt);

    // Challenge mode logic
    if (challengeRef.current.active && challengeRoundActiveRef.current) {
      challengeTimerRef.current += dt;
      const absEmf = Math.abs(emf);
      if (absEmf > peakEmfRef.current) {
        peakEmfRef.current = absEmf;
      }

      // Round ends after 5 seconds
      if (challengeTimerRef.current >= 5) {
        challengeRoundActiveRef.current = false;
        const target = targetEmfRef.current;
        const peak = peakEmfRef.current;
        const ratio = peak / target;

        let points: number;
        let label: string;
        let tier: "perfect" | "great" | "good" | "close" | "miss";
        if (ratio >= 0.95 && ratio <= 1.15) {
          points = 3; label = "Perfect!"; tier = "perfect";
        } else if (ratio >= 0.8 && ratio <= 1.3) {
          points = 2; label = "Great!"; tier = "great";
        } else if (ratio >= 0.6 && ratio <= 1.5) {
          points = 1; label = "Good!"; tier = "good";
        } else if (ratio >= 0.3) {
          points = 1; label = "Close!"; tier = "close";
        } else {
          points = 0; label = "Try Again"; tier = "miss";
        }

        const result = { points, label, tier };
        challengeRef.current = updateChallengeState(challengeRef.current, result);

        popupsRef.current.push({
          text: `${label} (Peak: ${peak.toFixed(1)}V)`,
          points,
          x: canvas.width * 0.5,
          y: canvas.height * 0.5,
          startTime: performance.now(),
        });

        if (points > 0) {
          playScore(points);
          particlesRef.current.emitConfetti(canvas.width * 0.5, canvas.height * 0.4, points * 10);
        } else {
          playSFX("fail");
        }

        // Start new round after delay
        setTimeout(() => {
          if (challengeRef.current.active) {
            targetEmfRef.current = 3 + Math.random() * 15;
            peakEmfRef.current = 0;
            challengeTimerRef.current = 0;
            challengeRoundActiveRef.current = true;
          }
        }, 2000);
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [coilTurns, magnetSpeed, draw, mode]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 480);
      // Initialize magnet position in drag mode
      if (mode === "drag" && magnetPosRef.current.x === 0) {
        magnetPosRef.current.x = canvas.width * 0.4 + 180;
        magnetPosRef.current.y = canvas.height * 0.4;
      }
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw, mode]);

  // Animation loop
  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Drag handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "drag") return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const mx = magnetPosRef.current.x;
        const my = magnetPosRef.current.y;
        const hitW = 60;
        const hitH = 40;
        if (isPointInRect(x, y, mx - hitW, my - hitH, hitW * 2, hitH * 2)) {
          isDraggingRef.current = true;
          playSFX("click");
          return true;
        }
        return false;
      },
      onDrag: (x, y) => {
        magnetPosRef.current.x = x;
        magnetPosRef.current.y = y;
      },
      onDragEnd: () => {
        isDraggingRef.current = false;
      },
    });

    return cleanup;
  }, [mode]);

  const reset = () => {
    timeRef.current = 0;
    historyRef.current = [];
    particlesRef.current.clear();
    popupsRef.current = [];
    peakEmfRef.current = 0;
    challengeTimerRef.current = 0;
    prevMagnetXRef.current = 0;
    if (mode === "drag") {
      const canvas = canvasRef.current;
      if (canvas) {
        magnetPosRef.current.x = canvas.width * 0.4 + 180;
        magnetPosRef.current.y = canvas.height * 0.4;
      }
    }
    draw();
  };

  const toggleChallenge = () => {
    const newActive = !challengeActive;
    setChallengeActive(newActive);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = newActive;
    if (newActive) {
      setMode("drag");
      targetEmfRef.current = 5 + Math.random() * 10;
      peakEmfRef.current = 0;
      challengeTimerRef.current = 0;
      challengeRoundActiveRef.current = true;
      playSFX("powerup");
    } else {
      challengeRoundActiveRef.current = false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-grab active:cursor-grabbing" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Coil Turns
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={15}
              value={coilTurns}
              onChange={(e) => {
                setCoilTurns(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {coilTurns}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Magnet Speed
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={magnetSpeed}
              onChange={(e) => setMagnetSpeed(Number(e.target.value))}
              className="flex-1 accent-red-500"
              disabled={mode === "drag"}
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {mode === "drag" ? "Manual" : `${magnetSpeed.toFixed(1)}\u00D7`}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mode
          </label>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => { setMode("auto"); reset(); }}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                mode === "auto"
                  ? "bg-amber-600 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => { setMode("drag"); reset(); }}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                mode === "drag"
                  ? "bg-amber-600 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
              }`}
            >
              Drag
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Challenge
          </label>
          <button
            onClick={toggleChallenge}
            className={`w-full h-8 mt-2 rounded-lg text-xs font-medium transition-colors ${
              challengeActive
                ? "bg-yellow-500 text-black"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {challengeActive ? "Challenge ON" : "Start Challenge"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
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
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Faraday&apos;s Law
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {"\u03B5"} = {"\u2212"}N d{"\u03A6"}/dt
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {"\u03A6"} = B {"\u00B7"} A {"\u00B7"} cos{"\u03B8"}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            Lenz&apos;s law: opposes change
          </div>
        </div>
      </div>
      {challengeActive && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <h3 className="text-sm font-semibold text-yellow-500 mb-1">Maximize EMF Challenge</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Drag the magnet through the coil as fast as you can! Try to hit the target peak EMF
            within 5 seconds per round. Faster motion = higher EMF. More coil turns = higher EMF.
            Score: {challengeRef.current.score} pts | Attempts: {challengeRef.current.attempts}
          </p>
        </div>
      )}
    </div>
  );
}
