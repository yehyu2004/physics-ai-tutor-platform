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
import { SimMath } from "@/components/simulations/SimMath";

interface Neutron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  generation: number;
  speed: number; // 0 = thermal, 1 = fast
}

interface Fragment {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  age: number;
}

interface Nucleus {
  x: number;
  y: number;
  split: boolean;
}

type GameMode = "sandbox" | "critical_mass";

export default function NuclearFission() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [enrichment, setEnrichment] = useState(0.5);
  const [controlRodDepth, setControlRodDepth] = useState(0.5); // 0 = fully out, 1 = fully in
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");

  const neutronsRef = useRef<Neutron[]>([]);
  const fragmentsRef = useRef<Fragment[]>([]);
  const nucleiRef = useRef<Nucleus[]>([]);
  const statsRef = useRef({
    fissions: 0,
    generation: 0,
    maxGeneration: 0,
    peakNeutrons: 0,
    kEffective: 1.0, // multiplication factor
    neutronHistory: [] as number[], // track neutron count over time
    meltdownTriggered: false,
    meltdownFlash: 0,
    totalEnergy: 0,
  });
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const timeRef = useRef(0);

  // Critical mass challenge state
  const criticalTargetRef = useRef({ targetK: 1.0, tolerance: 0.15 });

  const initNuclei = useCallback(() => {
    const nuclei: Nucleus[] = [];
    for (let i = 0; i < 80; i++) {
      nuclei.push({
        x: 0.1 + Math.random() * 0.8,
        y: 0.1 + Math.random() * 0.8,
        split: false,
      });
    }
    nucleiRef.current = nuclei;
    neutronsRef.current = [];
    fragmentsRef.current = [];
    statsRef.current = {
      fissions: 0,
      generation: 0,
      maxGeneration: 0,
      peakNeutrons: 0,
      kEffective: 1.0,
      neutronHistory: [],
      meltdownTriggered: false,
      meltdownFlash: 0,
      totalEnergy: 0,
    };
    particlesRef.current.clear();
    timeRef.current = 0;
  }, []);

  useEffect(() => {
    initNuclei();
  }, [initNuclei]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const stats = statsRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Meltdown flash overlay
    if (stats.meltdownTriggered) {
      stats.meltdownFlash = Math.min(stats.meltdownFlash + 0.02, 0.6);
      const flashAlpha = stats.meltdownFlash * (0.5 + 0.5 * Math.sin(timeRef.current * 8));
      ctx.fillStyle = `rgba(239,68,68,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    const nuclei = nucleiRef.current;
    const neutrons = neutronsRef.current;
    const fragments = fragmentsRef.current;

    // Draw control rods (vertical bars)
    const rodWidth = 12;
    const numRods = 5;
    const rodSpacing = W / (numRods + 1);
    for (let i = 0; i < numRods; i++) {
      const rx = rodSpacing * (i + 1);
      const rodHeight = controlRodDepth * H;
      // Rod shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(rx - rodWidth / 2 + 2, 0, rodWidth, rodHeight + 2);
      // Rod body
      const rodGrad = ctx.createLinearGradient(rx - rodWidth / 2, 0, rx + rodWidth / 2, 0);
      rodGrad.addColorStop(0, "#4b5563");
      rodGrad.addColorStop(0.5, "#9ca3af");
      rodGrad.addColorStop(1, "#4b5563");
      ctx.fillStyle = rodGrad;
      ctx.fillRect(rx - rodWidth / 2, 0, rodWidth, rodHeight);
      // Rod tip
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(rx - rodWidth / 2 - 2, rodHeight - 4, rodWidth + 4, 8);
    }

    // Draw nuclei
    for (const nuc of nuclei) {
      if (nuc.split) continue;
      const nx = nuc.x * W;
      const ny = nuc.y * H;

      // Nucleus glow
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 18);
      glow.addColorStop(0, "rgba(34,197,94,0.3)");
      glow.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, 18, 0, Math.PI * 2);
      ctx.fill();

      // Nucleus
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 7px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("U", nx, ny);
      ctx.textBaseline = "alphabetic";
    }

    // Draw fragments
    for (const frag of fragments) {
      const fx = frag.x * W;
      const fy = frag.y * H;
      const alpha = Math.max(0, 1 - frag.age / 3);

      ctx.fillStyle = frag.color.replace("1)", `${alpha})`);
      ctx.beginPath();
      ctx.arc(fx, fy, frag.r * (1 - frag.age * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw neutrons with speed-based coloring
    for (const n of neutrons) {
      const nx = n.x * W;
      const ny = n.y * H;

      // Color: fast = red/orange, thermal = blue/cyan
      const coreColor = n.speed > 0.5 ? "#fb923c" : "#38bdf8";
      const glowColor = n.speed > 0.5 ? "rgba(251,146,60,0.3)" : "rgba(56,189,248,0.3)";

      // Neutron glow
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI * 2);
      ctx.fill();

      // Neutron trail (for fast neutrons)
      if (n.speed > 0.5) {
        ctx.strokeStyle = `rgba(251,146,60,${0.1 * n.speed})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(nx - n.vx * W * 0.03, ny - n.vy * H * 0.03);
        ctx.stroke();
      }

      // Neutron
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // Stats panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 200, 130, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CHAIN REACTION", 22, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Fissions: ${stats.fissions}`, 22, 46);
    ctx.fillText(`Neutrons: ${neutrons.length}`, 22, 62);
    ctx.fillText(`Remaining: ${nuclei.filter((n) => !n.split).length}`, 22, 78);
    ctx.fillText(`Max Generation: ${stats.maxGeneration}`, 22, 94);
    ctx.fillText(`Energy: ${(stats.totalEnergy * 200).toFixed(0)} MeV`, 22, 110);

    // k-effective indicator
    const kColor = stats.kEffective > 1.2 ? "#ef4444" : stats.kEffective > 0.9 ? "#22c55e" : "#3b82f6";
    ctx.fillStyle = kColor;
    ctx.font = "bold 12px ui-monospace";
    ctx.fillText(`k_eff = ${stats.kEffective.toFixed(2)}`, 22, 130);

    // Reactivity meter (right side)
    const meterX = W - 50;
    const meterH = H - 40;
    const meterW = 24;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(meterX - 8, 12, meterW + 16, meterH + 16, 8);
    ctx.fill();

    // Meter labels
    ctx.font = "bold 9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ef4444";
    ctx.fillText("SUPER", meterX + meterW / 2, 28);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("CRIT", meterX + meterW / 2, 28 + meterH * 0.33);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("SUB", meterX + meterW / 2, 28 + meterH * 0.8);

    // Meter background
    const meterGrad = ctx.createLinearGradient(0, 20, 0, 20 + meterH);
    meterGrad.addColorStop(0, "rgba(239,68,68,0.3)");
    meterGrad.addColorStop(0.33, "rgba(34,197,94,0.3)");
    meterGrad.addColorStop(0.66, "rgba(59,130,246,0.3)");
    meterGrad.addColorStop(1, "rgba(59,130,246,0.1)");
    ctx.fillStyle = meterGrad;
    ctx.beginPath();
    ctx.roundRect(meterX, 35, meterW, meterH - 30, 4);
    ctx.fill();

    // Meter indicator
    const kNorm = Math.max(0, Math.min(1, 1 - (stats.kEffective / 2)));
    const indicatorY = 35 + kNorm * (meterH - 30);
    ctx.fillStyle = kColor;
    ctx.beginPath();
    ctx.moveTo(meterX - 4, indicatorY);
    ctx.lineTo(meterX + meterW + 4, indicatorY);
    ctx.lineTo(meterX + meterW + 4, indicatorY + 4);
    ctx.lineTo(meterX - 4, indicatorY + 4);
    ctx.closePath();
    ctx.fill();

    // Meltdown warning
    if (stats.meltdownTriggered) {
      const warningAlpha = 0.7 + 0.3 * Math.sin(timeRef.current * 10);
      ctx.fillStyle = `rgba(239,68,68,${warningAlpha})`;
      ctx.font = "bold 28px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("MELTDOWN!", W / 2, H / 2 - 10);
      ctx.font = "14px ui-monospace";
      ctx.fillStyle = `rgba(255,255,255,${warningAlpha})`;
      ctx.fillText("Supercritical! Insert control rods!", W / 2, H / 2 + 20);

      // Warning border
      ctx.strokeStyle = `rgba(239,68,68,${warningAlpha * 0.5})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    }

    // Challenge mode scoreboard
    if (gameMode === "critical_mass" && challengeRef.current.active) {
      renderScoreboard(ctx, W - 180, H - 140, 160, 120, challengeRef.current);

      // Target indicator
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(12, H - 60, 220, 45, 6);
      ctx.fill();
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText("TARGET: Achieve k_eff = 1.00 +/- 0.15", 22, H - 40);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Adjust control rods to reach criticality", 22, H - 24);
    }

    // Score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Instructions
    if (neutrons.length === 0 && !isRunning) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText('Click "Fire Neutron" to start the chain reaction', W / 2, H - 30);
    }

    // Neutron legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, H - 110, 130, 40, 6);
    ctx.fill();
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#fb923c";
    ctx.fillText("● Fast neutron", 24, H - 94);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("● Thermal neutron", 24, H - 80);
  }, [isRunning, controlRodDepth, gameMode]);

  const animate = useCallback(() => {
    const dt = 0.016;
    timeRef.current += dt;
    const neutrons = neutronsRef.current;
    const nuclei = nucleiRef.current;
    const fragments = fragmentsRef.current;
    const stats = statsRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;

    // Update particles
    particlesRef.current.update(dt);

    // Update neutrons
    for (const n of neutrons) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.age += dt;

      // Slow down neutrons over time (thermalization)
      n.speed = Math.max(0, n.speed - dt * 0.3);

      // Control rod absorption: if neutron is near a control rod, absorb it
      const numRods = 5;
      const rodSpacing = 1.0 / (numRods + 1);
      for (let i = 0; i < numRods; i++) {
        const rodX = rodSpacing * (i + 1);
        const rodTop = controlRodDepth;
        if (Math.abs(n.x - rodX) < 0.015 && n.y < rodTop) {
          n.age = 999; // mark for removal
        }
      }
    }

    // Update fragments
    for (const f of fragments) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.age += dt;
    }

    // Check neutron-nucleus collisions
    const newNeutrons: Neutron[] = [];
    let fissionsThisFrame = 0;
    for (const neutron of neutrons) {
      if (neutron.age > 100) continue;
      for (const nuc of nuclei) {
        if (nuc.split) continue;
        const dx = neutron.x - nuc.x;
        const dy = neutron.y - nuc.y;
        if (dx * dx + dy * dy < 0.0008) {
          // Fission probability depends on enrichment and neutron speed
          // Thermal neutrons are more likely to cause fission
          const thermalBonus = 1 - neutron.speed * 0.5;
          if (Math.random() < enrichment * thermalBonus) {
            nuc.split = true;
            stats.fissions++;
            fissionsThisFrame++;
            stats.totalEnergy++;

            // Emit particles at fission site
            particlesRef.current.emitSparks(nuc.x * W, nuc.y * H, 8, "#fbbf24");

            // Release 2-3 neutrons (fast neutrons)
            const numNew = 2 + (Math.random() > 0.5 ? 1 : 0);
            for (let i = 0; i < numNew; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.3 + Math.random() * 0.4;
              newNeutrons.push({
                x: nuc.x,
                y: nuc.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                age: 0,
                generation: neutron.generation + 1,
                speed: 0.8 + Math.random() * 0.2, // fast neutrons
              });
            }

            stats.maxGeneration = Math.max(stats.maxGeneration, neutron.generation + 1);

            // Create fragments
            const fragAngle = Math.random() * Math.PI * 2;
            fragments.push(
              {
                x: nuc.x,
                y: nuc.y,
                vx: Math.cos(fragAngle) * 0.15,
                vy: Math.sin(fragAngle) * 0.15,
                r: 5,
                color: "rgba(239,68,68,1)",
                age: 0,
              },
              {
                x: nuc.x,
                y: nuc.y,
                vx: -Math.cos(fragAngle) * 0.15,
                vy: -Math.sin(fragAngle) * 0.15,
                r: 4,
                color: "rgba(168,85,247,1)",
                age: 0,
              }
            );

            if (fissionsThisFrame === 1) {
              playSFX("collision");
            }
          }
        }
      }
    }

    // Calculate k-effective (neutron multiplication factor)
    stats.neutronHistory.push(neutrons.length + newNeutrons.length);
    if (stats.neutronHistory.length > 30) stats.neutronHistory.shift();
    if (stats.neutronHistory.length >= 2) {
      const recent = stats.neutronHistory.slice(-10);
      const older = stats.neutronHistory.slice(-20, -10);
      if (older.length > 0) {
        const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
        const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
        stats.kEffective = avgOlder > 0 ? avgRecent / avgOlder : avgRecent > 0 ? 2 : 0;
      }
    }

    // Meltdown detection
    const totalNeutrons = neutrons.length + newNeutrons.length;
    stats.peakNeutrons = Math.max(stats.peakNeutrons, totalNeutrons);
    if (totalNeutrons > 100 && !stats.meltdownTriggered) {
      stats.meltdownTriggered = true;
      playSFX("fail");
      // Emit lots of particles
      particlesRef.current.emitSparks(W / 2, H / 2, 40, "#ef4444");
    }

    neutronsRef.current = [
      ...neutrons.filter(
        (n) => n.x > -0.1 && n.x < 1.1 && n.y > -0.1 && n.y < 1.1 && n.age < 5
      ),
      ...newNeutrons,
    ];
    fragmentsRef.current = fragments.filter((f) => f.age < 3);

    draw();

    if (neutronsRef.current.length > 0 || fragmentsRef.current.length > 0 || particlesRef.current.count > 0) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      setIsRunning(false);

      // Score challenge if in critical mass mode
      if (gameMode === "critical_mass" && challengeRef.current.active && stats.fissions > 0) {
        const result = calculateAccuracy(stats.kEffective, 1.0, criticalTargetRef.current.tolerance);
        // Bonus points for sustained reaction (more generations)
        const genBonus = Math.min(stats.maxGeneration, 3);
        result.points += genBonus;
        if (stats.maxGeneration >= 3 && !stats.meltdownTriggered) {
          result.label = "Controlled Fission!";
          result.points += 2;
        }
        if (stats.meltdownTriggered) {
          result.label = "Meltdown!";
          result.points = Math.max(0, result.points - 3);
        }
        challengeRef.current = updateChallengeState(challengeRef.current, result);
        popupsRef.current.push({
          text: result.label,
          points: result.points,
          x: W / 2,
          y: H / 2,
          startTime: performance.now(),
        });
        if (result.points > 0) {
          playScore(result.points);
        } else {
          playSFX("fail");
        }
        draw();
      }
    }
  }, [enrichment, draw, controlRodDepth, gameMode]);

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
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const fireNeutron = () => {
    neutronsRef.current.push({
      x: 0.02,
      y: 0.5,
      vx: 0.5,
      vy: (Math.random() - 0.5) * 0.2,
      age: 0,
      generation: 0,
      speed: 1.0, // fast neutron
    });
    playSFX("launch");
    setIsRunning(true);
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    initNuclei();
    setIsRunning(false);
    setTimeout(() => draw(), 50);
  };

  const startChallenge = () => {
    reset();
    setGameMode("critical_mass");
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Achieve critical mass (k_eff = 1.0)",
    };
    playSFX("powerup");
    setTimeout(() => draw(), 50);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Fission Probability
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={enrichment}
              onChange={(e) => {
                setEnrichment(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {(enrichment * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Control Rod Depth
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={controlRodDepth}
              onChange={(e) => setControlRodDepth(Number(e.target.value))}
              className="flex-1 accent-gray-400"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {(controlRodDepth * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={fireNeutron}
            className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
          >
            Fire Neutron
          </button>
          <button
            onClick={reset}
            className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={startChallenge}
            className={`w-full h-10 rounded-lg font-medium text-sm transition-colors ${
              gameMode === "critical_mass" && challengeRef.current.active
                ? "bg-amber-600 text-white"
                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/50"
            }`}
          >
            {gameMode === "critical_mass" && challengeRef.current.active
              ? `Challenge: ${challengeRef.current.score} pts`
              : "Critical Mass Challenge"}
          </button>
        </div>
      </div>
      {gameMode === "critical_mass" && challengeRef.current.active && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Critical Mass Challenge
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Adjust the control rod depth and fission probability, then fire a neutron.
            Achieve a sustained chain reaction (k_eff near 1.0) without causing a meltdown.
            More generations = more bonus points. Meltdown = penalty!
          </p>
          <div className="mt-2 flex gap-4 text-xs font-mono text-amber-700 dark:text-amber-400">
            <span>Score: {challengeRef.current.score}</span>
            <span>Attempts: {challengeRef.current.attempts}</span>
            <span>Streak: {challengeRef.current.streak}</span>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E = mc^2" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="k_{eff} > 1 \Rightarrow \text{supercritical}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="k_{eff} = 1 \Rightarrow \text{critical}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Fire a neutron to start the chain reaction! Adjust fission probability and control rods to manage criticality.</p>
    </div>
  );
}
