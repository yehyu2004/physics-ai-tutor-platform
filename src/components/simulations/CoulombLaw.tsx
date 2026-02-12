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
import { drawArrow, drawInfoPanel } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

// Coulomb constant in visual units (scaled for canvas)
const K_VISUAL = 5000;
// Coulomb constant in SI (for display)
const K_SI = 8.99e9;
// Pixels-per-meter scaling for display purposes
const SCALE_M = 100; // 100 px = 1 m (arbitrary but consistent)

interface Charge {
  id: number;
  x: number; // canvas px
  y: number; // canvas px
  q: number; // in multiples of 1 uC (visual sign: +1 or -1, magnitude via slider)
  magnitude: number; // |q| in uC, 1-10
}

interface ForcePair {
  i: number;
  j: number;
  fx: number; // force x on charge i from charge j
  fy: number;
  mag: number;
  dist: number; // distance in canvas px
}

type GameMode = "sandbox" | "challenge";

export default function CoulombLaw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nextId = useRef(3);

  const [charges, setCharges] = useState<Charge[]>([
    { id: 1, x: 250, y: 220, q: 1, magnitude: 3 },
    { id: 2, x: 550, y: 220, q: -1, magnitude: 3 },
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForceVectors, setShowForceVectors] = useState(true);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [chargeSign, setChargeSign] = useState<number>(1);
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");

  // Challenge state
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [challengeCharges, setChallengeCharges] = useState<{ q1: number; q2: number; dist: number }>({
    q1: 3,
    q2: 5,
    dist: 200,
  });
  const [userPrediction, setUserPrediction] = useState("");
  const [predictionSubmitted, setPredictionSubmitted] = useState(false);
  const [actualForce, setActualForce] = useState(0);

  const chargesRef = useRef(charges);
  const selectedRef = useRef(selectedId);
  const showForceRef = useRef(showForceVectors);
  const showDistRef = useRef(showDistanceLines);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const timeRef = useRef(0);
  const draggingIdRef = useRef<number | null>(null);

  useEffect(() => {
    chargesRef.current = charges;
  }, [charges]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    showForceRef.current = showForceVectors;
  }, [showForceVectors]);
  useEffect(() => {
    showDistRef.current = showDistanceLines;
  }, [showDistanceLines]);

  /** Compute all pairwise Coulomb forces */
  const computeForces = useCallback((chargeList: Charge[]): ForcePair[] => {
    const pairs: ForcePair[] = [];
    for (let i = 0; i < chargeList.length; i++) {
      for (let j = i + 1; j < chargeList.length; j++) {
        const ci = chargeList[i];
        const cj = chargeList[j];
        const dx = cj.x - ci.x;
        const dy = cj.y - ci.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) continue;

        // F = k * |q1| * |q2| / r^2, direction: repel if same sign, attract if opposite
        const qProduct = ci.q * ci.magnitude * cj.q * cj.magnitude;
        const forceMag = (K_VISUAL * Math.abs(qProduct)) / (dist * dist);

        // Unit vector from i to j
        const nx = dx / dist;
        const ny = dy / dist;

        // If qProduct > 0 (same sign), force on i is away from j (repulsion) => -nx
        // If qProduct < 0 (opposite sign), force on i is toward j (attraction) => +nx
        const sign = qProduct > 0 ? -1 : 1;
        const fx = sign * nx * forceMag;
        const fy = sign * ny * forceMag;

        pairs.push({ i, j, fx, fy, mag: forceMag, dist });
      }
    }
    return pairs;
  }, []);

  /** Convert canvas distance to display meters */
  const pxToM = (px: number) => px / SCALE_M;

  /** Compute SI force magnitude between two charges */
  const computeSIForce = (q1_uC: number, q2_uC: number, dist_px: number) => {
    const q1 = q1_uC * 1e-6; // convert uC to C
    const q2 = q2_uC * 1e-6;
    const r = dist_px / SCALE_M; // convert px to m
    if (r < 0.01) return 0;
    return (K_SI * Math.abs(q1 * q2)) / (r * r);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const now = performance.now();
    const currentCharges = chargesRef.current;
    const currentSelected = selectedRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

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

    // Scale bar
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W - 130, H - 25);
    ctx.lineTo(W - 30, H - 25);
    ctx.stroke();
    // Tick marks
    ctx.beginPath();
    ctx.moveTo(W - 130, H - 30);
    ctx.lineTo(W - 130, H - 20);
    ctx.moveTo(W - 30, H - 30);
    ctx.lineTo(W - 30, H - 20);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("1 m", W - 80, H - 12);

    const pairs = computeForces(currentCharges);

    // Distance lines between all pairs
    if (showDistRef.current) {
      for (const pair of pairs) {
        const ci = currentCharges[pair.i];
        const cj = currentCharges[pair.j];

        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ci.x, ci.y);
        ctx.lineTo(cj.x, cj.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Distance label at midpoint
        const mx = (ci.x + cj.x) / 2;
        const my = (ci.y + cj.y) / 2;
        const distM = pxToM(pair.dist);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${distM.toFixed(2)} m`, mx, my - 8);
      }
    }

    // Force vectors on each charge (net force from all others)
    if (showForceRef.current && currentCharges.length >= 2) {
      // Compute net force on each charge
      const netForces: { fx: number; fy: number }[] = currentCharges.map(() => ({
        fx: 0,
        fy: 0,
      }));

      for (const pair of pairs) {
        // Force on charge i
        netForces[pair.i].fx += pair.fx;
        netForces[pair.i].fy += pair.fy;
        // Force on charge j (Newton's 3rd law: opposite)
        netForces[pair.j].fx -= pair.fx;
        netForces[pair.j].fy -= pair.fy;
      }

      for (let k = 0; k < currentCharges.length; k++) {
        const c = currentCharges[k];
        const { fx, fy } = netForces[k];
        const fMag = Math.sqrt(fx * fx + fy * fy);
        if (fMag < 0.1) continue;

        // Scale arrow length: cap at maxLen, min at minLen
        const maxLen = 120;
        const minLen = 20;
        const arrowScale = 0.8;
        const len = Math.min(maxLen, Math.max(minLen, fMag * arrowScale));
        const nx = fx / fMag;
        const ny = fy / fMag;

        // Arrow glow
        ctx.shadowColor = "rgba(251,191,36,0.4)";
        ctx.shadowBlur = 8;

        drawArrow(ctx, c.x, c.y, nx * len, ny * len, "#f59e0b", {
          lineWidth: 2.5,
          headSize: 10,
          ...(gameMode !== "challenge" && {
            label: `${computeSIForce(
              c.magnitude,
              // Find the dominant interaction for labeling; for net force, label with total magnitude
              currentCharges.length === 2
                ? currentCharges.find((o) => o.id !== c.id)!.magnitude
                : 1,
              currentCharges.length === 2
                ? pairs[0]?.dist ?? 100
                : 100
            ).toExponential(1)} N`,
          }),
        });

        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }

      // For exactly 2 charges, draw individual pair force labels more precisely
      if (currentCharges.length === 2 && pairs.length === 1) {
        const p = pairs[0];
        const ci = currentCharges[p.i];
        const cj = currentCharges[p.j];
        const fSI = computeSIForce(ci.magnitude, cj.magnitude, p.dist);

        // Net force arrows already drawn above; redraw with proper SI label
        // Clear and re-render force arrows with correct labels
        const fMag = p.mag;
        if (fMag > 0.1) {
          const dx = cj.x - ci.x;
          const dy = cj.y - ci.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0) {
            const nx = dx / d;
            const ny = dy / d;
            const sign = ci.q * cj.q > 0 ? -1 : 1;
            const len = Math.min(120, Math.max(20, fMag * 0.8));

            // Arrow on charge i
            ctx.shadowColor = "rgba(251,191,36,0.3)";
            ctx.shadowBlur = 6;
            drawArrow(ctx, ci.x, ci.y, sign * nx * len, sign * ny * len, "#fbbf24", {
              lineWidth: 2.5,
              headSize: 10,
            });

            // Arrow on charge j (opposite direction by Newton's 3rd law)
            drawArrow(ctx, cj.x, cj.y, -sign * nx * len, -sign * ny * len, "#fbbf24", {
              lineWidth: 2.5,
              headSize: 10,
            });
            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";

            // Force label at midpoint (hidden in challenge mode to avoid answer leak)
            if (gameMode !== "challenge") {
              ctx.fillStyle = "#fbbf24";
              ctx.font = "bold 11px ui-monospace, monospace";
              ctx.textAlign = "center";
              const midX = (ci.x + cj.x) / 2;
              const midY = (ci.y + cj.y) / 2;
              const forceLabel =
                fSI >= 0.01
                  ? `F = ${fSI.toFixed(2)} N`
                  : `F = ${fSI.toExponential(2)} N`;
              ctx.fillText(forceLabel, midX, midY + 18);

              // Direction label
              ctx.fillStyle = "rgba(251,191,36,0.6)";
              ctx.font = "10px ui-monospace, monospace";
              ctx.fillText(
                ci.q * cj.q > 0 ? "Repulsive" : "Attractive",
                midX,
                midY + 32
              );
            }
          }
        }
      }
    }

    // Draw charges
    for (const charge of currentCharges) {
      const isSelected = charge.id === currentSelected;

      // Glow
      const glow = ctx.createRadialGradient(
        charge.x,
        charge.y,
        0,
        charge.x,
        charge.y,
        35 + charge.magnitude * 2
      );
      if (charge.q > 0) {
        glow.addColorStop(0, `rgba(239, 68, 68, ${0.3 + charge.magnitude * 0.03})`);
        glow.addColorStop(1, "rgba(239, 68, 68, 0)");
      } else {
        glow.addColorStop(0, `rgba(59, 130, 246, ${0.3 + charge.magnitude * 0.03})`);
        glow.addColorStop(1, "rgba(59, 130, 246, 0)");
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(charge.x, charge.y, 35 + charge.magnitude * 2, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(charge.x, charge.y, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Charge body
      const radius = 14 + charge.magnitude * 0.8;
      ctx.fillStyle = charge.q > 0 ? "#ef4444" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(charge.x, charge.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = charge.q > 0 ? "#fca5a5" : "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Sign symbol
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${14 + charge.magnitude * 0.5}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(charge.q > 0 ? "+" : "\u2212", charge.x, charge.y + 1);

      // Charge magnitude label
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.fillText(
        `${charge.q > 0 ? "+" : "\u2212"}${charge.magnitude} \u00B5C`,
        charge.x,
        charge.y + radius + 14
      );
    }

    // Data panel for selected pair or general info
    if (currentCharges.length >= 2) {
      const c0 = currentCharges[0];
      const c1 = currentCharges[1];
      const dx = c1.x - c0.x;
      const dy = c1.y - c0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distM = pxToM(dist);
      const fSI = computeSIForce(c0.magnitude, c1.magnitude, dist);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      drawInfoPanel(ctx, 12, 12, 200, 120, "COULOMB FORCE DATA", [
        { label: "q\u2081", value: `${c0.q > 0 ? "+" : "\u2212"}${c0.magnitude} \u00B5C`, color: c0.q > 0 ? "#ef4444" : "#3b82f6" },
        { label: "q\u2082", value: `${c1.q > 0 ? "+" : "\u2212"}${c1.magnitude} \u00B5C`, color: c1.q > 0 ? "#ef4444" : "#3b82f6" },
        { label: "Distance", value: `${distM.toFixed(2)} m`, color: "#94a3b8" },
        {
          label: "|F|",
          value: gameMode === "challenge" ? "???" : (fSI >= 0.01 ? `${fSI.toFixed(3)} N` : `${fSI.toExponential(2)} N`),
          color: "#fbbf24",
        },
        { label: "Direction", value: `${angle.toFixed(1)}\u00B0`, color: "#94a3b8" },
        { label: "Type", value: gameMode === "challenge" ? "???" : (c0.q * c1.q > 0 ? "Repulsive" : "Attractive"), color: gameMode === "challenge" ? "#94a3b8" : (c0.q * c1.q > 0 ? "#ef4444" : "#22c55e") },
      ]);
    }

    // Instruction hint
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (gameMode === "sandbox") {
      ctx.fillText("Click to add charges \u2022 Drag to move \u2022 Click charge to select", 12, H - 22);
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Scoreboard for challenge mode
    if (challengeState.active) {
      renderScoreboard(ctx, W - 170, 12, 158, 120, challengeState);
    }

    ctx.textBaseline = "alphabetic";
  }, [computeForces, challengeState, gameMode]);

  // Animation loop
  const animate = useCallback(() => {
    const dt = 0.016;
    timeRef.current += dt;
    particlesRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 500);

      // Re-position default charges if they are off-screen
      setCharges((prev) =>
        prev.map((c) => ({
          ...c,
          x: Math.min(c.x, canvas.width - 30),
          y: Math.min(c.y, canvas.height - 30),
        }))
      );

      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Animation frame
  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // Drag handler with createDragHandler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        // Check if clicking on an existing charge
        for (const charge of chargesRef.current) {
          const dx = x - charge.x;
          const dy = y - charge.y;
          const r = 14 + charge.magnitude * 0.8;
          if (dx * dx + dy * dy < (r + 8) * (r + 8)) {
            draggingIdRef.current = charge.id;
            setSelectedId(charge.id);
            return true;
          }
        }
        return false;
      },
      onDrag: (x, y) => {
        if (draggingIdRef.current === null) return;
        setCharges((prev) =>
          prev.map((c) =>
            c.id === draggingIdRef.current
              ? {
                  ...c,
                  x: Math.max(20, Math.min(canvas.width - 20, x)),
                  y: Math.max(20, Math.min(canvas.height - 20, y)),
                }
              : c
          )
        );
      },
      onDragEnd: () => {
        draggingIdRef.current = null;
      },
      onClick: (x, y) => {
        // Check if clicking on existing charge (select it)
        for (const charge of chargesRef.current) {
          const dx = x - charge.x;
          const dy = y - charge.y;
          const r = 14 + charge.magnitude * 0.8;
          if (dx * dx + dy * dy < (r + 8) * (r + 8)) {
            setSelectedId(charge.id);
            playSFX("click");
            return;
          }
        }

        // Add new charge at click position (sandbox mode only)
        if (gameMode === "sandbox") {
          const newCharge: Charge = {
            id: nextId.current++,
            x,
            y,
            q: chargeSign,
            magnitude: 3,
          };
          setCharges((prev) => [...prev, newCharge]);
          setSelectedId(newCharge.id);
          playSFX("pop");
          particlesRef.current.emitGlow(
            x,
            y,
            6,
            chargeSign > 0 ? "#ef4444" : "#3b82f6"
          );
        }
      },
    });

    return cleanup;
  }, [chargeSign, gameMode]);

  // Challenge generation
  const generateChallenge = useCallback(() => {
    const q1 = Math.round(1 + Math.random() * 9); // 1-10 uC
    const q2 = Math.round(1 + Math.random() * 9);
    const distPx = 100 + Math.round(Math.random() * 400); // 100-500 px
    const force = computeSIForce(q1, q2, distPx);

    setChallengeCharges({ q1, q2, dist: distPx });
    setActualForce(force);
    setUserPrediction("");
    setPredictionSubmitted(false);

    // Place the two challenge charges on canvas
    const canvas = canvasRef.current;
    const cW = canvas ? canvas.width : 800;
    const cH = canvas ? canvas.height : 440;
    const cx = cW / 2;
    const cy = cH / 2;
    const halfDist = distPx / 2;

    setCharges([
      { id: nextId.current++, x: cx - halfDist, y: cy, q: 1, magnitude: q1 },
      { id: nextId.current++, x: cx + halfDist, y: cy, q: -1, magnitude: q2 },
    ]);
    setSelectedId(null);
  }, []);

  const handleChallengeSubmit = () => {
    const predicted = parseFloat(userPrediction);
    if (isNaN(predicted) || predicted < 0) return;

    const result = calculateAccuracy(predicted, actualForce, actualForce);
    setChallengeState((prev) => updateChallengeState(prev, result));
    setPredictionSubmitted(true);

    const canvas = canvasRef.current;
    const popX = canvas ? canvas.width / 2 : 400;
    const popY = canvas ? canvas.height / 3 : 150;

    if (result.points >= 2) {
      playSFX("correct");
      playScore(result.points);
      if (canvas) {
        particlesRef.current.emitConfetti(popX, popY, result.points * 8);
      }
    } else if (result.points === 1) {
      playSFX("pop");
    } else {
      playSFX("incorrect");
    }

    popupsRef.current.push({
      text: `${result.label}`,
      points: result.points,
      x: popX,
      y: popY,
      startTime: performance.now(),
    });
  };

  const switchMode = (mode: GameMode) => {
    setGameMode(mode);
    setPredictionSubmitted(false);
    setUserPrediction("");
    particlesRef.current.clear();

    if (mode === "sandbox") {
      setChallengeState(createChallengeState());
      setCharges([
        { id: nextId.current++, x: 250, y: 220, q: 1, magnitude: 3 },
        { id: nextId.current++, x: 550, y: 220, q: -1, magnitude: 3 },
      ]);
      setSelectedId(null);
    } else {
      setChallengeState({ ...createChallengeState(), active: true });
      generateChallenge();
    }
  };

  const selectedCharge = charges.find((c) => c.id === selectedId);

  const removeCharge = (id: number) => {
    setCharges((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleChargeSign = (id: number) => {
    setCharges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, q: c.q * -1 } : c))
    );
    playSFX("click");
  };

  const updateMagnitude = (id: number, mag: number) => {
    setCharges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, magnitude: mag } : c))
    );
  };

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => switchMode("sandbox")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            gameMode === "sandbox"
              ? "bg-orange-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Sandbox
        </button>
        <button
          onClick={() => switchMode("challenge")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            gameMode === "challenge"
              ? "bg-amber-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Predict the Force
        </button>
      </div>

      {/* Sandbox controls */}
      {gameMode === "sandbox" && (
        <>
          {/* Charge placement toolbar */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setChargeSign(1)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                chargeSign === 1
                  ? "bg-red-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              + Positive
            </button>
            <button
              onClick={() => setChargeSign(-1)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                chargeSign === -1
                  ? "bg-blue-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              &minus; Negative
            </button>

            <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

            <button
              onClick={() => setShowForceVectors(!showForceVectors)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                showForceVectors
                  ? "bg-amber-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Force Vectors
            </button>
            <button
              onClick={() => setShowDistanceLines(!showDistanceLines)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                showDistanceLines
                  ? "bg-cyan-500 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              Distance Lines
            </button>

            <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

            <button
              onClick={() => {
                setCharges([]);
                setSelectedId(null);
                nextId.current = 1;
              }}
              className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                const cW = canvas ? canvas.width : 800;
                const cH = canvas ? canvas.height : 440;
                setCharges([
                  { id: nextId.current++, x: cW * 0.35, y: cH * 0.5, q: 1, magnitude: 3 },
                  { id: nextId.current++, x: cW * 0.65, y: cH * 0.5, q: -1, magnitude: 3 },
                ]);
                setSelectedId(null);
              }}
              className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Dipole
            </button>
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                const cW = canvas ? canvas.width : 800;
                const cH = canvas ? canvas.height : 440;
                const cx = cW / 2;
                const cy = cH / 2;
                const r = 120;
                setCharges([
                  { id: nextId.current++, x: cx, y: cy - r, q: 1, magnitude: 5 },
                  { id: nextId.current++, x: cx + r * Math.cos(Math.PI / 6), y: cy + r * Math.sin(Math.PI / 6), q: 1, magnitude: 5 },
                  { id: nextId.current++, x: cx - r * Math.cos(Math.PI / 6), y: cy + r * Math.sin(Math.PI / 6), q: -1, magnitude: 5 },
                ]);
                setSelectedId(null);
              }}
              className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Triangle
            </button>
          </div>

          {/* Selected charge controls */}
          {selectedCharge && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Selected Charge
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleChargeSign(selectedCharge.id)}
                    className={`px-3 h-8 rounded-lg text-xs font-medium transition-colors ${
                      selectedCharge.q > 0
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                    }`}
                  >
                    {selectedCharge.q > 0 ? "+ Positive" : "\u2212 Negative"} (click to flip)
                  </button>
                  <button
                    onClick={() => removeCharge(selectedCharge.id)}
                    className="px-3 h-8 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-xs font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Magnitude (|q|)
                </label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={selectedCharge.magnitude}
                    onChange={(e) =>
                      updateMagnitude(selectedCharge.id, Number(e.target.value))
                    }
                    className="flex-1 accent-orange-500"
                  />
                  <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
                    {selectedCharge.magnitude} {"\u00B5C"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Challenge mode */}
      {gameMode === "challenge" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Predict the Force
            </h3>
            {predictionSubmitted && (
              <button
                onClick={generateChallenge}
                className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                Next Challenge
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
              q{"\u2081"} = +{challengeCharges.q1} {"\u00B5C"}
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
              q{"\u2082"} = {"\u2212"}{challengeCharges.q2} {"\u00B5C"}
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
              r = {(challengeCharges.dist / SCALE_M).toFixed(2)} m
            </div>
          </div>
          {!predictionSubmitted ? (
            <div className="flex gap-2 items-center">
              <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                |F| =
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={userPrediction}
                onChange={(e) => setUserPrediction(e.target.value)}
                placeholder="? N"
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleChallengeSubmit();
                }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">N</span>
              <button
                onClick={handleChallengeSubmit}
                disabled={!userPrediction}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Submit
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-mono">Your answer: {userPrediction} N</span>
                <span className="ml-3 font-mono">
                  Actual:{" "}
                  {actualForce >= 0.01
                    ? `${actualForce.toFixed(3)} N`
                    : `${actualForce.toExponential(2)} N`}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Error:{" "}
                {Math.abs(parseFloat(userPrediction) - actualForce) >= 0.001
                  ? `${Math.abs(parseFloat(userPrediction) - actualForce).toFixed(3)} N`
                  : `${Math.abs(parseFloat(userPrediction) - actualForce).toExponential(2)} N`}{" "}
                ({((Math.abs(parseFloat(userPrediction) - actualForce) / actualForce) * 100).toFixed(1)}%)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Challenge score */}
      {challengeState.active && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Challenge Score
              </span>
              <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">
                {challengeState.score}
              </div>
            </div>
            <div className="text-right text-sm text-amber-600 dark:text-amber-400">
              <div>{challengeState.attempts} attempts</div>
              {challengeState.streak > 0 && (
                <div className="font-bold">Streak: {challengeState.streak}</div>
              )}
              {challengeState.bestStreak > 1 && (
                <div>Best: {challengeState.bestStreak}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Key Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="F = k\frac{q_1 q_2}{r^2}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="k = 8.99 \times 10^9 \text{ N·m}^2/\text{C}^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="\vec{F}_{12} = k\frac{q_1 q_2}{r_{12}^2}\hat{r}_{12}" />
          </div>
        </div>
      </div>
    </div>
  );
}
