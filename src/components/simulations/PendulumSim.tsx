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
import { getCanvasMousePos, isPointInCircle } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type ChallengeType = "none" | "match-period" | "find-g";

export default function PendulumSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [length, setLength] = useState(200);
  const [gravity, setGravity] = useState(9.8);
  const [initAngle, setInitAngle] = useState(30);
  const [isRunning, setIsRunning] = useState(true);
  const [damping, setDamping] = useState(0.5);

  // Pendulum 1 (main)
  const angleRef = useRef((initAngle * Math.PI) / 180);
  const angVelRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);

  // Coupled pendulum (pendulum 2)
  const [showCoupled, setShowCoupled] = useState(false);
  const [coupling, setCoupling] = useState(2.0);
  const angle2Ref = useRef(0);
  const angVel2Ref = useRef(0);
  const trail2Ref = useRef<{ x: number; y: number }[]>([]);

  // Challenge mode
  const [challengeType, setChallengeType] = useState<ChallengeType>("none");
  const [targetPeriod, setTargetPeriod] = useState(2.0);
  const [targetG, setTargetG] = useState(9.8);
  const [gGuess, setGGuess] = useState("");
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Particles
  const particlesRef = useRef(new ParticleSystem());

  // Metronome
  const [metronomeOn, setMetronomeOn] = useState(false);
  const lastTickSideRef = useRef<number>(0);

  // Period measurement
  const measuredPeriodRef = useRef(0);
  const periodCrossingsRef = useRef<number[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const pivotX = showCoupled ? W * 0.35 : W * 0.5;
    const pivotY = H * 0.15;
    const scale = Math.min(1, (H * 0.65) / length);
    const L = length * scale;

    const theta = angleRef.current;
    const bobX = pivotX + L * Math.sin(theta);
    const bobY = pivotY + L * Math.cos(theta);

    // Trail pendulum 1
    const trail = trailRef.current;
    if (trail.length > 1) {
      ctx.strokeStyle = "rgba(168, 85, 247, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // Equilibrium line (dashed)
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + L + 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arc showing angle
    if (Math.abs(theta) > 0.02) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const arcR = 40;
      const startAngle = Math.PI / 2 - Math.abs(theta);
      const endAngle = Math.PI / 2;
      if (theta > 0) {
        ctx.arc(pivotX, pivotY, arcR, startAngle, endAngle);
      } else {
        ctx.arc(pivotX, pivotY, arcR, endAngle, endAngle + Math.abs(theta));
      }
      ctx.stroke();

      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      const labelAngle = Math.PI / 2 - theta / 2;
      ctx.fillText(
        `${((theta * 180) / Math.PI).toFixed(1)}\u00B0`,
        pivotX + 55 * Math.cos(labelAngle),
        pivotY + 55 * Math.sin(labelAngle)
      );
    }

    // String
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // Pivot
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#475569";
    ctx.fillRect(pivotX - 30, pivotY - 8, showCoupled ? W * 0.3 + 60 : 60, 8);

    // Bob glow
    const glow = ctx.createRadialGradient(bobX, bobY, 0, bobX, bobY, 35);
    glow.addColorStop(0, "rgba(59, 130, 246, 0.4)");
    glow.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bobX, bobY, 35, 0, Math.PI * 2);
    ctx.fill();

    // Bob
    const bobGrad = ctx.createRadialGradient(bobX - 4, bobY - 4, 0, bobX, bobY, 18);
    bobGrad.addColorStop(0, "#60a5fa");
    bobGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = bobGrad;
    ctx.beginPath();
    ctx.arc(bobX, bobY, 18, 0, Math.PI * 2);
    ctx.fill();

    // "Click to push" hint
    if (isRunning) {
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.textAlign = "center";
      ctx.fillText("click bob to push", bobX, bobY + 30);
    }

    // Force vectors
    const gForce = 40;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bobX, bobY);
    ctx.lineTo(bobX, bobY + gForce);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(bobX, bobY + gForce);
    ctx.lineTo(bobX - 5, bobY + gForce - 8);
    ctx.lineTo(bobX + 5, bobY + gForce - 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.fillText("mg", bobX + 10, bobY + gForce);

    // Tension
    const tLen = 35;
    const tx = pivotX - bobX;
    const ty = pivotY - bobY;
    const tMag = Math.sqrt(tx * tx + ty * ty);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bobX, bobY);
    ctx.lineTo(bobX + (tx / tMag) * tLen, bobY + (ty / tMag) * tLen);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    const tipX = bobX + (tx / tMag) * tLen;
    const tipY = bobY + (ty / tMag) * tLen;
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - (tx / tMag) * 8 - (ty / tMag) * 5, tipY - (ty / tMag) * 8 + (tx / tMag) * 5);
    ctx.lineTo(tipX - (tx / tMag) * 8 + (ty / tMag) * 5, tipY - (ty / tMag) * 8 - (tx / tMag) * 5);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.fillText("T", tipX + 10, tipY);

    // ---- COUPLED PENDULUM ----
    if (showCoupled) {
      const pivot2X = W * 0.65;
      const pivot2Y = pivotY;
      const theta2 = angle2Ref.current;
      const bob2X = pivot2X + L * Math.sin(theta2);
      const bob2Y = pivot2Y + L * Math.cos(theta2);

      // Trail pendulum 2
      const trail2 = trail2Ref.current;
      if (trail2.length > 1) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        trail2.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      // Equilibrium line 2
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pivot2X, pivot2Y);
      ctx.lineTo(pivot2X, pivot2Y + L + 30);
      ctx.stroke();
      ctx.setLineDash([]);

      // String 2
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pivot2X, pivot2Y);
      ctx.lineTo(bob2X, bob2Y);
      ctx.stroke();

      // Pivot 2
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(pivot2X, pivot2Y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Bob 2 glow
      const glow2 = ctx.createRadialGradient(bob2X, bob2Y, 0, bob2X, bob2Y, 35);
      glow2.addColorStop(0, "rgba(239, 68, 68, 0.4)");
      glow2.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = glow2;
      ctx.beginPath();
      ctx.arc(bob2X, bob2Y, 35, 0, Math.PI * 2);
      ctx.fill();

      // Bob 2
      const bob2Grad = ctx.createRadialGradient(bob2X - 4, bob2Y - 4, 0, bob2X, bob2Y, 18);
      bob2Grad.addColorStop(0, "#fca5a5");
      bob2Grad.addColorStop(1, "#dc2626");
      ctx.fillStyle = bob2Grad;
      ctx.beginPath();
      ctx.arc(bob2X, bob2Y, 18, 0, Math.PI * 2);
      ctx.fill();

      // Spring coupling visualization
      const spring1X = pivotX + L * 0.4 * Math.sin(theta);
      const spring2X = pivot2X + L * 0.4 * Math.sin(theta2);
      const spring1Y = pivotY + L * 0.4 * Math.cos(theta);
      const spring2Y = pivot2Y + L * 0.4 * Math.cos(theta2);

      // Draw spring as zigzag
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const segments = 12;
      const springDx = spring2X - spring1X;
      const springDy = spring2Y - spring1Y;
      const springLen = Math.sqrt(springDx * springDx + springDy * springDy);
      const snx = springDx / (springLen || 1);
      const sny = springDy / (springLen || 1);
      const perpX = -sny;
      const perpY = snx;

      ctx.moveTo(spring1X, spring1Y);
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = spring1X + springDx * t;
        const baseY = spring1Y + springDy * t;
        const zigzag = i % 2 === 0 ? 8 : -8;
        if (i === 1 || i === segments - 1) {
          ctx.lineTo(baseX, baseY);
        } else {
          ctx.lineTo(baseX + perpX * zigzag, baseY + perpY * zigzag);
        }
      }
      ctx.lineTo(spring2X, spring2Y);
      ctx.stroke();

      // Spring label
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`k=${coupling.toFixed(1)}`, (spring1X + spring2X) / 2, (spring1Y + spring2Y) / 2 - 12);

      // Labels
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "center";
      ctx.fillText("P1", bobX, bobY + 28);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("P2", bob2X, bob2Y + 28);
    }

    // Info box
    const omega = Math.sqrt(gravity / (length / 100));
    const period = (2 * Math.PI) / omega;
    const KE = 0.5 * angVelRef.current * angVelRef.current * L * L;
    const PE = gravity * L * (1 - Math.cos(theta));
    const maxE = Math.max(KE + PE, 1);

    const infoW = 195;
    const infoX = W - infoW - 15;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(infoX, 15, infoW, 105, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("PENDULUM DATA", infoX + 12, 33);

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Period:  ${period.toFixed(2)} s`, infoX + 12, 53);
    ctx.fillText(`\u03B8:       ${((theta * 180) / Math.PI).toFixed(1)}\u00B0`, infoX + 12, 70);
    ctx.fillText(`\u03C9:       ${angVelRef.current.toFixed(2)} rad/s`, infoX + 12, 87);
    ctx.fillText(`Length:  ${(length / 100).toFixed(1)} m`, infoX + 12, 104);

    // Measured period display
    if (measuredPeriodRef.current > 0) {
      ctx.fillStyle = "#22c55e";
      ctx.fillText(`Meas T: ${measuredPeriodRef.current.toFixed(3)} s`, infoX + 12, 118);
    }

    // Metronome indicator
    if (metronomeOn) {
      const metX = infoX - 50;
      const metY = 20;
      const phase = (theta / (initAngle * Math.PI / 180));
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(metX, metY, 40, 40, 6);
      ctx.fill();
      ctx.font = "18px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = Math.abs(phase) > 0.8 ? "#f59e0b" : "rgba(255,255,255,0.3)";
      ctx.fillText("\u266A", metX + 20, metY + 28);
    }

    // Energy bars at bottom
    const barY = H - 50;
    const barW = showCoupled ? W * 0.35 : W * 0.5;
    const barX = showCoupled ? 20 : (W - barW) / 2;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(barX - 10, barY - 25, barW + 20, 55, 8);
    ctx.fill();

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("KE", barX, barY - 8);

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(barX, barY, (KE / maxE) * barW, 8, 3);
    ctx.fill();

    ctx.fillStyle = "#94a3b8";
    ctx.fillText("PE", barX, barY + 15);

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(barX, barY + 18, (PE / maxE) * barW, 8, 3);
    ctx.fill();

    // Challenge scoreboard
    if (challengeType !== "none") {
      renderScoreboard(ctx, 10, 10, 140, 110, challengeRef.current);

      // Target display
      if (challengeType === "match-period") {
        ctx.fillStyle = "rgba(245,158,11,0.15)";
        ctx.beginPath();
        ctx.roundRect(10, 130, 140, 40, 6);
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText("TARGET PERIOD", 80, 147);
        ctx.font = "bold 16px ui-monospace";
        ctx.fillText(`${targetPeriod.toFixed(2)} s`, 80, 165);
      }

      if (challengeType === "find-g") {
        ctx.fillStyle = "rgba(168,85,247,0.15)";
        ctx.beginPath();
        ctx.roundRect(10, 130, 140, 55, 6);
        ctx.fill();
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = "bold 10px ui-monospace";
        ctx.fillStyle = "#a855f7";
        ctx.textAlign = "center";
        ctx.fillText("FIND g", 80, 147);
        ctx.font = "11px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`L = ${(length / 100).toFixed(2)} m`, 80, 162);
        ctx.fillText(`T = ${(2 * Math.PI / Math.sqrt(targetG / (length / 100))).toFixed(3)} s`, 80, 177);
      }
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now)
    );
  }, [length, gravity, showCoupled, coupling, challengeType, targetPeriod, targetG, metronomeOn, initAngle, isRunning]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    const g = gravity;
    const L = length / 100;

    // Pendulum 1 physics
    let alpha1 = -(g / L) * Math.sin(angleRef.current);

    // Coupling force from pendulum 2
    if (showCoupled) {
      const k = coupling;
      const dtheta = angle2Ref.current - angleRef.current;
      alpha1 += k * dtheta;
    }

    angVelRef.current += alpha1 * dt;
    angVelRef.current *= Math.exp(-damping * dt);
    angleRef.current += angVelRef.current * dt;

    // Pendulum 2 physics (coupled)
    if (showCoupled) {
      let alpha2 = -(g / L) * Math.sin(angle2Ref.current);
      const k = coupling;
      const dtheta = angleRef.current - angle2Ref.current;
      alpha2 += k * dtheta;
      angVel2Ref.current += alpha2 * dt;
      angVel2Ref.current *= Math.exp(-damping * dt);
      angle2Ref.current += angVel2Ref.current * dt;
    }

    // Trail updates
    const canvas = canvasRef.current;
    if (canvas) {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const pivotX = showCoupled ? W * 0.35 : W * 0.5;
      const pivotY = H * 0.15;
      const scaleL = Math.min(1, (H * 0.65) / length);
      const displayL = length * scaleL;

      const bobX = pivotX + displayL * Math.sin(angleRef.current);
      const bobY = pivotY + displayL * Math.cos(angleRef.current);
      trailRef.current.push({ x: bobX, y: bobY });
      if (trailRef.current.length > 200) trailRef.current.shift();

      if (showCoupled) {
        const pivot2X = W * 0.65;
        const bob2X = pivot2X + displayL * Math.sin(angle2Ref.current);
        const bob2Y = pivotY + displayL * Math.cos(angle2Ref.current);
        trail2Ref.current.push({ x: bob2X, y: bob2Y });
        if (trail2Ref.current.length > 200) trail2Ref.current.shift();
      }
    }

    // Metronome: detect zero crossings of angle
    if (metronomeOn) {
      const currentSide = angleRef.current > 0.01 ? 1 : angleRef.current < -0.01 ? -1 : 0;
      if (currentSide !== 0 && currentSide !== lastTickSideRef.current) {
        playSFX("tick");
        lastTickSideRef.current = currentSide;
      }
    }

    // Period measurement: detect positive-going zero crossings
    const prevAngle = angleRef.current - angVelRef.current * dt;
    if (prevAngle < 0 && angleRef.current >= 0 && angVelRef.current > 0) {
      const crossingTime = now / 1000;
      periodCrossingsRef.current.push(crossingTime);
      if (periodCrossingsRef.current.length > 10) {
        periodCrossingsRef.current.shift();
      }
      const crossings = periodCrossingsRef.current;
      if (crossings.length >= 2) {
        const lastTwo = crossings.slice(-2);
        measuredPeriodRef.current = lastTwo[1] - lastTwo[0];
      }
    }

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [length, gravity, draw, showCoupled, coupling, damping, metronomeOn]);

  // Canvas click handler for "click to push"
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const pivotX = showCoupled ? W * 0.35 : W * 0.5;
      const pivotY = H * 0.15;
      const scaleL = Math.min(1, (H * 0.65) / length);
      const displayL = length * scaleL;
      const bobX = pivotX + displayL * Math.sin(angleRef.current);
      const bobY = pivotY + displayL * Math.cos(angleRef.current);

      if (isPointInCircle(pos.x, pos.y, bobX, bobY, 30)) {
        // Push in the direction away from click
        const dx = bobX - pos.x;
        const pushDir = dx > 0 ? 1 : -1;
        const pushStrength = 3.0;
        angVelRef.current += pushDir * pushStrength;
        playSFX("whoosh");
        particlesRef.current.emitSparks(bobX, bobY, 10, "#60a5fa");
      }

      // Also check pendulum 2
      if (showCoupled) {
        const pivot2X = W * 0.65;
        const bob2X = pivot2X + displayL * Math.sin(angle2Ref.current);
        const bob2Y = pivotY + displayL * Math.cos(angle2Ref.current);
        if (isPointInCircle(pos.x, pos.y, bob2X, bob2Y, 30)) {
          const dx = bob2X - pos.x;
          const pushDir = dx > 0 ? 1 : -1;
          angVel2Ref.current += pushDir * 3.0;
          playSFX("whoosh");
          particlesRef.current.emitSparks(bob2X, bob2Y, 10, "#ef4444");
        }
      }
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [showCoupled, length, isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.6), _isMobile ? 500 : 520));
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

  const reset = () => {
    angleRef.current = (initAngle * Math.PI) / 180;
    angVelRef.current = 0;
    trailRef.current = [];
    lastTsRef.current = null;
    lastTickSideRef.current = 0;
    periodCrossingsRef.current = [];
    measuredPeriodRef.current = 0;
    particlesRef.current.clear();
    if (showCoupled) {
      angle2Ref.current = 0;
      angVel2Ref.current = 0;
      trail2Ref.current = [];
    }
    draw();
  };

  const generateMatchPeriodChallenge = () => {
    const target = 1.0 + Math.random() * 2.5; // 1.0 to 3.5 seconds
    setTargetPeriod(parseFloat(target.toFixed(2)));
    setChallengeType("match-period");
    challengeRef.current = createChallengeState();
    challengeRef.current.active = true;
    challengeRef.current.description = `Match period: ${target.toFixed(2)}s`;
    setChallengeState(challengeRef.current);
  };

  const generateFindGChallenge = () => {
    const gValues = [1.62, 3.7, 9.8, 24.8, 11.2]; // Moon, Mars, Earth, Jupiter, Exoplanet
    const randomG = gValues[Math.floor(Math.random() * gValues.length)];
    setTargetG(randomG);
    setGravity(randomG);
    setChallengeType("find-g");
    setGGuess("");
    challengeRef.current = createChallengeState();
    challengeRef.current.active = true;
    challengeRef.current.description = `Find g from period and length`;
    setChallengeState(challengeRef.current);
    reset();
  };

  const handleCheckPeriod = () => {
    const currentPeriod = (2 * Math.PI) / Math.sqrt(gravity / (length / 100));
    const result = calculateAccuracy(currentPeriod, targetPeriod, targetPeriod);
    const newState = updateChallengeState(challengeRef.current, result);
    challengeRef.current = newState;
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight * 0.3,
        startTime: performance.now(),
      });
    }

    if (result.points >= 2) {
      playSFX("success");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight * 0.3, 20);
    } else if (result.points > 0) {
      playSFX("correct");
    } else {
      playSFX("incorrect");
    }
  };

  const handleSubmitG = () => {
    const guess = parseFloat(gGuess);
    if (isNaN(guess)) return;

    const result = calculateAccuracy(guess, targetG, targetG);
    const newState = updateChallengeState(challengeRef.current, result);
    challengeRef.current = newState;
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight * 0.3,
        startTime: performance.now(),
      });
    }

    if (result.points >= 2) {
      playSFX("success");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight * 0.3, 20);
    } else if (result.points > 0) {
      playSFX("correct");
    } else {
      playSFX("incorrect");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>

      {/* Challenge panels */}
      {challengeType === "match-period" && (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-amber-600 dark:text-amber-400 text-sm font-bold uppercase tracking-wider">
                Match the Period Challenge
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Adjust Length and Gravity to achieve T = {targetPeriod.toFixed(2)}s
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">Current period</div>
              <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                {((2 * Math.PI) / Math.sqrt(gravity / (length / 100))).toFixed(2)}s
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCheckPeriod}
              className="px-4 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
            >
              Check Match
            </button>
            <button
              onClick={generateMatchPeriodChallenge}
              className="px-4 h-9 rounded-lg border border-amber-500 text-amber-500 hover:bg-amber-500/10 font-medium text-sm transition-colors"
            >
              New Target
            </button>
            <div className="flex items-center gap-2 ml-auto text-sm text-gray-500 dark:text-gray-400">
              <span>Score: <strong className="text-gray-900 dark:text-white">{challengeState.score}</strong></span>
              <span>|</span>
              <span>Streak: <strong className="text-amber-400">{challengeState.streak}</strong></span>
            </div>
          </div>
        </div>
      )}

      {challengeType === "find-g" && (
        <div className="rounded-xl border-2 border-purple-500/50 bg-purple-50 dark:bg-purple-950/30 p-4 space-y-3">
          <div>
            <span className="text-purple-600 dark:text-purple-400 text-sm font-bold uppercase tracking-wider">
              Find g Challenge
            </span>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Observe the pendulum, measure the period, then calculate g using T = 2{"\u03C0"}{"\u221A"}(L/g)
            </p>
            <p className="text-xs font-mono text-gray-500 dark:text-gray-500 mt-1">
              L = {(length / 100).toFixed(2)} m | Measured T = {measuredPeriodRef.current > 0 ? measuredPeriodRef.current.toFixed(3) : "..."} s
            </p>
          </div>
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-purple-500">g (m/s{"\u00B2"})</label>
              <input
                type="number"
                step="0.1"
                value={gGuess}
                onChange={(e) => setGGuess(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="?"
              />
            </div>
            <button
              onClick={handleSubmitG}
              disabled={gGuess.trim() === ""}
              className="h-10 px-4 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              Submit
            </button>
            <button
              onClick={generateFindGChallenge}
              className="h-10 px-4 rounded-lg border border-purple-500 text-purple-500 hover:bg-purple-500/10 font-medium text-sm transition-colors"
            >
              New Planet
            </button>
            {challengeState.lastResult && (
              <div className="ml-auto text-sm">
                <span className="text-gray-500 dark:text-gray-400">Actual: </span>
                <span className="text-green-500 font-mono font-bold">{targetG.toFixed(1)} m/s{"\u00B2"}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Length</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={50} max={350} value={length}
              onChange={(e) => { setLength(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500"
              disabled={challengeType === "find-g"} />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{(length / 100).toFixed(1)} m</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gravity</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={25} step={0.1} value={gravity}
              onChange={(e) => { setGravity(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500"
              disabled={challengeType === "find-g"} />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">{gravity.toFixed(1)} m/s{"\u00B2"}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial Angle</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={5} max={170} value={initAngle}
              onChange={(e) => { setInitAngle(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{initAngle}&deg;</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      {/* Feature toggles and challenges */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setMetronomeOn(!metronomeOn)}
          className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors border ${
            metronomeOn
              ? "bg-amber-500 text-white border-amber-500"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          {metronomeOn ? "\u266A Metronome ON" : "\u266A Metronome"}
        </button>

        <button
          onClick={() => {
            setShowCoupled(!showCoupled);
            angle2Ref.current = 0;
            angVel2Ref.current = 0;
            trail2Ref.current = [];
          }}
          className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors border ${
            showCoupled
              ? "bg-red-500 text-white border-red-500"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          {showCoupled ? "Coupled ON" : "Coupled Pendulums"}
        </button>

        {showCoupled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Coupling:</span>
            <input type="range" min={0.1} max={10} step={0.1} value={coupling}
              onChange={(e) => setCoupling(Number(e.target.value))}
              className="w-24 accent-amber-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{coupling.toFixed(1)}</span>
          </div>
        )}

        <div className="h-9 w-px bg-gray-200 dark:bg-gray-700" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Damping:</span>
          <input type="range" min={0} max={3} step={0.1} value={damping}
            onChange={(e) => setDamping(Number(e.target.value))}
            className="w-20 accent-gray-500" />
          <span className="text-xs font-mono text-gray-500">{damping.toFixed(1)}</span>
        </div>

        <div className="h-9 w-px bg-gray-200 dark:bg-gray-700" />

        {challengeType === "none" ? (
          <>
            <button
              onClick={generateMatchPeriodChallenge}
              className="px-4 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
            >
              Match Period
            </button>
            <button
              onClick={generateFindGChallenge}
              className="px-4 h-9 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-medium text-sm transition-colors"
            >
              Find g
            </button>
          </>
        ) : (
          <button
            onClick={() => setChallengeType("none")}
            className="px-4 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
          >
            Exit Challenge
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="T = 2\pi\sqrt{L/g}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\alpha = -(g/L)\sin\theta" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E = mgh = mgL(1 - \cos\theta)" /></div>
        </div>
      </div>
    </div>
  );
}
