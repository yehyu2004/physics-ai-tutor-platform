"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { createDragHandler } from "@/lib/simulation/interaction";
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
import { playSFX, playScore } from "@/lib/simulation/sound";
import { ParticleSystem } from "@/lib/simulation/particles";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type WireConfig = "single" | "parallel" | "antiparallel" | "loop" | "solenoid";

interface Probe {
  x: number;
  y: number;
  Bx: number;
  By: number;
  magnitude: number;
}

export default function BiotSavart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState(10);
  const [wireConfig, setWireConfig] = useState<WireConfig>("single");
  const [showFieldLines, setShowFieldLines] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showRightHandRule, setShowRightHandRule] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [challengeMode, setChallengeMode] = useState(false);
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [challengeProbe, setChallengeProbe] = useState<{ x: number; y: number; actualB: number } | null>(null);
  const [guess, setGuess] = useState("");
  const [showChallengeAnswer, setShowChallengeAnswer] = useState(false);

  const popupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const rhrAnimRef = useRef(0);

  const MU_0_OVER_2PI = 2e-7; // mu_0 / (2*pi) in T·m/A

  // Get wire positions based on configuration
  const getWires = useCallback((cx: number, cy: number) => {
    const wireSpacing = 120;
    const wires: { x: number; y: number; dir: number }[] = [];
    switch (wireConfig) {
      case "single":
        wires.push({ x: cx, y: cy, dir: 1 });
        break;
      case "parallel":
        wires.push({ x: cx - wireSpacing / 2, y: cy, dir: 1 });
        wires.push({ x: cx + wireSpacing / 2, y: cy, dir: 1 });
        break;
      case "antiparallel":
        wires.push({ x: cx - wireSpacing / 2, y: cy, dir: 1 });
        wires.push({ x: cx + wireSpacing / 2, y: cy, dir: -1 });
        break;
      case "loop":
        // Represent a current loop as two wires (cross-section of a loop)
        wires.push({ x: cx - 60, y: cy, dir: 1 });
        wires.push({ x: cx + 60, y: cy, dir: -1 });
        break;
      case "solenoid":
        // Multiple loops
        for (let i = -2; i <= 2; i++) {
          wires.push({ x: cx - 40, y: cy + i * 30, dir: 1 });
          wires.push({ x: cx + 40, y: cy + i * 30, dir: -1 });
        }
        break;
    }
    return wires;
  }, [wireConfig]);

  // Calculate B field at point (px, py)
  const calculateField = useCallback((px: number, py: number, wires: { x: number; y: number; dir: number }[], I: number) => {
    const mu0I = I * 0.2; // scaled for display
    let Bx = 0, By = 0;
    for (const wire of wires) {
      const dx = px - wire.x;
      const dy = py - wire.y;
      const r2 = dx * dx + dy * dy;
      if (r2 < 400) continue;
      const r = Math.sqrt(r2);
      const B = mu0I * wire.dir / r;
      Bx += -B * dy / r;
      By += B * dx / r;
    }
    return { Bx, By, magnitude: Math.sqrt(Bx * Bx + By * By) };
  }, []);

  // Calculate actual physical B field magnitude in Tesla
  const calculatePhysicalB = useCallback((px: number, py: number, wires: { x: number; y: number; dir: number }[], I: number) => {
    // 1 pixel = 1mm = 0.001m for the simulation
    const pixelToMeter = 0.001;
    let Bx = 0, By = 0;
    for (const wire of wires) {
      const dx = (px - wire.x) * pixelToMeter;
      const dy = (py - wire.y) * pixelToMeter;
      const r2 = dx * dx + dy * dy;
      if (r2 < 1e-8) continue;
      const r = Math.sqrt(r2);
      const B = MU_0_OVER_2PI * I * wire.dir / r;
      Bx += -B * dy / r;
      By += B * dx / r;
    }
    return Math.sqrt(Bx * Bx + By * By);
  }, [MU_0_OVER_2PI]);

  const generateChallenge = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W * 0.5;
    const cy = H * 0.5;

    // Place challenge probe at random offset from wire(s)
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 120;
    const probeX = cx + Math.cos(angle) * dist;
    const probeY = cy + Math.sin(angle) * dist;

    const wires = getWires(cx, cy);
    const actualB = calculatePhysicalB(probeX, probeY, wires, current);

    setChallengeProbe({ x: probeX, y: probeY, actualB });
    setGuess("");
    setShowChallengeAnswer(false);
  }, [current, getWires, calculatePhysicalB]);

  const startChallenge = useCallback(() => {
    setChallengeMode(true);
    setChallengeState({ ...createChallengeState(), active: true, description: "Predict B at point P" });
    setProbe(null);
    setTimeout(generateChallenge, 100);
    playSFX("powerup");
  }, [generateChallenge]);

  const stopChallenge = useCallback(() => {
    setChallengeMode(false);
    setChallengeState(createChallengeState());
    setChallengeProbe(null);
    setShowChallengeAnswer(false);
  }, []);

  const submitGuess = useCallback(() => {
    const guessNum = parseFloat(guess);
    if (isNaN(guessNum) || !challengeProbe) return;

    // Compare in microTesla
    const actualMicroT = challengeProbe.actualB * 1e6;
    const result = calculateAccuracy(guessNum, actualMicroT, actualMicroT * 2);
    const newState = updateChallengeState(challengeState, result);
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: challengeProbe.x,
        y: challengeProbe.y - 30,
        startTime: performance.now(),
      });

      if (result.points >= 2) {
        particlesRef.current.emitConfetti(challengeProbe.x, challengeProbe.y, 20);
        playSFX("correct");
        playScore(result.points);
      } else if (result.points === 1) {
        playSFX("success");
      } else {
        playSFX("incorrect");
      }
    }

    setShowChallengeAnswer(true);
    setTimeout(generateChallenge, 2500);
  }, [guess, challengeProbe, challengeState, generateChallenge]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const t = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const cx = W * 0.5;
    const cy = H * 0.5;
    const wires = getWires(cx, cy);

    // Heatmap visualization
    if (showHeatmap) {
      const step = 6;
      for (let x = 0; x < W; x += step) {
        for (let y = 0; y < H; y += step) {
          const field = calculateField(x, y, wires, current);
          const mag = field.magnitude;
          if (mag < 0.01) continue;

          // Map field strength to color (blue -> cyan -> green -> yellow -> red)
          const normalized = Math.min(mag / 3, 1);
          let r = 0, g = 0, b = 0;
          if (normalized < 0.25) {
            b = 0.5 + normalized * 2;
            g = normalized * 2;
          } else if (normalized < 0.5) {
            g = 0.5 + (normalized - 0.25) * 2;
            b = 1 - (normalized - 0.25) * 4;
          } else if (normalized < 0.75) {
            r = (normalized - 0.5) * 4;
            g = 1;
          } else {
            r = 1;
            g = 1 - (normalized - 0.75) * 4;
          }

          ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${0.15 + normalized * 0.3})`;
          ctx.fillRect(x, y, step, step);
        }
      }
    }

    // B field vectors
    const spacing = 25;

    for (let x = spacing; x < W; x += spacing) {
      for (let y = spacing; y < H; y += spacing) {
        const field = calculateField(x, y, wires, current);
        const mag = field.magnitude;
        if (mag < 0.01) continue;

        const maxLen = 12;
        const len = Math.min(mag * 8, maxLen);
        const nx = field.Bx / mag;
        const ny = field.By / mag;

        const intensity = Math.min(mag / 2, 1);
        ctx.strokeStyle = `rgba(59, 200, 246, ${0.1 + intensity * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - nx * len / 2, y - ny * len / 2);
        ctx.lineTo(x + nx * len / 2, y + ny * len / 2);
        ctx.stroke();

        // Arrow tip
        const tipX = x + nx * len / 2;
        const tipY = y + ny * len / 2;
        ctx.fillStyle = `rgba(59, 200, 246, ${0.1 + intensity * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - nx * 3 - ny * 1.5, tipY - ny * 3 + nx * 1.5);
        ctx.lineTo(tipX - nx * 3 + ny * 1.5, tipY - ny * 3 - nx * 1.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Field lines (circles around each wire, or special patterns for loop/solenoid)
    if (showFieldLines) {
      if (wireConfig === "loop") {
        // Draw connecting arc between the two wire endpoints
        ctx.strokeStyle = "rgba(251,191,36,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        // Semi-circular arcs for loop cross-section
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 60, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const wire of wires) {
        for (let r = 30; r < 250; r += 30) {
          ctx.strokeStyle = `rgba(251, 191, 36, ${0.08 + 0.05 * (30 / r)})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.arc(wire.x, wire.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // For solenoid, draw internal uniform field lines
      if (wireConfig === "solenoid") {
        ctx.strokeStyle = "rgba(34, 197, 94, 0.2)";
        ctx.lineWidth = 1.5;
        for (let dy = -50; dy <= 50; dy += 20) {
          ctx.beginPath();
          ctx.moveTo(cx - 35, cy + dy);
          ctx.lineTo(cx + 35, cy + dy);
          ctx.stroke();

          // Arrow in middle
          ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
          ctx.beginPath();
          ctx.moveTo(cx + 5, cy + dy);
          ctx.lineTo(cx - 2, cy + dy - 4);
          ctx.lineTo(cx - 2, cy + dy + 4);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw wires
    for (const wire of wires) {
      // Glow
      const glow = ctx.createRadialGradient(wire.x, wire.y, 0, wire.x, wire.y, 30);
      glow.addColorStop(0, wire.dir > 0 ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(wire.x, wire.y, 30, 0, Math.PI * 2);
      ctx.fill();

      // Wire cross-section
      ctx.fillStyle = "#475569";
      ctx.beginPath();
      ctx.arc(wire.x, wire.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Current direction indicator
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (wire.dir > 0) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(wire.x, wire.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wire.x - 5, wire.y - 5);
        ctx.lineTo(wire.x + 5, wire.y + 5);
        ctx.moveTo(wire.x + 5, wire.y - 5);
        ctx.lineTo(wire.x - 5, wire.y + 5);
        ctx.stroke();
      }
    }

    // Draw solenoid body outline
    if (wireConfig === "solenoid") {
      ctx.strokeStyle = "rgba(100, 116, 139, 0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.roundRect(cx - 50, cy - 80, 100, 160, 8);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("SOLENOID", cx, cy - 88);
    }

    // Draw loop arc
    if (wireConfig === "loop") {
      ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("CURRENT LOOP", cx, cy - 70);
    }

    // Right-hand rule animation
    if (showRightHandRule && wires.length > 0) {
      const rhrWire = wires[0];
      const phase = rhrAnimRef.current;

      // Draw animated thumb (current direction - out of page)
      const rhrX = rhrWire.x + 40;
      const rhrY = rhrWire.y - 50;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(rhrX - 45, rhrY - 30, 90, 80, 8);
      ctx.fill();

      ctx.font = "bold 9px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("RIGHT-HAND RULE", rhrX, rhrY - 18);

      // Thumb up (current direction)
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rhrX, rhrY + 15);
      ctx.lineTo(rhrX, rhrY - 5);
      ctx.stroke();
      // Arrow head on thumb
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(rhrX, rhrY - 8);
      ctx.lineTo(rhrX - 4, rhrY);
      ctx.lineTo(rhrX + 4, rhrY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.font = "8px ui-monospace";
      ctx.fillText("I (thumb)", rhrX, rhrY - 12);

      // Curling fingers (B field direction)
      const fingerRadius = 18;
      const startAngle = -Math.PI / 2;
      const sweepAngle = Math.min(phase * Math.PI * 2, Math.PI * 1.5);

      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(rhrX, rhrY + 15, fingerRadius, startAngle, startAngle + sweepAngle);
      ctx.stroke();

      // Arrow tip on the arc
      const tipAngle = startAngle + sweepAngle;
      const tipAx = rhrX + Math.cos(tipAngle) * fingerRadius;
      const tipAy = rhrY + 15 + Math.sin(tipAngle) * fingerRadius;
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(tipAx, tipAy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#3b82f6";
      ctx.font = "8px ui-monospace";
      ctx.fillText("B (fingers)", rhrX, rhrY + 42);
    }

    // Draw user-placed probe
    if (probe && !challengeMode) {
      drawTarget(ctx, probe.x, probe.y, 12, "#22c55e", (t * 2) % 1);

      // Probe info
      const physB = calculatePhysicalB(probe.x, probe.y, wires, current);
      const bMicroT = physB * 1e6;

      drawInfoPanel(ctx, probe.x + 20, probe.y - 50, 160, 65, "PROBE READING", [
        { label: "|B|", value: `${bMicroT.toFixed(2)} \u00b5T`, color: "#22c55e" },
        { label: "Bx", value: `${probe.Bx.toFixed(3)}`, color: "#60a5fa" },
        { label: "By", value: `${probe.By.toFixed(3)}`, color: "#60a5fa" },
      ]);

      // Direction arrow at probe
      if (probe.magnitude > 0.01) {
        const arrowLen = Math.min(probe.magnitude * 15, 30);
        const nx = probe.Bx / probe.magnitude;
        const ny = probe.By / probe.magnitude;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(34,197,94,0.5)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(probe.x, probe.y);
        ctx.lineTo(probe.x + nx * arrowLen, probe.y + ny * arrowLen);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Arrow tip
        const atx = probe.x + nx * arrowLen;
        const aty = probe.y + ny * arrowLen;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(atx, aty);
        ctx.lineTo(atx - nx * 6 - ny * 3, aty - ny * 6 + nx * 3);
        ctx.lineTo(atx - nx * 6 + ny * 3, aty - ny * 6 - nx * 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Challenge probe
    if (challengeMode && challengeProbe) {
      const pulseFactor = 0.5 + 0.5 * Math.sin(t * 3);
      drawTarget(ctx, challengeProbe.x, challengeProbe.y, 15, "#f59e0b", pulseFactor);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 14px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("P", challengeProbe.x, challengeProbe.y - 22);

      // Distance label to nearest wire
      let minDist = Infinity;
      for (const wire of wires) {
        const dx = challengeProbe.x - wire.x;
        const dy = challengeProbe.y - wire.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px ui-monospace";
      ctx.fillText(`r = ${(minDist * 0.001 * 1000).toFixed(1)} mm`, challengeProbe.x, challengeProbe.y + 28);

      if (showChallengeAnswer) {
        const actualMicroT = challengeProbe.actualB * 1e6;
        drawInfoPanel(ctx, challengeProbe.x + 25, challengeProbe.y - 40, 170, 50, "ANSWER", [
          { label: "|B|", value: `${actualMicroT.toFixed(2)} \u00b5T`, color: "#22c55e" },
          { label: "Your guess", value: `${guess} \u00b5T`, color: "#f59e0b" },
        ]);
      }
    }

    // Info panel
    const configNames: Record<WireConfig, string> = {
      single: "Single Wire",
      parallel: "Parallel Wires",
      antiparallel: "Anti-parallel",
      loop: "Current Loop",
      solenoid: "Solenoid",
    };

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 200, 12, 188, 90, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("MAGNETIC FIELD", W - 188, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`I = ${current} A`, W - 188, 46);
    ctx.fillText(`Config: ${configNames[wireConfig]}`, W - 188, 62);
    ctx.fillText(`B = \u00b5\u2080I/(2\u03c0r)`, W - 188, 78);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("\u2299 out of page", W - 188, 94);

    // Legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 155, showHeatmap ? 54 : 40, 6);
    ctx.fill();
    ctx.font = "10px system-ui";
    ctx.fillStyle = "rgba(59,200,246,0.8)";
    ctx.textAlign = "left";
    ctx.fillText("\u2014 B field vectors", 22, 28);
    ctx.fillStyle = "rgba(251,191,36,0.6)";
    ctx.fillText("--- field lines", 22, 44);
    if (showHeatmap) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("\u2588 heatmap (strength)", 22, 58);
    }

    // Challenge scoreboard
    if (challengeMode) {
      renderScoreboard(ctx, 12, H - 120, 148, 108, challengeState);
    }

    // Click instruction
    if (!challengeMode) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 100, H - 28, 200, 22, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("Click anywhere to place probe", W / 2, H - 14);
    }

    // Render score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Render particles
    particlesRef.current.draw(ctx);
  }, [current, wireConfig, showFieldLines, showHeatmap, showRightHandRule, probe, challengeMode, challengeProbe, challengeState, guess, showChallengeAnswer, getWires, calculateField, calculatePhysicalB]);

  const animate = useCallback(() => {
    timeRef.current += 0.016;
    rhrAnimRef.current = (rhrAnimRef.current + 0.008) % 1;
    particlesRef.current.update(0.016);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas click handler for probe placement
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        if (challengeMode) return; // Don't place probe in challenge mode

        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const cx = W * 0.5;
        const cy = H * 0.5;
        const wires = getWires(cx, cy);

        // Don't place on top of wires
        for (const wire of wires) {
          const dx = x - wire.x;
          const dy = y - wire.y;
          if (dx * dx + dy * dy < 400) {
            playSFX("click");
            return;
          }
        }

        const field = calculateField(x, y, wires, current);

        setProbe({
          x,
          y,
          Bx: field.Bx,
          By: field.By,
          magnitude: field.magnitude,
        });

        playSFX("pop");
        particlesRef.current.emitGlow(x, y, 6, "#22c55e");
      },
    });

    return cleanup;
  }, [challengeMode, current, getWires, calculateField]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 480));
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

  // Regenerate challenge probe when config or current changes
  useEffect(() => {
    if (challengeMode) {
      setTimeout(generateChallenge, 100);
    }
  }, [wireConfig, current, challengeMode, generateChallenge]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Challenge mode */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {challengeMode ? "Challenge: Predict B at Point P" : "Challenge Mode"}
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

        {challengeMode && challengeProbe && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              A probe is placed at point P (marked in yellow). Using B = {"\u00b5\u2080"}I/(2{"\u03c0"}r), predict the magnetic field magnitude in {"\u00b5"}T.
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="text-xs font-mono text-gray-700 dark:text-gray-300 space-y-1">
                <div>I = {current} A</div>
                <div>{"\u00b5\u2080"} = 4{"\u03c0"}{"\u00d7"}10{"\u207b\u2077"} T{"\u00b7"}m/A</div>
                <div>Configuration: {wireConfig}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder={`Enter |B| in \u00b5T`}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono"
                onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              />
              <button
                onClick={submitGuess}
                disabled={!guess || showChallengeAnswer}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current (A)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={30} value={current}
              onChange={(e) => setCurrent(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{current} A</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Configuration</label>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(["single", "parallel", "antiparallel", "loop", "solenoid"] as WireConfig[]).map((cfg) => (
              <button key={cfg} onClick={() => setWireConfig(cfg)}
                className={`flex-1 min-w-[60px] h-8 rounded-lg text-[10px] font-medium ${
                  wireConfig === cfg ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}>
                {cfg === "single" ? "Wire" : cfg === "parallel" ? "Par" : cfg === "antiparallel" ? "Anti" : cfg === "loop" ? "Loop" : "Sol"}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Visualizations</label>
          <div className="flex flex-col gap-1.5">
            <button onClick={() => setShowFieldLines(!showFieldLines)}
              className={`h-8 rounded-lg text-xs font-medium ${
                showFieldLines ? "bg-amber-500 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}>
              Field Lines {showFieldLines ? "ON" : "OFF"}
            </button>
            <button onClick={() => setShowHeatmap(!showHeatmap)}
              className={`h-8 rounded-lg text-xs font-medium ${
                showHeatmap ? "bg-emerald-500 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}>
              Heatmap {showHeatmap ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Tools</label>
          <button onClick={() => setShowRightHandRule(!showRightHandRule)}
            className={`w-full h-8 rounded-lg text-xs font-medium mb-1.5 ${
              showRightHandRule ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            Right-Hand Rule {showRightHandRule ? "ON" : "OFF"}
          </button>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400 font-mono mt-2">
            <div>B = {"\u00b5\u2080"}I/(2{"\u03c0"}r)</div>
            <div>{"\u00b5\u2080"} = 4{"\u03c0"}{"\u00d7"}10{"\u207b\u2077"} T{"\u00b7"}m/A</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="B = \frac{\mu_0 I}{2\pi r}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\mu_0 = 4\pi \times 10^{-7} \text{ T·m/A}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Move the probe point to measure the magnetic field at different distances from the wire!</p>
    </div>
  );
}
