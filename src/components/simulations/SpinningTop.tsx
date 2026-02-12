"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import {
  calculateAccuracy,
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { SimMath } from "@/components/simulations/SimMath";

type ChallengeMode = "free" | "stabilize" | "predict";

interface PrecessionChallenge {
  targetRate: number;
  userGuess: number | null;
  revealed: boolean;
}

export default function SpinningTop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  const [mass, setMass] = useState(1.0);
  const [length, setLength] = useState(0.14);
  const [tiltDeg, setTiltDeg] = useState(28);
  const [spinRate, setSpinRate] = useState(120);
  const [spinDamping, setSpinDamping] = useState(0.08);
  const [isRunning, setIsRunning] = useState(true);

  // Challenge state
  const [mode, setMode] = useState<ChallengeMode>("free");
  const [challenge, setChallenge] = useState<ChallengeState>(createChallengeState());
  const [precessionChallenge, setPrecessionChallenge] = useState<PrecessionChallenge | null>(null);
  const [precGuessInput, setPrecGuessInput] = useState("");
  const [showNutation, setShowNutation] = useState(true);

  const phiRef = useRef(0);
  const omegaRef = useRef(spinRate);
  const thetaRef = useRef((tiltDeg * Math.PI) / 180);
  const nutationPhaseRef = useRef(0);
  const nutationTrailRef = useRef<{ x: number; y: number }[]>([]);

  // Stabilization challenge refs
  const stabilityRef = useRef(1.0);
  const perturbationRef = useRef(0);
  const stableTimeRef = useRef(0);
  const challengeTimerRef = useRef(0);
  const appliedTorqueRef = useRef({ x: 0, z: 0 });
  const thetaVelRef = useRef(0);

  // Scoring popups
  const popupsRef = useRef<ScorePopup[]>([]);
  const particleSystemRef = useRef(new ParticleSystem());

  const g = 9.81;
  const topRadius = 0.12;
  const momentOfInertia = 0.5 * mass * topRadius * topRadius;

  const projectPoint = useCallback(
    (x: number, y: number, z: number, cx: number, baseY: number, scale: number) => {
      return {
        x: cx + scale * (x + 0.45 * z),
        y: baseY - scale * (y + 0.2 * z),
      };
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W * 0.36;
    const baseY = H * 0.78;
    const scale = 420;

    const theta = thetaRef.current;
    const phi = phiRef.current;
    const omega = omegaRef.current;

    const nx = Math.sin(theta) * Math.cos(phi);
    const ny = Math.cos(theta);
    const nz = Math.sin(theta) * Math.sin(phi);

    const com = projectPoint(nx * length, ny * length, nz * length, cx, baseY, scale);
    const pivot = projectPoint(0, 0, 0, cx, baseY, scale);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    // Ground plane
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, baseY + 8, W, H - baseY);
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 8);
    ctx.lineTo(W, baseY + 8);
    ctx.stroke();

    // Precession guide circle
    const circleR = length * Math.sin(theta) * scale;
    ctx.strokeStyle = "rgba(59,130,246,0.25)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(
      cx,
      baseY - length * Math.cos(theta) * scale,
      circleR,
      circleR * 0.35,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.setLineDash([]);

    // Nutation trail (wiggly path showing nutation clearly)
    if (showNutation && nutationTrailRef.current.length > 1) {
      for (let i = 1; i < nutationTrailRef.current.length; i++) {
        const alpha = i / nutationTrailRef.current.length;
        ctx.strokeStyle = `rgba(250,204,21,${alpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nutationTrailRef.current[i - 1].x, nutationTrailRef.current[i - 1].y);
        ctx.lineTo(nutationTrailRef.current[i].x, nutationTrailRef.current[i].y);
        ctx.stroke();
      }
    }

    // Trail
    if (trailRef.current.length > 1) {
      for (let i = 1; i < trailRef.current.length; i++) {
        const alpha = i / trailRef.current.length;
        ctx.strokeStyle = `rgba(168,85,247,${alpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(trailRef.current[i - 1].x, trailRef.current[i - 1].y);
        ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
        ctx.stroke();
      }
    }

    // Top axis
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(com.x, com.y);
    ctx.stroke();

    // Top body
    const bodyR = 26;
    const bodyGrad = ctx.createRadialGradient(com.x - 4, com.y - 4, 0, com.x, com.y, bodyR);
    bodyGrad.addColorStop(0, "#60a5fa");
    bodyGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(com.x, com.y, bodyR, bodyR * 0.62, phi * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Click-to-nudge glow (pulsing when in stabilize mode)
    if (mode === "stabilize") {
      const pulsePhase = (performance.now() / 1000) % 1;
      const pulseAlpha = 0.15 + 0.1 * Math.sin(pulsePhase * Math.PI * 2);
      const hoverGlow = ctx.createRadialGradient(com.x, com.y, bodyR, com.x, com.y, bodyR + 25);
      hoverGlow.addColorStop(0, `rgba(250,204,21,${pulseAlpha})`);
      hoverGlow.addColorStop(1, "rgba(250,204,21,0)");
      ctx.fillStyle = hoverGlow;
      ctx.beginPath();
      ctx.arc(com.x, com.y, bodyR + 25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spin indicator ring
    const spinGlow = Math.min(1, omega / 160);
    ctx.strokeStyle = `rgba(250,204,21,${0.25 + 0.45 * spinGlow})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(com.x, com.y, bodyR + 8, bodyR * 0.72, phi * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Pivot point
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Angular momentum vector (L)
    const lLen = 50 * Math.min(1, omega / 80);
    const lEndX = com.x + nx * lLen * 0.6;
    const lEndY = com.y - ny * lLen;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(com.x, com.y);
    ctx.lineTo(lEndX, lEndY);
    ctx.stroke();
    // Arrowhead for L
    const lDx = lEndX - com.x;
    const lDy = lEndY - com.y;
    const lMag = Math.sqrt(lDx * lDx + lDy * lDy);
    if (lMag > 5) {
      const lnx = lDx / lMag;
      const lny = lDy / lMag;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(lEndX, lEndY);
      ctx.lineTo(lEndX - lnx * 8 - lny * 4, lEndY - lny * 8 + lnx * 4);
      ctx.lineTo(lEndX - lnx * 8 + lny * 4, lEndY - lny * 8 - lnx * 4);
      ctx.closePath();
      ctx.fill();
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("L", lEndX + 6, lEndY - 4);
    }

    // Angle label
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    ctx.fillText(`theta = ${((theta * 180) / Math.PI).toFixed(1)} deg`, cx - 120, baseY - 18);

    // Stability meter (on canvas, left side)
    const stability = stabilityRef.current;
    const meterX = 15;
    const meterY = 20;
    const meterW = 14;
    const meterH = H * 0.5;
    // Background
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Fill
    const fillH = Math.max(0, Math.min(1, stability)) * meterH;
    const meterColor =
      stability > 0.7 ? "#22c55e" : stability > 0.4 ? "#f59e0b" : "#ef4444";
    ctx.fillStyle = meterColor;
    ctx.beginPath();
    ctx.roundRect(meterX, meterY + meterH - fillH, meterW, fillH, 3);
    ctx.fill();
    // Label
    ctx.save();
    ctx.translate(meterX + meterW / 2, meterY - 10);
    ctx.font = "bold 9px ui-monospace, monospace";
    ctx.fillStyle = meterColor;
    ctx.textAlign = "center";
    ctx.fillText("STABILITY", 0, 0);
    ctx.restore();
    // Percentage
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = meterColor;
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(stability * 100)}%`, meterX + meterW / 2, meterY + meterH + 16);

    // Data panel
    const panelX = W * 0.62;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect(panelX, 18, W * 0.34, H - 36, 10);
    ctx.fill();

    const L = momentOfInertia * omega;
    const precessionOmega = mass * g * length / Math.max(L, 1e-4);
    const keRot = 0.5 * momentOfInertia * omega * omega;

    let y = 46;
    ctx.textAlign = "left";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("SPINNING TOP", panelX + 14, y);
    y += 24;

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#22c55e";
    ctx.fillText(`omega_spin = ${omega.toFixed(1)} rad/s`, panelX + 14, y);
    y += 22;
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`Omega_prec = ${precessionOmega.toFixed(2)} rad/s`, panelX + 14, y);
    y += 22;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`L = ${L.toFixed(3)} kg\u00B7m\u00B2/s`, panelX + 14, y);
    y += 22;
    ctx.fillStyle = "#60a5fa";
    ctx.fillText(`KE_rot = ${keRot.toFixed(2)} J`, panelX + 14, y);
    y += 26;

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`I = ${momentOfInertia.toFixed(4)} kg\u00B7m\u00B2`, panelX + 14, y);
    y += 16;
    ctx.fillText(`m = ${mass.toFixed(2)} kg, l = ${length.toFixed(2)} m`, panelX + 14, y);
    y += 20;

    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Model: Omega = tau/L = mgl/(I*omega)", panelX + 14, y);
    y += 20;

    // Challenge info on canvas
    if (mode === "stabilize") {
      y += 10;
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillText("STABILIZATION CHALLENGE", panelX + 14, y);
      y += 16;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("Click the top to apply nudge", panelX + 14, y);
      y += 14;
      ctx.fillText("Keep stability above 50%", panelX + 14, y);
      y += 14;
      ctx.fillText(`Survived: ${stableTimeRef.current.toFixed(1)}s`, panelX + 14, y);

      // Scoreboard
      renderScoreboard(ctx, panelX + 8, y + 12, W * 0.34 - 16, 100, challenge);
    }

    if (mode === "predict") {
      y += 10;
      ctx.fillStyle = "#a78bfa";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillText("PRECESSION PREDICTION", panelX + 14, y);
      y += 16;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("Predict the precession rate", panelX + 14, y);
      y += 14;
      ctx.fillText("given spin and tilt angle.", panelX + 14, y);

      renderScoreboard(ctx, panelX + 8, y + 12, W * 0.34 - 16, 100, challenge);
    }

    // Render particles
    particleSystemRef.current.draw(ctx);

    // Render score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [length, mass, momentOfInertia, projectPoint, mode, challenge, showNutation]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    // Spin damping
    omegaRef.current *= Math.exp(-spinDamping * dt);

    // Nutation
    nutationPhaseRef.current += dt * Math.max(2, omegaRef.current * 0.05);
    const baseTheta = (tiltDeg * Math.PI) / 180;
    const nutationAmp = 0.03 * Math.exp(-spinDamping * 3);

    if (mode === "stabilize") {
      // Add random perturbations in stabilize mode
      perturbationRef.current += dt;
      if (perturbationRef.current > 2.0) {
        // Apply random perturbation every ~2 seconds
        perturbationRef.current = 0;
        const perturbStrength = 0.5 + Math.random() * 1.5;
        thetaVelRef.current += (Math.random() - 0.5) * perturbStrength;
        playSFX("whoosh");
      }

      // Apply user corrective torque
      thetaVelRef.current += appliedTorqueRef.current.x * dt * 20;
      appliedTorqueRef.current.x *= 0.9;
      appliedTorqueRef.current.z *= 0.9;

      // Gravity tries to topple
      thetaVelRef.current += Math.sin(thetaRef.current) * g * 0.3 * dt;

      // Gyroscopic stabilization (stronger with higher spin)
      const gyroStab = Math.min(1, omegaRef.current / 60);
      thetaVelRef.current *= 1 - gyroStab * 0.8 * dt;

      // Damping
      thetaVelRef.current *= 0.98;

      thetaRef.current += thetaVelRef.current * dt;
      thetaRef.current = Math.max(0.05, Math.min(Math.PI * 0.48, thetaRef.current));

      // Stability calculation
      const thetaDev = Math.abs(thetaRef.current - baseTheta);
      const velPenalty = Math.abs(thetaVelRef.current) * 0.2;
      stabilityRef.current = Math.max(0, 1 - thetaDev * 3 - velPenalty);

      // Track stable time
      if (stabilityRef.current > 0.5) {
        stableTimeRef.current += dt;
        challengeTimerRef.current += dt;
        // Award points every 5 seconds of stability
        if (challengeTimerRef.current >= 5.0) {
          challengeTimerRef.current -= 5.0;
          const result = {
            points: stabilityRef.current > 0.8 ? 3 : stabilityRef.current > 0.6 ? 2 : 1,
            tier: (stabilityRef.current > 0.8 ? "perfect" : stabilityRef.current > 0.6 ? "great" : "good") as "perfect" | "great" | "good",
            label: stabilityRef.current > 0.8 ? "Stable!" : stabilityRef.current > 0.6 ? "Holding!" : "OK!",
          };
          setChallenge((prev) => updateChallengeState(prev, result));
          popupsRef.current.push({
            text: result.label,
            points: result.points,
            x: canvasRef.current ? canvasRef.current.width * 0.36 : 300,
            y: canvasRef.current ? canvasRef.current.height * 0.4 : 200,
            startTime: now,
          });
          playScore(result.points);
        }
      } else {
        challengeTimerRef.current = 0;
      }

      // Check for topple (game over scenario)
      if (stabilityRef.current < 0.05) {
        playSFX("fail");
        const canvas = canvasRef.current;
        if (canvas) {
          const W = canvas.clientWidth;
          const baseY2 = canvas.clientHeight * 0.78;
          particleSystemRef.current.emitSparks(W * 0.36, baseY2, 20, "#ef4444");
        }
        // Reset position
        thetaRef.current = baseTheta;
        thetaVelRef.current = 0;
        stabilityRef.current = 1.0;
        stableTimeRef.current = 0;
      }
    } else {
      thetaRef.current = baseTheta + nutationAmp * Math.sin(nutationPhaseRef.current);
      // In free mode, compute stability from tilt and spin
      const tiltRatio = thetaRef.current / (Math.PI / 2);
      const spinStab = Math.min(1, omegaRef.current / 40);
      stabilityRef.current = Math.max(0, (1 - tiltRatio) * spinStab);
    }

    const L = momentOfInertia * Math.max(omegaRef.current, 0.4);
    const precessionOmega = (mass * g * length) / L;
    phiRef.current += precessionOmega * dt;

    const canvas = canvasRef.current;
    if (canvas) {
      const cx2 = canvas.clientWidth * 0.36;
      const baseY2 = canvas.clientHeight * 0.78;
      const scale2 = 420;
      const nx2 = Math.sin(thetaRef.current) * Math.cos(phiRef.current);
      const ny2 = Math.cos(thetaRef.current);
      const nz2 = Math.sin(thetaRef.current) * Math.sin(phiRef.current);
      const com2 = projectPoint(nx2 * length, ny2 * length, nz2 * length, cx2, baseY2, scale2);
      trailRef.current.push({ x: com2.x, y: com2.y });
      if (trailRef.current.length > 180) trailRef.current.shift();

      // Nutation sub-trail (higher resolution)
      nutationTrailRef.current.push({ x: com2.x, y: com2.y });
      if (nutationTrailRef.current.length > 400) nutationTrailRef.current.shift();
    }

    // Update particles
    particleSystemRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, length, mass, momentOfInertia, projectPoint, spinDamping, tiltDeg, mode]);

  useEffect(() => {
    omegaRef.current = spinRate;
  }, [spinRate]);

  useEffect(() => {
    thetaRef.current = (tiltDeg * Math.PI) / 180;
  }, [tiltDeg]);

  // Handle canvas click for nudge
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const cx = W * 0.36;
      const baseY = H * 0.78;
      const scale = 420;

      const theta = thetaRef.current;
      const phi = phiRef.current;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      const com = projectPoint(nx * length, ny * length, nz * length, cx, baseY, scale);

      const dist = Math.sqrt((mx - com.x) ** 2 + (my - com.y) ** 2);
      if (dist < 50) {
        // Apply nudge torque - push the top back towards vertical
        const nudgeDir = mx < com.x ? -1 : 1;
        if (mode === "stabilize") {
          // Corrective torque in stabilize mode
          appliedTorqueRef.current.x -= nudgeDir * 2.0;
          playSFX("click");
          particleSystemRef.current.emitSparks(mx, my, 8, "#fbbf24");
        } else {
          // Free mode nudge - just perturb
          thetaRef.current += nudgeDir * 0.08;
          omegaRef.current *= 0.95;
          playSFX("pop");
          particleSystemRef.current.emitSparks(mx, my, 12, "#60a5fa");
        }
      }
    },
    [length, mode, projectPoint]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.52), _isMobile ? 500 : 470));
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
  }, [animate, isRunning]);

  const reset = () => {
    phiRef.current = 0;
    thetaRef.current = (tiltDeg * Math.PI) / 180;
    omegaRef.current = spinRate;
    nutationPhaseRef.current = 0;
    lastTsRef.current = null;
    trailRef.current = [];
    nutationTrailRef.current = [];
    thetaVelRef.current = 0;
    stabilityRef.current = 1.0;
    stableTimeRef.current = 0;
    challengeTimerRef.current = 0;
    perturbationRef.current = 0;
    appliedTorqueRef.current = { x: 0, z: 0 };
    particleSystemRef.current.clear();
    popupsRef.current = [];
    draw();
  };

  const startPrecessionChallenge = () => {
    // Randomize parameters for a challenge
    const newSpin = 40 + Math.floor(Math.random() * 200);
    const newTilt = 15 + Math.floor(Math.random() * 50);
    setSpinRate(newSpin);
    setTiltDeg(newTilt);
    omegaRef.current = newSpin;
    thetaRef.current = (newTilt * Math.PI) / 180;

    const I = 0.5 * mass * topRadius * topRadius;
    const L = I * newSpin;
    const targetPrec = (mass * g * length) / L;

    setPrecessionChallenge({
      targetRate: targetPrec,
      userGuess: null,
      revealed: false,
    });
    setPrecGuessInput("");
  };

  const submitPrecGuess = () => {
    if (!precessionChallenge) return;
    const guess = parseFloat(precGuessInput);
    if (isNaN(guess)) return;

    const result = calculateAccuracy(guess, precessionChallenge.targetRate, precessionChallenge.targetRate * 2);
    setChallenge((prev) => updateChallengeState(prev, result));
    setPrecessionChallenge((prev) =>
      prev ? { ...prev, userGuess: guess, revealed: true } : prev
    );

    popupsRef.current.push({
      text: result.label,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width * 0.5 : 300,
      y: canvasRef.current ? canvasRef.current.height * 0.3 : 150,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }
  };

  const switchMode = (newMode: ChallengeMode) => {
    setMode(newMode);
    setChallenge(createChallengeState());
    setPrecessionChallenge(null);
    reset();
    if (newMode === "predict") {
      startPrecessionChallenge();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          onClick={handleCanvasClick}
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
          onClick={() => switchMode("stabilize")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "stabilize"
              ? "bg-amber-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Stabilization Challenge
        </button>
        <button
          onClick={() => switchMode("predict")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "predict"
              ? "bg-purple-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Precession Prediction
        </button>
        <label className="flex items-center gap-2 px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showNutation}
            onChange={(e) => setShowNutation(e.target.checked)}
            className="accent-amber-500"
          />
          Show Nutation
        </label>
      </div>

      {/* Precession prediction UI */}
      {mode === "predict" && precessionChallenge && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Predict the Precession Rate
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Given: spin = {spinRate} rad/s, tilt = {tiltDeg} deg, m = {mass.toFixed(2)} kg, l ={" "}
            {length.toFixed(2)} m, I = {momentOfInertia.toFixed(4)} kg·m²
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-mono">
            Hint: Omega_prec = mgl / (I * omega_spin)
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.1"
              value={precGuessInput}
              onChange={(e) => setPrecGuessInput(e.target.value)}
              placeholder="Your guess (rad/s)"
              disabled={precessionChallenge.revealed}
              className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100"
            />
            {!precessionChallenge.revealed ? (
              <button
                onClick={submitPrecGuess}
                className="h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
              >
                Submit
              </button>
            ) : (
              <button
                onClick={startPrecessionChallenge}
                className="h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
              >
                Next
              </button>
            )}
          </div>
          {precessionChallenge.revealed && (
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Actual: <span className="font-mono text-purple-400">{precessionChallenge.targetRate.toFixed(2)} rad/s</span>
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                Your guess: <span className="font-mono text-blue-400">{precessionChallenge.userGuess?.toFixed(2)} rad/s</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stabilization mode instructions */}
      {mode === "stabilize" && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
            Gyroscope Stabilization Challenge
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Random perturbations will tilt the top. Click on the spinning top to apply corrective nudges
            and keep it stable. Earn points for every 5 seconds of stability above 50%.
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm text-amber-600 dark:text-amber-400 font-mono">
            <span>Score: {challenge.score}</span>
            <span>Streak: {challenge.streak}</span>
            <span>Survived: {stableTimeRef.current.toFixed(1)}s</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Spin Rate
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={20}
              max={300}
              step={2}
              value={spinRate}
              onChange={(e) => setSpinRate(Number(e.target.value))}
              className="flex-1 accent-amber-500"
              disabled={mode === "predict"}
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4.5rem] text-right">
              {spinRate.toFixed(0)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Tilt Angle
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={70}
              step={1}
              value={tiltDeg}
              onChange={(e) => setTiltDeg(Number(e.target.value))}
              className="flex-1 accent-purple-500"
              disabled={mode === "predict"}
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {tiltDeg} deg
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Stem Length (m)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.05}
              max={0.25}
              step={0.005}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {length.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mass (kg)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.2}
              max={2.0}
              step={0.05}
              value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="flex-1 accent-cyan-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {mass.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Spin Damping
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0}
              max={0.4}
              step={0.01}
              value={spinDamping}
              onChange={(e) => setSpinDamping(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {spinDamping.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={() => {
              if (!isRunning) {
                lastTsRef.current = null;
              }
              setIsRunning(!isRunning);
            }}
            className="flex-1 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Gyroscope Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">L = I omega</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">tau = m g l</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Omega = tau / L</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            KE = 1/2 I omega^2
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="L = I\omega" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\Omega_p = \frac{Mgd}{L}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\tau = r \times F" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Adjust spin speed and tilt to see how gyroscopic precession changes. Faster spin = slower precession!
      </p>
    </div>
  );
}
