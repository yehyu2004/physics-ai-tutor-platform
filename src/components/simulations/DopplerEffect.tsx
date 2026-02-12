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
import { drawMeter } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

type SimMode = "sandbox" | "challenge" | "ambulance";

export default function DopplerEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [sourceSpeed, setSourceSpeed] = useState(0.4);
  const [waveSpeed, setWaveSpeed] = useState(1.0);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<SimMode>("sandbox");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [prediction, setPrediction] = useState("");

  const timeRef = useRef(0);
  const wavesRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const observerRef = useRef<{ x: number; y: number } | null>(null);
  const hiddenSpeedRef = useRef(0.4);
  const challengeRoundRef = useRef(0);
  const ambulancePhaseRef = useRef(0); // 0 = approaching, 1 = passing, 2 = receding

  // Audio oscillator refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const startAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      audioCtxRef.current = ctx;
      oscRef.current = osc;
      gainRef.current = gain;
    } catch {
      // audio not available
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch { /* already stopped */ }
      oscRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    gainRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  // Generate new challenge round
  const newChallengeRound = useCallback(() => {
    const speeds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
    hiddenSpeedRef.current = speeds[Math.floor(Math.random() * speeds.length)];
    challengeRoundRef.current += 1;
    timeRef.current = 0;
    lastTsRef.current = null;
    wavesRef.current = [];
    setPrediction("");
  }, []);

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

    const cy = H * 0.5;

    // Current effective speed
    const currentSpeed = mode === "challenge" ? hiddenSpeedRef.current : sourceSpeed;
    const isSonic = Math.abs(currentSpeed) >= waveSpeed;

    // Source position
    const rawSourceX = W * 0.2 + currentSpeed * t * 60;
    const wrappedX = mode === "ambulance"
      ? Math.max(-30, Math.min(W + 30, W * 0.2 + currentSpeed * t * 60))
      : ((rawSourceX - W * 0.1) % (W * 0.8)) + W * 0.1;

    // Draw wavefronts
    const waves = wavesRef.current;
    for (const wave of waves) {
      const age = t - wave.t;
      const radius = age * waveSpeed * 120;
      if (radius > W * 1.5) continue;

      const alpha = Math.max(0, 0.4 - age * 0.04);
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Sonic boom / Mach cone visualization
    if (isSonic && Math.abs(currentSpeed) > 0.01) {
      const machAngle = Math.asin(waveSpeed / Math.abs(currentSpeed));
      const coneLen = W * 0.7;

      ctx.save();
      ctx.strokeStyle = "rgba(255, 200, 50, 0.5)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 15;

      // Mach cone lines
      const dir = currentSpeed > 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(wrappedX, cy);
      ctx.lineTo(wrappedX + dir * Math.cos(machAngle) * coneLen, cy + Math.sin(machAngle) * coneLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wrappedX, cy);
      ctx.lineTo(wrappedX + dir * Math.cos(machAngle) * coneLen, cy - Math.sin(machAngle) * coneLen);
      ctx.stroke();

      // Shockwave fill
      ctx.fillStyle = "rgba(255, 200, 50, 0.04)";
      ctx.beginPath();
      ctx.moveTo(wrappedX, cy);
      ctx.lineTo(wrappedX + dir * Math.cos(machAngle) * coneLen, cy + Math.sin(machAngle) * coneLen);
      ctx.lineTo(wrappedX + dir * Math.cos(machAngle) * coneLen, cy - Math.sin(machAngle) * coneLen);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // "SONIC BOOM" label
      ctx.save();
      ctx.font = "bold 16px ui-monospace, monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 10;
      ctx.fillText("SONIC BOOM", wrappedX, cy - 50);
      ctx.restore();

      // Emit sparks
      if (Math.random() < 0.3) {
        particlesRef.current.emitSparks(wrappedX, cy, 2, "#fbbf24");
      }
    }

    // Source (ambulance mode draws a vehicle shape)
    if (mode === "ambulance") {
      // Ambulance body
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(wrappedX - 30, cy - 18, 60, 36, 6);
      ctx.fill();

      // Red cross
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(wrappedX - 4, cy - 12, 8, 24);
      ctx.fillRect(wrappedX - 12, cy - 4, 24, 8);

      // Siren light (flashing)
      const flash = Math.sin(t * 15) > 0;
      const sirenGlow = ctx.createRadialGradient(wrappedX, cy - 22, 0, wrappedX, cy - 22, 20);
      sirenGlow.addColorStop(0, flash ? "rgba(239,68,68,0.8)" : "rgba(59,130,246,0.8)");
      sirenGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sirenGlow;
      ctx.beginPath();
      ctx.arc(wrappedX, cy - 22, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = flash ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(wrappedX, cy - 22, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Normal source dot with glow
      const srcGlow = ctx.createRadialGradient(wrappedX, cy, 0, wrappedX, cy, 25);
      srcGlow.addColorStop(0, "rgba(239,68,68,0.4)");
      srcGlow.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = srcGlow;
      ctx.beginPath();
      ctx.arc(wrappedX, cy, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(wrappedX, cy, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Velocity arrow
    if (Math.abs(currentSpeed) > 0.01 && mode !== "challenge") {
      const arrLen = currentSpeed * 50;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(wrappedX, cy - 30);
      ctx.lineTo(wrappedX + arrLen, cy - 30);
      ctx.stroke();
      ctx.fillStyle = "#22c55e";
      const dir = currentSpeed > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(wrappedX + arrLen, cy - 30);
      ctx.lineTo(wrappedX + arrLen - dir * 7, cy - 35);
      ctx.lineTo(wrappedX + arrLen - dir * 7, cy - 25);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px system-ui";
      ctx.fillText("v_s", wrappedX + arrLen + 5, cy - 27);
    }

    // Observer positions (sandbox/ambulance uses fixed + movable; challenge uses fixed)
    const obs: { x: number; y: number; label: string; shift: string }[] = [];
    if (mode === "ambulance") {
      obs.push({ x: W * 0.5, y: cy, label: "You (stationary)", shift: "dynamic" });
    } else {
      obs.push(
        { x: W * 0.85, y: cy, label: "Observer (ahead)", shift: "higher" },
        { x: W * 0.08, y: cy, label: "Observer (behind)", shift: "lower" },
      );
    }

    // Custom observer (click to place)
    if (observerRef.current && mode === "sandbox") {
      obs.push({
        x: observerRef.current.x,
        y: observerRef.current.y,
        label: "Custom Observer",
        shift: "custom",
      });
    }

    obs.forEach((o) => {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(o.x, o.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Observer glow
      const obsGlow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 16);
      obsGlow.addColorStop(0, "rgba(251,191,36,0.3)");
      obsGlow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = obsGlow;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "10px system-ui";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      ctx.fillText(o.label, o.x, o.y + 25);

      // Calculate observed frequency
      let ratio = 1;
      if (o.shift === "higher") {
        ratio = currentSpeed > 0 ? waveSpeed / (waveSpeed - currentSpeed) : waveSpeed / (waveSpeed + Math.abs(currentSpeed));
      } else if (o.shift === "lower") {
        ratio = currentSpeed > 0 ? waveSpeed / (waveSpeed + currentSpeed) : waveSpeed / (waveSpeed - Math.abs(currentSpeed));
      } else if (o.shift === "dynamic" || o.shift === "custom") {
        // Relative position determines shift
        const dx = o.x - wrappedX;
        const approaching = (currentSpeed > 0 && dx > 0) || (currentSpeed < 0 && dx < 0);
        if (Math.abs(currentSpeed) < waveSpeed) {
          ratio = approaching
            ? waveSpeed / (waveSpeed - Math.abs(currentSpeed))
            : waveSpeed / (waveSpeed + Math.abs(currentSpeed));
        } else {
          ratio = approaching ? Infinity : waveSpeed / (waveSpeed + Math.abs(currentSpeed));
        }
      }

      if (ratio !== Infinity) {
        ctx.fillStyle = ratio > 1.01 ? "#ef4444" : ratio < 0.99 ? "#3b82f6" : "#94a3b8";
        ctx.font = "bold 11px ui-monospace";
        ctx.fillText(`f' = ${ratio.toFixed(2)}f₀`, o.x, o.y + 42);
      } else {
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 11px ui-monospace";
        ctx.fillText("SHOCK WAVE!", o.x, o.y + 42);
      }

      // Frequency bar visualization
      const barW = 60;
      const barH = 6;
      const barX = o.x - barW / 2;
      const barY = o.y + 48;
      const clampedRatio = Math.min(Math.max(ratio, 0.3), 3);
      const barFill = (clampedRatio - 0.3) / 2.7;
      drawMeter(ctx, barX, barY, barW, barH, barFill * barW, barW,
        ratio > 1.01 ? "#ef4444" : ratio < 0.99 ? "#3b82f6" : "#94a3b8");
    });

    // Particles
    particlesRef.current.draw(ctx);

    // Info panel
    const mach = Math.abs(currentSpeed) / waveSpeed;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 110, 12, 220, 68, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("DOPPLER DATA", W / 2, 28);
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    if (mode !== "challenge") {
      ctx.fillText(`v_s/v = ${mach.toFixed(2)} (Mach ${mach.toFixed(2)})`, W / 2, 48);
    } else {
      ctx.fillText(`Observe the wavefronts...`, W / 2, 48);
    }
    ctx.fillStyle = mach >= 1 ? "#ef4444" : "#22c55e";
    ctx.fillText(mach >= 1 ? "SUPERSONIC" : "SUBSONIC", W / 2, 64);

    // Challenge mode scoreboard
    if (mode === "challenge") {
      renderScoreboard(ctx, W - 155, 12, 140, 110, challengeRef.current);

      // Instructions
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, H - 50, 260, 38, 8);
      ctx.fill();
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText(`Round ${challengeRoundRef.current}: Guess v_s !`, 22, H - 33);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px ui-monospace";
      ctx.fillText("Enter your guess below and submit", 22, H - 18);
    }

    // Ambulance mode phase indicator
    if (mode === "ambulance") {
      const phase = ambulancePhaseRef.current;
      const phases = ["APPROACHING", "PASSING", "RECEDING"];
      const phaseColors = ["#ef4444", "#fbbf24", "#3b82f6"];
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, 12, 150, 30, 8);
      ctx.fill();
      ctx.font = "bold 12px ui-monospace";
      ctx.fillStyle = phaseColors[phase];
      ctx.textAlign = "left";
      ctx.fillText(phases[phase], 22, 32);
    }

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, performance.now())
    );
  }, [sourceSpeed, waveSpeed, mode]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;
    const t = timeRef.current;
    const cy = canvasRef.current ? canvasRef.current.height * 0.5 : 250;
    const W = canvasRef.current ? canvasRef.current.width : 800;

    const currentSpeed = mode === "challenge" ? hiddenSpeedRef.current : sourceSpeed;

    // Source position
    const rawSourceX = W * 0.2 + currentSpeed * t * 60;
    let wrappedX: number;
    if (mode === "ambulance") {
      wrappedX = W * 0.2 + currentSpeed * t * 60;
      // Ambulance phase tracking
      const obsX = W * 0.5;
      if (wrappedX < obsX - 20) ambulancePhaseRef.current = 0;
      else if (wrappedX < obsX + 20) ambulancePhaseRef.current = 1;
      else ambulancePhaseRef.current = 2;

      // Reset when ambulance exits screen
      if (wrappedX > W + 60) {
        timeRef.current = 0;
        lastTsRef.current = null;
        wavesRef.current = [];
      }
    } else {
      wrappedX = ((rawSourceX - W * 0.1) % (W * 0.8)) + W * 0.1;
    }

    // Emit wavefronts every 0.3s
    if (wavesRef.current.length === 0 || t - wavesRef.current[wavesRef.current.length - 1].t > 0.3) {
      wavesRef.current.push({ x: wrappedX, y: cy, t });
    }

    // Remove old waves
    wavesRef.current = wavesRef.current.filter((w) => t - w.t < 10);

    // Update particles
    particlesRef.current.update(dt);

    // Audio pitch shifting
    if (audioEnabled && oscRef.current && gainRef.current) {
      const baseFreq = mode === "ambulance" ? 600 : 440;
      // Calculate frequency shift based on observer at center
      const obsX = W * 0.5;
      const dx = obsX - wrappedX;
      const approaching = (currentSpeed > 0 && dx > 0) || (currentSpeed < 0 && dx < 0);
      let ratio = 1;
      if (Math.abs(currentSpeed) < waveSpeed) {
        ratio = approaching
          ? waveSpeed / (waveSpeed - Math.abs(currentSpeed))
          : waveSpeed / (waveSpeed + Math.abs(currentSpeed));
      }
      const dist = Math.abs(dx) / W;
      const volume = Math.max(0, 0.15 * (1 - dist));
      oscRef.current.frequency.setTargetAtTime(baseFreq * ratio, audioCtxRef.current!.currentTime, 0.05);
      gainRef.current.gain.setTargetAtTime(volume, audioCtxRef.current!.currentTime, 0.05);
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [sourceSpeed, waveSpeed, mode, audioEnabled, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.45, 400);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Click to place observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        if (mode === "sandbox") {
          observerRef.current = { x, y };
          playSFX("click");
          draw();
        }
      },
    });
    return cleanup;
  }, [mode, draw]);

  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    timeRef.current = 0;
    lastTsRef.current = null;
    wavesRef.current = [];
    particlesRef.current.clear();
    ambulancePhaseRef.current = 0;
    draw();
  };

  const handleSubmitPrediction = () => {
    const predicted = parseFloat(prediction);
    if (isNaN(predicted)) return;
    const actual = hiddenSpeedRef.current;
    const result = calculateAccuracy(predicted, actual, 1.5);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    const W = canvas ? canvas.width / 2 : 400;
    const H = canvas ? canvas.height / 2 : 200;
    popupsRef.current.push({
      text: `${result.label} (actual: ${actual.toFixed(1)})`,
      points: result.points,
      x: W,
      y: H,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(W, H, 20);
    } else {
      playSFX("incorrect");
    }

    // Next round after a short delay
    setTimeout(() => newChallengeRound(), 1500);
  };

  const switchMode = (newMode: SimMode) => {
    setMode(newMode);
    reset();
    if (newMode === "challenge") {
      challengeRef.current = createChallengeState();
      challengeRef.current.active = true;
      newChallengeRound();
    }
    if (newMode === "ambulance") {
      setSourceSpeed(0.5);
    }
  };

  const handleToggleAudio = () => {
    if (audioEnabled) {
      stopAudio();
      setAudioEnabled(false);
    } else {
      startAudio();
      setAudioEnabled(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "challenge", "ambulance"] as SimMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {m === "sandbox" ? "Sandbox" : m === "challenge" ? "Speed Challenge" : "Ambulance Siren"}
          </button>
        ))}
        <button
          onClick={handleToggleAudio}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            audioEnabled
              ? "bg-amber-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {audioEnabled ? "Sound ON" : "Sound OFF"}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Challenge mode prediction input */}
      {mode === "challenge" && (
        <div className="rounded-xl border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
            Watch the wavefront compression and predict the source speed (v_s).
            Speed is in units of wave speed (0.0 to 1.5).
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.05"
              min="0"
              max="1.5"
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              placeholder="Your guess (e.g. 0.5)"
              className="flex-1 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleSubmitPrediction()}
            />
            <button
              onClick={handleSubmitPrediction}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Submit
            </button>
            <button
              onClick={newChallengeRound}
              className="px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              Skip
            </button>
          </div>
          {challengeRef.current.lastResult && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Last: {challengeRef.current.lastResult.label} | Score: {challengeRef.current.score} | Streak: {challengeRef.current.streak}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {mode === "challenge" ? "Source Speed (hidden)" : "Source Speed"}
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={-1}
              max={1.5}
              step={0.05}
              value={sourceSpeed}
              onChange={(e) => {
                setSourceSpeed(Number(e.target.value));
                reset();
              }}
              disabled={mode === "challenge"}
              className="flex-1 accent-red-500 disabled:opacity-40"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {mode === "challenge" ? "???" : sourceSpeed.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wave Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={waveSpeed}
              onChange={(e) => {
                setWaveSpeed(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{waveSpeed.toFixed(1)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2">
          <button
            onClick={() => {
              if (!isRunning) {
                lastTsRef.current = null;
              }
              setIsRunning(!isRunning);
            }}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
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

      {mode === "sandbox" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Click anywhere on the canvas to place a custom observer.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="f' = f\frac{v \pm v_o}{v \mp v_s}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\lambda' = \frac{v}{f'}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Move the source and observer to hear and see the Doppler shift. Notice how frequency changes with relative motion!</p>
    </div>
  );
}
