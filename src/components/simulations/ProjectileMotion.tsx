"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  calculateAccuracy,
  renderScorePopup,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawTarget } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";
import { createDragHandler } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";

interface Trail {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ProjectileState {
  trails: Trail[];
  time: number;
  angle: number;
  speed: number;
  color: string;
  done: boolean;
  landed: boolean;
  landX: number;
}

interface TargetState {
  x: number; // in meters
  visible: boolean;
  radius: number; // in meters (the bullseye radius)
}

type GameMode = "sandbox" | "target" | "predict";

const PROJECTILE_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#ec4899", // pink
  "#f97316", // orange
];

export default function ProjectileMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [angle, setAngle] = useState(45);
  const [speed, setSpeed] = useState(50);
  const [gravity, setGravity] = useState(9.8);
  const [wind, setWind] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<GameMode>("sandbox");
  const [showPrediction, setShowPrediction] = useState(true);
  const [multiMode, setMultiMode] = useState(false);

  const lastTsRef = useRef<number | null>(null);
  const projectilesRef = useRef<ProjectileState[]>([]);
  const activeIndexRef = useRef(-1);
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const targetRef = useRef<TargetState>({ x: 0, visible: false, radius: 5 });
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const predictionMarkerRef = useRef<number | null>(null); // predicted landing x in px
  const pulseRef = useRef(0);

  const groundY = 0.85;

  // Generate a random target position
  const generateTarget = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxRange = (100 * 100) / (2 * gravity); // max possible range roughly
    const minX = maxRange * 0.15;
    const maxX = maxRange * 0.85;
    const tx = minX + Math.random() * (maxX - minX);
    targetRef.current = { x: tx, visible: true, radius: 5 };
  }, [gravity]);

  const getScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const gY = canvas.clientHeight * groundY;
    return (gY - 40) / ((100 * 100) / (2 * gravity) + 10);
  }, [gravity]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const gY = H * groundY;
    const scale = getScale();
    const originX = 60;

    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, gY);
    skyGrad.addColorStop(0, "#0f172a");
    skyGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, gY);

    // Stars
    const starSeed = 42;
    for (let i = 0; i < 60; i++) {
      const sx = (starSeed * (i + 1) * 7) % W;
      const sy = (starSeed * (i + 1) * 13) % (gY * 0.7);
      const sr = i % 3 === 0 ? 1.5 : 0.8;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.1})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground
    const groundGrad = ctx.createLinearGradient(0, gY, 0, H);
    groundGrad.addColorStop(0, "#166534");
    groundGrad.addColorStop(1, "#14532d");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gY, W, H - gY);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = gY; y > 0; y -= 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Wind indicator
    if (wind !== 0) {
      const windBarX = W / 2;
      const windBarY = 20;
      const windLen = wind * 3;
      ctx.strokeStyle = "rgba(100,200,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(windBarX, windBarY);
      ctx.lineTo(windBarX + windLen, windBarY);
      ctx.stroke();
      // Arrow head
      const dir = Math.sign(windLen);
      ctx.fillStyle = "rgba(100,200,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(windBarX + windLen, windBarY);
      ctx.lineTo(windBarX + windLen - dir * 8, windBarY - 4);
      ctx.lineTo(windBarX + windLen - dir * 8, windBarY + 4);
      ctx.closePath();
      ctx.fill();

      // Wind particles (small streaks)
      const windTime = performance.now() / 1000;
      ctx.strokeStyle = "rgba(100,200,255,0.15)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const wy = 40 + i * (gY / 10);
        const wxBase = ((windTime * wind * 20 + i * 137) % (W + 100)) - 50;
        ctx.beginPath();
        ctx.moveTo(wxBase, wy);
        ctx.lineTo(wxBase + wind * 2, wy);
        ctx.stroke();
      }
    }

    // Target
    const target = targetRef.current;
    if (target.visible) {
      const targetPx = originX + target.x * scale;
      if (targetPx > 0 && targetPx < W) {
        const targetR = target.radius * scale;
        pulseRef.current += 0.01;

        // Ground target marking
        ctx.fillStyle = "rgba(239,68,68,0.15)";
        ctx.beginPath();
        ctx.arc(targetPx, gY, targetR * 3, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "rgba(239,68,68,0.25)";
        ctx.beginPath();
        ctx.arc(targetPx, gY, targetR * 2, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "rgba(239,68,68,0.4)";
        ctx.beginPath();
        ctx.arc(targetPx, gY, targetR, Math.PI, 0);
        ctx.fill();

        drawTarget(ctx, targetPx, gY - 20, 15, "#ef4444", pulseRef.current % 1);

        // Flag
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetPx, gY);
        ctx.lineTo(targetPx, gY - 40);
        ctx.stroke();
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.moveTo(targetPx, gY - 40);
        ctx.lineTo(targetPx + 18, gY - 35);
        ctx.lineTo(targetPx, gY - 30);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Predicted trajectory (dashed) - for current settings
    const rad = (angle * Math.PI) / 180;
    const vx0 = speed * Math.cos(rad);
    const vy0 = speed * Math.sin(rad);

    if (showPrediction && !isRunning && mode !== "predict") {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let t = 0;
      let prevPy = gY;
      while (t < 30) {
        const px = originX + (vx0 * t + 0.5 * wind * t * t) * scale;
        const py = gY - (vy0 * t - 0.5 * gravity * t * t) * scale;
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        if (py > gY && prevPy <= gY) break;
        prevPy = py;
        t += 0.02;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Prediction marker (user click on ground)
    if (mode === "predict" && predictionMarkerRef.current !== null && !isRunning) {
      const mx = predictionMarkerRef.current;
      // Marker flag
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx, gY);
      ctx.lineTo(mx, gY - 30);
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(mx, gY - 30);
      ctx.lineTo(mx + 14, gY - 26);
      ctx.lineTo(mx, gY - 22);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Prediction", mx, gY + 15);
    }

    // All projectile trails
    const allProjectiles = projectilesRef.current;
    for (let pi = 0; pi < allProjectiles.length; pi++) {
      const proj = allProjectiles[pi];
      const trails = proj.trails;
      if (trails.length < 2) continue;

      const isActive = pi === activeIndexRef.current && !proj.done;
      const trailAlpha = isActive ? 1 : 0.4;

      // Glow
      ctx.shadowColor = proj.color;
      ctx.shadowBlur = isActive ? 12 : 4;
      ctx.strokeStyle = proj.color;
      ctx.lineWidth = isActive ? 3 : 1.5;
      ctx.globalAlpha = trailAlpha;
      ctx.beginPath();
      trails.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Trail dots for active projectile
      if (isActive) {
        trails.forEach((p, i) => {
          if (i % 3 === 0) {
            const alpha = 0.3 + 0.7 * (i / trails.length);
            ctx.fillStyle = proj.color;
            ctx.globalAlpha = alpha * trailAlpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
      ctx.globalAlpha = 1;

      // Landing marker for finished projectiles
      if (proj.done && proj.landed) {
        const lastPoint = trails[trails.length - 1];
        ctx.fillStyle = proj.color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(lastPoint.x, gY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Current active ball position
    const activeProj = allProjectiles[activeIndexRef.current];
    if (activeProj && !activeProj.done) {
      const trails = activeProj.trails;
      if (trails.length > 0) {
        const last = trails[trails.length - 1];
        const bx = last.x;
        const by = last.y;

        // Ball glow
        const ballGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 20);
        ballGrad.addColorStop(0, "rgba(251, 191, 36, 0.6)");
        ballGrad.addColorStop(1, "rgba(251, 191, 36, 0)");
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(bx, by, 20, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Cannon
    ctx.save();
    ctx.translate(originX, gY);
    ctx.rotate(-rad);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(-5, -6, 40, 12);
    ctx.fillStyle = "#475569";
    ctx.fillRect(30, -8, 10, 16);
    ctx.restore();

    // Cannon base
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.arc(originX, gY, 14, Math.PI, 0);
    ctx.fill();

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now),
    );

    // HUD text is rendered as HTML overlays (see JSX below)
  }, [angle, speed, gravity, wind, isRunning, mode, showPrediction, getScale]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    const gY = canvas.clientHeight * groundY;
    const scale = getScale();
    const originX = 60;

    // Update particles
    particlesRef.current.update(dt);

    const activeProj = projectilesRef.current[activeIndexRef.current];
    if (activeProj && !activeProj.done) {
      const rad = (activeProj.angle * Math.PI) / 180;
      const vx0 = activeProj.speed * Math.cos(rad);
      const vy0 = activeProj.speed * Math.sin(rad);
      const t = activeProj.time;

      // Position with wind (wind acts as horizontal acceleration)
      const curVx = vx0 + wind * t;
      const bx = originX + (vx0 * t + 0.5 * wind * t * t) * scale;
      const by = gY - (vy0 * t - 0.5 * gravity * t * t) * scale;

      if (by < gY) {
        activeProj.trails.push({ x: bx, y: by, vx: curVx, vy: vy0 - gravity * t });
        activeProj.time += dt;

        // Emit smoke/fire trail particles
        if (activeProj.trails.length % 2 === 0) {
          const trailAngle = Math.atan2(-(vy0 - gravity * t), curVx);
          particlesRef.current.emitTrail(bx, by, trailAngle, "#f59e0b");
          // Smoke
          particlesRef.current.emit(bx, by, 1, "rgba(150,150,150,0.5)", {
            speed: 15,
            lifetime: 0.4,
            size: 3,
            sizeVariance: 2,
            gravity: -30,
            drag: 0.95,
            shape: "circle",
          });
        }
      } else {
        // Landed
        activeProj.done = true;
        activeProj.landed = true;

        // Calculate actual landing position
        const landT = (2 * vy0) / gravity;
        const landXMeters = vx0 * landT + 0.5 * wind * landT * landT;
        activeProj.landX = landXMeters;
        const landPx = originX + landXMeters * scale;

        // Landing particles
        particlesRef.current.emitSparks(landPx, gY, 15, "#fbbf24");
        playSFX("collision");

        // Target scoring
        const target = targetRef.current;
        if (mode === "target" && target.visible) {
          const dist = Math.abs(landXMeters - target.x);
          let points = 0;
          let label = "Miss!";
          if (dist < target.radius * 0.5) {
            points = 3;
            label = "Bullseye!";
            particlesRef.current.emitConfetti(landPx, gY - 20, 40);
            playSFX("success");
          } else if (dist < target.radius) {
            points = 2;
            label = "Great!";
            particlesRef.current.emitGlow(landPx, gY, 10, "#3b82f6");
            playSFX("correct");
          } else if (dist < target.radius * 2) {
            points = 1;
            label = "Close!";
            playSFX("pop");
          } else if (dist < target.radius * 4) {
            points = 1;
            label = "Near";
            playSFX("tick");
          } else {
            playSFX("fail");
          }

          const result = { points, tier: points >= 3 ? "perfect" as const : points >= 2 ? "great" as const : points >= 1 ? "close" as const : "miss" as const, label };
          challengeRef.current = updateChallengeState(challengeRef.current, result);
          scorePopupsRef.current.push({
            text: label,
            points,
            x: landPx,
            y: gY - 40,
            startTime: performance.now(),
          });
          if (points > 0) playScore(points);

          // Generate new target after a delay
          setTimeout(() => {
            generateTarget();
          }, 1500);
        }

        // Prediction scoring
        if (mode === "predict" && predictionMarkerRef.current !== null) {
          const predictedMeters = (predictionMarkerRef.current - originX) / scale;
          const result = calculateAccuracy(predictedMeters, landXMeters, landXMeters * 0.3 + 5);
          challengeRef.current = updateChallengeState(challengeRef.current, result);
          scorePopupsRef.current.push({
            text: result.label,
            points: result.points,
            x: landPx,
            y: gY - 40,
            startTime: performance.now(),
          });
          if (result.points > 0) {
            playScore(result.points);
          } else {
            playSFX("fail");
          }
          predictionMarkerRef.current = null;
        }

        setIsRunning(false);
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravity, wind, draw, mode, generateTarget, getScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 500));
      draw();
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Click on canvas for prediction mode
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        if (mode === "predict" && !isRunning) {
          const gY = canvas.clientHeight * groundY;
          // Only accept clicks near the ground level
          if (Math.abs(y - gY) < 30) {
            predictionMarkerRef.current = x;
            playSFX("click");
            draw();
          }
        }
      },
    });

    return cleanup;
  }, [mode, isRunning, draw]);

  const launch = () => {
    if (!multiMode) {
      projectilesRef.current = [];
    }

    const colorIndex = projectilesRef.current.length % PROJECTILE_COLORS.length;
    const newProj: ProjectileState = {
      trails: [],
      time: 0,
      angle,
      speed,
      color: PROJECTILE_COLORS[colorIndex],
      done: false,
      landed: false,
      landX: 0,
    };
    projectilesRef.current.push(newProj);
    activeIndexRef.current = projectilesRef.current.length - 1;

    lastTsRef.current = null;
    playSFX("launch");
    setIsRunning(true);
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    projectilesRef.current = [];
    activeIndexRef.current = -1;
    lastTsRef.current = null;
    particlesRef.current.clear();
    predictionMarkerRef.current = null;
    setIsRunning(false);
    draw();
  };

  const switchMode = (newMode: GameMode) => {
    reset();
    setMode(newMode);
    challengeRef.current = createChallengeState();
    scorePopupsRef.current = [];
    if (newMode === "target") {
      generateTarget();
    } else {
      targetRef.current.visible = false;
    }
  };

  const rad = (angle * Math.PI) / 180;
  const vy0 = speed * Math.sin(rad);
  const noWindRange = (speed * speed * Math.sin(2 * rad)) / gravity;
  const maxH = (vy0 * vy0) / (2 * gravity);
  const totalTimeNoWind = (2 * vy0) / gravity;

  return (
    <div className="space-y-4">
      <div className="relative rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />

        {/* HUD: Info panel (top-right) */}
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2 pointer-events-none">
          <p className="text-[11px] font-bold font-mono text-slate-400 uppercase tracking-wider mb-1">Projectile Data</p>
          <div className="space-y-0.5 text-xs font-mono text-slate-200">
            <p>Range: <span className="font-semibold">{noWindRange.toFixed(1)} m</span></p>
            <p>Max H: <span className="font-semibold">{maxH.toFixed(1)} m</span></p>
            <p>Time: <span className="font-semibold">{totalTimeNoWind.toFixed(2)} s</span></p>
            {wind !== 0 && (
              <p className="text-cyan-300/80">Wind: <span className="font-semibold">{wind > 0 ? "+" : ""}{wind.toFixed(0)} m/s</span></p>
            )}
          </div>
        </div>

        {/* HUD: Scoreboard (top-left, target mode) */}
        {mode === "target" && (
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2 pointer-events-none">
            <p className="text-[11px] font-bold font-mono text-slate-400 uppercase tracking-wider mb-1">Challenge</p>
            <p className="text-lg font-bold font-mono text-slate-100">{challengeRef.current.score}</p>
            <div className="space-y-0.5 text-[10px] font-mono text-slate-400 mt-1">
              <p>Attempts: {challengeRef.current.attempts}</p>
              {challengeRef.current.streak > 0 && (
                <p className="text-amber-400">Streak: {challengeRef.current.streak}</p>
              )}
              <p>Accuracy: {challengeRef.current.attempts > 0 ? Math.round((challengeRef.current.score / (challengeRef.current.attempts * 3)) * 100) : 0}%</p>
            </div>
          </div>
        )}

        {/* HUD: Mode badge (bottom-center) */}
        {mode !== "sandbox" && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className={`px-3 py-1 rounded-md text-[11px] font-bold font-mono uppercase tracking-wider border ${
              mode === "target"
                ? "text-red-400 bg-red-500/20 border-red-500/50"
                : "text-amber-400 bg-amber-500/20 border-amber-500/50"
            }`}>
              {mode === "target" ? "Target Mode" : "Predict Mode"}
            </span>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Game Mode
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => switchMode("sandbox")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "sandbox"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Sandbox
          </button>
          <button
            onClick={() => switchMode("target")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "target"
                ? "bg-red-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Target Challenge
          </button>
          <button
            onClick={() => switchMode("predict")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "predict"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Predict Landing
          </button>
          <button
            onClick={() => { setMultiMode(!multiMode); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              multiMode
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Multi-Shot {multiMode ? "ON" : "OFF"}
          </button>
        </div>
        {mode === "predict" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Click on the ground to place your prediction marker before launching. The trajectory preview is hidden in predict mode.
          </p>
        )}
        {mode === "target" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Hit the red target! Adjust angle, speed, and account for wind. Bullseye = 3pts, Great = 2pts, Close = 1pt, Near = 1pt.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Launch Angle
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={90}
              value={angle}
              onChange={(e) => {
                setAngle(Number(e.target.value));
                if (!multiMode) reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {angle}&deg;
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Initial Speed
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={100}
              value={speed}
              onChange={(e) => {
                setSpeed(Number(e.target.value));
                if (!multiMode) reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
              {speed} m/s
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Gravity
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={25}
              step={0.1}
              value={gravity}
              onChange={(e) => {
                setGravity(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">
              {gravity.toFixed(1)} m/s&sup2;
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Wind Speed
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={wind}
              onChange={(e) => {
                setWind(Number(e.target.value));
                if (!multiMode) reset();
              }}
              className="flex-1 accent-cyan-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5rem] text-right">
              {wind > 0 ? "+" : ""}{wind} m/s
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={launch}
            disabled={isRunning}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "In Flight..." : "Launch"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
          {mode === "sandbox" && (
            <button
              onClick={() => setShowPrediction(!showPrediction)}
              className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                showPrediction
                  ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Trace
            </button>
          )}
        </div>

        {/* Score display for challenge modes */}
        {(mode === "target" || mode === "predict") && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Score
                </label>
                <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {challengeRef.current.score}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {challengeRef.current.attempts} attempts
                </p>
                {challengeRef.current.streak > 0 && (
                  <p className="text-xs text-amber-500 font-medium">
                    Streak: {challengeRef.current.streak}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="x(t) = v_0\cos\theta \cdot t + \frac{1}{2}a_x t^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="y(t) = v_0\sin\theta \cdot t - \frac{1}{2}gt^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="R = \frac{v_0^2 \sin(2\theta)}{g}" />
          </div>
        </div>
      </div>
    </div>
  );
}
