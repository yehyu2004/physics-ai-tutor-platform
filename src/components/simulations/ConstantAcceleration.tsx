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
import { drawTarget, drawInfoPanel } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

const MAX_DIST = 200;

export default function ConstantAcceleration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [v0, setV0] = useState(5);
  const [accel, setAccel] = useState(2);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; x: number; v: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);
  const outOfBoundsRef = useRef(false);

  // Challenge mode state
  const [challengeMode, setChallengeMode] = useState(false);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const [lastStopDistance, setLastStopDistance] = useState<number | null>(null);
  const targetDistRef = useRef(80); // target distance in meters
  const scorePopupRef = useRef<ScorePopup | null>(null);
  const particlesRef = useRef(new ParticleSystem());
  const hasScored = useRef(false);
  const carStoppedRef = useRef(false);

  // Prediction mode state
  const [predictionMode, setPredictionMode] = useState(false);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [showPredictionResult, setShowPredictionResult] = useState(false);
  const predictionLineRef = useRef<number | null>(null);

  const randomizeTarget = useCallback(() => {
    targetDistRef.current = Math.round(30 + Math.random() * 100);
    hasScored.current = false;
    carStoppedRef.current = false;
    scorePopupRef.current = null;
  }, []);

  /** Calculate the theoretical stopping distance (when v=0) if accel < 0 */
  const getStoppingDistance = useCallback(() => {
    if (accel >= 0) {
      // Car never stops with positive/zero acceleration; use max distance
      return MAX_DIST;
    }
    // v = v0 + a*t = 0 => t_stop = -v0/a
    const tStop = -v0 / accel;
    if (tStop < 0) return 0; // car was already going backward
    const xStop = v0 * tStop + 0.5 * accel * tStop * tStop;
    return Math.max(0, xStop);
  }, [v0, accel]);

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

    // Current values
    const x = v0 * t + 0.5 * accel * t * t;
    const v = v0 + accel * t;

    // --- Top section: Car animation ---
    const carSection = H * 0.22;
    const roadY = carSection * 0.7;
    const margin = 60;
    const trackW = W - margin * 2;

    // Road
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(margin, roadY - 2, trackW, 20);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(margin, roadY + 8);
    ctx.lineTo(margin + trackW, roadY + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Distance markers
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    for (let d = 0; d <= MAX_DIST; d += 25) {
      const px = margin + (d / MAX_DIST) * trackW;
      ctx.fillRect(px, roadY + 18, 1, 5);
      ctx.fillText(`${d}m`, px, roadY + 32);
    }

    // --- Challenge mode: draw target on road ---
    if (challengeMode) {
      const targetX = margin + (targetDistRef.current / MAX_DIST) * trackW;
      const pulse = (performance.now() / 1000) % 1;

      // Target zone glow on road
      const zoneWidth = 20;
      const zoneGlow = ctx.createLinearGradient(
        targetX - zoneWidth, roadY,
        targetX + zoneWidth, roadY
      );
      zoneGlow.addColorStop(0, "rgba(239,68,68,0)");
      zoneGlow.addColorStop(0.3, "rgba(239,68,68,0.15)");
      zoneGlow.addColorStop(0.5, "rgba(239,68,68,0.3)");
      zoneGlow.addColorStop(0.7, "rgba(239,68,68,0.15)");
      zoneGlow.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = zoneGlow;
      ctx.fillRect(targetX - zoneWidth, roadY - 6, zoneWidth * 2, 26);

      // Target marker (flag)
      drawTarget(ctx, targetX, roadY - 12, 8, "#ef4444", pulse);

      // Target distance label
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText(`${targetDistRef.current}m`, targetX, roadY - 28);
    }

    // --- Prediction mode: draw prediction line ---
    if (predictionMode && predictionLineRef.current !== null) {
      const predX = margin + (predictionLineRef.current / MAX_DIST) * trackW;
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(predX, roadY - 30);
      ctx.lineTo(predX, roadY + 18);
      ctx.stroke();
      ctx.setLineDash([]);

      // Prediction label
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#a855f7";
      ctx.textAlign = "center";
      ctx.fillText(`Predicted: ${predictionLineRef.current.toFixed(1)}m`, predX, roadY - 34);
    }

    // Car position
    const carX = margin + Math.min((x / MAX_DIST), 1) * trackW;

    // Speed-based color
    const speedFrac = Math.min(Math.abs(v) / 30, 1);
    const cr = Math.round(59 + speedFrac * 180);
    const cg = Math.round(130 - speedFrac * 80);
    const cb = Math.round(246 - speedFrac * 200);

    // Car glow
    const carGlow = ctx.createRadialGradient(carX, roadY, 0, carX, roadY, 30);
    carGlow.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
    carGlow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = carGlow;
    ctx.beginPath();
    ctx.arc(carX, roadY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Car body
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.beginPath();
    ctx.roundRect(carX - 18, roadY - 12, 36, 14, 4);
    ctx.fill();
    // Roof
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.7)`;
    ctx.beginPath();
    ctx.roundRect(carX - 10, roadY - 20, 20, 10, 3);
    ctx.fill();
    // Wheels
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(carX - 10, roadY + 2, 4, 0, Math.PI * 2);
    ctx.arc(carX + 10, roadY + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Velocity arrow
    if (Math.abs(v) > 0.3) {
      const arrLen = Math.min(Math.abs(v) * 3, 60) * Math.sign(v);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(carX, roadY - 25);
      ctx.lineTo(carX + arrLen, roadY - 25);
      ctx.stroke();
      const dir = v > 0 ? 1 : -1;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(carX + arrLen, roadY - 25);
      ctx.lineTo(carX + arrLen - dir * 7, roadY - 30);
      ctx.lineTo(carX + arrLen - dir * 7, roadY - 20);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText(`v = ${v.toFixed(1)} m/s`, carX + arrLen / 2, roadY - 32);
    }

    // --- Draw particles ---
    particlesRef.current.draw(ctx);

    // --- Score popup ---
    if (scorePopupRef.current) {
      const alive = renderScorePopup(ctx, scorePopupRef.current, performance.now());
      if (!alive) {
        scorePopupRef.current = null;
      }
    }

    // --- Scoreboard (challenge mode) ---
    if (challengeMode && challengeRef.current.attempts > 0) {
      renderScoreboard(ctx, W - 150, 8, 140, 110, challengeRef.current);
    }

    // --- Challenge mode: instructions banner ---
    if (challengeMode && !hasScored.current && !isRunning && t === 0) {
      ctx.fillStyle = "rgba(245,158,11,0.12)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 160, 6, 320, 28, 8);
      ctx.fill();
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      ctx.fillText("Set v₀ & a to stop the car at the target!", W / 2, 24);
    }

    // --- Three graphs side by side ---
    const graphTop = carSection + 20;
    const graphH = H - graphTop - 30;
    const gapX = 15;
    const graphW = (W - margin * 2 - gapX * 2) / 3;
    const history = historyRef.current;
    const maxT = Math.max(t + 1, 6);

    const graphs = [
      {
        title: "Position x(t)",
        color: "#3b82f6",
        glow: "rgba(59,130,246,0.3)",
        getValue: (h: { x: number }) => h.x,
        equation: `x = ${v0}t + ½(${accel})t²`,
      },
      {
        title: "Velocity v(t)",
        color: "#22c55e",
        glow: "rgba(34,197,94,0.3)",
        getValue: (h: { v: number }) => h.v,
        equation: `v = ${v0} + ${accel}t`,
      },
      {
        title: "Acceleration a(t)",
        color: "#f59e0b",
        glow: "rgba(245,158,11,0.3)",
        getValue: () => accel,
        equation: `a = ${accel} m/s²`,
      },
    ];

    graphs.forEach((graph, idx) => {
      const gx = margin + idx * (graphW + gapX);
      const gy = graphTop;

      // Background
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(gx, gy, graphW, graphH, 6);
      ctx.fill();

      // Title
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = graph.color;
      ctx.textAlign = "left";
      ctx.fillText(graph.title, gx + 8, gy + 16);

      // Equation
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#64748b";
      ctx.fillText(graph.equation, gx + 8, gy + 28);

      // Axes
      const axMargin = 10;
      const plotX = gx + axMargin;
      const plotW = graphW - axMargin * 2;
      const plotY = gy + 35;
      const plotH = graphH - 50;

      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();

      // Target line on position graph (challenge mode)
      if (challengeMode && idx === 0) {
        const values = history.length > 0 ? history.map((h) => graph.getValue(h)) : [0];
        const minVal = Math.min(0, ...values);
        const maxVal = Math.max(1, ...values, targetDistRef.current * 1.1);
        const range = maxVal - minVal || 1;
        const targetY = plotY + plotH - ((targetDistRef.current - minVal) / range) * plotH;

        ctx.strokeStyle = "rgba(239,68,68,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(plotX, targetY);
        ctx.lineTo(plotX + plotW, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "right";
        ctx.fillText(`target`, plotX + plotW, targetY - 4);
      }

      // Prediction line on position graph
      if (predictionMode && predictionLineRef.current !== null && idx === 0) {
        const values = history.length > 0 ? history.map((h) => graph.getValue(h)) : [0];
        const minVal = Math.min(0, ...values);
        const maxVal = Math.max(1, ...values, (predictionLineRef.current || 1) * 1.1);
        const range = maxVal - minVal || 1;
        const predY = plotY + plotH - ((predictionLineRef.current - minVal) / range) * plotH;

        ctx.strokeStyle = "rgba(168,85,247,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(plotX, predY);
        ctx.lineTo(plotX + plotW, predY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "#a855f7";
        ctx.textAlign = "right";
        ctx.fillText(`predicted`, plotX + plotW, predY - 4);
      }

      // Plot data
      if (history.length > 1) {
        const values = history.map((h) => graph.getValue(h));
        const minVal = Math.min(0, ...values);
        const maxVal = Math.max(1, ...values);
        const range = maxVal - minVal || 1;

        // Zero line
        if (minVal < 0 && maxVal > 0) {
          const zeroY = plotY + plotH - ((-minVal) / range) * plotH;
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.beginPath();
          ctx.moveTo(plotX, zeroY);
          ctx.lineTo(plotX + plotW, zeroY);
          ctx.stroke();
        }

        ctx.strokeStyle = graph.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = graph.glow;
        ctx.shadowBlur = 8;
        ctx.beginPath();

        for (let i = 0; i < history.length; i++) {
          const px = plotX + (history[i].t / maxT) * plotW;
          const py = plotY + plotH - ((values[i] - minVal) / range) * plotH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Current value dot
        const lastH = history[history.length - 1];
        const lastVal = graph.getValue(lastH);
        const dotX = plotX + (lastH.t / maxT) * plotW;
        const dotY = plotY + plotH - ((lastVal - minVal) / range) * plotH;
        ctx.fillStyle = graph.color;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Value label
        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "right";
        ctx.fillText(lastVal.toFixed(1), gx + graphW - 8, gy + graphH - 8);
      }
    });

    // --- Info panel in challenge mode showing distance to target ---
    if (challengeMode) {
      const distToTarget = Math.abs(x - targetDistRef.current);
      drawInfoPanel(ctx, margin, H - 28, 200, 22,
        "", [{ label: `Distance to target: ${distToTarget.toFixed(1)}m`, value: "", color: distToTarget < 5 ? "#22c55e" : "#94a3b8" }]);
    }

    // Time display
    ctx.font = "bold 12px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(`t = ${t.toFixed(1)} s`, challengeMode ? margin + 210 : margin, H - 8);

    // Out of bounds indicator
    if (outOfBoundsRef.current) {
      ctx.fillStyle = "rgba(239,68,68,0.15)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 85, 12, 170, 30, 8);
      ctx.fill();
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OUT OF BOUNDS", W / 2, 27);
    }

    // --- Prediction result overlay ---
    if (predictionMode && showPredictionResult && predictionLineRef.current !== null) {
      const actualStop = getStoppingDistance();
      const predVal = predictionLineRef.current;
      const result = calculateAccuracy(predVal, actualStop, MAX_DIST);

      const panelW = 220;
      const panelH = 80;
      const panelX = W / 2 - panelW / 2;
      const panelY = carSection * 0.15;

      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 10);
      ctx.fill();
      ctx.strokeStyle = result.points >= 2 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = "bold 16px ui-monospace";
      ctx.fillStyle = result.points >= 3 ? "#22c55e" : result.points >= 2 ? "#3b82f6" : result.points >= 1 ? "#f59e0b" : "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText(result.label, W / 2, panelY + 25);

      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Predicted: ${predVal.toFixed(1)}m`, W / 2, panelY + 45);
      ctx.fillText(`Actual: ${actualStop.toFixed(1)}m  |  Error: ${Math.abs(predVal - actualStop).toFixed(1)}m`, W / 2, panelY + 62);
    }
  }, [v0, accel, challengeMode, predictionMode, showPredictionResult, isRunning, getStoppingDistance]);

  const scoreChallenge = useCallback((currentX: number) => {
    if (!challengeMode || hasScored.current) return;

    const targetDist = targetDistRef.current;
    const result = calculateAccuracy(currentX, targetDist, MAX_DIST);
    hasScored.current = true;

    const canvas = canvasRef.current;
    const W = canvas ? canvas.width : 800;
    const margin = 60;
    const trackW = W - margin * 2;
    const carSection = canvas ? canvas.height * 0.22 : 100;
    const roadY = carSection * 0.7;
    const carPx = margin + Math.min((currentX / MAX_DIST), 1) * trackW;

    // Update challenge state
    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeScore(challengeRef.current.score);
    setChallengeAttempts(challengeRef.current.attempts);
    setLastStopDistance(currentX);

    // Create score popup
    scorePopupRef.current = {
      text: result.label,
      points: result.points,
      x: carPx,
      y: roadY - 40,
      startTime: performance.now(),
    };

    // Particle effects
    if (result.points >= 2) {
      particlesRef.current.emitConfetti(carPx, roadY - 10, 25);
      playSFX("success");
      playScore(result.points);
    } else if (result.points >= 1) {
      particlesRef.current.emitSparks(carPx, roadY, 15, "#f59e0b");
      playSFX("correct");
      playScore(result.points);
    } else {
      particlesRef.current.emitSparks(carPx, roadY, 8, "#ef4444");
      playSFX("fail");
    }
  }, [challengeMode]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;
    const t = timeRef.current;
    const x = v0 * t + 0.5 * accel * t * t;
    const v = v0 + accel * t;
    historyRef.current.push({ t, x, v });
    if (historyRef.current.length > 500) historyRef.current.shift();

    // Update particles
    particlesRef.current.update(dt);

    // Challenge mode: check if car stopped (v crosses zero with negative accel)
    if (challengeMode && accel < 0 && !hasScored.current) {
      if (v <= 0 && !carStoppedRef.current) {
        carStoppedRef.current = true;
        // Car has stopped, score it
        const tStop = -v0 / accel;
        const xStop = v0 * tStop + 0.5 * accel * tStop * tStop;
        scoreChallenge(xStop);
        playSFX("collision");
        // Stop the simulation so the car doesn't reverse
        cancelAnimationFrame(animRef.current);
        setIsRunning(false);
        draw();
        return;
      }
    }

    // Prediction mode: check if car stopped
    if (predictionMode && accel < 0 && predictionLineRef.current !== null && !showPredictionResult) {
      if (v <= 0) {
        setShowPredictionResult(true);
        // Stop the simulation so the car doesn't reverse
        cancelAnimationFrame(animRef.current);
        setIsRunning(false);
        draw();
        return;
      }
    }

    // Stop if position goes out of bounds
    if (x > MAX_DIST || x < -10) {
      outOfBoundsRef.current = true;

      // In challenge mode, score as miss if hasn't scored yet
      if (challengeMode && !hasScored.current) {
        scoreChallenge(x);
      }

      setIsRunning(false);
      draw();
      return;
    }

    // With positive acceleration, car never stops - check if it passed the target
    if (challengeMode && accel >= 0 && !hasScored.current && x >= MAX_DIST * 0.95) {
      scoreChallenge(x);
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [v0, accel, draw, challengeMode, predictionMode, showPredictionResult, scoreChallenge]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.65, 550);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Animation loop
  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Canvas click handler for placing targets
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (mx, my) => {
        const W = canvas.width;
        const H = canvas.height;
        const carSection = H * 0.22;
        const roadY = carSection * 0.7;
        const margin = 60;
        const trackW = W - margin * 2;

        // Only handle clicks near the road area
        if (my > roadY - 40 && my < roadY + 40 && mx >= margin && mx <= margin + trackW) {
          if (challengeMode && !isRunning) {
            // Place target at click position
            const dist = ((mx - margin) / trackW) * MAX_DIST;
            targetDistRef.current = Math.round(Math.max(10, Math.min(190, dist)));
            hasScored.current = false;
            carStoppedRef.current = false;
            scorePopupRef.current = null;
            playSFX("click");
            draw();
          } else if (predictionMode && !isRunning && timeRef.current === 0) {
            // Place prediction marker
            const dist = ((mx - margin) / trackW) * MAX_DIST;
            const clamped = Math.max(0, Math.min(MAX_DIST, dist));
            const rounded = Math.round(clamped * 10) / 10; // round to 1 decimal
            predictionLineRef.current = rounded;
            setPrediction(rounded);
            playSFX("click");
            draw();
          }
        }
      },
    });

    return cleanup;
  }, [challengeMode, predictionMode, isRunning, draw]);

  const reset = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    setIsRunning(false);
    timeRef.current = 0;
    historyRef.current = [];
    lastTsRef.current = null;
    outOfBoundsRef.current = false;
    carStoppedRef.current = false;
    if (challengeMode) {
      hasScored.current = false;
      scorePopupRef.current = null;
    }
    if (predictionMode) {
      setShowPredictionResult(false);
    }
    particlesRef.current.clear();
    draw();
  }, [draw, challengeMode, predictionMode]);

  const handleToggleChallenge = () => {
    const next = !challengeMode;
    setChallengeMode(next);
    if (next) {
      challengeRef.current = createChallengeState();
      setChallengeScore(0);
      setChallengeAttempts(0);
      setLastStopDistance(null);
      randomizeTarget();
      setPredictionMode(false);
      predictionLineRef.current = null;
      setPrediction(null);
      setShowPredictionResult(false);
      // Stop the sim so the user can set params before pressing Play
      setIsRunning(false);
      cancelAnimationFrame(animRef.current);
      // Set sensible defaults for braking challenge
      setV0(20);
      setAccel(-2);
    }
    hasScored.current = false;
    carStoppedRef.current = false;
    scorePopupRef.current = null;
    reset();
  };

  const handleTogglePrediction = () => {
    const next = !predictionMode;
    setPredictionMode(next);
    if (next) {
      setChallengeMode(false);
      predictionLineRef.current = null;
      setPrediction(null);
      setShowPredictionResult(false);
    } else {
      predictionLineRef.current = null;
      setPrediction(null);
      setShowPredictionResult(false);
    }
    reset();
  };

  const handleNewTarget = () => {
    randomizeTarget();
    reset();
    playSFX("pop");
  };

  const handleLaunch = () => {
    if (!isRunning && timeRef.current === 0) {
      playSFX("launch");
    }
    if (!isRunning) {
      lastTsRef.current = null;
    }
    setIsRunning(!isRunning);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Initial Velocity</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={-10} max={20} step={0.5} value={v0}
              onChange={(e) => { setV0(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4.5rem] text-right">{v0} m/s</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acceleration</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={-5} max={10} step={0.5} value={accel}
              onChange={(e) => { setAccel(Number(e.target.value)); reset(); }}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">{accel} m/s²</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={handleLaunch}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={() => { reset(); if (!isRunning) draw(); }}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Key Equations</h4>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
            <div><SimMath math="x = x_0 + v_0 t + \frac{1}{2}at^2" /></div>
            <div><SimMath math="v = v_0 + at" /></div>
            <div><SimMath math="v^2 = v_0^2 + 2a(x - x_0)" /></div>
          </div>
        </div>
      </div>

      {/* Challenge & Prediction Mode Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`rounded-xl border ${challengeMode ? "border-amber-500/50" : "border-gray-200 dark:border-gray-800"} bg-white dark:bg-gray-900 p-4 transition-colors`}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span> Challenge Mode
            </h4>
            <button onClick={handleToggleChallenge}
              className={`h-8 px-4 rounded-lg text-sm font-medium transition-colors ${
                challengeMode
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>
              {challengeMode ? "Exit Challenge" : "Start Challenge"}
            </button>
          </div>
          {challengeMode && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Stop the car at the target ({targetDistRef.current}m). Adjust v₀ and a, then press Play.
                Click on the road to place the target.
              </p>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5">
                Tip: Use negative acceleration (braking) to stop the car at the target!
              </p>
              {lastStopDistance !== null && (
                <div className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Stopped at: </span>
                  <strong className="text-gray-900 dark:text-gray-100">{lastStopDistance.toFixed(1)}m</strong>
                  <span className="text-gray-500 dark:text-gray-400 mx-2">|</span>
                  <span className="text-gray-500 dark:text-gray-400">Target: </span>
                  <strong className="text-amber-500">{targetDistRef.current}m</strong>
                  <span className="text-gray-500 dark:text-gray-400 mx-2">|</span>
                  <span className="text-gray-500 dark:text-gray-400">Error: </span>
                  <strong className={Math.abs(lastStopDistance - targetDistRef.current) < 5 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(lastStopDistance - targetDistRef.current).toFixed(1)}m
                  </strong>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleNewTarget}
                  className="h-8 px-3 rounded-lg border border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs font-medium transition-colors">
                  New Target
                </button>
                {challengeAttempts > 0 && (
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 ml-auto">
                    <span>Score: <strong className="text-gray-900 dark:text-gray-100">{challengeScore}</strong></span>
                    <span>Streak: <strong className="text-amber-500">{challengeRef.current.streak}</strong></span>
                    <span>Attempts: {challengeAttempts}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`rounded-xl border ${predictionMode ? "border-purple-500/50" : "border-gray-200 dark:border-gray-800"} bg-white dark:bg-gray-900 p-4 transition-colors`}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <span className="text-purple-500">&#9881;</span> Prediction Mode
            </h4>
            <button onClick={handleTogglePrediction}
              className={`h-8 px-4 rounded-lg text-sm font-medium transition-colors ${
                predictionMode
                  ? "bg-purple-500 text-white hover:bg-purple-600"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>
              {predictionMode ? "Exit Prediction" : "Predict"}
            </button>
          </div>
          {predictionMode && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {accel < 0
                  ? "Click on the road to predict where the car will stop, then press Play to verify."
                  : "Set a negative acceleration first, then predict where the car will stop."
                }
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Prediction:</label>
                  <input
                    type="number"
                    min={0}
                    max={MAX_DIST}
                    step={0.1}
                    value={prediction ?? ""}
                    placeholder="Click road or type"
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPrediction(val);
                      predictionLineRef.current = val;
                      draw();
                    }}
                    className="flex-1 h-8 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono"
                  />
                  <span className="text-xs text-gray-400">m</span>
                </div>
                {accel < 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Actual: <strong className="text-purple-400">{showPredictionResult ? `${getStoppingDistance().toFixed(1)}m` : "???"}</strong>
                  </div>
                )}
              </div>
              {showPredictionResult && predictionLineRef.current !== null && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-300">
                  <div>t_stop = -v₀/a = {(-v0 / accel).toFixed(2)} s</div>
                  <div>x_stop = v₀t + ½at² = {getStoppingDistance().toFixed(2)} m</div>
                  <div>Your prediction error: {Math.abs((predictionLineRef.current || 0) - getStoppingDistance()).toFixed(1)} m</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
