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
import { drawTarget } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

interface Charge {
  x: number;
  y: number;
  q: number;
  id: number;
}

interface TestCharge {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: { x: number; y: number }[];
  active: boolean;
}

export default function ElectricField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [charges, setCharges] = useState<Charge[]>([
    { x: 0.35, y: 0.5, q: 1, id: 1 },
    { x: 0.65, y: 0.5, q: -1, id: 2 },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [chargeType, setChargeType] = useState<number>(1);
  const [showFieldLines, setShowFieldLines] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mode, setMode] = useState<"place" | "testCharge" | "equilibrium">("place");
  const nextId = useRef(3);
  const testChargeRef = useRef<TestCharge>({ x: 0, y: 0, vx: 0, vy: 0, trail: [], active: false });
  const particleSystemRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const equilibriumTargetRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const chargesRef = useRef(charges);
  const timeRef = useRef(0);
  const heatmapCacheRef = useRef<ImageData | null>(null);
  const heatmapDirtyRef = useRef(true);

  // Keep chargesRef in sync
  useEffect(() => {
    chargesRef.current = charges;
    heatmapDirtyRef.current = true;
  }, [charges]);

  const getField = useCallback(
    (px: number, py: number, chargeList: Charge[], W: number, H: number) => {
      let Ex = 0,
        Ey = 0;
      const k = 800;
      for (const c of chargeList) {
        const cx = c.x * W;
        const cy = c.y * H;
        const dx = px - cx;
        const dy = py - cy;
        const r2 = dx * dx + dy * dy;
        if (r2 < 100) continue;
        const r = Math.sqrt(r2);
        const E = (k * c.q) / r2;
        Ex += (E * dx) / r;
        Ey += (E * dy) / r;
      }
      return { Ex, Ey };
    },
    []
  );

  const generateEquilibriumTarget = useCallback(() => {
    // Place target somewhere near middle, avoiding edges
    equilibriumTargetRef.current = {
      x: 0.25 + Math.random() * 0.5,
      y: 0.25 + Math.random() * 0.5,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const now = performance.now();

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Heatmap (field strength as background color intensity)
    if (showHeatmap && charges.length > 0) {
      if (heatmapDirtyRef.current || !heatmapCacheRef.current ||
          heatmapCacheRef.current.width !== W || heatmapCacheRef.current.height !== H) {
        const imageData = ctx.createImageData(W, H);
        const data = imageData.data;
        const step = 4; // sample every 4 pixels for performance
        for (let py = 0; py < H; py += step) {
          for (let px = 0; px < W; px += step) {
            const { Ex, Ey } = getField(px, py, charges, W, H);
            const mag = Math.sqrt(Ex * Ex + Ey * Ey);
            const intensity = Math.min(mag / 8, 1);

            // Color gradient: dark blue -> cyan -> yellow -> red
            let r = 0, g = 0, b = 0;
            if (intensity < 0.25) {
              const t = intensity / 0.25;
              r = Math.round(15 + t * 10);
              g = Math.round(23 + t * 40);
              b = Math.round(42 + t * 80);
            } else if (intensity < 0.5) {
              const t = (intensity - 0.25) / 0.25;
              r = Math.round(25 + t * 30);
              g = Math.round(63 + t * 100);
              b = Math.round(122 + t * 60);
            } else if (intensity < 0.75) {
              const t = (intensity - 0.5) / 0.25;
              r = Math.round(55 + t * 150);
              g = Math.round(163 + t * 60);
              b = Math.round(182 - t * 100);
            } else {
              const t = (intensity - 0.75) / 0.25;
              r = Math.round(205 + t * 50);
              g = Math.round(223 - t * 100);
              b = Math.round(82 - t * 70);
            }

            // Fill the step x step block
            for (let dy = 0; dy < step && py + dy < H; dy++) {
              for (let dx = 0; dx < step && px + dx < W; dx++) {
                const idx = ((py + dy) * W + (px + dx)) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 120; // semi-transparent overlay
              }
            }
          }
        }
        heatmapCacheRef.current = imageData;
        heatmapDirtyRef.current = false;
      }
      ctx.putImageData(heatmapCacheRef.current, 0, 0);

      // Redraw dark background underneath so it blends
      ctx.fillStyle = "rgba(15, 23, 42, 0.3)";
      ctx.fillRect(0, 0, W, H);
    }

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Field lines
    if (showFieldLines) {
      const positiveCharges = charges.filter((c) => c.q > 0);
      const linesPerCharge = 16;

      for (const charge of positiveCharges) {
        for (let i = 0; i < linesPerCharge; i++) {
          const angle = (i / linesPerCharge) * Math.PI * 2;
          let lx = charge.x * W + Math.cos(angle) * 15;
          let ly = charge.y * H + Math.sin(angle) * 15;

          ctx.strokeStyle = "rgba(251,191,36,0.25)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(lx, ly);

          for (let step = 0; step < 200; step++) {
            const { Ex, Ey } = getField(lx, ly, charges, W, H);
            const mag = Math.sqrt(Ex * Ex + Ey * Ey);
            if (mag < 0.01) break;

            const stepSize = 4;
            lx += (Ex / mag) * stepSize;
            ly += (Ey / mag) * stepSize;

            if (lx < 0 || lx > W || ly < 0 || ly > H) break;

            let hitNeg = false;
            for (const c of charges) {
              if (c.q < 0) {
                const dx = lx - c.x * W;
                const dy = ly - c.y * H;
                if (dx * dx + dy * dy < 200) {
                  hitNeg = true;
                  break;
                }
              }
            }

            ctx.lineTo(lx, ly);
            if (hitNeg) break;
          }
          ctx.stroke();
        }
      }

      // For negative-only charges, draw lines going inward
      if (positiveCharges.length === 0) {
        for (const charge of charges) {
          for (let i = 0; i < linesPerCharge; i++) {
            const angle = (i / linesPerCharge) * Math.PI * 2;
            let lx = charge.x * W + Math.cos(angle) * 200;
            let ly = charge.y * H + Math.sin(angle) * 200;

            ctx.strokeStyle = "rgba(251,191,36,0.25)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(lx, ly);

            for (let step = 0; step < 200; step++) {
              const { Ex, Ey } = getField(lx, ly, charges, W, H);
              const mag = Math.sqrt(Ex * Ex + Ey * Ey);
              if (mag < 0.01) break;

              const stepSize = 4;
              lx += (Ex / mag) * stepSize;
              ly += (Ey / mag) * stepSize;

              if (lx < 0 || lx > W || ly < 0 || ly > H) break;

              const dx = lx - charge.x * W;
              const dy = ly - charge.y * H;
              if (dx * dx + dy * dy < 200) break;

              ctx.lineTo(lx, ly);
            }
            ctx.stroke();
          }
        }
      }
    }

    // Field vectors
    if (showVectors) {
      const spacing = 40;
      for (let x = spacing; x < W; x += spacing) {
        for (let y = spacing; y < H; y += spacing) {
          const { Ex, Ey } = getField(x, y, charges, W, H);
          const mag = Math.sqrt(Ex * Ex + Ey * Ey);
          if (mag < 0.1) continue;

          const maxLen = 45;
          const len = Math.min(mag * 20, maxLen);
          const nx = Ex / mag;
          const ny = Ey / mag;

          const intensity = Math.min(mag / 3, 1);
          ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 + intensity * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - (nx * len) / 2, y - (ny * len) / 2);
          ctx.lineTo(x + (nx * len) / 2, y + (ny * len) / 2);
          ctx.stroke();

          const tipX = x + (nx * len) / 2;
          const tipY = y + (ny * len) / 2;
          ctx.fillStyle = `rgba(100, 200, 255, ${0.3 + intensity * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - nx * 9 - ny * 4.5, tipY - ny * 9 + nx * 4.5);
          ctx.lineTo(tipX - nx * 9 + ny * 4.5, tipY - ny * 9 - nx * 4.5);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Equilibrium target
    if (mode === "equilibrium" && challengeRef.current.active) {
      const tx = equilibriumTargetRef.current.x * W;
      const ty = equilibriumTargetRef.current.y * H;
      const pulse = (now % 2000) / 2000;
      drawTarget(ctx, tx, ty, 20, "#f59e0b", pulse);

      // Label
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("Zero field here!", tx, ty - 30);

      // Show field magnitude at target
      const { Ex, Ey } = getField(tx, ty, charges, W, H);
      const fieldMag = Math.sqrt(Ex * Ex + Ey * Ey);
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = fieldMag < 0.5 ? "#22c55e" : fieldMag < 2 ? "#f59e0b" : "#ef4444";
      ctx.fillText(`|E| = ${fieldMag.toFixed(2)}`, tx, ty + 35);
    }

    // Draw charges
    for (const charge of charges) {
      const cx = charge.x * W;
      const cy = charge.y * H;

      // Glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
      if (charge.q > 0) {
        glow.addColorStop(0, "rgba(239, 68, 68, 0.4)");
        glow.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        glow.addColorStop(0, "rgba(59, 130, 246, 0.4)");
        glow.addColorStop(1, "rgba(59, 130, 246, 0)");
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fill();

      // Charge circle
      ctx.fillStyle = charge.q > 0 ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = charge.q > 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Symbol
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(charge.q > 0 ? "+" : "\u2212", cx, cy + 1);
    }

    // Test charge trail
    const tc = testChargeRef.current;
    if (tc.active && tc.trail.length > 1) {
      for (let i = 1; i < tc.trail.length; i++) {
        const alpha = (i / tc.trail.length) * 0.8;
        const width = (i / tc.trail.length) * 3;
        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(tc.trail[i - 1].x * W, tc.trail[i - 1].y * H);
        ctx.lineTo(tc.trail[i].x * W, tc.trail[i].y * H);
        ctx.stroke();
      }
    }

    // Test charge body
    if (tc.active) {
      const tcx = tc.x * W;
      const tcy = tc.y * H;

      // Glow
      const tcGlow = ctx.createRadialGradient(tcx, tcy, 0, tcx, tcy, 20);
      tcGlow.addColorStop(0, "rgba(34, 197, 94, 0.5)");
      tcGlow.addColorStop(1, "rgba(34, 197, 94, 0)");
      ctx.fillStyle = tcGlow;
      ctx.beginPath();
      ctx.arc(tcx, tcy, 20, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(tcx, tcy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#86efac";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Velocity arrow
      const speed = Math.sqrt(tc.vx * tc.vx + tc.vy * tc.vy);
      if (speed > 0.001) {
        const arrowLen = Math.min(speed * 30, 40);
        const nvx = tc.vx / speed;
        const nvy = tc.vy / speed;
        ctx.strokeStyle = "rgba(134, 239, 172, 0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tcx, tcy);
        ctx.lineTo(tcx + nvx * arrowLen, tcy + nvy * arrowLen);
        ctx.stroke();
      }
    }

    // Draw particle system
    particleSystemRef.current.draw(ctx);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Scoreboard for equilibrium mode
    if (mode === "equilibrium" && challengeRef.current.active) {
      renderScoreboard(ctx, W - 160, H - 130, 150, 120, challengeRef.current);
    }

    // Field info at mouse for test charge mode
    if (mode === "testCharge" && !tc.active) {
      ctx.font = "12px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Click to place test charge (+)", 15, 15);
    } else if (mode === "equilibrium") {
      ctx.font = "12px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Place charges to make E=0 at the target", 15, 15);
    } else {
      ctx.font = "12px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Click to add charges \u2022 Drag to move", 15, 15);
    }

    // Field magnitude at mouse tooltip (in test charge mode when hovering)
    ctx.textBaseline = "alphabetic";
  }, [charges, showFieldLines, showVectors, showHeatmap, getField, mode]);

  // Animation loop for test charge
  const animate = useCallback(() => {
    const tc = testChargeRef.current;
    const dt = 0.016;
    timeRef.current += dt;

    if (tc.active) {
      const canvas = canvasRef.current;
      if (canvas) {
        const W = canvas.width;
        const H = canvas.height;
        const px = tc.x * W;
        const py = tc.y * H;
        const { Ex, Ey } = getField(px, py, chargesRef.current, W, H);

        // F = qE, a = F/m (unit test charge so a = E * scale)
        const accelScale = 0.00003;
        tc.vx += Ex * accelScale;
        tc.vy += Ey * accelScale;

        // Apply slight damping so it doesn't fly off forever
        tc.vx *= 0.999;
        tc.vy *= 0.999;

        tc.x += tc.vx;
        tc.y += tc.vy;

        // Trail
        tc.trail.push({ x: tc.x, y: tc.y });
        if (tc.trail.length > 500) tc.trail.shift();

        // Emit trail particles occasionally
        if (Math.random() < 0.3) {
          particleSystemRef.current.emitTrail(px, py, Math.atan2(tc.vy, tc.vx), "#22c55e");
        }

        // Out of bounds? Deactivate
        if (tc.x < -0.1 || tc.x > 1.1 || tc.y < -0.1 || tc.y > 1.1) {
          tc.active = false;
          tc.trail = [];
        }

        // Hit a source charge? Spark + deactivate
        for (const c of chargesRef.current) {
          const cdx = tc.x - c.x;
          const cdy = tc.y - c.y;
          if (Math.sqrt(cdx * cdx + cdy * cdy) < 0.03) {
            particleSystemRef.current.emitSparks(c.x * W, c.y * H, 15, c.q > 0 ? "#ef4444" : "#3b82f6");
            playSFX("collision");
            tc.active = false;
            tc.trail = [];
            break;
          }
        }
      }
    }

    particleSystemRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, getField]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 500);
      heatmapDirtyRef.current = true;
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

  const checkEquilibrium = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const tx = equilibriumTargetRef.current.x * W;
    const ty = equilibriumTargetRef.current.y * H;
    const { Ex, Ey } = getField(tx, ty, chargesRef.current, W, H);
    const fieldMag = Math.sqrt(Ex * Ex + Ey * Ey);

    // Score based on how close to zero
    const result = calculateAccuracy(0, fieldMag, 5);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    popupsRef.current.push({
      text: result.label,
      points: result.points,
      x: tx,
      y: ty,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (result.tier === "perfect") {
        particleSystemRef.current.emitConfetti(tx, ty, 20);
      } else {
        particleSystemRef.current.emitGlow(tx, ty, 8, "#22c55e");
      }
      // Generate new target after success
      setTimeout(() => generateEquilibriumTarget(), 1500);
    } else {
      playSFX("incorrect");
    }
  }, [getField, generateEquilibriumTarget]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;

    if (mode === "testCharge") {
      // Place test charge
      const tc = testChargeRef.current;
      tc.x = mx;
      tc.y = my;
      tc.vx = 0;
      tc.vy = 0;
      tc.trail = [{ x: mx, y: my }];
      tc.active = true;
      playSFX("pop");
      return;
    }

    // Check if clicking on existing charge
    for (const charge of charges) {
      const dx = mx - charge.x;
      const dy = my - charge.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.04) {
        setDragging(charge.id);
        return;
      }
    }

    // Add new charge
    const newCharge: Charge = {
      x: mx,
      y: my,
      q: chargeType,
      id: nextId.current++,
    };
    setCharges((prev) => [...prev, newCharge]);
    playSFX("click");
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setCharges((prev) =>
      prev.map((c) => (c.id === dragging ? { ...c, x: mx, y: my } : c))
    );
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Interaction Mode
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setMode("place");
              testChargeRef.current.active = false;
              testChargeRef.current.trail = [];
              challengeRef.current = { ...challengeRef.current, active: false };
            }}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              mode === "place"
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Place Charges
          </button>
          <button
            onClick={() => {
              setMode("testCharge");
              testChargeRef.current.active = false;
              testChargeRef.current.trail = [];
              challengeRef.current = { ...challengeRef.current, active: false };
            }}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              mode === "testCharge"
                ? "bg-green-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Test Charge
          </button>
          <button
            onClick={() => {
              setMode("equilibrium");
              testChargeRef.current.active = false;
              testChargeRef.current.trail = [];
              challengeRef.current = { ...createChallengeState(), active: true, description: "Find the equilibrium" };
              generateEquilibriumTarget();
              // Start with just one positive charge
              setCharges([{ x: 0.3, y: 0.5, q: 1, id: nextId.current++ }]);
            }}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
              mode === "equilibrium"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Equilibrium Challenge
          </button>
        </div>
      </div>

      {/* Equilibrium check button */}
      {mode === "equilibrium" && challengeRef.current.active && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Place charges to create E = 0 at the target
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Score: {challengeRef.current.score} pts | Attempts: {challengeRef.current.attempts} | Streak: {challengeRef.current.streak}
              </p>
            </div>
            <button
              onClick={checkEquilibrium}
              className="px-6 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Check Equilibrium
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {mode === "place" && (
          <>
            <button
              onClick={() => setChargeType(1)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                chargeType === 1
                  ? "bg-red-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              + Positive
            </button>
            <button
              onClick={() => setChargeType(-1)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                chargeType === -1
                  ? "bg-blue-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              &minus; Negative
            </button>
            <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
          </>
        )}

        {mode === "equilibrium" && (
          <>
            <button
              onClick={() => setChargeType(1)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                chargeType === 1
                  ? "bg-red-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              + Positive
            </button>
            <button
              onClick={() => setChargeType(-1)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                chargeType === -1
                  ? "bg-blue-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              &minus; Negative
            </button>
            <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
          </>
        )}

        <button
          onClick={() => setShowFieldLines(!showFieldLines)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showFieldLines
              ? "bg-amber-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Field Lines
        </button>
        <button
          onClick={() => setShowVectors(!showVectors)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showVectors
              ? "bg-cyan-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Vectors
        </button>
        <button
          onClick={() => {
            setShowHeatmap(!showHeatmap);
            heatmapDirtyRef.current = true;
          }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showHeatmap
              ? "bg-emerald-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Heatmap
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        <button
          onClick={() => {
            setCharges([]);
            nextId.current = 1;
            testChargeRef.current.active = false;
            testChargeRef.current.trail = [];
          }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={() => {
            setCharges([
              { x: 0.35, y: 0.5, q: 1, id: nextId.current++ },
              { x: 0.65, y: 0.5, q: -1, id: nextId.current++ },
            ]);
            testChargeRef.current.active = false;
            testChargeRef.current.trail = [];
          }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Dipole
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\vec{E} = k\frac{q}{r^2}\hat{r}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\vec{F} = q\vec{E}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="k = 8.99 \times 10^9 \text{ N·m}^2/\text{C}^2" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Click to add charges. Drag to move them. Toggle field lines and vectors to visualize the electric field!</p>
    </div>
  );
}
