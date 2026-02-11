"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawTarget } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

interface Charge {
  x: number;
  y: number;
  q: number;
}

interface PathPoint {
  x: number;
  y: number;
  V: number;
}

type GameMode = "sandbox" | "navigate";

export default function Equipotential() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [charges, setCharges] = useState<Charge[]>([
    { x: 0.35, y: 0.5, q: 1 },
    { x: 0.65, y: 0.5, q: -1 },
  ]);
  const [showField, setShowField] = useState(true);
  const [contourCount, setContourCount] = useState(12);
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");
  const draggingRef = useRef<number | null>(null);

  // Path drawing state
  const [pathPoints, setPathPoints] = useState<PathPoint[]>([]);
  const isDrawingPathRef = useRef(false);

  // Navigate game state
  const testChargeRef = useRef({ x: 0.1, y: 0.5 });
  const testChargeGoalRef = useRef({ x: 0.9, y: 0.5 });
  const isDraggingTestChargeRef = useRef(false);
  const navPathRef = useRef<Array<{ x: number; y: number }>>([]);
  const navWorkRef = useRef(0);
  const navCompletedRef = useRef(false);
  const navBestWorkRef = useRef(Infinity);

  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const timeRef = useRef(0);

  const k = 8.99e9;

  const computeV = useCallback(
    (px: number, py: number, W: number, H: number, chargeList: Charge[]): number => {
      let V = 0;
      for (const c of chargeList) {
        const dx = px - c.x * W;
        const dy = py - c.y * H;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 5) continue;
        V += (c.q * k) / (r * 2);
      }
      return V;
    },
    []
  );

  const computeVNorm = useCallback(
    (fx: number, fy: number, chargeList: Charge[]): number => {
      // Compute potential at fractional coords
      let V = 0;
      for (const c of chargeList) {
        const dx = fx - c.x;
        const dy = fy - c.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.01) continue;
        V += c.q / r;
      }
      return V;
    },
    []
  );

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

    // Compute potential field
    const step = 6;
    const cols = Math.ceil(W / step);
    const rows = Math.ceil(H / step);
    const field: number[][] = [];

    let minV = Infinity,
      maxV = -Infinity;
    for (let j = 0; j < rows; j++) {
      field[j] = [];
      for (let i = 0; i < cols; i++) {
        const v = computeV(i * step, j * step, W, H, charges);
        field[j][i] = v;
        if (Math.abs(v) < 1e12) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
    }

    // Draw colored potential map
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const v = field[j][i];
        if (Math.abs(v) > 1e12) continue;
        const norm = (v - minV) / (maxV - minV + 1e-10);
        const r = Math.floor(norm * 100);
        const g = Math.floor(20 + (1 - Math.abs(norm - 0.5) * 2) * 30);
        const b = Math.floor((1 - norm) * 100);
        ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
        ctx.fillRect(i * step, j * step, step, step);
      }
    }

    // Draw equipotential contours
    const contourRange = maxV - minV;
    if (contourRange > 0) {
      for (let c = 1; c <= contourCount; c++) {
        const targetV = minV + (contourRange * c) / (contourCount + 1);
        const isPositive = targetV > (minV + maxV) / 2;

        ctx.strokeStyle = isPositive
          ? `rgba(239,68,68,${0.4 + c * 0.03})`
          : `rgba(59,130,246,${0.4 + (contourCount - c) * 0.03})`;
        ctx.lineWidth = 1.5;

        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const v00 = field[j][i];
            const v10 = field[j][i + 1];
            const v01 = field[j + 1][i];

            if (
              (v00 - targetV) * (v10 - targetV) < 0 &&
              Math.abs(v00) < 1e12 &&
              Math.abs(v10) < 1e12
            ) {
              const frac = (targetV - v00) / (v10 - v00);
              const cx2 = (i + frac) * step;
              const cy2 = j * step;
              ctx.beginPath();
              ctx.arc(cx2, cy2, 1, 0, Math.PI * 2);
              ctx.stroke();
            }

            if (
              (v00 - targetV) * (v01 - targetV) < 0 &&
              Math.abs(v00) < 1e12 &&
              Math.abs(v01) < 1e12
            ) {
              const frac = (targetV - v00) / (v01 - v00);
              const cx2 = i * step;
              const cy2 = (j + frac) * step;
              ctx.beginPath();
              ctx.arc(cx2, cy2, 1, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }
    }

    // Draw electric field vectors
    if (showField) {
      const arrowStep = 40;
      for (let y = arrowStep; y < H; y += arrowStep) {
        for (let x = arrowStep; x < W; x += arrowStep) {
          let Ex = 0,
            Ey = 0;
          let tooClose = false;
          for (const c of charges) {
            const dx = x - c.x * W;
            const dy = y - c.y * H;
            const r2 = dx * dx + dy * dy;
            if (r2 < 600) {
              tooClose = true;
              break;
            }
            const r = Math.sqrt(r2);
            const E = c.q / r2;
            Ex += (E * dx) / r;
            Ey += (E * dy) / r;
          }
          if (tooClose) continue;

          const mag = Math.sqrt(Ex * Ex + Ey * Ey);
          if (mag < 1e-10) continue;
          const len = Math.min(mag * 5e5, 16);
          const nx = Ex / mag;
          const ny = Ey / mag;

          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + nx * len, y + ny * len);
          ctx.stroke();

          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.beginPath();
          ctx.moveTo(x + nx * (len + 3), y + ny * (len + 3));
          ctx.lineTo(x + nx * len - ny * 2, y + ny * len + nx * 2);
          ctx.lineTo(x + nx * len + ny * 2, y + ny * len - nx * 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw path if drawn
    if (pathPoints.length > 1) {
      ctx.strokeStyle = "rgba(34,197,94,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pathPoints[0].x * W, pathPoints[0].y * H);
      for (let i = 1; i < pathPoints.length; i++) {
        ctx.lineTo(pathPoints[i].x * W, pathPoints[i].y * H);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Work done along path
      let totalWork = 0;
      for (let i = 1; i < pathPoints.length; i++) {
        totalWork += Math.abs(pathPoints[i].V - pathPoints[i - 1].V);
      }
      const deltaV = pathPoints[pathPoints.length - 1].V - pathPoints[0].V;

      // Path info
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W - 200, H - 70, 188, 58, 6);
      ctx.fill();
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "left";
      ctx.fillText("PATH ANALYSIS", W - 190, H - 54);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Delta V = ${deltaV.toFixed(2)}`, W - 190, H - 38);
      ctx.fillText(`Path integral |dV| = ${totalWork.toFixed(2)}`, W - 190, H - 22);
    }

    // Draw charges
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const cx2 = c.x * W;
      const cy2 = c.y * H;

      const glow = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 30);
      glow.addColorStop(0, c.q > 0 ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)");
      glow.addColorStop(1, c.q > 0 ? "rgba(239,68,68,0)" : "rgba(59,130,246,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 30, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = c.q > 0 ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(cx2, cy2, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.q > 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.q > 0 ? "+" : "-", cx2, cy2 + 1);
      ctx.textBaseline = "alphabetic";

      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`q=${c.q > 0 ? "+" : ""}${c.q}`, cx2, cy2 + 28);
    }

    // Navigate game rendering
    if (gameMode === "navigate") {
      const tc = testChargeRef.current;
      const goal = testChargeGoalRef.current;
      const tcx = tc.x * W;
      const tcy = tc.y * H;
      const gx = goal.x * W;
      const gy = goal.y * H;

      // Draw navigation path
      const navPath = navPathRef.current;
      if (navPath.length > 1) {
        ctx.strokeStyle = "rgba(168,85,247,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(navPath[0].x * W, navPath[0].y * H);
        for (let i = 1; i < navPath.length; i++) {
          ctx.lineTo(navPath[i].x * W, navPath[i].y * H);
        }
        ctx.stroke();

        // Path dots
        for (let i = 0; i < navPath.length; i += 5) {
          ctx.fillStyle = "rgba(168,85,247,0.3)";
          ctx.beginPath();
          ctx.arc(navPath[i].x * W, navPath[i].y * H, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Goal target
      const goalPulse = (timeRef.current * 0.5) % 1;
      drawTarget(ctx, gx, gy, 18, "#22c55e", goalPulse);
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 10px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("GOAL", gx, gy - 25);

      // Test charge
      const tcGlow = ctx.createRadialGradient(tcx, tcy, 0, tcx, tcy, 20);
      tcGlow.addColorStop(0, "rgba(168,85,247,0.5)");
      tcGlow.addColorStop(1, "rgba(168,85,247,0)");
      ctx.fillStyle = tcGlow;
      ctx.beginPath();
      ctx.arc(tcx, tcy, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.arc(tcx, tcy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c4b5fd";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px ui-monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("q", tcx, tcy);
      ctx.textBaseline = "alphabetic";

      // Nav stats
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W - 210, 12, 198, 80, 8);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#a855f7";
      ctx.textAlign = "left";
      ctx.fillText("NAVIGATE CHARGE", W - 198, 28);
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Work done: ${navWorkRef.current.toFixed(2)}`, W - 198, 46);
      ctx.fillText(`Path length: ${navPathRef.current.length}`, W - 198, 62);
      if (navBestWorkRef.current < Infinity) {
        ctx.fillStyle = "#22c55e";
        ctx.fillText(`Best: ${navBestWorkRef.current.toFixed(2)}`, W - 198, 78);
      }

      // Goal check
      if (navCompletedRef.current) {
        ctx.fillStyle = "rgba(34,197,94,0.2)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 24px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText("GOAL REACHED!", W / 2, H / 2 - 15);
        ctx.font = "14px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`Work done: ${navWorkRef.current.toFixed(2)}`, W / 2, H / 2 + 15);
      }

      // Instruction
      if (!isDraggingTestChargeRef.current && !navCompletedRef.current) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Drag the purple test charge to the green goal", W / 2, H - 15);
      }
    } else {
      // Info panel
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(10, 10, 210, 65, 6);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("EQUIPOTENTIAL LINES", 20, 28);
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText("Drag charges to reposition", 20, 45);
      ctx.fillText("Hold Shift + drag to draw path", 20, 60);
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // Challenge scoreboard
    if (challengeRef.current.active) {
      renderScoreboard(ctx, 12, H - 140, 160, 120, challengeRef.current);
    }

    // Score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [charges, showField, contourCount, computeV, gameMode, pathPoints]);

  // Animation loop for navigate mode
  const animate = useCallback(() => {
    timeRef.current += 0.016;
    particlesRef.current.update(0.016);
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
      canvas.height = Math.min(container.clientWidth * 0.55, 500);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (gameMode === "navigate") {
      animRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animRef.current);
    } else {
      draw();
    }
  }, [gameMode, animate, draw]);

  // Mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };

    const onDown = (e: MouseEvent) => {
      const pos = getPos(e);

      if (gameMode === "navigate") {
        // Check if clicking test charge
        const tc = testChargeRef.current;
        const dx = pos.x - tc.x;
        const dy = pos.y - tc.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.03) {
          isDraggingTestChargeRef.current = true;
          navPathRef.current = [{ x: tc.x, y: tc.y }];
          navWorkRef.current = 0;
          navCompletedRef.current = false;
          return;
        }
      }

      // Check if shift is held for path drawing
      if (e.shiftKey && gameMode === "sandbox") {
        isDrawingPathRef.current = true;
        const V = computeVNorm(pos.x, pos.y, charges);
        setPathPoints([{ x: pos.x, y: pos.y, V }]);
        return;
      }

      // Check if clicking existing charge
      for (let i = 0; i < charges.length; i++) {
        const dx = pos.x - charges[i].x;
        const dy = pos.y - charges[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.05) {
          draggingRef.current = i;
          return;
        }
      }
    };

    const onMove = (e: MouseEvent) => {
      const pos = getPos(e);

      if (isDraggingTestChargeRef.current) {
        const prev = testChargeRef.current;
        const prevV = computeVNorm(prev.x, prev.y, charges);
        const newV = computeVNorm(pos.x, pos.y, charges);
        navWorkRef.current += Math.abs(newV - prevV);

        testChargeRef.current = { x: pos.x, y: pos.y };
        navPathRef.current.push({ x: pos.x, y: pos.y });

        // Check if reached goal
        const goal = testChargeGoalRef.current;
        const dx = pos.x - goal.x;
        const dy = pos.y - goal.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.03 && !navCompletedRef.current) {
          navCompletedRef.current = true;
          isDraggingTestChargeRef.current = false;

          // Score based on work efficiency
          if (navWorkRef.current < navBestWorkRef.current) {
            navBestWorkRef.current = navWorkRef.current;
          }

          // Score: lower work = better
          const work = navWorkRef.current;
          let points = 0;
          let label = "";
          if (work < 1.0) {
            points = 3;
            label = "Optimal Path!";
          } else if (work < 2.0) {
            points = 2;
            label = "Efficient!";
          } else if (work < 4.0) {
            points = 1;
            label = "Good Path";
          } else {
            points = 0;
            label = "Too Much Work";
          }

          challengeRef.current = updateChallengeState(challengeRef.current, {
            points,
            tier: points >= 3 ? "perfect" : points >= 2 ? "great" : points >= 1 ? "good" : "miss",
            label,
          });

          popupsRef.current.push({
            text: label,
            points,
            x: canvas.width / 2,
            y: canvas.height / 2,
            startTime: performance.now(),
          });

          if (points > 0) {
            playScore(points);
            particlesRef.current.emitConfetti(
              testChargeGoalRef.current.x * canvas.width,
              testChargeGoalRef.current.y * canvas.height,
              20
            );
          } else {
            playSFX("incorrect");
          }
        }
        return;
      }

      if (isDrawingPathRef.current) {
        const V = computeVNorm(pos.x, pos.y, charges);
        setPathPoints((prev) => [...prev, { x: pos.x, y: pos.y, V }]);
        return;
      }

      if (draggingRef.current === null) return;
      setCharges((prev) => {
        const next = [...prev];
        next[draggingRef.current!] = {
          ...next[draggingRef.current!],
          x: pos.x,
          y: pos.y,
        };
        return next;
      });
    };

    const onUp = () => {
      draggingRef.current = null;
      isDraggingTestChargeRef.current = false;
      isDrawingPathRef.current = false;
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onUp);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onUp);
    };
  }, [charges, gameMode, computeVNorm]);

  const addCharge = (q: number) => {
    setCharges((prev) => [
      ...prev,
      { x: 0.5, y: 0.3 + Math.random() * 0.4, q },
    ]);
    playSFX("drop");
  };

  const removeLastCharge = () => {
    if (charges.length > 1) {
      setCharges((prev) => prev.slice(0, -1));
      playSFX("pop");
    }
  };

  const startNavigateGame = () => {
    setGameMode("navigate");
    // Random start and goal positions
    testChargeRef.current = {
      x: 0.08 + Math.random() * 0.15,
      y: 0.2 + Math.random() * 0.6,
    };
    testChargeGoalRef.current = {
      x: 0.75 + Math.random() * 0.15,
      y: 0.2 + Math.random() * 0.6,
    };
    navPathRef.current = [];
    navWorkRef.current = 0;
    navCompletedRef.current = false;
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Navigate charge to goal",
    };
    playSFX("powerup");
  };

  const resetNavigate = () => {
    testChargeRef.current = {
      x: 0.08 + Math.random() * 0.15,
      y: 0.2 + Math.random() * 0.6,
    };
    testChargeGoalRef.current = {
      x: 0.75 + Math.random() * 0.15,
      y: 0.2 + Math.random() * 0.6,
    };
    navPathRef.current = [];
    navWorkRef.current = 0;
    navCompletedRef.current = false;
  };

  const backToSandbox = () => {
    setGameMode("sandbox");
    challengeRef.current = createChallengeState();
    setPathPoints([]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {gameMode === "sandbox" && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
              <button
                onClick={() => addCharge(1)}
                className="flex-1 h-9 rounded-lg bg-red-600 text-white text-xs font-medium"
              >
                + Charge
              </button>
              <button
                onClick={() => addCharge(-1)}
                className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium"
              >
                - Charge
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
              <button
                onClick={removeLastCharge}
                className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium"
              >
                Remove Last
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Contours
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="range"
                  min={4}
                  max={24}
                  value={contourCount}
                  onChange={(e) => setContourCount(Number(e.target.value))}
                  className="flex-1 accent-purple-500"
                />
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
                  {contourCount}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
              <button
                onClick={() => setShowField(!showField)}
                className={`w-full h-9 rounded-lg text-xs font-medium transition-colors ${
                  showField
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {showField ? "E-field ON" : "E-field OFF"}
              </button>
            </div>
          </>
        )}
        {gameMode === "navigate" && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
              <button
                onClick={resetNavigate}
                className="w-full h-9 rounded-lg bg-purple-600 text-white text-xs font-medium"
              >
                New Route
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
              <button
                onClick={() => addCharge(1)}
                className="flex-1 h-9 rounded-lg bg-red-600 text-white text-xs font-medium"
              >
                + Charge
              </button>
              <button
                onClick={() => addCharge(-1)}
                className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium"
              >
                - Charge
              </button>
            </div>
          </>
        )}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => {
              setCharges([
                { x: 0.35, y: 0.5, q: 1 },
                { x: 0.65, y: 0.5, q: -1 },
              ]);
              setPathPoints([]);
            }}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium"
          >
            Reset Charges
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mode
          </label>
          <div className="flex gap-1.5">
            <button
              onClick={backToSandbox}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                gameMode === "sandbox"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Sandbox
            </button>
            <button
              onClick={startNavigateGame}
              className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                gameMode === "navigate"
                  ? "bg-amber-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Navigate
            </button>
          </div>
        </div>
      </div>
      {gameMode === "sandbox" && pathPoints.length > 0 && (
        <div className="rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1">
                Path Analysis
              </h3>
              <p className="text-xs text-green-700 dark:text-green-400">
                Path drawn with {pathPoints.length} points. Delta V ={" "}
                {pathPoints.length >= 2
                  ? (
                      pathPoints[pathPoints.length - 1].V - pathPoints[0].V
                    ).toFixed(2)
                  : "---"}
              </p>
            </div>
            <button
              onClick={() => setPathPoints([])}
              className="h-8 px-4 rounded-lg border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 text-xs font-medium"
            >
              Clear Path
            </button>
          </div>
        </div>
      )}
      {gameMode === "navigate" && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Navigate Charge Challenge
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Drag the purple test charge from start to the green goal. Try to minimize the
            work done by following equipotential lines (paths of constant voltage).
            You can add/remove charges to reshape the field!
          </p>
          <div className="mt-2 flex gap-4 text-xs font-mono text-amber-700 dark:text-amber-400">
            <span>Score: {challengeRef.current.score}</span>
            <span>Attempts: {challengeRef.current.attempts}</span>
            <span>Work: {navWorkRef.current.toFixed(2)}</span>
            {navBestWorkRef.current < Infinity && (
              <span>Best: {navBestWorkRef.current.toFixed(2)}</span>
            )}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="V = \frac{kq}{r}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="E = -\frac{dV}{dr}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="W = q\Delta V" />
          </div>
        </div>
      </div>
    </div>
  );
}
