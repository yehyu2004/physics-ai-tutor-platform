"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { createDragHandler, getCanvasMousePos } from "@/lib/simulation/interaction";
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

interface Measurement {
  y: number;
  order: number;
  wavelengthCalc: number;
}

export default function DiffractionGrating() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numSlits, setNumSlits] = useState(6);
  const [slitSpacing, setSlitSpacing] = useState(40);
  const [wavelength, setWavelength] = useState(550);
  const [challengeMode, setChallengeMode] = useState(false);
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [guess, setGuess] = useState("");
  const [hiddenWavelength, setHiddenWavelength] = useState(550);
  const [showAnswer, setShowAnswer] = useState(false);
  const [hoverY, setHoverY] = useState<number | null>(null);

  const popupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  function wavelengthToRGB(wl: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    if (wl >= 380 && wl < 440) { r = -(wl - 440) / 60; b = 1; }
    else if (wl >= 440 && wl < 490) { g = (wl - 440) / 50; b = 1; }
    else if (wl >= 490 && wl < 510) { g = 1; b = -(wl - 510) / 20; }
    else if (wl >= 510 && wl < 580) { r = (wl - 510) / 70; g = 1; }
    else if (wl >= 580 && wl < 645) { r = 1; g = -(wl - 645) / 65; }
    else if (wl >= 645 && wl <= 780) { r = 1; }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  const generateChallenge = useCallback(() => {
    const wl = Math.round(380 + Math.random() * 320);
    setHiddenWavelength(wl);
    setMeasurements([]);
    setGuess("");
    setShowAnswer(false);
  }, []);

  const startChallenge = useCallback(() => {
    setChallengeMode(true);
    setChallengeState({ ...createChallengeState(), active: true, description: "Find the wavelength!" });
    generateChallenge();
    playSFX("powerup");
  }, [generateChallenge]);

  const stopChallenge = useCallback(() => {
    setChallengeMode(false);
    setChallengeState(createChallengeState());
    setMeasurements([]);
    setShowAnswer(false);
  }, []);

  const submitGuess = useCallback(() => {
    const guessNum = parseFloat(guess);
    if (isNaN(guessNum)) return;

    const result = calculateAccuracy(guessNum, hiddenWavelength, 320);
    const newState = updateChallengeState(challengeState, result);
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });

      if (result.points >= 2) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 20);
        playSFX("correct");
        playScore(result.points);
      } else if (result.points === 1) {
        playSFX("success");
      } else {
        playSFX("incorrect");
      }
    }

    setShowAnswer(true);
    setTimeout(() => {
      generateChallenge();
    }, 2500);
  }, [guess, hiddenWavelength, challengeState, generateChallenge]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    const activeWavelength = challengeMode ? hiddenWavelength : wavelength;
    const [cr, cg, cb] = wavelengthToRGB(activeWavelength);
    const gratingX = W * 0.25;
    const screenX = W * 0.75;
    const midY = H / 2;

    // Incoming laser beam
    ctx.save();
    ctx.shadowColor = `rgba(${cr},${cg},${cb},0.5)`;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.6)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(gratingX, midY);
    ctx.stroke();
    ctx.restore();

    // Grating barrier
    ctx.fillStyle = "#334155";
    const slitW = 3;
    const totalH = slitSpacing * (numSlits - 1);
    const startY = midY - totalH / 2;

    ctx.fillRect(gratingX - 4, 0, 8, startY - slitW);
    for (let i = 0; i < numSlits - 1; i++) {
      const y = startY + i * slitSpacing + slitW;
      ctx.fillRect(gratingX - 4, y, 8, slitSpacing - slitW * 2);
    }
    ctx.fillRect(gratingX - 4, startY + totalH + slitW, 8, H - startY - totalH - slitW);

    // Slit markers
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "right";
    for (let i = 0; i < numSlits; i++) {
      const y = startY + i * slitSpacing;
      ctx.fillText(`${i + 1}`, gratingX - 10, y + 3);
    }

    // Calculate and draw diffraction pattern with true color for visible wavelengths
    const d = slitSpacing;
    const lambda = activeWavelength / 15;
    const L = screenX - gratingX;
    const barW = 24;

    // Draw screen pattern
    for (let py = 0; py < H; py++) {
      const y = py - midY;
      const sinTheta = y / Math.sqrt(y * y + L * L);

      const beta = (Math.PI * d * sinTheta) / lambda;
      const sinNBeta = Math.sin(numSlits * beta);
      const sinBeta = Math.sin(beta);

      let intensity: number;
      if (Math.abs(sinBeta) < 0.001) {
        intensity = numSlits * numSlits;
      } else {
        intensity = (sinNBeta / sinBeta) ** 2;
      }
      intensity /= (numSlits * numSlits);
      intensity = Math.min(intensity, 1);

      // Color visualization: show actual spectral color for visible wavelengths
      if (intensity > 0.01) {
        // Main color
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${intensity})`;
        ctx.fillRect(screenX - barW / 2, py, barW, 1);

        // White-hot center for brightest fringes
        if (intensity > 0.8) {
          const whiteIntensity = (intensity - 0.8) * 5;
          ctx.fillStyle = `rgba(255,255,255,${whiteIntensity * 0.5})`;
          ctx.fillRect(screenX - barW / 2, py, barW, 1);
        }
      }
    }

    // Draw rays from slits to major maxima
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let m = -3; m <= 3; m++) {
      const sinTheta = (m * lambda) / d;
      if (Math.abs(sinTheta) >= 1) continue;
      const maxY = midY + L * sinTheta / Math.sqrt(1 - sinTheta * sinTheta);
      if (maxY > 5 && maxY < H - 5) {
        for (let i = 0; i < numSlits; i++) {
          const slitY = startY + i * slitSpacing;
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},1)`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(gratingX, slitY);
          ctx.lineTo(screenX, maxY);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Screen edge
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX + barW / 2 + 2, 0);
    ctx.lineTo(screenX + barW / 2 + 2, H);
    ctx.stroke();

    // Intensity graph
    const graphX = screenX + barW / 2 + 15;
    const graphW2 = W - graphX - 10;
    if (graphW2 > 30) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX, 0);
      ctx.lineTo(graphX, H);
      ctx.stroke();

      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let py = 0; py < H; py += 1) {
        const y = py - midY;
        const sinTheta = y / Math.sqrt(y * y + L * L);
        const beta2 = (Math.PI * d * sinTheta) / lambda;
        const sinNBeta = Math.sin(numSlits * beta2);
        const sinBeta = Math.sin(beta2);
        const intensity = Math.abs(sinBeta) < 0.001
          ? 1
          : (sinNBeta / sinBeta) ** 2 / (numSlits * numSlits);
        const gx = graphX + Math.min(intensity, 1) * graphW2 * 0.9;
        if (py === 0) ctx.moveTo(gx, py);
        else ctx.lineTo(gx, py);
      }
      ctx.stroke();

      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText("I(\u03b8)", graphX + graphW2 / 2, 12);
    }

    // Order labels (m = 0, +/-1, +/-2, ...) with detailed info
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "left";
    for (let m = -4; m <= 4; m++) {
      const sinTheta = (m * lambda) / d;
      if (Math.abs(sinTheta) >= 1) continue;
      const y = midY + L * sinTheta / Math.sqrt(1 - sinTheta * sinTheta);
      if (y > 10 && y < H - 10) {
        // Order marker line
        ctx.strokeStyle = "rgba(251,191,36,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(screenX - barW / 2 - 5, y);
        ctx.lineTo(screenX - barW / 2 - 20, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Order label with color-coded background
        const orderColor = m === 0 ? "#22c55e" : Math.abs(m) === 1 ? "#fbbf24" : Math.abs(m) === 2 ? "#f97316" : "#ef4444";
        ctx.fillStyle = orderColor;
        const label = m === 0 ? "m=0 (central)" : `m=${m > 0 ? "+" : ""}${m}`;
        ctx.fillText(label, screenX + barW / 2 + 5, y + 3);

        // Draw angle indicator for non-zero orders
        if (m !== 0) {
          const theta = Math.asin(sinTheta);
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.font = "9px ui-monospace";
          ctx.fillText(`\u03b8=${(theta * 180 / Math.PI).toFixed(1)}\u00b0`, screenX + barW / 2 + 5, y + 15);
          ctx.font = "bold 11px ui-monospace";
        }
      }
    }

    // Hover crosshair for measurement
    if (hoverY !== null && challengeMode) {
      const canvasHoverY = hoverY;
      if (canvasHoverY > 0 && canvasHoverY < H) {
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(screenX - barW, canvasHoverY);
        ctx.lineTo(screenX + barW + 40, canvasHoverY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Show position offset from center
        const offset = canvasHoverY - midY;
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "10px ui-monospace";
        ctx.textAlign = "right";
        ctx.fillText(`y = ${offset.toFixed(0)} px`, screenX - barW - 5, canvasHoverY - 5);
      }
    }

    // Draw measurement markers
    for (const m of measurements) {
      const markY = m.y;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenX - barW / 2, markY);
      ctx.lineTo(screenX + barW / 2, markY);
      ctx.stroke();

      // Marker label
      ctx.fillStyle = "#22c55e";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`m=${m.order} \u2192 \u03bb\u2248${m.wavelengthCalc.toFixed(0)}nm`, screenX + barW / 2 + 5, markY - 5);

      // Small triangle marker
      ctx.beginPath();
      ctx.moveTo(screenX - barW / 2 - 6, markY);
      ctx.lineTo(screenX - barW / 2, markY - 4);
      ctx.lineTo(screenX - barW / 2, markY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Info panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 185, challengeMode ? 85 : 65, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("GRATING DATA", 22, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`N = ${numSlits} slits`, 22, 45);
    if (!challengeMode) {
      ctx.fillText(`\u03bb = ${wavelength} nm`, 22, 60);
    } else {
      ctx.fillText(`\u03bb = ??? nm`, 22, 60);
    }
    ctx.fillText(`d = ${slitSpacing} (arb)`, 22, 75);
    if (challengeMode) {
      ctx.fillStyle = "#f59e0b";
      ctx.fillText("Click fringes to measure!", 22, 90);
    }

    // Challenge mode scoreboard
    if (challengeMode) {
      renderScoreboard(ctx, W - 160, 12, 148, 100, challengeState);
    }

    // Challenge: show answer feedback
    if (showAnswer && challengeMode) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 120, H / 2 - 40, 240, 80, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "bold 14px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.fillText(`Answer: ${hiddenWavelength} nm`, W / 2, H / 2 - 10);

      const [ar, ag, ab] = wavelengthToRGB(hiddenWavelength);
      ctx.fillStyle = `rgb(${ar},${ag},${ab})`;
      ctx.fillRect(W / 2 - 40, H / 2 + 5, 80, 12);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.strokeRect(W / 2 - 40, H / 2 + 5, 80, 12);

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px ui-monospace";
      ctx.fillText(`Your guess: ${guess} nm`, W / 2, H / 2 + 35);
    }

    // Color spectrum reference bar (bottom of screen area)
    if (!challengeMode) {
      const specY = H - 20;
      const specW = 200;
      const specStart = 20;
      for (let i = 0; i < specW; i++) {
        const wl = 380 + (i / specW) * 400;
        const [sr, sg, sb] = wavelengthToRGB(wl);
        ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
        ctx.fillRect(specStart + i, specY, 1, 10);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.strokeRect(specStart, specY, specW, 10);

      // Current wavelength indicator
      const markerX = specStart + ((activeWavelength - 380) / 400) * specW;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(markerX, specY - 4);
      ctx.lineTo(markerX - 4, specY - 10);
      ctx.lineTo(markerX + 4, specY - 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "8px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText("380nm", specStart, specY + 18);
      ctx.textAlign = "right";
      ctx.fillText("780nm", specStart + specW, specY + 18);
    }

    // Render score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Render particles
    particlesRef.current.draw(ctx);
  }, [numSlits, slitSpacing, wavelength, challengeMode, hiddenWavelength, challengeState, measurements, hoverY, showAnswer, guess]);

  const animate = useCallback(() => {
    timeRef.current += 0.016;
    particlesRef.current.update(0.016);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas click handler for measurements
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        if (!challengeMode) return;

        const W = canvas.width;
        const H = canvas.height;
        const screenX = W * 0.75;
        const barW = 24;
        const midY2 = H / 2;

        // Only register clicks near the screen
        if (Math.abs(x - screenX) > barW + 30) return;

        const gratingX = W * 0.25;
        const L2 = screenX - gratingX;
        const d2 = slitSpacing;
        const lambda2 = hiddenWavelength / 15;

        // Find the nearest principal maximum
        const yOffset = y - midY2;
        const sinTheta = yOffset / Math.sqrt(yOffset * yOffset + L2 * L2);
        const mOrder = Math.round((d2 * sinTheta) / lambda2);

        if (mOrder === 0) {
          // Central max doesn't help determine wavelength
          playSFX("click");
          return;
        }

        // Calculate wavelength from measurement
        const actualSinTheta = yOffset / Math.sqrt(yOffset * yOffset + L2 * L2);
        const calculatedLambda = (d2 * actualSinTheta / mOrder) * 15;

        setMeasurements((prev) => {
          const newMeas = [...prev, { y, order: mOrder, wavelengthCalc: Math.abs(calculatedLambda) }];
          return newMeas.slice(-5); // Keep last 5 measurements
        });

        playSFX("pop");
        particlesRef.current.emitSparks(x, y, 8, "#22c55e");
      },
    });

    // Track hover
    const handleMouseMove = (e: MouseEvent) => {
      if (!challengeMode) return;
      const pos = getCanvasMousePos(canvas, e);
      setHoverY(pos.y);
    };

    const handleMouseLeave = () => {
      setHoverY(null);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cleanup();
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [challengeMode, hiddenWavelength, slitSpacing]);

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
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950 relative">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Challenge mode controls */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {challengeMode ? "Challenge: Find the Wavelength!" : "Challenge Mode"}
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

        {challengeMode && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Click on bright fringes to measure their position. Use the fringe spacing to calculate the wavelength, then submit your guess below.
            </p>
            {measurements.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Measurements:</p>
                <div className="space-y-1">
                  {measurements.map((m, i) => (
                    <div key={i} className="text-xs font-mono text-gray-700 dark:text-gray-300">
                      Order m={m.order}: calculated {"\u03bb"} {"\u2248"} {m.wavelengthCalc.toFixed(0)} nm
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="number"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Enter wavelength (nm)"
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
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Number of Slits</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={2} max={20} value={numSlits}
              onChange={(e) => setNumSlits(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{numSlits}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slit Spacing</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={15} max={80} value={slitSpacing}
              onChange={(e) => setSlitSpacing(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{slitSpacing}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Wavelength (nm) {challengeMode && <span className="text-amber-500">HIDDEN</span>}
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={380} max={700} value={wavelength}
              onChange={(e) => setWavelength(Number(e.target.value))}
              disabled={challengeMode}
              className="flex-1 disabled:opacity-30"
              style={{ accentColor: challengeMode ? "#6b7280" : `rgb(${wavelengthToRGB(wavelength).join(",")})` }}
            />
            <span className="text-sm font-mono font-bold" style={{ color: challengeMode ? "#6b7280" : `rgb(${wavelengthToRGB(wavelength).join(",")})` }}>
              {challengeMode ? "???" : wavelength}
            </span>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="d\sin\theta = m\lambda" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="R = mN" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Adjust the number of slits and wavelength to see how the diffraction pattern changes!</p>
    </div>
  );
}
