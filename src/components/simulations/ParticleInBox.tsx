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
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

type ChallengeType = "energy" | "probability" | "measurement";

interface EnergyQuiz {
  targetN: number;
  options: number[];
  correctEnergy: number;
  answered: boolean;
  correct: boolean;
}

interface MeasurementResult {
  x: number;           // measured position (0-1 normalized)
  canvasX: number;     // canvas pixel x
  n: number;           // quantum state at measurement
  time: number;        // when it happened
}

export default function ParticleInBox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [n, setN] = useState(1); // quantum number
  const [boxWidth, setBoxWidth] = useState(200);
  const [showProbability, setShowProbability] = useState(true);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);

  // Challenge mode
  const [challengeMode, setChallengeMode] = useState(false);
  const [challengeType, setChallengeType] = useState<ChallengeType>("energy");
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [, setChallengeAttempts] = useState(0);

  // Score popups and particles
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());

  // Energy quiz
  const [energyQuiz, setEnergyQuiz] = useState<EnergyQuiz | null>(null);

  // Measurement mode
  const [measurementMode, setMeasurementMode] = useState(false);
  const measurementsRef = useRef<MeasurementResult[]>([]);
  const [measurementCount, setMeasurementCount] = useState(0);
  const collapseAnimRef = useRef<{
    active: boolean;
    x: number;
    canvasX: number;
    progress: number;
  }>({ active: false, x: 0, canvasX: 0, progress: 0 });

  // Probability click game
  const [probabilityMode, setProbabilityMode] = useState(false);
  const [probabilityTarget, setProbabilityTarget] = useState<string>("");

  // Well geometry cache for click detection
  const wellGeomRef = useRef({ left: 0, right: 0, midY: 0, amp: 0 });

  // Generate energy quiz
  const generateEnergyQuiz = useCallback(() => {
    const targetN = Math.floor(Math.random() * 8) + 1;
    const correctE = targetN * targetN; // E_n = n^2 * E_1
    // Generate 3 wrong answers
    const options = [correctE];
    while (options.length < 4) {
      const wrong = Math.floor(Math.random() * 64) + 1;
      if (!options.includes(wrong)) {
        options.push(wrong);
      }
    }
    options.sort(() => Math.random() - 0.5);

    setEnergyQuiz({
      targetN,
      options,
      correctEnergy: correctE,
      answered: false,
      correct: false,
    });
  }, []);

  // Generate probability challenge
  const generateProbabilityChallenge = useCallback(() => {
    const descriptions = [
      "Click where the particle is MOST likely to be found",
      "Click where |psi|^2 is at its maximum",
      "Click a NODE (where psi = 0, inside the box)",
    ];
    const idx = n > 1
      ? Math.floor(Math.random() * descriptions.length)
      : Math.floor(Math.random() * 2); // no nodes for n=1
    setProbabilityTarget(descriptions[idx]);
  }, [n]);

  // Score probability click
  const scoreProbabilityClick = useCallback((clickedX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { left, right, midY } = wellGeomRef.current;
    const wellW = right - left;

    let result;
    if (probabilityTarget.includes("NODE")) {
      // Check if clicked near a node
      let minDist = Infinity;
      for (let k = 1; k < n; k++) {
        const nodeX = k / n;
        const dist = Math.abs(clickedX - nodeX);
        minDist = Math.min(minDist, dist);
      }
      if (n <= 1) {
        result = { points: 0, tier: "miss" as const, label: "No nodes for n=1!" };
      } else {
        result = calculateAccuracy(minDist, 0, 0.5);
      }
    } else {
      // Check if clicked near a maximum of |psi|^2
      // Maxima of sin^2(n*pi*x/L) are at x = (2k-1)/(2n) for k=1..n
      let minDist = Infinity;
      for (let k = 1; k <= n; k++) {
        const maxX = (2 * k - 1) / (2 * n);
        const dist = Math.abs(clickedX - maxX);
        minDist = Math.min(minDist, dist);
      }
      result = calculateAccuracy(minDist, 0, 0.5);
    }

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeScore(challengeRef.current.score);
    setChallengeAttempts(challengeRef.current.attempts);

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }

    scorePopupsRef.current.push({
      text: result.label,
      points: result.points,
      x: left + clickedX * wellW,
      y: midY - 40,
      startTime: performance.now(),
    });

    // Generate next challenge after delay
    setTimeout(() => generateProbabilityChallenge(), 1500);
  }, [probabilityTarget, n, generateProbabilityChallenge]);

  // Perform "measurement" - collapse wavefunction
  const performMeasurement = useCallback((clickX: number) => {
    const { left, right, midY } = wellGeomRef.current;
    const wellW = right - left;
    if (clickX < left || clickX > right) return;

    const xNorm = (clickX - left) / wellW; // 0 to 1

    // Sample from |psi|^2 distribution using rejection method
    // |psi|^2 = sin^2(n*pi*x/L), max = 1
    let measuredX: number = 0.5;
    let tries = 0;
    do {
      measuredX = Math.random();
      const prob = Math.sin(n * Math.PI * measuredX) ** 2;
      if (Math.random() < prob) break;
      tries++;
    } while (tries < 1000);

    const measuredCanvasX = left + measuredX * wellW;

    // Start collapse animation
    collapseAnimRef.current = {
      active: true,
      x: measuredX,
      canvasX: measuredCanvasX,
      progress: 0,
    };

    // Record measurement
    measurementsRef.current.push({
      x: measuredX,
      canvasX: measuredCanvasX,
      n,
      time: performance.now(),
    });
    setMeasurementCount(measurementsRef.current.length);

    // Particle effect at measurement location
    particlesRef.current.emitGlow(measuredCanvasX, midY, 10, "#fbbf24");
    particlesRef.current.emitSparks(measuredCanvasX, midY, 8, "#fbbf24");
    playSFX("pop");

    // If in challenge mode, score the prediction
    if (challengeMode && probabilityMode) {
      scoreProbabilityClick(xNorm);
    }
  }, [n, challengeMode, probabilityMode, scoreProbabilityClick]);

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

    const margin = 60;
    const wellLeft = margin;
    const wellRight = margin + boxWidth * (W - margin * 2) / 300;
    const wellW = wellRight - wellLeft;
    const midY = H * 0.5;
    const amp = H * 0.3;

    // Cache geometry for click handlers
    wellGeomRef.current = { left: wellLeft, right: wellRight, midY, amp };

    // Potential walls
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fillRect(0, 0, wellLeft, H);
    ctx.fillRect(wellRight, 0, W - wellRight, H);

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wellLeft, 0);
    ctx.lineTo(wellLeft, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wellRight, 0);
    ctx.lineTo(wellRight, H);
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("V = \u221E", wellLeft / 2, midY);
    ctx.fillText("V = \u221E", (wellRight + W) / 2, midY);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.font = "10px system-ui";
    ctx.fillText("V = 0", (wellLeft + wellRight) / 2, H - 15);

    // Zero line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wellLeft, midY);
    ctx.lineTo(wellRight, midY);
    ctx.stroke();

    // Collapse animation effect
    const collapse = collapseAnimRef.current;
    if (collapse.active) {
      const alpha = Math.max(0, 1 - collapse.progress);
      // Draw collapsing wavefunction -> delta function
      const sigma = (1 - collapse.progress) * wellW * 0.3 + 2;

      ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(251,191,36,0.5)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let px = wellLeft; px <= wellRight; px++) {
        const xNorm = (px - wellLeft) / wellW;
        const gaussian = Math.exp(-((xNorm - collapse.x) ** 2) / (2 * (sigma / wellW) ** 2));
        const py = midY - gaussian * amp * 0.8 * alpha;
        if (px === wellLeft) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Measurement marker
      ctx.fillStyle = `rgba(251,191,36,${alpha})`;
      ctx.beginPath();
      ctx.arc(collapse.canvasX, midY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wave function psi_n(x) = sqrt(2/L) sin(n*pi*x/L) - only when not fully collapsed
    const showWave = !collapse.active || collapse.progress < 0.5;
    const waveAlpha = collapse.active ? Math.max(0, 1 - collapse.progress * 2) : 1;

    if (showWave) {
      const omega = n * n * 2;

      ctx.strokeStyle = `rgba(59,130,246,${waveAlpha})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = `rgba(59,130,246,${waveAlpha * 0.4})`;
      ctx.shadowBlur = 10;
      ctx.beginPath();

      for (let px = wellLeft; px <= wellRight; px++) {
        const x = (px - wellLeft) / wellW;
        const psi = Math.sin(n * Math.PI * x) * Math.cos(omega * t);
        const py = midY - psi * amp;
        if (px === wellLeft) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Probability density |psi|^2
      if (showProbability) {
        ctx.fillStyle = `rgba(168,85,247,${0.15 * waveAlpha})`;
        ctx.beginPath();
        ctx.moveTo(wellLeft, midY);
        for (let px = wellLeft; px <= wellRight; px++) {
          const x = (px - wellLeft) / wellW;
          const psi2 = Math.sin(n * Math.PI * x) ** 2;
          const py = midY - psi2 * amp * 0.8;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(wellRight, midY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(168,85,247,${waveAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let px = wellLeft; px <= wellRight; px++) {
          const x = (px - wellLeft) / wellW;
          const psi2 = Math.sin(n * Math.PI * x) ** 2;
          const py = midY - psi2 * amp * 0.8;
          if (px === wellLeft) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // Node indicators
    for (let k = 1; k < n; k++) {
      const nodeX = wellLeft + (k / n) * wellW;
      ctx.fillStyle = "rgba(251,191,36,0.5)";
      ctx.beginPath();
      ctx.arc(nodeX, midY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Previous measurement points (histogram)
    const measurements = measurementsRef.current;
    if (measurements.length > 0) {
      // Draw measurement dots
      for (const m of measurements) {
        const age = (performance.now() - m.time) / 1000;
        const alpha = Math.max(0.2, Math.min(1, 1 - age / 30));
        ctx.fillStyle = `rgba(251,191,36,${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(m.canvasX, midY + 20, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Histogram
      if (measurements.length > 5) {
        const bins = 30;
        const binCounts = new Array(bins).fill(0);
        for (const m of measurements) {
          const bin = Math.min(bins - 1, Math.floor(m.x * bins));
          binCounts[bin]++;
        }
        const maxCount = Math.max(...binCounts, 1);
        const binW = wellW / bins;
        const histH = amp * 0.3;

        for (let b = 0; b < bins; b++) {
          const bh = (binCounts[b] / maxCount) * histH;
          if (bh > 0) {
            ctx.fillStyle = "rgba(251,191,36,0.2)";
            ctx.fillRect(wellLeft + b * binW, midY + 25, binW - 1, bh);
          }
        }

        ctx.font = "8px ui-monospace";
        ctx.fillStyle = "rgba(251,191,36,0.5)";
        ctx.textAlign = "left";
        ctx.fillText(`${measurements.length} measurements`, wellLeft, midY + 25 + histH + 12);
      }
    }

    // Probability challenge hint
    if (challengeMode && probabilityMode && probabilityTarget) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(wellLeft, 8, wellW, 22, 4);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(probabilityTarget, (wellLeft + wellRight) / 2, 23);

      // Hint: "Click inside the box!"
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText("Click inside the box!", (wellLeft + wellRight) / 2, H - 4);
    }

    // Energy level diagram (right side)
    const elvX = W - 160;
    const elvW2 = 130;
    const elvY2 = 30;
    const elvH = H - 60;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(elvX - 10, elvY2 - 15, elvW2 + 20, elvH + 30, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("ENERGY LEVELS", elvX + elvW2 / 2, elvY2);

    const maxN = 5;
    const maxE = maxN * maxN;

    for (let level = 1; level <= maxN; level++) {
      const E = level * level;
      const ly = elvY2 + elvH - (E / maxE) * (elvH - 30);
      const isActive = level === n;

      ctx.strokeStyle = isActive ? "#fbbf24" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isActive ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(elvX, ly);
      ctx.lineTo(elvX + elvW2, ly);
      ctx.stroke();

      ctx.fillStyle = isActive ? "#fbbf24" : "#64748b";
      ctx.font = isActive ? "bold 11px ui-monospace" : "10px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`n=${level}`, elvX + elvW2 + 5, ly + 4);
      ctx.textAlign = "right";
      ctx.fillText(`${E}E\u2081`, elvX - 5, ly + 4);
    }

    // Legend
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("\u2014 \u03C8(x,t) wave function", wellLeft + 10, 25);
    if (showProbability) {
      ctx.fillStyle = "#a855f7";
      ctx.fillText("\u2014 |\u03C8|\u00B2 probability density", wellLeft + 10, 42);
    }
    if (n > 1) {
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`\u25CF ${n - 1} node${n > 2 ? "s" : ""}`, wellLeft + 10, showProbability ? 59 : 42);
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((popup) =>
      renderScorePopup(ctx, popup, now)
    );

    // Challenge scoreboard
    if (challengeMode) {
      renderScoreboard(ctx, W - 160, H - 120, 148, 110, challengeRef.current);
    }
  }, [n, boxWidth, showProbability, challengeMode, probabilityMode, probabilityTarget]);

  const animate = useCallback(() => {
    const now = performance.now();
    const dt = Math.min((now - (lastFrameRef.current || now)) / 1000, 0.05);
    lastFrameRef.current = now;
    timeRef.current += 0.02;

    // Update collapse animation
    const collapse = collapseAnimRef.current;
    if (collapse.active) {
      collapse.progress += dt * 2;
      if (collapse.progress >= 1) {
        collapse.active = false;
      }
    }

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas click handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        const { left, right, midY } = wellGeomRef.current;

        // If click is inside the box region, handle it
        if (x >= left && x <= right) {
          if (measurementMode || (challengeMode && probabilityMode)) {
            performMeasurement(x);
          } else {
            // Click-to-excite: add energy quantum
            // Click in upper half = excite, lower half = de-excite
            if (y < midY) {
              if (n < 8) {
                setN(n + 1);
                particlesRef.current.emitGlow(x, y, 8, "#3b82f6");
                playSFX("powerup");
              }
            } else {
              if (n > 1) {
                setN(n - 1);
                particlesRef.current.emitSparks(x, y, 6, "#a855f7");
                playSFX("drop");
              }
            }
          }
        }
      },
    });

    return cleanup;
  }, [n, measurementMode, challengeMode, probabilityMode, performMeasurement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.5), _isMobile ? 500 : 420);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      lastFrameRef.current = performance.now();
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Answer energy quiz
  const answerEnergyQuiz = (energy: number) => {
    if (!energyQuiz || energyQuiz.answered) return;
    const correct = energy === energyQuiz.correctEnergy;

    const result = correct
      ? { points: 3, tier: "perfect" as const, label: "Correct!" }
      : { points: 0, tier: "miss" as const, label: "Wrong!" };

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeScore(challengeRef.current.score);
    setChallengeAttempts(challengeRef.current.attempts);

    if (correct) {
      playSFX("correct");
      playScore(3);
    } else {
      playSFX("incorrect");
    }

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
    }

    setEnergyQuiz({ ...energyQuiz, answered: true, correct });

    setTimeout(() => {
      generateEnergyQuiz();
    }, 2000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Quantum Number n
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={8}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {n}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Box Width
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={80}
              max={280}
              value={boxWidth}
              onChange={(e) => setBoxWidth(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {boxWidth}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setShowProbability(!showProbability)}
            className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
              showProbability
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            |psi|^2 {showProbability ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      {/* Interactive controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Click-to-Excite
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Click above the zero line inside the box to excite (n+1). Click below to de-excite (n-1).
          </p>
          <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
            Current: n={n}, E={n * n}E_1
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Measurement
          </label>
          <button
            onClick={() => {
              setMeasurementMode(!measurementMode);
              if (!measurementMode) setProbabilityMode(false);
            }}
            className={`w-full h-9 rounded-lg text-sm font-medium transition-colors ${
              measurementMode
                ? "bg-amber-500 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            {measurementMode ? "Collapse Mode ON" : "Enable Measurement"}
          </button>
          {measurementCount > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">{measurementCount} measurements</span>
              <button
                onClick={() => {
                  measurementsRef.current = [];
                  setMeasurementCount(0);
                }}
                className="text-xs text-red-500 hover:text-red-400"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Challenge Mode
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const newMode = !challengeMode;
                setChallengeMode(newMode);
                challengeRef.current = { ...challengeRef.current, active: newMode };
                if (newMode) {
                  setChallengeType("energy");
                  generateEnergyQuiz();
                } else {
                  setEnergyQuiz(null);
                  setProbabilityMode(false);
                }
              }}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                challengeMode
                  ? "bg-amber-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              {challengeMode ? `Score: ${challengeScore}` : "Start"}
            </button>
          </div>
        </div>
      </div>

      {/* Challenge type selector */}
      {challengeMode && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Challenge Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setChallengeType("energy");
                setProbabilityMode(false);
                setMeasurementMode(false);
                generateEnergyQuiz();
              }}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                challengeType === "energy"
                  ? "bg-blue-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Energy Quiz
            </button>
            <button
              onClick={() => {
                setChallengeType("probability");
                setProbabilityMode(true);
                setMeasurementMode(true);
                generateProbabilityChallenge();
              }}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                challengeType === "probability"
                  ? "bg-purple-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Probability Game
            </button>
            <button
              onClick={() => {
                setChallengeType("measurement");
                setProbabilityMode(false);
                setMeasurementMode(true);
                measurementsRef.current = [];
                setMeasurementCount(0);
              }}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                challengeType === "measurement"
                  ? "bg-amber-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Measure & Build
            </button>
          </div>
          {challengeType === "measurement" && (
            <p className="text-xs text-gray-500 mt-2">
              Click inside the box to &quot;measure&quot; the particle position. After many measurements, the histogram should match |psi|^2!
            </p>
          )}
        </div>
      )}

      {/* Energy quiz */}
      {challengeMode && challengeType === "energy" && energyQuiz && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
            Energy Level Quiz
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            What is the energy of the <span className="font-mono font-bold">n = {energyQuiz.targetN}</span> state
            (in units of E_1)?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {energyQuiz.options.map((e, i) => {
              const isCorrectAnswer = e === energyQuiz.correctEnergy;
              let btnClass =
                "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
              if (energyQuiz.answered) {
                if (isCorrectAnswer) {
                  btnClass = "bg-green-600 text-white";
                } else {
                  btnClass =
                    "border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600";
                }
              }
              return (
                <button
                  key={i}
                  onClick={() => answerEnergyQuiz(e)}
                  disabled={energyQuiz.answered}
                  className={`h-10 rounded-lg text-sm font-mono font-medium transition-colors ${btnClass}`}
                >
                  {e} E_1
                </button>
              );
            })}
          </div>
          {energyQuiz.answered && (
            <p
              className={`text-sm mt-2 font-medium ${
                energyQuiz.correct ? "text-green-600" : "text-red-500"
              }`}
            >
              {energyQuiz.correct
                ? `Correct! E_${energyQuiz.targetN} = ${energyQuiz.targetN}^2 E_1 = ${energyQuiz.correctEnergy} E_1`
                : `Wrong! E_${energyQuiz.targetN} = n^2 E_1 = ${energyQuiz.targetN}^2 E_1 = ${energyQuiz.correctEnergy} E_1`}
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E_n = \frac{n^2\pi^2\hbar^2}{2mL^2}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\psi_n(x) = \sqrt{\frac{2}{L}}\sin\!\left(\frac{n\pi x}{L}\right)" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Change the quantum number n to see different standing wave patterns. Higher n = higher energy!</p>
    </div>
  );
}
