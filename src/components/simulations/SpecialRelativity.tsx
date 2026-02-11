"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  calculateAccuracy,
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { ParticleSystem } from "@/lib/simulation/particles";

type ChallengeType = "time_dilation" | "length_contraction" | "gamma" | "relativistic_energy";
type ViewMode = "comparison" | "spaceship" | "twins" | "minkowski";

interface ChallengeQuestion {
  type: ChallengeType;
  beta: number;
  question: string;
  answer: number;
  unit: string;
  hint: string;
}

export default function SpecialRelativity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [beta, setBeta] = useState(0.5); // v/c
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const [viewMode, setViewMode] = useState<ViewMode>("comparison");

  // Challenge state
  const [challengeMode, setChallengeMode] = useState(false);
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeQuestion | null>(null);
  const [guess, setGuess] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  const popupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());

  // Lorentz factor
  const gamma = 1 / Math.sqrt(1 - beta * beta);

  const generateChallenge = useCallback(() => {
    const types: ChallengeType[] = ["time_dilation", "length_contraction", "gamma", "relativistic_energy"];
    const type = types[Math.floor(Math.random() * types.length)];
    const challengeBeta = Math.round((0.3 + Math.random() * 0.65) * 100) / 100;
    const g = 1 / Math.sqrt(1 - challengeBeta * challengeBeta);

    let question: string, answer: number, unit: string, hint: string;

    switch (type) {
      case "gamma":
        question = `What is the Lorentz factor \u03b3 for v = ${challengeBeta.toFixed(2)}c?`;
        answer = g;
        unit = "";
        hint = "\u03b3 = 1/\u221a(1 - v\u00b2/c\u00b2)";
        break;
      case "time_dilation":
        question = `A clock ticks once per second at rest. At v = ${challengeBeta.toFixed(2)}c, what is the dilated period (in seconds)?`;
        answer = g;
        unit = "s";
        hint = "\u0394t = \u03b3\u0394t\u2080";
        break;
      case "length_contraction":
        question = `A 1.00 m rod moves at v = ${challengeBeta.toFixed(2)}c. What is its contracted length (in meters)?`;
        answer = 1 / g;
        unit = "m";
        hint = "L = L\u2080/\u03b3";
        break;
      case "relativistic_energy":
        question = `What is \u03b3mc\u00b2 / mc\u00b2 (total energy ratio) at v = ${challengeBeta.toFixed(2)}c?`;
        answer = g;
        unit = "";
        hint = "E = \u03b3mc\u00b2";
        break;
    }

    setCurrentChallenge({ type, beta: challengeBeta, question, answer, unit, hint });
    setGuess("");
    setShowAnswer(false);
  }, []);

  const startChallenge = useCallback(() => {
    setChallengeMode(true);
    setChallengeState({ ...createChallengeState(), active: true, description: "Relativity calculations" });
    generateChallenge();
    playSFX("powerup");
  }, [generateChallenge]);

  const stopChallenge = useCallback(() => {
    setChallengeMode(false);
    setChallengeState(createChallengeState());
    setCurrentChallenge(null);
    setShowAnswer(false);
  }, []);

  const submitGuess = useCallback(() => {
    const guessNum = parseFloat(guess);
    if (isNaN(guessNum) || !currentChallenge) return;

    const result = calculateAccuracy(guessNum, currentChallenge.answer, currentChallenge.answer * 2);
    const newState = updateChallengeState(challengeState, result);
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 3,
        startTime: performance.now(),
      });

      if (result.points >= 2) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, 25);
        playSFX("correct");
        playScore(result.points);
      } else if (result.points === 1) {
        playSFX("success");
      } else {
        playSFX("incorrect");
      }
    }

    setShowAnswer(true);
    setTimeout(generateChallenge, 2500);
  }, [guess, currentChallenge, challengeState, generateChallenge]);

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

    // Draw stars background
    const starSeed = 42;
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137 + starSeed) % W);
      const sy = ((i * 97 + starSeed * 3) % H);
      const brightness = 0.1 + ((i * 53) % 100) / 200;
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.5 + ((i * 31) % 100) / 100, 0, Math.PI * 2);
      ctx.fill();
    }

    const margin = 30;

    if (viewMode === "comparison") {
      drawComparisonView(ctx, W, H, t, margin);
    } else if (viewMode === "spaceship") {
      drawSpaceshipView(ctx, W, H, t, margin);
    } else if (viewMode === "twins") {
      drawTwinsView(ctx, W, H, t, margin);
    } else if (viewMode === "minkowski") {
      drawMinkowskiView(ctx, W, H, t, margin);
    }

    // Challenge scoreboard
    if (challengeMode) {
      renderScoreboard(ctx, W - 160, 12, 148, 108, challengeState);
    }

    // Render score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Render particles
    particlesRef.current.draw(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beta, gamma, viewMode, challengeMode, challengeState]);

  // --- Comparison View (enhanced original) ---
  const drawComparisonView = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number, margin: number) => {
    const visH = H * 0.48;

    // Stationary frame (left)
    const leftX = margin;
    const leftW = (W - margin * 3) / 2;
    const rightX = leftX + leftW + margin;

    // Labels
    ctx.font = "bold 12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Rest Frame (S)", leftX + leftW / 2, 22);
    ctx.fillText(`Moving Frame (S') \u2014 v = ${(beta).toFixed(2)}c`, rightX + leftW / 2, 22);

    // Frame backgrounds
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(leftX, 30, leftW, visH - 40, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rightX, 30, leftW, visH - 40, 8);
    ctx.fill();

    // --- Rest frame: normal clock and ruler ---
    const clockCx = leftX + leftW / 2;
    const clockCy = 85;
    const clockR = 32;

    // Clock face
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(clockCx, clockCy, clockR, 0, Math.PI * 2);
    ctx.stroke();

    // Clock ticks
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clockCx + Math.cos(angle) * (clockR - 5), clockCy + Math.sin(angle) * (clockR - 5));
      ctx.lineTo(clockCx + Math.cos(angle) * clockR, clockCy + Math.sin(angle) * clockR);
      ctx.stroke();
    }

    // Clock hand
    const clockAngle = (t * 0.5) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clockCx, clockCy);
    ctx.lineTo(clockCx + Math.cos(clockAngle) * (clockR - 8), clockCy + Math.sin(clockAngle) * (clockR - 8));
    ctx.stroke();

    ctx.fillStyle = "#22c55e";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`t = ${t.toFixed(1)} s`, clockCx, clockCy + clockR + 15);

    // Rest ruler
    const rulerY = visH - 35;
    const rulerW = leftW - 20;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(leftX + 10, rulerY, rulerW, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("L\u2080 = 1.00 m", leftX + 10 + rulerW / 2, rulerY + 25);

    // Meter marks
    for (let i = 0; i <= 10; i++) {
      const mx = leftX + 10 + (i / 10) * rulerW;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, rulerY);
      ctx.lineTo(mx, rulerY + (i % 5 === 0 ? 12 : 6));
      ctx.stroke();
    }

    // --- Moving frame: dilated clock and contracted ruler ---
    const clockCx2 = rightX + leftW / 2;

    // Dilated clock
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(clockCx2, clockCy, clockR, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clockCx2 + Math.cos(angle) * (clockR - 5), clockCy + Math.sin(angle) * (clockR - 5));
      ctx.lineTo(clockCx2 + Math.cos(angle) * clockR, clockCy + Math.sin(angle) * clockR);
      ctx.stroke();
    }

    // Dilated hand (runs slower by gamma)
    const dilatedAngle = (t / gamma * 0.5) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clockCx2, clockCy);
    ctx.lineTo(clockCx2 + Math.cos(dilatedAngle) * (clockR - 8), clockCy + Math.sin(dilatedAngle) * (clockR - 8));
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`t' = ${(t / gamma).toFixed(1)} s (slower!)`, clockCx2, clockCy + clockR + 15);

    // Contracted ruler
    const contractedW = rulerW / gamma;
    const rulerStart = rightX + 10 + (rulerW - contractedW) / 2;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(rulerStart, rulerY, contractedW, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`L = ${(1 / gamma).toFixed(3)} m (shorter!)`, rightX + 10 + rulerW / 2, rulerY + 25);

    // --- Bottom: Gamma graph ---
    drawGammaGraph(ctx, W, H, visH + 10, margin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beta, gamma]);

  // --- Spaceship View ---
  const drawSpaceshipView = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number, margin: number) => {
    const centerY = H * 0.35;

    // Title
    ctx.font = "bold 12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(`Spaceship at v = ${beta.toFixed(2)}c`, W / 2, 22);

    // Draw ground/reference frame
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, centerY + 80);
    ctx.lineTo(W - margin, centerY + 80);
    ctx.stroke();

    // Distance markers
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "8px ui-monospace";
    ctx.textAlign = "center";
    for (let i = 0; i <= 10; i++) {
      const mx = margin + (i / 10) * (W - margin * 2);
      ctx.beginPath();
      ctx.moveTo(mx, centerY + 77);
      ctx.lineTo(mx, centerY + 83);
      ctx.stroke();
    }

    // Spaceship at rest (top reference)
    const shipRestW = 120;
    const shipRestH = 30;
    const shipRestX = W / 2 - shipRestW / 2;
    const shipRestY = centerY - 60;

    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("At rest:", W / 2, shipRestY - 12);

    drawSpaceship(ctx, shipRestX, shipRestY, shipRestW, shipRestH, "#3b82f6", 0.4, false);

    ctx.fillStyle = "#93c5fd";
    ctx.font = "10px ui-monospace";
    ctx.fillText(`L\u2080 = ${shipRestW} px`, W / 2, shipRestY + shipRestH + 15);

    // Spaceship contracted (moving)
    const contractedShipW = shipRestW / gamma;
    const shipX = W / 2 - contractedShipW / 2 + Math.sin(t * beta * 2) * 50;
    const shipY = centerY + 10;

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`At v = ${beta.toFixed(2)}c:`, W / 2, shipY - 12);

    drawSpaceship(ctx, shipX, shipY, contractedShipW, shipRestH, "#ef4444", 1.0, true);

    // Engine exhaust particles
    if (beta > 0.1) {
      const exhaustIntensity = Math.min(beta * 2, 1);
      for (let i = 0; i < 5; i++) {
        const px = shipX - 5 - Math.random() * 30 * exhaustIntensity;
        const py = shipY + shipRestH / 2 + (Math.random() - 0.5) * 10;
        const alpha = Math.random() * exhaustIntensity * 0.5;
        ctx.fillStyle = `rgba(251,191,36,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "#fca5a5";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`L = ${(shipRestW / gamma).toFixed(1)} px (contracted by ${((1 - 1 / gamma) * 100).toFixed(1)}%)`, W / 2, shipY + shipRestH + 15);

    // Relativistic mass/energy display
    const energyY = centerY + 100;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(margin, energyY, W - margin * 2, 65, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("RELATIVISTIC ENERGY (m\u2080 = 1 kg)", margin + 12, energyY + 16);

    // Rest energy bar
    const barY = energyY + 24;
    const barMaxW = W - margin * 2 - 24;
    const restBarW = barMaxW * 0.3;

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(margin + 12, barY, restBarW, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText("m\u2080c\u00b2 = 1.00", margin + 14, barY + 11);

    // Total energy bar (gamma * rest)
    const totalBarW = Math.min(restBarW * gamma, barMaxW);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(margin + 12, barY + 20, totalBarW, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`\u03b3m\u2080c\u00b2 = ${gamma.toFixed(3)}`, margin + 14, barY + 31);

    // KE label
    if (totalBarW > restBarW + 10) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "8px ui-monospace";
      ctx.textAlign = "center";
      const keStart = margin + 12 + restBarW;
      const keW = totalBarW - restBarW;
      ctx.fillText("KE", keStart + keW / 2, barY + 31);
    }

    // Gamma graph
    drawGammaGraph(ctx, W, H, energyY + 75, margin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beta, gamma]);

  // --- Twin Paradox View ---
  const drawTwinsView = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number, margin: number) => {
    ctx.font = "bold 12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Twin Paradox", W / 2, 22);

    const centerX = W / 2;
    const twinSpacing = Math.min(W * 0.3, 180);

    // Earth twin (left)
    const earthX = centerX - twinSpacing;
    const earthY = 80;

    // Draw Earth
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(earthX, earthY + 50, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    // Simple continent shapes
    ctx.beginPath();
    ctx.arc(earthX - 5, earthY + 45, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(earthX + 8, earthY + 55, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("Earth Twin", earthX, earthY + 90);

    // Earth twin's clock
    drawClock(ctx, earthX, earthY + 120, 30, t, "#22c55e");
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 12px ui-monospace";
    ctx.fillText(`Age: ${t.toFixed(1)} years`, earthX, earthY + 162);

    // Traveling twin (right)
    const travelX = centerX + twinSpacing;
    const travelY = 80;

    // Draw small spaceship
    const travelOffsetY = Math.sin(t * 0.3) * 20;
    drawSpaceship(ctx, travelX - 20, travelY + 30 + travelOffsetY, 40, 15, "#ef4444", 0.8, true);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Traveling Twin (v=${beta.toFixed(2)}c)`, travelX, travelY + 90);

    // Traveling twin's clock (runs slower)
    drawClock(ctx, travelX, travelY + 120, 30, t / gamma, "#ef4444");
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 12px ui-monospace";
    ctx.fillText(`Age: ${(t / gamma).toFixed(1)} years`, travelX, travelY + 162);

    // Age difference
    const ageDiff = t - t / gamma;
    if (ageDiff > 0.1) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(centerX - 80, earthY + 170, 160, 35, 8);
      ctx.fill();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText(`Age difference: ${ageDiff.toFixed(1)} years`, centerX, earthY + 192);
    }

    // Connecting arrow
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(earthX + 35, earthY + 50);
    ctx.lineTo(travelX - 35, earthY + 50);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`v = ${beta.toFixed(2)}c`, centerX, earthY + 45);

    // Gamma graph at bottom
    drawGammaGraph(ctx, W, H, earthY + 215, margin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beta, gamma]);

  // --- Minkowski Diagram ---
  const drawMinkowskiView = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number, margin: number) => {
    ctx.font = "bold 12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Minkowski Spacetime Diagram", W / 2, 22);

    const diagramSize = Math.min(W - margin * 4, H - 80);
    const ox = W / 2;
    const oy = 40 + diagramSize;
    const scale = diagramSize * 0.45;

    // Light cone
    ctx.strokeStyle = "rgba(251,191,36,0.3)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    // Future light cone
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + scale, oy - scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox - scale, oy - scale);
    ctx.stroke();
    // Past light cone
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + scale, oy + scale * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox - scale, oy + scale * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Light cone labels
    ctx.fillStyle = "rgba(251,191,36,0.5)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText("v = c", ox + scale - 20, oy - scale + 15);
    ctx.textAlign = "right";
    ctx.fillText("v = c", ox - scale + 20, oy - scale + 15);

    // Fill light cone regions
    ctx.fillStyle = "rgba(251,191,36,0.03)";
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + scale, oy - scale);
    ctx.lineTo(ox - scale, oy - scale);
    ctx.closePath();
    ctx.fill();

    // Region labels
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("FUTURE", ox, oy - scale * 0.6);
    ctx.fillText("ELSEWHERE", ox + scale * 0.7, oy - scale * 0.2);
    ctx.fillText("ELSEWHERE", ox - scale * 0.7, oy - scale * 0.2);

    // Rest frame axes (x, ct)
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    // ct axis (vertical)
    ctx.beginPath();
    ctx.moveTo(ox, oy + scale * 0.3);
    ctx.lineTo(ox, oy - scale);
    ctx.stroke();
    // x axis (horizontal)
    ctx.beginPath();
    ctx.moveTo(ox - scale, oy);
    ctx.lineTo(ox + scale, oy);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("ct", ox + 12, oy - scale + 5);
    ctx.fillText("x", ox + scale - 5, oy + 15);

    // Moving frame axes (ct', x')
    const angle = Math.atan(beta);

    // ct' axis (tilted toward light cone)
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.sin(angle) * scale, oy - Math.cos(angle) * scale);
    ctx.stroke();

    // x' axis (tilted symmetrically)
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(angle) * scale, oy - Math.sin(angle) * scale);
    ctx.stroke();

    // Moving frame labels
    ctx.fillStyle = "#a855f7";
    ctx.font = "bold 10px ui-monospace";
    const ctPrimeEnd = { x: ox + Math.sin(angle) * scale, y: oy - Math.cos(angle) * scale };
    ctx.textAlign = "left";
    ctx.fillText("ct'", ctPrimeEnd.x + 8, ctPrimeEnd.y + 5);
    const xPrimeEnd = { x: ox + Math.cos(angle) * scale, y: oy - Math.sin(angle) * scale };
    ctx.fillText("x'", xPrimeEnd.x + 5, xPrimeEnd.y - 5);

    // Worldline of moving object
    const worldlineAngle = Math.atan(beta);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(239,68,68,0.3)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    const wlLen = scale * 0.8;
    ctx.lineTo(ox + Math.sin(worldlineAngle) * wlLen, oy - Math.cos(worldlineAngle) * wlLen * 1.0);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Moving dot on worldline
    const dotProgress = (t * 0.15) % 1;
    const dotX = ox + Math.sin(worldlineAngle) * wlLen * dotProgress;
    const dotY = oy - Math.cos(worldlineAngle) * wlLen * dotProgress;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Worldline label
    ctx.fillStyle = "#ef4444";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText(`worldline (v=${beta.toFixed(2)}c)`, dotX + 10, dotY);

    // Tick marks on axes
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "8px ui-monospace";
    ctx.textAlign = "center";
    for (let i = 1; i <= 3; i++) {
      const tickLen = 4;
      // ct axis ticks
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox - tickLen, oy - i * scale / 3);
      ctx.lineTo(ox + tickLen, oy - i * scale / 3);
      ctx.stroke();
      ctx.fillText(`${i}`, ox - 12, oy - i * scale / 3 + 3);

      // x axis ticks
      ctx.beginPath();
      ctx.moveTo(ox + i * scale / 3, oy - tickLen);
      ctx.lineTo(ox + i * scale / 3, oy + tickLen);
      ctx.stroke();
      ctx.fillText(`${i}`, ox + i * scale / 3, oy + 15);
    }

    // Info box
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 190, 80, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("MINKOWSKI DIAGRAM", 22, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`v = ${beta.toFixed(3)}c`, 22, 46);
    ctx.fillText(`\u03b3 = ${gamma.toFixed(4)}`, 22, 62);
    ctx.fillStyle = "#a855f7";
    ctx.fillText(`tan(\u03b8) = v/c = ${beta.toFixed(3)}`, 22, 78);
  }, [beta, gamma]);

  // --- Helper: Draw Gamma Graph ---
  const drawGammaGraph = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, graphY: number, margin: number) => {
    const graphH2 = H - graphY - 25;
    if (graphH2 < 40) return;
    const graphW2 = W - margin * 2;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(margin - 10, graphY - 5, graphW2 + 20, graphH2 + 20, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("LORENTZ FACTOR \u03b3 vs v/c", margin, graphY + 10);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, graphY + 18);
    ctx.lineTo(margin, graphY + graphH2);
    ctx.lineTo(margin + graphW2, graphY + graphH2);
    ctx.stroke();

    // Plot gamma curve
    const maxGamma = 8;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(168,85,247,0.3)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let px = 0; px <= graphW2; px++) {
      const b = (px / graphW2) * 0.999;
      const g = 1 / Math.sqrt(1 - b * b);
      const py = graphY + graphH2 - (Math.min(g, maxGamma) / maxGamma) * (graphH2 - 22);
      if (px === 0) ctx.moveTo(margin + px, py);
      else ctx.lineTo(margin + px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current point
    const curPx = margin + beta * graphW2;
    const curPy = graphY + graphH2 - (Math.min(gamma, maxGamma) / maxGamma) * (graphH2 - 22);
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Value label
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText(`\u03b3 = ${gamma.toFixed(3)}`, curPx + 8, curPy - 4);

    // Axis labels
    ctx.font = "8px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("v/c \u2192", margin + graphW2 / 2, graphY + graphH2 + 12);
    ctx.fillText("0", margin, graphY + graphH2 + 10);
    ctx.fillText("1", margin + graphW2, graphY + graphH2 + 10);
  }, [beta, gamma]);

  // --- Helper: Draw Spaceship ---
  function drawSpaceship(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha: number, showEngine: boolean) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + w, y + h / 2); // Nose
    ctx.lineTo(x + w * 0.7, y); // Top front
    ctx.lineTo(x + w * 0.1, y); // Top back
    ctx.lineTo(x, y + h * 0.2); // Back top
    ctx.lineTo(x, y + h * 0.8); // Back bottom
    ctx.lineTo(x + w * 0.1, y + h); // Bottom back
    ctx.lineTo(x + w * 0.7, y + h); // Bottom front
    ctx.closePath();
    ctx.fill();

    // Cockpit window
    ctx.fillStyle = "rgba(200,230,255,0.4)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.75, y + h / 2, w * 0.08, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine
    if (showEngine) {
      ctx.fillStyle = "rgba(100,100,120,0.6)";
      ctx.fillRect(x - 2, y + h * 0.25, 4, h * 0.5);
    }

    // Speed lines (at high velocities)
    if (alpha >= 0.8 && w < 110) {
      ctx.strokeStyle = `rgba(255,255,255,${0.1 * alpha})`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        const ly = y + h * 0.2 + (h * 0.6) * (i / 4);
        const lx = x - 5 - Math.random() * 20;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - 15 - Math.random() * 15, ly);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // --- Helper: Draw Clock ---
  function drawClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, time: number, color: string) {
    // Face
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Fill
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    // Ticks
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * (r - 4), cy + Math.sin(angle) * (r - 4));
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.stroke();
    }

    // Hand
    const angle = (time * 0.5) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (r - 6), cy + Math.sin(angle) * (r - 6));
    ctx.stroke();

    // Center dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const animate = useCallback(() => {
    if (isRunning) {
      timeRef.current += 0.016;
    }
    particlesRef.current.update(0.016);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.65, 560);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* View mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Visualization</label>
        <div className="flex gap-2">
          {([
            { key: "comparison", label: "Clocks & Rulers" },
            { key: "spaceship", label: "Spaceship" },
            { key: "twins", label: "Twin Paradox" },
            { key: "minkowski", label: "Minkowski" },
          ] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setViewMode(key)}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                viewMode === key
                  ? "bg-purple-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Challenge mode */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {challengeMode ? "Challenge: Relativity Calculations" : "Challenge Mode"}
          </h3>
          <button
            onClick={challengeMode ? stopChallenge : startChallenge}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              challengeMode
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-amber-500 hover:bg-amber-600 text-white"
            }`}
          >
            {challengeMode ? "End Challenge" : "Start Challenge"}
          </button>
        </div>

        {challengeMode && currentChallenge && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {currentChallenge.question}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                Hint: {currentChallenge.hint}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder={`Answer ${currentChallenge.unit ? `(${currentChallenge.unit})` : ""}`}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono"
                onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              />
              <button
                onClick={submitGuess}
                disabled={!guess || showAnswer}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium transition-colors"
              >
                Submit
              </button>
            </div>
            {showAnswer && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                  Correct answer: <b>{currentChallenge.answer.toFixed(4)}</b> {currentChallenge.unit}
                </p>
              </div>
            )}
            {challengeState.attempts > 0 && (
              <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>Score: <b className="text-gray-900 dark:text-gray-100">{challengeState.score}</b></span>
                <span>Attempts: <b className="text-gray-900 dark:text-gray-100">{challengeState.attempts}</b></span>
                <span>Streak: <b className="text-amber-500">{challengeState.streak}</b></span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed (v/c)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={0.99} step={0.01} value={beta}
              onChange={(e) => setBeta(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{beta.toFixed(2)}c</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <div className="flex gap-2 w-full">
            <button onClick={() => setIsRunning(!isRunning)}
              className="flex-1 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors">
              {isRunning ? "Pause" : "Play"}
            </button>
            <button onClick={() => { timeRef.current = 0; }}
              className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Reset
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <div>Time dilation: <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{gamma.toFixed(3)}{"\u00d7"}</span></div>
            <div>Length contraction: <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{(1/gamma).toFixed(3)}{"\u00d7"}</span></div>
            <div>Rel. energy: <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{gamma.toFixed(3)}mc{"\u00b2"}</span></div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Special Relativity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{"\u03b3"} = 1/{"\u221a"}(1{"\u2212"}v{"\u00b2"}/c{"\u00b2"})</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{"\u0394"}t = {"\u03b3"}{"\u0394"}t{"\u2080"}</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">L = L{"\u2080"}/{"\u03b3"}</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E = {"\u03b3"}mc{"\u00b2"}</div>
        </div>
      </div>
    </div>
  );
}
