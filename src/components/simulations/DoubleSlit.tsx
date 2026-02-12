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
import { SimMath } from "@/components/simulations/SimMath";

type Mode = "sandbox" | "measure-d" | "wavelength-quiz" | "compare";
type SlitConfig = "single" | "double" | "multi";

interface MeasureChallenge {
  actualD: number;       // the real slit separation
  wavelength: number;    // nm
  submitted: boolean;
}

interface WavelengthQuiz {
  actualWavelength: number;
  options: number[];
  submitted: boolean;
  selected: number | null;
}

export default function DoubleSlit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slitSep, setSlitSep] = useState(40);
  const [wavelength, setWavelength] = useState(500);
  const [slitWidth, setSlitWidth] = useState(8);
  const [showWaves, setShowWaves] = useState(true);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<Mode>("sandbox");
  const [slitConfig, setSlitConfig] = useState<SlitConfig>("double");
  const [numSlits, setNumSlits] = useState(5);

  // Ruler state
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
  const [isPlacingRuler, setIsPlacingRuler] = useState(false);
  const [rulerActive, setRulerActive] = useState(false);

  // Challenge state
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());

  // Measurement challenge
  const [measureChallenge, setMeasureChallenge] = useState<MeasureChallenge | null>(null);
  const [userMeasurement, setUserMeasurement] = useState("");

  // Wavelength quiz
  const [wavelengthQuiz, setWavelengthQuiz] = useState<WavelengthQuiz | null>(null);

  // Intensity cursor
  const [cursorY, setCursorY] = useState<number | null>(null);

  function wavelengthToRGB(wl: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    if (wl >= 380 && wl < 440) {
      r = -(wl - 440) / (440 - 380);
      b = 1;
    } else if (wl >= 440 && wl < 490) {
      g = (wl - 440) / (490 - 440);
      b = 1;
    } else if (wl >= 490 && wl < 510) {
      g = 1;
      b = -(wl - 510) / (510 - 490);
    } else if (wl >= 510 && wl < 580) {
      r = (wl - 510) / (580 - 510);
      g = 1;
    } else if (wl >= 580 && wl < 645) {
      r = 1;
      g = -(wl - 645) / (645 - 580);
    } else if (wl >= 645 && wl <= 780) {
      r = 1;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  const generateMeasureChallenge = useCallback(() => {
    const d = 25 + Math.floor(Math.random() * 60);
    const wl = [450, 500, 550, 600, 650][Math.floor(Math.random() * 5)];
    setSlitSep(d);
    setWavelength(wl);
    setSlitConfig("double");
    setMeasureChallenge({ actualD: d, wavelength: wl, submitted: false });
    setUserMeasurement("");
    setRulerActive(true);
    setRulerStart(null);
    setRulerEnd(null);
  }, []);

  const generateWavelengthQuiz = useCallback(() => {
    const wavelengths = [420, 470, 530, 580, 620, 680];
    const actual = wavelengths[Math.floor(Math.random() * wavelengths.length)];
    // Generate 3 wrong answers + correct
    const options = new Set<number>([actual]);
    while (options.size < 4) {
      const wrong = wavelengths[Math.floor(Math.random() * wavelengths.length)];
      if (Math.abs(wrong - actual) > 20) options.add(wrong);
    }
    const shuffled = Array.from(options).sort(() => Math.random() - 0.5);
    setWavelength(actual);
    setSlitSep(40);
    setSlitConfig("double");
    setWavelengthQuiz({ actualWavelength: actual, options: shuffled, submitted: false, selected: null });
  }, []);

  const startMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = newMode !== "sandbox";
    setChallengeState({ ...challengeRef.current });
    popupsRef.current = [];
    particlesRef.current.clear();
    setRulerActive(false);
    setRulerStart(null);
    setRulerEnd(null);
    setMeasureChallenge(null);
    setWavelengthQuiz(null);

    if (newMode === "measure-d") {
      generateMeasureChallenge();
    } else if (newMode === "wavelength-quiz") {
      generateWavelengthQuiz();
    } else if (newMode === "compare") {
      setSlitConfig("double");
    } else {
      setSlitConfig("double");
    }
  }, [generateMeasureChallenge, generateWavelengthQuiz]);

  const submitMeasurement = useCallback(() => {
    if (!measureChallenge || measureChallenge.submitted) return;
    const guess = parseFloat(userMeasurement);
    if (isNaN(guess)) return;
    const result = calculateAccuracy(guess, measureChallenge.actualD, measureChallenge.actualD * 0.5);

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeState({ ...challengeRef.current });
    setMeasureChallenge({ ...measureChallenge, submitted: true });

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${result.label} (d=${measureChallenge.actualD})`,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: Date.now(),
      });
      if (result.points >= 2) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2);
        playSFX("success");
      } else if (result.points > 0) {
        playSFX("correct");
      } else {
        playSFX("incorrect");
      }
      playScore(result.points);
    }
  }, [measureChallenge, userMeasurement]);

  const submitWavelengthAnswer = useCallback((wl: number) => {
    if (!wavelengthQuiz || wavelengthQuiz.submitted) return;
    const isCorrect = wl === wavelengthQuiz.actualWavelength;
    const result = isCorrect
      ? { points: 3, tier: "perfect" as const, label: "Correct!" }
      : { points: 0, tier: "miss" as const, label: "Incorrect" };

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeState({ ...challengeRef.current });
    setWavelengthQuiz({ ...wavelengthQuiz, submitted: true, selected: wl });

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${result.label} (${wavelengthQuiz.actualWavelength}nm)`,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: Date.now(),
      });
      if (isCorrect) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2);
        playSFX("success");
        playScore(3);
      } else {
        playSFX("incorrect");
      }
    }
  }, [wavelengthQuiz]);

  // Calculate intensity for any slit configuration
  const calcIntensity = useCallback((y: number, midY: number, L: number, d: number, a: number, lambda: number, config: SlitConfig, nSlits: number): number => {
    const theta = Math.atan2(y - midY, L);
    const sinTheta = Math.sin(theta);
    const beta = (Math.PI * a * sinTheta) / lambda;
    const singleSlit = beta !== 0 ? Math.sin(beta) / beta : 1;

    if (config === "single") {
      return singleSlit * singleSlit;
    }

    const alpha = (Math.PI * d * sinTheta) / lambda;

    if (config === "double") {
      const doubleSlit = Math.cos(alpha);
      return singleSlit * singleSlit * doubleSlit * doubleSlit;
    }

    // Multi-slit
    const N = nSlits;
    const numerator = Math.sin(N * alpha);
    const denominator = Math.sin(alpha);
    const multiSlit = denominator !== 0 ? (numerator / denominator) : N;
    return singleSlit * singleSlit * (multiSlit * multiSlit) / (N * N);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const now = Date.now();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    const wallX = W * 0.3;
    const screenX = W * 0.85;
    const midY = H / 2;
    const [cr, cg, cb] = wavelengthToRGB(wavelength);
    const color = `rgb(${cr},${cg},${cb})`;
    const currentConfig = slitConfig;

    // Light source
    const sourceX = W * 0.08;
    const sourceGlow = ctx.createRadialGradient(sourceX, midY, 0, sourceX, midY, 40);
    sourceGlow.addColorStop(0, color);
    sourceGlow.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.5)`);
    sourceGlow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = sourceGlow;
    ctx.beginPath();
    ctx.arc(sourceX, midY, 40, 0, Math.PI * 2);
    ctx.fill();

    // Incoming waves
    if (showWaves) {
      const t = timeRef.current;
      const k = (2 * Math.PI) / (wavelength / 15);
      const omega = k * 2;

      for (let x = sourceX + 10; x < wallX - 5; x += 3) {
        const phase = k * x - omega * t;
        const intensity = (Math.sin(phase) + 1) / 2;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${intensity * 0.15})`;
        ctx.fillRect(x, midY - 60, 3, 120);
      }
    }

    // Wall / barrier - depends on slit configuration
    ctx.fillStyle = "#334155";
    if (currentConfig === "single") {
      ctx.fillRect(wallX - 4, 0, 8, midY - slitWidth / 2);
      ctx.fillRect(wallX - 4, midY + slitWidth / 2, 8, H);
      // Label
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      ctx.fillText("single slit", wallX - 10, midY);
    } else if (currentConfig === "double") {
      ctx.fillStyle = "#334155";
      ctx.fillRect(wallX - 4, 0, 8, midY - slitSep / 2 - slitWidth / 2);
      ctx.fillRect(wallX - 4, midY - slitSep / 2 + slitWidth / 2, 8, slitSep - slitWidth);
      ctx.fillRect(wallX - 4, midY + slitSep / 2 + slitWidth / 2, 8, H);
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      ctx.fillText("slit 1", wallX - 10, midY - slitSep / 2);
      ctx.fillText("slit 2", wallX - 10, midY + slitSep / 2);
    } else {
      // Multi-slit
      const totalSpan = slitSep * (numSlits - 1);
      const startY = midY - totalSpan / 2;
      // Barrier from top
      ctx.fillStyle = "#334155";
      ctx.fillRect(wallX - 4, 0, 8, startY - slitWidth / 2);
      for (let i = 0; i < numSlits; i++) {
        const sy = startY + i * slitSep;
        const nextY = i < numSlits - 1 ? startY + (i + 1) * slitSep : H + slitWidth;
        ctx.fillRect(wallX - 4, sy + slitWidth / 2, 8, nextY - slitWidth / 2 - (sy + slitWidth / 2));
      }
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      ctx.fillText(`${numSlits} slits`, wallX - 10, midY);
    }

    // Diffraction pattern on screen
    const lambda = wavelength / 800;
    const d = slitSep;
    const a = slitWidth;
    const L = screenX - wallX;
    const barW = 20;

    for (let py = 0; py < H; py++) {
      const intensity = calcIntensity(py, midY, L, d, a, lambda, currentConfig, numSlits);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${intensity})`;
      ctx.fillRect(screenX - barW / 2, py, barW, 1);
    }

    // Screen border
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX + barW / 2 + 2, 0);
    ctx.lineTo(screenX + barW / 2 + 2, H);
    ctx.stroke();

    // Wave propagation from slits
    if (showWaves) {
      const t = timeRef.current;
      const k = (2 * Math.PI) / (wavelength / 15);
      const omega = k * 2;

      const slitPositions: number[] = [];
      if (currentConfig === "single") {
        slitPositions.push(midY);
      } else if (currentConfig === "double") {
        slitPositions.push(midY - slitSep / 2, midY + slitSep / 2);
      } else {
        const totalSpan = slitSep * (numSlits - 1);
        const startY = midY - totalSpan / 2;
        for (let i = 0; i < numSlits; i++) {
          slitPositions.push(startY + i * slitSep);
        }
      }

      for (const slitY of slitPositions) {
        for (let r = 0; r < 300; r += wavelength / 15) {
          const phase = k * r - omega * t;
          const alphaVal = Math.max(0, 0.08 * (1 - r / 300) * ((Math.sin(phase) + 1) / 2));
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alphaVal})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(wallX, slitY, r, -Math.PI / 2.5, Math.PI / 2.5);
          ctx.stroke();
        }
      }
    }

    // Intensity graph with enhanced display
    const graphX = screenX + barW / 2 + 15;
    const graphW = W - graphX - 10;
    if (graphW > 30) {
      // Axis line
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX, 0);
      ctx.lineTo(graphX, H);
      ctx.stroke();

      // Filled intensity profile
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.1)`;
      ctx.beginPath();
      ctx.moveTo(graphX, 0);
      for (let py = 0; py < H; py++) {
        const intensity = calcIntensity(py, midY, L, d, a, lambda, currentConfig, numSlits);
        const gx = graphX + intensity * graphW * 0.9;
        ctx.lineTo(gx, py);
      }
      ctx.lineTo(graphX, H);
      ctx.closePath();
      ctx.fill();

      // Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let py = 0; py < H; py++) {
        const intensity = calcIntensity(py, midY, L, d, a, lambda, currentConfig, numSlits);
        const gx = graphX + intensity * graphW * 0.9;
        if (py === 0) ctx.moveTo(gx, py);
        else ctx.lineTo(gx, py);
      }
      ctx.stroke();

      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText("I(\u03b8)", graphX + graphW / 2, 15);

      // Intensity cursor
      if (cursorY !== null && cursorY >= 0 && cursorY < H) {
        const intensity = calcIntensity(cursorY, midY, L, d, a, lambda, currentConfig, numSlits);
        const gx = graphX + intensity * graphW * 0.9;

        // Horizontal line
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(screenX - barW / 2, cursorY);
        ctx.lineTo(gx, cursorY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot on curve
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(gx, cursorY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Intensity readout
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(gx + 8, cursorY - 12, 60, 24, 4);
        ctx.fill();
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(`I=${intensity.toFixed(3)}`, gx + 14, cursorY + 4);
      }
    }

    // === RULER ===
    if ((rulerActive || mode === "measure-d") && rulerStart && rulerEnd) {
      ctx.save();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(rulerStart.x, rulerStart.y);
      ctx.lineTo(rulerEnd.x, rulerEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // End markers
      for (const pt of [rulerStart, rulerEnd]) {
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Crosshair
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pt.x - 8, pt.y);
        ctx.lineTo(pt.x + 8, pt.y);
        ctx.moveTo(pt.x, pt.y - 8);
        ctx.lineTo(pt.x, pt.y + 8);
        ctx.stroke();
      }

      // Distance label
      const dx = rulerEnd.x - rulerStart.x;
      const dy = rulerEnd.y - rulerStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const mx = (rulerStart.x + rulerEnd.x) / 2;
      const my = (rulerStart.y + rulerEnd.y) / 2;

      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.beginPath();
      ctx.roundRect(mx - 35, my - 22, 70, 20, 4);
      ctx.fill();
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`${dist.toFixed(1)} px`, mx, my - 8);
      ctx.restore();
    }

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Particles
    particlesRef.current.update(1 / 60);
    particlesRef.current.draw(ctx);

    // Scoreboard
    if (challengeRef.current.active && challengeRef.current.attempts > 0) {
      renderScoreboard(ctx, 12, H - 140, 140, 110, challengeRef.current);
    }

    // Config label
    if (mode === "compare") {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 80, 8, 160, 26, 8);
      ctx.fill();
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`${currentConfig.toUpperCase()} SLIT${currentConfig === "multi" ? ` (N=${numSlits})` : ""}`, W / 2, 26);
    }
  }, [slitSep, wavelength, slitWidth, showWaves, slitConfig, numSlits, cursorY, rulerStart, rulerEnd, rulerActive, mode, calcIntensity]);

  const animate = useCallback(() => {
    timeRef.current += 0.03;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 480);
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

  // Canvas mouse handlers for ruler and intensity cursor
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!rulerActive && mode !== "measure-d") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setRulerStart({ x, y });
    setRulerEnd({ x, y });
    setIsPlacingRuler(true);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const scaleX = canvas.width / rect.width;
    const y = (e.clientY - rect.top) * scaleY;

    setCursorY(y);

    if (isPlacingRuler) {
      const x = (e.clientX - rect.left) * scaleX;
      setRulerEnd({ x, y });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPlacingRuler(false);
  };

  const handleCanvasMouseLeave = () => {
    setCursorY(null);
    setIsPlacingRuler(false);
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {([
          ["sandbox", "Sandbox"],
          ["measure-d", "Measure d"],
          ["wavelength-quiz", "Wavelength Quiz"],
          ["compare", "Compare Slits"],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => startMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
        {mode !== "sandbox" && (
          <span className="flex items-center text-sm font-mono text-amber-500 ml-2">
            Score: {challengeState.score} | Streak: {challengeState.streak}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className={`w-full ${rulerActive || mode === "measure-d" ? "cursor-crosshair" : "cursor-default"}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
        />
      </div>

      {/* Measure challenge */}
      {mode === "measure-d" && measureChallenge && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-900/10 p-4">
          <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">
            Measure the Slit Separation
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Use the ruler (click and drag on the pattern) to measure fringe spacing. Then calculate d using{" "}
            <code className="text-amber-400">d = m * lambda * L / y</code>. Enter your answer for d (arbitrary units).
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              value={userMeasurement}
              onChange={(e) => setUserMeasurement(e.target.value)}
              placeholder="Enter d..."
              disabled={measureChallenge.submitted}
              className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono"
            />
            <button
              onClick={submitMeasurement}
              disabled={measureChallenge.submitted || !userMeasurement}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              {measureChallenge.submitted ? "Submitted!" : "Submit"}
            </button>
            <button
              onClick={generateMeasureChallenge}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next
            </button>
            {measureChallenge.submitted && (
              <span className="text-sm font-mono text-green-400">Actual d = {measureChallenge.actualD}</span>
            )}
          </div>
        </div>
      )}

      {/* Wavelength quiz */}
      {mode === "wavelength-quiz" && wavelengthQuiz && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 dark:bg-purple-900/10 p-4">
          <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
            Identify the Wavelength
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Based on the color and fringe pattern, what is the wavelength of this light?
          </p>
          <div className="flex gap-3 flex-wrap">
            {wavelengthQuiz.options.map((wl) => {
              const [r, g, b] = wavelengthToRGB(wl);
              return (
                <button
                  key={wl}
                  onClick={() => submitWavelengthAnswer(wl)}
                  disabled={wavelengthQuiz.submitted}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    wavelengthQuiz.selected === wl
                      ? wl === wavelengthQuiz.actualWavelength
                        ? "bg-green-600 text-white"
                        : "bg-red-600 text-white"
                      : wavelengthQuiz.submitted && wl === wavelengthQuiz.actualWavelength
                        ? "bg-green-600 text-white"
                        : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full inline-block"
                    style={{ backgroundColor: `rgb(${r},${g},${b})` }}
                  />
                  {wl} nm
                </button>
              );
            })}
            {wavelengthQuiz.submitted && (
              <button
                onClick={generateWavelengthQuiz}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Slit config for compare mode */}
        {mode === "compare" && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Configuration</label>
            <div className="flex flex-col gap-1 mt-2">
              {(["single", "double", "multi"] as SlitConfig[]).map((cfg) => (
                <button
                  key={cfg}
                  onClick={() => setSlitConfig(cfg)}
                  className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                    slitConfig === cfg
                      ? "bg-purple-600 text-white"
                      : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {cfg === "single" ? "Single Slit" : cfg === "double" ? "Double Slit" : `Multi (${numSlits})`}
                </button>
              ))}
              {slitConfig === "multi" && (
                <div className="flex items-center gap-2 mt-1">
                  <input type="range" min={3} max={12} value={numSlits}
                    onChange={(e) => setNumSlits(Number(e.target.value))}
                    className="flex-1 accent-purple-500" />
                  <span className="text-xs font-mono text-gray-500">{numSlits}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Separation</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={15} max={100} value={slitSep}
              onChange={(e) => setSlitSep(Number(e.target.value))}
              className="flex-1 accent-purple-500"
              disabled={mode === "measure-d"}
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {mode === "measure-d" ? "?" : slitSep}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wavelength (nm)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={380} max={700} value={wavelength}
              onChange={(e) => setWavelength(Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: `rgb(${wavelengthToRGB(wavelength).join(",")})` }}
              disabled={mode === "wavelength-quiz"}
            />
            <span className="text-sm font-mono font-bold min-w-[3rem] text-right" style={{ color: `rgb(${wavelengthToRGB(wavelength).join(",")})` }}>
              {mode === "wavelength-quiz" ? "?" : wavelength}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Width</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={2} max={30} value={slitWidth}
              onChange={(e) => setSlitWidth(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2rem] text-right">{slitWidth}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => setShowWaves(!showWaves)}
            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
              showWaves ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Waves {showWaves ? "ON" : "OFF"}
          </button>
          <button onClick={() => setIsRunning(!isRunning)}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>

        {/* Ruler toggle for sandbox */}
        {mode === "sandbox" && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
            <button
              onClick={() => {
                setRulerActive(!rulerActive);
                if (rulerActive) { setRulerStart(null); setRulerEnd(null); }
              }}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                rulerActive
                  ? "bg-amber-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Ruler {rulerActive ? "ON" : "OFF"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Interference Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="d\sin\theta = m\lambda \text{ (maxima)}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="d\sin\theta = (m+\tfrac{1}{2})\lambda \text{ (minima)}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="I = I_0\cos^2\!\left(\frac{\pi d\sin\theta}{\lambda}\right)" /></div>
        </div>
      </div>
    </div>
  );
}
