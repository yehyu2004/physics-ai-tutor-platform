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
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type SimMode = "sandbox" | "challenge" | "resonance";

/** Generate a random target frequency in a reasonable range */
function randomTargetFreq(): number {
  // frequency = (1/(2pi)) * sqrt(k/m), range roughly 0.1 - 1.3 Hz
  return Math.round((0.2 + Math.random() * 1.0) * 100) / 100;
}

export default function SimpleHarmonicMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Physics params
  const [mass, setMass] = useState(2);
  const [springK, setSpringK] = useState(10);
  const [amplitude, setAmplitude] = useState(100);
  const [damping, setDamping] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  // Mode
  const [mode, setMode] = useState<SimMode>("sandbox");

  // Challenge mode
  const [targetFreq, setTargetFreq] = useState(() => randomTargetFreq());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);

  // Resonance mode
  const [drivingFreq, setDrivingFreq] = useState(0.5);
  const [drivingAmplitude, setDrivingAmplitude] = useState(30);

  // Audio
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Internal simulation state
  const stateRef = useRef({
    time: 0,
    position: 0, // displacement from equilibrium (px)
    velocity: 0, // px/s
    history: [] as number[],
    lastTs: null as number | null,
    particles: new ParticleSystem(),
    lastExtreme: 0, // time of last extreme detection for spark throttling
    impulseApplied: false,
    // For resonance: track amplitude envelope
    maxDisplacement: 0,
    resonanceHistory: [] as number[],
  });

  // ---- Audio helpers ----
  const startAudioTone = useCallback((freq: number) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      // Stop previous
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch { /* ignore */ }
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      // Map physics frequency to audible range (scale up by 220)
      osc.frequency.value = Math.max(60, Math.min(2000, freq * 220));
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscRef.current = osc;
      gainNodeRef.current = gain;
    } catch { /* Web Audio not available */ }
  }, [soundEnabled]);

  const stopAudioTone = useCallback(() => {
    if (oscRef.current) {
      try {
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.exponentialRampToValueAtTime(
            0.001,
            (audioCtxRef.current?.currentTime ?? 0) + 0.1,
          );
        }
        setTimeout(() => {
          try { oscRef.current?.stop(); } catch { /* ignore */ }
          oscRef.current = null;
        }, 120);
      } catch { /* ignore */ }
    }
  }, []);

  const updateAudioTone = useCallback((freq: number, velocityMagnitude: number) => {
    if (!soundEnabled || !oscRef.current || !gainNodeRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    oscRef.current.frequency.setValueAtTime(
      Math.max(60, Math.min(2000, freq * 220)),
      ctx.currentTime,
    );
    // Volume proportional to velocity (louder when moving fast)
    const vol = Math.min(0.15, 0.02 + velocityMagnitude * 0.0003);
    gainNodeRef.current.gain.setValueAtTime(vol, ctx.currentTime);
  }, [soundEnabled]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      try { oscRef.current?.stop(); } catch { /* */ }
      try { audioCtxRef.current?.close(); } catch { /* */ }
    };
  }, []);

  // Start/stop tone when soundEnabled or isRunning changes
  useEffect(() => {
    if (soundEnabled && isRunning) {
      const omega = Math.sqrt(springK / mass);
      const freq = omega / (2 * Math.PI);
      startAudioTone(freq);
    } else {
      stopAudioTone();
    }
  }, [soundEnabled, isRunning, springK, mass, startAudioTone, stopAudioTone]);

  // ---- Drawing ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const midY = H * 0.35;
    const graphY = H * 0.65;
    const graphH = H * 0.3;
    const s = stateRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Equilibrium line
    const eqX = W * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(eqX, 20);
    ctx.lineTo(eqX, midY + 40);
    ctx.stroke();
    ctx.setLineDash([]);

    // Physics values
    const omega = Math.sqrt(springK / mass);
    const freq = omega / (2 * Math.PI);
    const period = 1 / freq;
    const displacement = s.position;
    const velocity = s.velocity;

    const massX = eqX + displacement;

    // Wall
    ctx.fillStyle = "#475569";
    ctx.fillRect(30, midY - 30, 12, 60);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(30, midY - 25 + i * 12);
      ctx.lineTo(22, midY - 18 + i * 12);
      ctx.stroke();
    }

    // Spring (zigzag)
    const springStart = 42;
    const springEnd = massX - 25;
    const coils = 12;
    const segLen = (springEnd - springStart) / (coils * 2);
    const springAmp = 14;

    // Color spring based on stretch/compression
    const stretch = displacement / amplitude;
    if (stretch > 0.5) {
      ctx.strokeStyle = "#ef4444"; // red when stretched
    } else if (stretch < -0.5) {
      ctx.strokeStyle = "#3b82f6"; // blue when compressed
    } else {
      ctx.strokeStyle = "#94a3b8";
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(springStart, midY);
    for (let i = 0; i < coils * 2; i++) {
      const sx = springStart + segLen * (i + 1);
      const sy = midY + (i % 2 === 0 ? springAmp : -springAmp);
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(massX - 25, midY);
    ctx.stroke();

    // Mass block with glow when near extremes
    const blockW = 50;
    const blockH = 50;
    const absStretch = Math.abs(stretch);

    // Glow at extremes
    if (absStretch > 0.85) {
      const glowIntensity = (absStretch - 0.85) / 0.15;
      const glowColor = stretch > 0 ? `rgba(239,68,68,${glowIntensity * 0.3})` : `rgba(59,130,246,${glowIntensity * 0.3})`;
      ctx.shadowColor = stretch > 0 ? "#ef4444" : "#3b82f6";
      ctx.shadowBlur = glowIntensity * 20;
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(massX, midY, blockW * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    const gradient = ctx.createLinearGradient(
      massX - blockW / 2, midY - blockH / 2,
      massX + blockW / 2, midY + blockH / 2,
    );
    gradient.addColorStop(0, "#3b82f6");
    gradient.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(massX - blockW / 2, midY - blockH / 2, blockW, blockH, 6);
    ctx.fill();

    // "Click me" hint on mass (only in sandbox or first few seconds)
    if (s.time < 3 && mode === "sandbox") {
      const hintAlpha = Math.max(0, 1 - s.time / 3);
      ctx.fillStyle = `rgba(255,255,255,${hintAlpha * 0.6})`;
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("click to push", massX, midY - blockH / 2 - 8);
    }

    // Mass label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${mass} kg`, massX, midY + 5);

    // Velocity arrow
    const velScale = 0.5;
    const velLen = velocity * velScale;
    if (Math.abs(velLen) > 3) {
      ctx.strokeStyle = "#22c55e";
      ctx.fillStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(massX, midY + blockH / 2 + 15);
      ctx.lineTo(massX + velLen, midY + blockH / 2 + 15);
      ctx.stroke();
      const dir = velLen > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(massX + velLen, midY + blockH / 2 + 15);
      ctx.lineTo(massX + velLen - dir * 8, midY + blockH / 2 + 10);
      ctx.lineTo(massX + velLen - dir * 8, midY + blockH / 2 + 20);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = "11px system-ui";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("velocity", massX + 30, midY + blockH / 2 + 35);

    // Force arrow (restoring force)
    const forceScale = 0.3;
    const force = -springK * displacement / 100; // scale down
    const forceLen = force * forceScale * 100;
    if (Math.abs(forceLen) > 3) {
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(massX, midY - blockH / 2 - 15);
      ctx.lineTo(massX + forceLen, midY - blockH / 2 - 15);
      ctx.stroke();
      const dir = forceLen > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(massX + forceLen, midY - blockH / 2 - 15);
      ctx.lineTo(massX + forceLen - dir * 6, midY - blockH / 2 - 20);
      ctx.lineTo(massX + forceLen - dir * 6, midY - blockH / 2 - 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = "11px system-ui";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "left";
    ctx.fillText("F = -kx", massX + 30, midY - blockH / 2 - 10);

    // Energy bars
    const KE = 0.5 * mass * velocity * velocity / 1000;
    const PE = 0.5 * springK * displacement * displacement / 1000;
    const TE = KE + PE;
    const barMaxW = 120;
    const barX = W - 180;
    const barY = 30;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(barX - 15, barY - 15, 175, 110, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("ENERGY", barX, barY);

    // KE bar
    ctx.fillStyle = "#ef4444";
    const keW = TE > 0 ? (KE / TE) * barMaxW : 0;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 15, keW, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "11px system-ui";
    ctx.fillText(`KE: ${KE.toFixed(1)}`, barX + barMaxW + 8, barY + 27);

    // PE bar
    ctx.fillStyle = "#3b82f6";
    const peW = TE > 0 ? (PE / TE) * barMaxW : 0;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 38, peW, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(`PE: ${PE.toFixed(1)}`, barX + barMaxW + 8, barY + 50);

    // Total bar
    ctx.fillStyle = "#a855f7";
    const dampFactor = damping > 0 ? Math.exp(-damping * s.time / (2 * mass)) : 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 61, barMaxW * dampFactor * dampFactor, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#d8b4fe";
    ctx.fillText(`TE: ${(KE + PE).toFixed(1)}`, barX + barMaxW + 8, barY + 73);

    // Physics info panel (top left)
    drawInfoPanel(ctx, 10, 10, 160, mode === "resonance" ? 120 : 90, "OSCILLATOR", [
      { label: "f", value: `${freq.toFixed(3)} Hz`, color: "#60a5fa" },
      { label: "T", value: `${period.toFixed(3)} s`, color: "#60a5fa" },
      { label: "omega", value: `${omega.toFixed(2)} rad/s`, color: "#60a5fa" },
      ...(mode === "resonance" ? [
        { label: "f_drive", value: `${drivingFreq.toFixed(3)} Hz`, color: "#f59e0b" },
        { label: "A_resp", value: `${s.maxDisplacement.toFixed(0)} cm`, color: "#f59e0b" },
      ] : []),
    ]);

    // Challenge mode overlay
    if (mode === "challenge") {
      const ch = challengeRef.current;

      // Target frequency display
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 120, 8, 240, 50, 8);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("MATCH THE FREQUENCY", W / 2, 25);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px ui-monospace, monospace";
      ctx.fillText(`Target: ${targetFreq.toFixed(2)} Hz`, W / 2, 48);

      // Current frequency indicator
      const freqError = Math.abs(freq - targetFreq);
      const freqColor = freqError < 0.02 ? "#22c55e" : freqError < 0.1 ? "#f59e0b" : "#ef4444";
      ctx.fillStyle = freqColor;
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.fillText(`Your: ${freq.toFixed(2)} Hz`, W / 2, midY + blockH / 2 + 55);

      // Accuracy bar
      const barW2 = 200;
      const barH2 = 8;
      const barX2 = W / 2 - barW2 / 2;
      const barY2 = midY + blockH / 2 + 62;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.roundRect(barX2, barY2, barW2, barH2, 4);
      ctx.fill();
      const accuracy = Math.max(0, 1 - freqError / targetFreq);
      ctx.fillStyle = freqColor;
      ctx.beginPath();
      ctx.roundRect(barX2, barY2, barW2 * accuracy, barH2, 4);
      ctx.fill();

      // Scoreboard
      if (ch.attempts > 0) {
        renderScoreboard(ctx, W - 150, graphY - 80, 140, 90, ch);
      }
    }

    // Resonance mode overlay
    if (mode === "resonance") {
      // Draw driving force indicator
      const drivingPhase = 2 * Math.PI * drivingFreq * s.time;
      const drivingDisp = drivingAmplitude * Math.sin(drivingPhase);

      // Draw driving force arrow at bottom of mass
      ctx.strokeStyle = "#f59e0b";
      ctx.fillStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(massX, midY + blockH / 2 + 30);
      ctx.lineTo(massX + drivingDisp * 0.5, midY + blockH / 2 + 30);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("driving force", massX, midY + blockH / 2 + 45);

      // Resonance detection
      const resonanceRatio = freq > 0 ? drivingFreq / freq : 0;
      const isNearResonance = Math.abs(resonanceRatio - 1) < 0.05;

      if (isNearResonance) {
        // Pulsing "RESONANCE!" text
        const pulseAlpha = 0.6 + 0.4 * Math.sin(s.time * 6);
        ctx.fillStyle = `rgba(245,158,11,${pulseAlpha})`;
        ctx.font = "bold 16px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("RESONANCE!", W / 2, graphY - 15);
      }

      // Amplitude response indicator
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 100, graphY - 45, 200, 25, 6);
      ctx.fill();
      ctx.fillStyle = isNearResonance ? "#f59e0b" : "#94a3b8";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `f_drive/f_natural = ${resonanceRatio.toFixed(2)}`,
        W / 2, graphY - 28,
      );
    }

    // Graph
    const history = s.history;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(20, graphY - 10, W - 40, graphH + 20, 8);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, graphY + graphH / 2);
    ctx.lineTo(W - 30, graphY + graphH / 2);
    ctx.stroke();

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText("x(t)", 42, graphY + 5);

    if (history.length > 1) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const graphW = W - 80;
      const maxPts = 300;
      const startIdx = Math.max(0, history.length - maxPts);
      const maxAmp = Math.max(amplitude + 10, s.maxDisplacement + 10);
      for (let i = startIdx; i < history.length; i++) {
        const px = 40 + ((i - startIdx) / maxPts) * graphW;
        const py = graphY + graphH / 2 - (history[i] / maxAmp) * (graphH / 2 - 5);
        if (i === startIdx) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw particles
    s.particles.draw(ctx);

    // Draw score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter(
      (p) => renderScorePopup(ctx, p, now),
    );
  }, [mass, springK, amplitude, damping, mode, targetFreq, drivingFreq, drivingAmplitude]);

  // ---- Physics simulation (Velocity Verlet) ----
  const animate = useCallback(() => {
    const now = performance.now();
    const s = stateRef.current;

    if (s.lastTs == null) {
      s.lastTs = now;
    }
    const dt = Math.min((now - s.lastTs) / 1000, 0.05);
    s.lastTs = now;

    // Force calculation function
    const calcForce = (pos: number, vel: number, t: number): number => {
      let F = -springK * pos; // Restoring force (k in N/m, pos in px -> treat as F proportional)
      F -= damping * vel;     // Damping force

      // Driving force in resonance mode
      if (mode === "resonance") {
        const drivingPhase = 2 * Math.PI * drivingFreq * t;
        F += drivingAmplitude * springK * 0.1 * Math.sin(drivingPhase);
      }

      return F;
    };

    // Velocity Verlet integration
    const F1 = calcForce(s.position, s.velocity, s.time);
    const acc1 = F1 / mass;
    const newPos = s.position + s.velocity * dt + 0.5 * acc1 * dt * dt;
    const F2 = calcForce(newPos, s.velocity, s.time + dt);
    const acc2 = F2 / mass;
    const newVel = s.velocity + 0.5 * (acc1 + acc2) * dt;

    s.position = newPos;
    s.velocity = newVel;
    s.time += dt;

    // Track max displacement (for resonance mode amplitude display)
    const absPos = Math.abs(s.position);
    if (absPos > s.maxDisplacement) {
      s.maxDisplacement = absPos;
    }
    // Slowly decay max tracker
    s.maxDisplacement *= 0.999;

    // History
    s.history.push(s.position);
    if (s.history.length > 500) s.history.shift();

    // Particle effects at max extension/compression
    if (amplitude > 0) {
      const stretchRatio = Math.abs(s.position) / amplitude;
      if (stretchRatio > 0.92 && Math.abs(s.velocity) < 30 && s.time - s.lastExtreme > 0.3) {
        const canvas = canvasRef.current;
        if (canvas) {
          const midY = canvas.clientHeight * 0.35;
          const eqX = canvas.clientWidth * 0.5;
          const massX = eqX + s.position;
          const sparkColor = s.position > 0 ? "#ef4444" : "#3b82f6";
          s.particles.emitSparks(massX, midY, 8, sparkColor);
          s.lastExtreme = s.time;
        }
      }
    }

    // Update particles
    s.particles.update(dt);

    // Update audio
    const omega = Math.sqrt(springK / mass);
    const freq = omega / (2 * Math.PI);
    updateAudioTone(freq, Math.abs(s.velocity));

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [mass, springK, amplitude, damping, draw, mode, drivingFreq, drivingAmplitude, updateAudioTone]);

  // ---- Canvas resize ----
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

  // ---- Animation loop ----
  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // ---- Click-to-push interaction ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const midY = H * 0.35;
        const eqX = W * 0.5;
        const s = stateRef.current;
        const massX = eqX + s.position;

        // Check if click is on or near the mass block
        const blockW = 50;
        const blockH = 50;
        const dx = x - massX;
        const dy = y - midY;

        if (Math.abs(dx) < blockW && Math.abs(dy) < blockH) {
          // Apply impulse: push in the direction away from click
          const pushDir = dx > 0 ? -1 : 1;
          const impulse = pushDir * (80 + Math.abs(dx) * 2);
          s.velocity += impulse;
          s.impulseApplied = true;

          // Visual + audio feedback
          playSFX("pop");
          s.particles.emitGlow(massX, midY, 6, "#60a5fa");

          // If paused, start running
          if (!isRunning) {
            stateRef.current.lastTs = null;
            setIsRunning(true);
          }
        }
      },
    });

    return cleanup;
  }, [isRunning]);

  // ---- Reset ----
  const reset = useCallback(() => {
    const s = stateRef.current;
    s.time = 0;
    s.position = amplitude;
    s.velocity = 0;
    s.history = [];
    s.lastTs = null;
    s.particles.clear();
    s.lastExtreme = 0;
    s.maxDisplacement = 0;
    s.resonanceHistory = [];
    s.impulseApplied = false;
    draw();
  }, [amplitude, draw]);

  // Initialize position on mount
  useEffect(() => {
    stateRef.current.position = amplitude;
    stateRef.current.velocity = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Challenge: check answer ----
  const checkFrequency = useCallback(() => {
    const omega = Math.sqrt(springK / mass);
    const currentFreq = omega / (2 * Math.PI);
    const result = calculateAccuracy(currentFreq, targetFreq, targetFreq);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    // Add popup
    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight * 0.35 - 50,
        startTime: performance.now(),
      });
    }

    // Sound effects
    if (result.points >= 3) {
      playSFX("success");
      playScore(result.points);
      // Confetti for perfect
      if (canvas) {
        stateRef.current.particles.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight * 0.35, 25);
      }
    } else if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }

    // Generate new target after a delay
    setTimeout(() => {
      setTargetFreq(randomTargetFreq());
    }, 1500);
  }, [springK, mass, targetFreq]);

  // ---- Mode switch handlers ----
  const switchMode = useCallback((newMode: SimMode) => {
    setMode(newMode);
    if (newMode === "challenge") {
      challengeRef.current = createChallengeState();
      challengeRef.current.active = true;
      setTargetFreq(randomTargetFreq());
      setDamping(0);
    } else if (newMode === "resonance") {
      setDamping(0.5); // Need some damping for resonance to be visible
      const omega = Math.sqrt(springK / mass);
      setDrivingFreq(omega / (2 * Math.PI)); // Start at natural frequency
    } else {
      setDamping(0);
    }
    reset();
  }, [reset, springK, mass]);

  // Compute derived values for display
  const omega = Math.sqrt(springK / mass);
  const freq = omega / (2 * Math.PI);

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "challenge", "resonance"] as SimMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {m === "sandbox" ? "Sandbox" : m === "challenge" ? "Match the Frequency" : "Resonance"}
          </button>
        ))}
        <button
          onClick={() => {
            setSoundEnabled(!soundEnabled);
            if (!soundEnabled) {
              playSFX("click");
            }
          }}
          className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors ml-auto ${
            soundEnabled
              ? "bg-green-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          {soundEnabled ? "Sound ON" : "Sound OFF"}
        </button>
      </div>

      {/* Canvas */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mass
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={mass}
              onChange={(e) => {
                setMass(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {mass} kg
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Spring Constant
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={50}
              value={springK}
              onChange={(e) => {
                setSpringK(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
              {springK} N/m
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Amplitude
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={20}
              max={180}
              value={amplitude}
              onChange={(e) => {
                setAmplitude(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {amplitude} cm
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Damping
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={damping}
              onChange={(e) => {
                setDamping(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {damping.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Resonance-specific controls */}
      {mode === "resonance" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Driving Frequency
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={0.05}
                max={2.0}
                step={0.01}
                value={drivingFreq}
                onChange={(e) => setDrivingFreq(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">
                {drivingFreq.toFixed(2)} Hz
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Natural: {freq.toFixed(2)} Hz {Math.abs(drivingFreq - freq) < 0.05 && "(at resonance!)"}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Driving Amplitude
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={5}
                max={80}
                value={drivingAmplitude}
                onChange={(e) => setDrivingAmplitude(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
                {drivingAmplitude}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => {
            if (!isRunning) {
              stateRef.current.lastTs = null;
            }
            setIsRunning(!isRunning);
          }}
          className="px-6 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            reset();
            if (!isRunning) draw();
          }}
          className="px-6 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Reset
        </button>

        {mode === "challenge" && (
          <button
            onClick={checkFrequency}
            className="px-6 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
          >
            Check Frequency
          </button>
        )}

        {mode === "resonance" && (
          <button
            onClick={() => {
              const omega2 = Math.sqrt(springK / mass);
              setDrivingFreq(omega2 / (2 * Math.PI));
            }}
            className="px-6 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
          >
            Snap to Resonance
          </button>
        )}
      </div>

      {/* Challenge score display */}
      {mode === "challenge" && challengeRef.current.attempts > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Challenge Score
              </h3>
              <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">
                {challengeRef.current.score} pts
              </p>
            </div>
            <div className="text-right text-sm text-amber-700 dark:text-amber-400">
              <div>{challengeRef.current.attempts} attempts</div>
              <div>Streak: {challengeRef.current.streak}</div>
              <div>Best: {challengeRef.current.bestStreak}</div>
            </div>
          </div>
          {challengeRef.current.lastResult && (
            <div className="mt-2 text-sm font-medium" style={{
              color: challengeRef.current.lastResult.points >= 3 ? "#22c55e"
                : challengeRef.current.lastResult.points >= 1 ? "#f59e0b" : "#ef4444",
            }}>
              Last: {challengeRef.current.lastResult.label} (+{challengeRef.current.lastResult.points})
            </div>
          )}
        </div>
      )}

      {/* Key Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="x(t) = A\cos(\omega t)" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\omega = \sqrt{k/m}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="T = 2\pi\sqrt{m/k}" /></div>
        </div>
        {mode === "resonance" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono mt-3">
            <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
              <SimMath math="F_{drive} = F_0\sin(\omega_d t)" />
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
              Resonance: <SimMath math="\omega_d = \omega_{natural}" />
            </div>
          </div>
        )}
        {mode === "challenge" && (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Hint: f = (1/2 pi) sqrt(k/m). Adjust mass and spring constant to match the target frequency.
          </div>
        )}
      </div>

      {/* Instructions per mode */}
      {mode === "sandbox" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Tip:</span>{" "}
          Click on the mass block to give it a push. Adjust sliders to change oscillation properties.
          Enable sound to hear a tone matching the oscillation frequency.
        </div>
      )}
      {mode === "resonance" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Resonance Mode:</span>{" "}
          A periodic driving force is applied to the mass. Adjust the driving frequency to match the
          natural frequency and observe the amplitude grow. Set damping higher to see how it limits
          resonance amplitude.
        </div>
      )}
    </div>
  );
}
