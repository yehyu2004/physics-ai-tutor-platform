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
import { drawArrow, drawInfoPanel, drawMeter } from "@/lib/simulation/drawing";
import { createDragHandler, isPointInCircle } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type Mode = "sandbox" | "predict-work" | "target-ke";

interface EnergyParticle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

export default function WorkEnergy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [force, setForce] = useState(20);
  const [angle, setAngle] = useState(0); // force angle in degrees
  const [mass, setMass] = useState(5);
  const [friction, setFriction] = useState(0.1);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("sandbox");
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [prediction, setPrediction] = useState("");
  const [targetKE, setTargetKE] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [challengeParams, setChallengeParams] = useState({ f: 20, d: 5, theta: 0 });
  const [waitingForPrediction, setWaitingForPrediction] = useState(false);

  const timeRef = useRef(0);
  const posRef = useRef(0);
  const velRef = useRef(0);
  const historyRef = useRef<{ x: number; ke: number; work: number }[]>([]);

  // Drag force arrow state
  const isDraggingArrowRef = useRef(false);
  const dragForceRef = useRef({ magnitude: 20, angle: 0 });

  // Energy transfer particles
  const energyParticlesRef = useRef<EnergyParticle[]>([]);
  const particleSystemRef = useRef(new ParticleSystem());

  // Score popups
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Accumulated net work (incremental integration)
  const workAccumRef = useRef(0);

  // Animation time for pulsing effects
  const animTimeRef = useRef(0);

  // Challenge tracking
  const challengeReachedRef = useRef(false);

  const generateChallenge = useCallback((currentMode: Mode) => {
    if (currentMode === "predict-work") {
      const f = 10 + Math.floor(Math.random() * 50);
      const d = 2 + Math.floor(Math.random() * 8);
      const theta = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
      setChallengeParams({ f, d, theta });
      setForce(f);
      setAngle(theta);
      setPrediction("");
      setWaitingForPrediction(true);
      setShowResult(false);
    } else if (currentMode === "target-ke") {
      const target = 10 + Math.floor(Math.random() * 90);
      setTargetKE(target);
      setForce(20);
      setAngle(0);
      setFriction(0.1);
      setMass(5);
      setShowResult(false);
      challengeReachedRef.current = false;
    }
  }, []);

  const spawnEnergyParticles = useCallback((fromX: number, fromY: number, toX: number, toY: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      energyParticlesRef.current.push({
        x: fromX + (Math.random() - 0.5) * 10,
        y: fromY + (Math.random() - 0.5) * 10,
        targetX: toX + (Math.random() - 0.5) * 20,
        targetY: toY + (Math.random() - 0.5) * 20,
        progress: 0,
        speed: 0.8 + Math.random() * 1.2,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const groundY = H * 0.55;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, groundY);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(1, "#1e293b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, groundY);

    // Ground
    const grd = ctx.createLinearGradient(0, groundY, 0, H);
    grd.addColorStop(0, "#374151");
    grd.addColorStop(1, "#1f2937");
    ctx.fillStyle = grd;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Grid on ground
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Distance markers on ground
    const startX = 60;
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "center";
    for (let m = 0; m <= 10; m++) {
      const mx = startX + m * 8 * 8; // 8 pixels per meter * 8 scale
      if (mx < W - 60) {
        ctx.beginPath();
        ctx.moveTo(mx, groundY);
        ctx.lineTo(mx, groundY + 5);
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.stroke();
        ctx.fillText(`${m}m`, mx, groundY + 14);
      }
    }

    // Target distance marker for predict-work mode
    if (mode === "predict-work" && waitingForPrediction) {
      const targetDistX = startX + challengeParams.d * 64;
      if (targetDistX < W - 60) {
        ctx.strokeStyle = "rgba(245,158,11,0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(targetDistX, groundY - 10);
        ctx.lineTo(targetDistX, groundY + 20);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 10px ui-monospace, monospace";
        ctx.fillText(`d = ${challengeParams.d} m`, targetDistX, groundY - 15);
      }
    }

    // Box position
    const boxW = 50;
    const boxH = 40;
    const maxTravel = W - 140;
    const boxX = startX + Math.min(posRef.current * 64, maxTravel);
    const boxY = groundY - boxH;

    // Box glow (based on KE)
    const ke = 0.5 * mass * velRef.current * velRef.current;
    const glowIntensity = Math.min(ke / 200, 1);
    const glowGrad = ctx.createRadialGradient(
      boxX + boxW / 2, boxY + boxH / 2, 0,
      boxX + boxW / 2, boxY + boxH / 2, 50 + glowIntensity * 30
    );
    glowGrad.addColorStop(0, `rgba(59,130,246,${0.15 + glowIntensity * 0.2})`);
    glowGrad.addColorStop(1, "rgba(59,130,246,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(boxX + boxW / 2, boxY + boxH / 2, 50 + glowIntensity * 30, 0, Math.PI * 2);
    ctx.fill();

    // Box
    const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    boxGrad.addColorStop(0, "#3b82f6");
    boxGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = boxGrad;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mass label on box
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${mass}kg`, boxX + boxW / 2, boxY + boxH / 2 + 4);

    // Force arrow with angle - draggable
    const angleRad = -(angle * Math.PI) / 180;
    const effectiveForce = force;
    const arrowLen = Math.min(effectiveForce * 2.5, 120);
    const arrowStartX = boxX + boxW + 5;
    const arrowStartY = boxY + boxH / 2;
    const arrowDx = Math.cos(angleRad) * arrowLen;
    const arrowDy = Math.sin(angleRad) * arrowLen;

    // Draw force arrow using utility
    drawArrow(ctx, arrowStartX, arrowStartY, arrowDx, arrowDy, "#ef4444", {
      lineWidth: 3,
      headSize: 12,
      label: `F = ${force} N`,
    });

    // Angle indicator arc (when angle > 0)
    if (angle > 0) {
      ctx.strokeStyle = "rgba(239,68,68,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(arrowStartX, arrowStartY, 30, 0, -angleRad, true);
      ctx.stroke();
      ctx.fillStyle = "rgba(239,68,68,0.7)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${angle}\u00b0`, arrowStartX + 33, arrowStartY - 5);
    }

    // Drag handle indicator at arrow tip
    if (!isRunning) {
      const tipX = arrowStartX + arrowDx;
      const tipY = arrowStartY + arrowDy;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 8, 0, Math.PI * 2);
      ctx.fillStyle = isDraggingArrowRef.current
        ? "rgba(239,68,68,0.5)"
        : "rgba(239,68,68,0.2)";
      ctx.fill();
      ctx.strokeStyle = "rgba(239,68,68,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Friction arrow (orange, opposite direction)
    const frictionForce = friction * mass * 9.8;
    if (velRef.current > 0.01 && frictionForce > 0) {
      const fLen = Math.min(frictionForce * 2.5, 60);
      drawArrow(ctx, boxX - 5, boxY + boxH / 2 + 2, -fLen, 0, "#f59e0b", {
        lineWidth: 2,
        headSize: 8,
        label: `f = ${frictionForce.toFixed(1)} N`,
      });
    }

    // Velocity arrow (green)
    if (velRef.current > 0.1) {
      const vLen = Math.min(velRef.current * 15, 80);
      drawArrow(ctx, boxX + boxW / 2, boxY - 15, vLen, 0, "#22c55e", {
        lineWidth: 2,
        headSize: 7,
        label: `v = ${velRef.current.toFixed(1)} m/s`,
      });
    }

    // --- Energy bar graph & data panel ---
    const frictionF = friction * mass * 9.8;
    const workDone = workAccumRef.current;
    const workByF = force * Math.cos(angleRad) * posRef.current;
    const workByFriction = -frictionF * posRef.current;

    drawInfoPanel(ctx, W - 200, 10, 190, 165, "ENERGY DATA", [
      { label: "KE", value: `${ke.toFixed(1)} J`, color: "#3b82f6" },
      { label: "W_net", value: `${workDone.toFixed(1)} J`, color: "#22c55e" },
      { label: "W_F", value: `${workByF.toFixed(1)} J`, color: "#ef4444" },
      { label: "W_fric", value: `${workByFriction.toFixed(1)} J`, color: "#f59e0b" },
      { label: "d", value: `${posRef.current.toFixed(2)} m`, color: "#e2e8f0" },
      { label: "v", value: `${velRef.current.toFixed(2)} m/s`, color: "#e2e8f0" },
      { label: "\u0394KE", value: `${ke.toFixed(1)} J`, color: "#a78bfa" },
    ]);

    // --- Energy bars (visual meters) ---
    const meterX = W - 200;
    const meterY = 185;
    const maxEnergy = Math.max(100, ke, Math.abs(workByF), Math.abs(workByFriction)) * 1.2;

    drawMeter(ctx, meterX, meterY, 190, 10, ke, maxEnergy, "#3b82f6", "KE");
    drawMeter(ctx, meterX, meterY + 16, 190, 10, Math.abs(workByF), maxEnergy, "#ef4444", "W_F");
    drawMeter(ctx, meterX, meterY + 32, 190, 10, Math.abs(workByFriction), maxEnergy, "#f59e0b", "W_fric");

    // Target KE meter (in target-ke mode)
    if (mode === "target-ke" && targetKE > 0) {
      const pulse = (Math.sin(animTimeRef.current * 3) + 1) / 2;
      ctx.strokeStyle = `rgba(245,158,11,${0.3 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      const targetW = Math.min(1, targetKE / maxEnergy) * 190;
      ctx.beginPath();
      ctx.moveTo(meterX + targetW, meterY - 3);
      ctx.lineTo(meterX + targetW, meterY + 13);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`Target: ${targetKE} J`, meterX + targetW, meterY - 7);
    }

    // --- Challenge scoreboard ---
    if (mode !== "sandbox") {
      renderScoreboard(ctx, 10, 10, 150, 120, challengeState);
    }

    // --- Energy transfer particles ---
    const energyPs = energyParticlesRef.current;
    for (const ep of energyPs) {
      const t = ep.progress;
      const x = ep.x + (ep.targetX - ep.x) * t;
      const y = ep.y + (ep.targetY - ep.y) * t - Math.sin(t * Math.PI) * 20;
      const alpha = 1 - t * 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ep.color;
      ctx.shadowColor = ep.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, ep.size * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // --- Particle system ---
    particleSystemRef.current.draw(ctx);

    // --- Score popups ---
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter(p => renderScorePopup(ctx, p, now));

    // --- Bottom graph ---
    const graphY = groundY + 25;
    const graphH = H - groundY - 35;
    const graphW2 = W - 40;
    const history = historyRef.current;

    if (history.length > 1) {
      const maxE = Math.max(1, ...history.map(h => Math.max(h.ke, Math.abs(h.work))));
      const maxX2 = Math.max(1, ...history.map(h => h.x));

      // KE line (blue)
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.4)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = 20 + (history[i].x / maxX2) * graphW2;
        const py = graphY + graphH - (history[i].ke / maxE) * (graphH - 10);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Work line (green)
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.4)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = 20 + (history[i].x / maxX2) * graphW2;
        const py = graphY + graphH - (history[i].work / maxE) * (graphH - 10);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Legend
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "left";
      ctx.fillText("KE", 25, graphY + 12);
      ctx.fillStyle = "#22c55e";
      ctx.fillText("W_net", 55, graphY + 12);
    }

    // Mode label
    if (mode !== "sandbox") {
      ctx.fillStyle = "rgba(245,158,11,0.15)";
      ctx.beginPath();
      const labelText = mode === "predict-work" ? "PREDICT WORK" : "TARGET KE";
      const labelW = ctx.measureText(labelText).width + 20;
      ctx.roundRect(W / 2 - labelW / 2, groundY - boxH - 40, labelW, 22, 10);
      ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(labelText, W / 2, groundY - boxH - 25);
    }
  }, [force, angle, mass, friction, isRunning, mode, challengeState, targetKE, challengeParams, waitingForPrediction]);

  const animate = useCallback(() => {
    const dt = 0.03;
    const g = 9.8;
    const angleRad = -(angle * Math.PI) / 180;
    const frictionForce = friction * mass * g;
    const horizontalForce = force * Math.cos(angleRad);
    const netForce = Math.max(0, horizontalForce - (velRef.current > 0.01 ? frictionForce : 0));
    const accel = netForce / mass;

    velRef.current += accel * dt;
    if (velRef.current < 0) velRef.current = 0;
    posRef.current += velRef.current * dt;
    timeRef.current += dt;
    animTimeRef.current += dt;

    // Accumulate work incrementally: W += F_net * dx
    const dx = velRef.current * dt;
    workAccumRef.current += netForce * dx;

    const ke = 0.5 * mass * velRef.current * velRef.current;
    historyRef.current.push({ x: posRef.current, ke, work: workAccumRef.current });
    if (historyRef.current.length > 500) historyRef.current.shift();

    // Spawn energy transfer particles periodically
    if (isRunning && Math.random() < 0.15 && velRef.current > 0.5) {
      const canvas = canvasRef.current;
      if (canvas) {
        const W = canvas.clientWidth;
        const groundY = canvas.clientHeight * 0.55;
        const startXP = 60;
        const boxX = startXP + Math.min(posRef.current * 64, W - 140);
        const boxY = groundY - 40;
        // Particles flow from force application to box center (work -> KE)
        spawnEnergyParticles(
          boxX + 60, boxY + 20,
          boxX + 25, boxY + 20,
          "#22c55e", 2
        );
      }
    }

    // Update energy transfer particles
    energyParticlesRef.current = energyParticlesRef.current.filter(ep => {
      ep.progress += ep.speed * dt;
      return ep.progress < 1;
    });

    // Update particle system
    particleSystemRef.current.update(dt);

    // Target KE check
    if (mode === "target-ke" && !challengeReachedRef.current) {
      const accuracy = Math.abs(ke - targetKE);
      if (accuracy < targetKE * 0.03) {
        // Hit target almost exactly
        challengeReachedRef.current = true;
        const result = calculateAccuracy(ke, targetKE, targetKE);
        const newState = updateChallengeState(challengeState, result);
        setChallengeState(newState);
        playSFX("success");
        playScore(result.points);
        const canvas = canvasRef.current;
        if (canvas) {
          const W = canvas.clientWidth;
          particleSystemRef.current.emitConfetti(W / 2, canvas.clientHeight * 0.3, 25);
          scorePopupsRef.current.push({
            text: `${result.label} KE = ${ke.toFixed(1)} J`,
            points: result.points,
            x: W / 2,
            y: canvas.clientHeight * 0.3,
            startTime: performance.now(),
          });
        }
      }
    }

    draw();

    if (posRef.current < 12) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      setIsRunning(false);
      // Check target-ke at end if not reached exactly
      if (mode === "target-ke" && !challengeReachedRef.current) {
        const result = calculateAccuracy(ke, targetKE, targetKE);
        const newState = updateChallengeState(challengeState, result);
        setChallengeState(newState);
        if (result.points > 0) {
          playSFX("correct");
          playScore(result.points);
        } else {
          playSFX("incorrect");
        }
        const canvas = canvasRef.current;
        if (canvas) {
          scorePopupsRef.current.push({
            text: `${result.label} KE = ${ke.toFixed(1)} J (target: ${targetKE} J)`,
            points: result.points,
            x: canvas.clientWidth / 2,
            y: canvas.clientHeight * 0.3,
            startTime: performance.now(),
          });
          if (result.points >= 2) {
            particleSystemRef.current.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight * 0.3, 20);
          }
        }
        challengeReachedRef.current = true;
      }
    }
  }, [force, angle, mass, friction, draw, mode, targetKE, challengeState, spawnEnergyParticles, isRunning]);

  // Canvas setup and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 500));
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Drag interaction for force arrow
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        if (isRunning) return false;
        // Check if near the force arrow tip
        const groundY = canvas.clientHeight * 0.55;
        const boxW = 50;
        const boxH = 40;
        const startXPos = 60;
        const boxX = startXPos + Math.min(posRef.current * 64, canvas.clientWidth - 140);
        const boxY = groundY - boxH;
        const angleRad = -(angle * Math.PI) / 180;
        const arrowLen = Math.min(force * 2.5, 120);
        const arrowStartX = boxX + boxW + 5;
        const arrowStartY = boxY + boxH / 2;
        const tipX = arrowStartX + Math.cos(angleRad) * arrowLen;
        const tipY = arrowStartY + Math.sin(angleRad) * arrowLen;

        if (isPointInCircle(x, y, tipX, tipY, 20)) {
          isDraggingArrowRef.current = true;
          dragForceRef.current = { magnitude: force, angle };
          return true;
        }
        return false;
      },
      onDrag: (x, y) => {
        if (!isDraggingArrowRef.current) return;
        const groundY = canvas.clientHeight * 0.55;
        const boxW = 50;
        const boxH = 40;
        const startXPos = 60;
        const boxX = startXPos + Math.min(posRef.current * 64, canvas.clientWidth - 140);
        const boxY = groundY - boxH;
        const arrowStartX = boxX + boxW + 5;
        const arrowStartY = boxY + boxH / 2;

        const dx = x - arrowStartX;
        const dy = y - arrowStartY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const newForce = Math.min(80, Math.max(5, len / 2.5));
        const newAngle = Math.max(0, Math.min(60, Math.round(-Math.atan2(dy, dx) * 180 / Math.PI)));

        setForce(Math.round(newForce));
        setAngle(newAngle);
        dragForceRef.current = { magnitude: newForce, angle: newAngle };
        draw();
      },
      onDragEnd: () => {
        isDraggingArrowRef.current = false;
      },
    });

    return cleanup;
  }, [draw, isRunning, force, angle]);

  // Animation loop
  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  useEffect(() => { draw(); }, [draw]);

  const start = () => {
    timeRef.current = 0;
    posRef.current = 0;
    velRef.current = 0;
    workAccumRef.current = 0;
    historyRef.current = [];
    energyParticlesRef.current = [];
    particleSystemRef.current.clear();
    scorePopupsRef.current = [];
    challengeReachedRef.current = false;
    animTimeRef.current = 0;
    setIsRunning(true);
    playSFX("launch");
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    timeRef.current = 0;
    posRef.current = 0;
    velRef.current = 0;
    workAccumRef.current = 0;
    historyRef.current = [];
    energyParticlesRef.current = [];
    particleSystemRef.current.clear();
    animTimeRef.current = 0;
    challengeReachedRef.current = false;
    setIsRunning(false);
    setShowResult(false);
    draw();
  };

  const submitPrediction = () => {
    const predicted = parseFloat(prediction);
    if (isNaN(predicted)) return;

    const { f, d, theta } = challengeParams;
    const thetaRad = (theta * Math.PI) / 180;
    const frictionF = friction * mass * 9.8;
    const actualWork = f * Math.cos(thetaRad) * d - frictionF * d;

    const result = calculateAccuracy(predicted, actualWork, Math.abs(actualWork) + 10);
    const newState = updateChallengeState(challengeState, result);
    setChallengeState(newState);

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }

    setResultMessage(`${result.label} Actual W_net = ${actualWork.toFixed(1)} J (you predicted ${predicted} J)`);
    setShowResult(true);
    setWaitingForPrediction(false);

    // Add score popup at center of canvas
    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight * 0.3,
        startTime: performance.now(),
      });
      if (result.points >= 2) {
        particleSystemRef.current.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight * 0.3, 20);
      }
      draw();
    }
  };

  const switchMode = (newMode: Mode) => {
    reset();
    setMode(newMode);
    setChallengeState(createChallengeState());
    setWaitingForPrediction(false);
    setShowResult(false);
    if (newMode !== "sandbox") {
      generateChallenge(newMode);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "predict-work", "target-ke"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {m === "sandbox" ? "Sandbox" : m === "predict-work" ? "Predict Work" : "Target KE"}
          </button>
        ))}
      </div>

      {/* Challenge prompt for predict-work */}
      {mode === "predict-work" && waitingForPrediction && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Predict the Net Work Done
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            F = {challengeParams.f} N, d = {challengeParams.d} m, {"\u03B8"} = {challengeParams.theta} degrees, {"\u03BC\u2096"} = {friction.toFixed(2)}, mass = {mass} kg
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Hint: W_net = F d cos(theta) - mu_k m g d
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              placeholder="Your prediction (J)..."
              className="flex-1 h-9 px-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
              onKeyDown={(e) => e.key === "Enter" && submitPrediction()}
            />
            <button
              onClick={submitPrediction}
              className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Result feedback */}
      {showResult && (
        <div className={`rounded-xl border p-3 text-sm font-medium ${
          challengeState.lastResult && challengeState.lastResult.points >= 2
            ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
            : challengeState.lastResult && challengeState.lastResult.points >= 1
            ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200"
            : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
        }`}>
          {resultMessage}
          {mode === "predict-work" && (
            <button
              onClick={() => { reset(); generateChallenge(mode); }}
              className="ml-3 px-3 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Next Challenge
            </button>
          )}
        </div>
      )}

      {/* Target KE prompt */}
      {mode === "target-ke" && targetKE > 0 && (
        <div className="rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 p-3">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
            Target: Achieve exactly {targetKE} J of kinetic energy! Adjust F, angle, mass, and friction, then push.
          </p>
          {challengeReachedRef.current && (
            <button
              onClick={() => { reset(); generateChallenge(mode); }}
              className="mt-2 px-3 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Next Challenge
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Force (N)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={5} max={80} value={force}
              onChange={(e) => { setForce(Number(e.target.value)); if (!isRunning) { reset(); } }}
              disabled={mode === "predict-work" && waitingForPrediction}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{force}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Angle (deg)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={60} value={angle}
              onChange={(e) => { setAngle(Number(e.target.value)); if (!isRunning) { reset(); } }}
              disabled={mode === "predict-work" && waitingForPrediction}
              className="flex-1 accent-red-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{angle}&deg;</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass (kg)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={20} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); if (!isRunning) { reset(); } }}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{mass}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Friction (μₖ)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={0} max={0.5} step={0.01} value={friction}
              onChange={(e) => { setFriction(Number(e.target.value)); if (!isRunning) { reset(); } }}
              className="flex-1 accent-amber-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{friction.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={start} disabled={isRunning || (mode === "predict-work" && waitingForPrediction)}
            className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Running..." : "Push"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button onClick={reset}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="W = Fd\cos\theta" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="KE = \frac{1}{2}mv^2" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="W_{net} = \Delta KE" /></div>
        </div>
      </div>

      {/* Drag instruction */}
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Tip: Drag the red arrow tip on the canvas to change force magnitude and direction. Use challenge modes for scoring!
      </p>
    </div>
  );
}
