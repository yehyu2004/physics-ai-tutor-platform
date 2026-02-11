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
import { getCanvasMousePos } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

// Electron particle for flow visualization
interface Electron {
  pos: number; // 0-1 position along circuit path
  speed: number;
}

type GameMode = "sandbox" | "match-current" | "predict" | "power-puzzle";

export default function OhmsLaw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [voltage, setVoltage] = useState(12);
  const [resistance, setResistance] = useState(100);
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");

  // Challenge state
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());

  // Match current challenge
  const [targetCurrent, setTargetCurrent] = useState(0); // mA
  const [matchSubmitted, setMatchSubmitted] = useState(false);

  // Predict mode
  const [predictVoltage, setPredictVoltage] = useState(10);
  const [predictResistance, setPredictResistance] = useState(200);
  const [userPrediction, setUserPrediction] = useState("");
  const [predictionSubmitted, setPredictionSubmitted] = useState(false);
  const [predictionRevealed, setPredictionRevealed] = useState(false);

  // Power puzzle
  const [targetPower, setTargetPower] = useState(0); // mW
  const [powerSubmitted, setPowerSubmitted] = useState(false);

  const timeRef = useRef(0);

  const current = voltage / resistance;
  const power = voltage * current;

  // Electron particles for circuit flow
  const electronsRef = useRef<Electron[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Initialize electrons
  useEffect(() => {
    const electrons: Electron[] = [];
    const count = 20;
    for (let i = 0; i < count; i++) {
      electrons.push({
        pos: i / count,
        speed: 0,
      });
    }
    electronsRef.current = electrons;
  }, []);

  // Generate challenges
  const generateMatchChallenge = useCallback(() => {
    const target = Math.round((5 + Math.random() * 150) * 10) / 10; // 5-155 mA
    setTargetCurrent(target);
    setMatchSubmitted(false);
    setVoltage(10);
    setResistance(200);
  }, []);

  const generatePredictChallenge = useCallback(() => {
    const v = Math.round((2 + Math.random() * 18) * 2) / 2; // 2-20V in 0.5 steps
    const r = Math.round((20 + Math.random() * 480) / 10) * 10; // 20-500 ohm in 10 steps
    setPredictVoltage(v);
    setPredictResistance(r);
    setUserPrediction("");
    setPredictionSubmitted(false);
    setPredictionRevealed(false);
  }, []);

  const generatePowerPuzzle = useCallback(() => {
    const target = Math.round((50 + Math.random() * 950) * 10) / 10; // 50-1000 mW
    setTargetPower(target);
    setPowerSubmitted(false);
    setVoltage(10);
    setResistance(200);
  }, []);

  // Get circuit path point at position 0-1
  const getCircuitPoint = useCallback((pos: number, cx: number, cy: number, size: number) => {
    // Circuit is a rectangle: top->right->bottom->left
    const perim = size * 8; // total perimeter
    const p = ((pos % 1) + 1) % 1; // normalize to 0-1
    const dist = p * perim;

    if (dist < size * 2) {
      // Top wire (left to right)
      return { x: cx - size + dist, y: cy - size };
    } else if (dist < size * 4) {
      // Right wire (top to bottom)
      return { x: cx + size, y: cy - size + (dist - size * 2) };
    } else if (dist < size * 6) {
      // Bottom wire (right to left)
      return { x: cx + size - (dist - size * 4), y: cy + size };
    } else {
      // Left wire (bottom to top)
      return { x: cx - size, y: cy + size - (dist - size * 6) };
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;
    const now = performance.now();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Effective values based on mode
    const effV = gameMode === "predict" && !predictionRevealed ? predictVoltage : voltage;
    const effR = gameMode === "predict" && !predictionRevealed ? predictResistance : resistance;
    const effI = effV / effR;
    const effP = effV * effI;

    // --- Left: Circuit diagram ---
    const circW = W * 0.5;
    const cx = circW * 0.5;
    const cy = H * 0.5;
    const size = Math.min(circW * 0.32, H * 0.32);

    // Wire heating effect - glow based on power
    const heatIntensity = Math.min(effP / 3, 1);

    // Wire color shifts with heat
    const wireR = Math.round(100 + heatIntensity * 155);
    const wireG = Math.round(116 + (1 - heatIntensity) * 0);
    const wireB = Math.round(139 * (1 - heatIntensity * 0.8));
    const wireColor = heatIntensity > 0.1 ? `rgb(${wireR},${wireG},${wireB})` : "#64748b";

    // Draw heated wire glow effect
    if (heatIntensity > 0.1) {
      ctx.shadowColor = `rgba(239,68,68,${heatIntensity * 0.5})`;
      ctx.shadowBlur = 8 + heatIntensity * 12;
    }

    // Circuit wires
    ctx.strokeStyle = wireColor;
    ctx.lineWidth = 2.5;

    // Top wire
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.stroke();

    // Right wire
    ctx.beginPath();
    ctx.moveTo(cx + size, cy - size);
    ctx.lineTo(cx + size, cy + size);
    ctx.stroke();

    // Bottom wire
    ctx.beginPath();
    ctx.moveTo(cx + size, cy + size);
    ctx.lineTo(cx - size, cy + size);
    ctx.stroke();

    // Left wire
    ctx.beginPath();
    ctx.moveTo(cx - size, cy + size);
    ctx.lineTo(cx - size, cy - size);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // Battery (left side)
    const batY = cy;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(cx - size - 10, batY - 12);
    ctx.lineTo(cx - size + 10, batY - 12);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - size - 15, batY + 2);
    ctx.lineTo(cx - size + 15, batY + 2);
    ctx.stroke();

    // + and -
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("+", cx - size - 25, batY - 8);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("-", cx - size - 25, batY + 8);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillText(`${effV}V`, cx - size + 30, batY);

    // Resistor (top side - zigzag)
    const rStart = cx - size * 0.4;
    const rEnd = cx + size * 0.4;

    // Resistor heat glow
    if (heatIntensity > 0.15) {
      const rGlowGrad = ctx.createRadialGradient(cx, cy - size, 0, cx, cy - size, 50 + heatIntensity * 20);
      rGlowGrad.addColorStop(0, `rgba(239,68,68,${heatIntensity * 0.4})`);
      rGlowGrad.addColorStop(0.5, `rgba(239,150,68,${heatIntensity * 0.15})`);
      rGlowGrad.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = rGlowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy - size, 50 + heatIntensity * 20, 0, Math.PI * 2);
      ctx.fill();

      // Emit heat particles from resistor
      if (Math.random() < heatIntensity * 0.3) {
        particlesRef.current.emit(
          cx + (Math.random() - 0.5) * (rEnd - rStart),
          cy - size,
          1,
          `rgba(239,${Math.round(100 + Math.random() * 100)},68,0.7)`,
          {
            speed: 20 + heatIntensity * 30,
            lifetime: 0.5,
            size: 2,
            gravity: -40,
            drag: 0.97,
            shape: "circle",
            angle: -Math.PI / 2,
            spread: Math.PI * 0.6,
          }
        );
      }
    }

    ctx.strokeStyle = heatIntensity > 0.3 ? `rgb(${wireR},${wireG},${wireB})` : "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rStart, cy - size);
    const segments = 6;
    const segW = (rEnd - rStart) / segments;
    for (let i = 0; i < segments; i++) {
      ctx.lineTo(rStart + segW * (i + 0.25), cy - size - 10);
      ctx.lineTo(rStart + segW * (i + 0.75), cy - size + 10);
    }
    ctx.lineTo(rEnd, cy - size);
    ctx.stroke();

    // Resistor label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`R = ${effR} \u03A9`, cx, cy - size - 18);

    // --- Electron flow ---
    if (effI > 0.001) {
      for (const electron of electronsRef.current) {
        const pt = getCircuitPoint(electron.pos, cx, cy, size);

        // Electron glow
        const electronGlow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 6);
        electronGlow.addColorStop(0, "rgba(96,165,250,0.8)");
        electronGlow.addColorStop(0.5, "rgba(96,165,250,0.3)");
        electronGlow.addColorStop(1, "rgba(96,165,250,0)");
        ctx.fillStyle = electronGlow;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Electron core
        ctx.fillStyle = "#60a5fa";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Trail
        if (effI > 0.02) {
          const trailPos = ((electron.pos - 0.01) % 1 + 1) % 1;
          const trailPt = getCircuitPoint(trailPos, cx, cy, size);
          ctx.strokeStyle = "rgba(96,165,250,0.2)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(trailPt.x, trailPt.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
        }
      }
    }

    // Current flow arrows (existing animation kept as secondary indicator)
    if (effI > 0.001) {
      const arrowColor = `rgba(34,197,94,${0.2 + Math.sin(t * 3) * 0.1})`;
      ctx.fillStyle = arrowColor;
      const speed = effI * 150 + 50;
      const offset = (t * speed) % 40;

      // Top wire arrows (left to right)
      for (let ax = cx - size + offset + 20; ax < cx + size - 10; ax += 40) {
        if (ax < rStart || ax > rEnd) {
          ctx.beginPath();
          ctx.moveTo(ax + 5, cy - size);
          ctx.lineTo(ax - 3, cy - size - 5);
          ctx.lineTo(ax - 3, cy - size + 5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Right wire arrows (top to bottom)
      for (let ay = cy - size + offset; ay < cy + size; ay += 40) {
        ctx.beginPath();
        ctx.moveTo(cx + size, ay + 5);
        ctx.lineTo(cx + size - 5, ay - 3);
        ctx.lineTo(cx + size + 5, ay - 3);
        ctx.closePath();
        ctx.fill();
      }

      // Bottom wire arrows (right to left)
      for (let ax = cx + size - offset - 20; ax > cx - size + 10; ax -= 40) {
        ctx.beginPath();
        ctx.moveTo(ax - 5, cy + size);
        ctx.lineTo(ax + 3, cy + size - 5);
        ctx.lineTo(ax + 3, cy + size + 5);
        ctx.closePath();
        ctx.fill();
      }

      // Left wire arrows (bottom to top)
      for (let ay = cy + size - offset; ay > cy + 10; ay -= 40) {
        ctx.beginPath();
        ctx.moveTo(cx - size, ay - 5);
        ctx.lineTo(cx - size - 5, ay + 3);
        ctx.lineTo(cx - size + 5, ay + 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Current label on right wire
    if (gameMode !== "predict" || predictionRevealed) {
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`I = ${(effI * 1000).toFixed(1)} mA`, cx + size + 45, cy);
    }

    // Power dissipation indicator
    if (heatIntensity > 0.05) {
      ctx.fillStyle = `rgba(239,68,68,${Math.min(heatIntensity, 0.8)})`;
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      const heatText = heatIntensity > 0.8 ? "HOT!" : heatIntensity > 0.4 ? "WARM" : "mild";
      ctx.fillText(heatText, cx, cy - size + 28);
    }

    // --- Right: IV Graph and data ---
    const graphX = circW + 30;
    const graphW2 = W - graphX - 25;
    const graphTop = 30;
    const graphH2 = H * 0.55;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphTop - 10, graphW2 + 20, graphH2 + 25, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("V-I CHARACTERISTIC (Ohmic)", graphX, graphTop + 8);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphTop + 20);
    ctx.lineTo(graphX, graphTop + graphH2);
    ctx.lineTo(graphX + graphW2, graphTop + graphH2);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#64748b";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("V (Volts)", graphX + graphW2 / 2, graphTop + graphH2 + 15);
    ctx.save();
    ctx.translate(graphX - 12, graphTop + graphH2 / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("I (mA)", 0, 0);
    ctx.restore();

    // Line: I = V/R
    const maxVGraph = 20;
    const maxIGraph = maxVGraph / effR * 1000;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(59,130,246,0.4)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const plotH = graphH2 - 25;
    for (let v = 0; v <= maxVGraph; v += 0.5) {
      const i = v / effR * 1000;
      const px = graphX + (v / maxVGraph) * graphW2;
      const py = graphTop + graphH2 - (i / maxIGraph) * plotH;
      if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current operating point
    if (gameMode !== "predict" || predictionRevealed) {
      const opX = graphX + (effV / maxVGraph) * graphW2;
      const opY = graphTop + graphH2 - ((effI * 1000) / maxIGraph) * plotH;
      const opGlow = ctx.createRadialGradient(opX, opY, 0, opX, opY, 12);
      opGlow.addColorStop(0, "rgba(251,191,36,0.5)");
      opGlow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = opGlow;
      ctx.beginPath();
      ctx.arc(opX, opY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(opX, opY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Dashed lines to axes
      ctx.strokeStyle = "rgba(251,191,36,0.3)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(opX, opY);
      ctx.lineTo(opX, graphTop + graphH2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(opX, opY);
      ctx.lineTo(graphX, opY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Slope label
    ctx.fillStyle = "#3b82f6";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`slope = 1/R = ${(1 / effR * 1000).toFixed(2)} mA/V`, graphX + 10, graphTop + 28);

    // --- Target indicators for challenges ---
    if (gameMode === "match-current" && targetCurrent > 0) {
      const targetY = graphTop + graphH2 - (targetCurrent / maxIGraph) * plotH;

      // Target line
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(graphX, targetY);
      ctx.lineTo(graphX + graphW2, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`Target: ${targetCurrent.toFixed(1)} mA`, graphX + graphW2, targetY - 5);
    }

    if (gameMode === "power-puzzle" && targetPower > 0) {
      // Draw power hyperbola: P = VI => I = P/V
      ctx.strokeStyle = "rgba(245,158,11,0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let started = false;
      for (let v = 0.5; v <= maxVGraph; v += 0.3) {
        const i = (targetPower / 1000) / v * 1000; // mA
        if (i > maxIGraph * 1.5) continue;
        const px = graphX + (v / maxVGraph) * graphW2;
        const py = graphTop + graphH2 - (i / maxIGraph) * plotH;
        if (py < graphTop + 20 || py > graphTop + graphH2) continue;
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`P = ${targetPower.toFixed(0)} mW curve`, graphX + 10, graphTop + 42);
    }

    // --- Data panel ---
    if (gameMode !== "predict" || predictionRevealed) {
      const dataY = graphTop + graphH2 + 35;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(graphX - 10, dataY, graphW2 + 20, H - dataY - 15, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("CIRCUIT DATA", graphX, dataY + 18);

      let dy = dataY + 38;
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`V = ${effV} V`, graphX, dy);
      ctx.fillStyle = "#22c55e";
      ctx.fillText(`I = ${(effI * 1000).toFixed(1)} mA`, graphX + graphW2 / 2, dy);
      dy += 22;
      ctx.fillStyle = "#ef4444";
      ctx.fillText(`P = ${(effP * 1000).toFixed(1)} mW`, graphX, dy);
      ctx.fillStyle = "#a78bfa";
      ctx.fillText(`R = ${effR} \u03A9`, graphX + graphW2 / 2, dy);
    }

    // --- Predict mode overlay ---
    if (gameMode === "predict" && !predictionRevealed) {
      const dataY = graphTop + graphH2 + 35;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(graphX - 10, dataY, graphW2 + 20, H - dataY - 15, 8);
      ctx.fill();

      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText("PREDICT THE CURRENT", graphX, dataY + 18);

      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`V = ${predictVoltage} V`, graphX, dataY + 38);
      ctx.fillText(`R = ${predictResistance} \u03A9`, graphX + graphW2 / 2, dataY + 38);

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText("I = ? mA", graphX, dataY + 58);
      ctx.fillText("Use the input below to predict", graphX, dataY + 76);
    }

    // --- Scoreboard ---
    if (challengeState.active) {
      renderScoreboard(ctx, 12, 12, 150, 110, challengeState);
    }

    // --- Particles ---
    particlesRef.current.draw(ctx);

    // --- Score popups ---
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [voltage, resistance, gameMode, challengeState, targetCurrent, predictVoltage, predictResistance, predictionRevealed, targetPower, getCircuitPoint]);

  const animate = useCallback(() => {
    const dt = 0.016;
    timeRef.current += dt;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.width;
    const H = canvas.height;
    const circW = W * 0.5;
    const cx = circW * 0.5;
    const cy = H * 0.5;
    const size = Math.min(circW * 0.32, H * 0.32);

    const effV = gameMode === "predict" && !predictionRevealed ? predictVoltage : voltage;
    const effR = gameMode === "predict" && !predictionRevealed ? predictResistance : resistance;
    const effI = effV / effR;

    // Update electron positions along circuit
    const electronSpeed = effI * 2 + 0.01; // scale current to visual speed
    for (const electron of electronsRef.current) {
      electron.speed = electronSpeed;
      electron.pos = (electron.pos + electron.speed * dt * 0.05) % 1;
    }

    // Spark particles at resistor when high power
    const effP = effV * effI;
    if (effP > 1.5 && Math.random() < (effP - 1.5) * 0.15) {
      particlesRef.current.emitSparks(
        cx + (Math.random() - 0.5) * size * 0.6,
        cy - size + (Math.random() - 0.5) * 10,
        1,
        "#fbbf24",
      );
    }

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, voltage, resistance, gameMode, predictVoltage, predictResistance, predictionRevealed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.5, 440);
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

  // Mouse tracking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleMouseMove = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      mouseRef.current = pos;
    };
    canvas.addEventListener("mousemove", handleMouseMove);
    return () => canvas.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Challenge handlers
  const handleMatchSubmit = () => {
    const actualCurrent = (voltage / resistance) * 1000; // mA
    const result = calculateAccuracy(actualCurrent, targetCurrent, targetCurrent);
    setChallengeState((prev) => updateChallengeState(prev, result));
    setMatchSubmitted(true);

    if (result.points >= 2) {
      playSFX("correct");
      playScore(result.points);
      const canvas = canvasRef.current;
      if (canvas) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, result.points * 8);
      }
    } else if (result.points === 1) {
      playSFX("pop");
    } else {
      playSFX("incorrect");
    }

    popupsRef.current.push({
      text: `${result.label} (${actualCurrent.toFixed(1)} mA)`,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 3 : 100,
      startTime: performance.now(),
    });
  };

  const handlePredictSubmit = () => {
    const predicted = parseFloat(userPrediction);
    if (isNaN(predicted)) return;

    const actual = (predictVoltage / predictResistance) * 1000; // mA
    const result = calculateAccuracy(predicted, actual, actual);
    setChallengeState((prev) => updateChallengeState(prev, result));
    setPredictionSubmitted(true);

    // Reveal after brief delay
    setTimeout(() => {
      setPredictionRevealed(true);
      setVoltage(predictVoltage);
      setResistance(predictResistance);

      if (result.points >= 2) {
        playSFX("correct");
        playScore(result.points);
        const canvas = canvasRef.current;
        if (canvas) {
          particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, result.points * 8);
        }
      } else if (result.points === 1) {
        playSFX("pop");
      } else {
        playSFX("incorrect");
      }

      popupsRef.current.push({
        text: `${result.label} (actual: ${actual.toFixed(1)} mA)`,
        points: result.points,
        x: canvasRef.current ? canvasRef.current.width / 2 : 300,
        y: canvasRef.current ? canvasRef.current.height / 3 : 100,
        startTime: performance.now(),
      });
    }, 600);
  };

  const handlePowerSubmit = () => {
    const actualPower = (voltage * voltage / resistance) * 1000; // mW
    const result = calculateAccuracy(actualPower, targetPower, targetPower);
    setChallengeState((prev) => updateChallengeState(prev, result));
    setPowerSubmitted(true);

    if (result.points >= 2) {
      playSFX("correct");
      playScore(result.points);
      const canvas = canvasRef.current;
      if (canvas) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, result.points * 8);
      }
    } else if (result.points === 1) {
      playSFX("pop");
    } else {
      playSFX("incorrect");
    }

    popupsRef.current.push({
      text: `${result.label} (${actualPower.toFixed(0)} mW)`,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 3 : 100,
      startTime: performance.now(),
    });
  };

  const switchMode = (mode: GameMode) => {
    setGameMode(mode);
    setMatchSubmitted(false);
    setPredictionSubmitted(false);
    setPredictionRevealed(false);
    setPowerSubmitted(false);
    setUserPrediction("");
    particlesRef.current.clear();

    if (mode === "sandbox") {
      setChallengeState(createChallengeState());
    } else {
      setChallengeState({ ...createChallengeState(), active: true });
      if (mode === "match-current") generateMatchChallenge();
      else if (mode === "predict") generatePredictChallenge();
      else if (mode === "power-puzzle") generatePowerPuzzle();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "match-current", "predict", "power-puzzle"] as GameMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => switchMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              gameMode === mode
                ? "bg-yellow-500 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {mode === "sandbox" ? "Sandbox" : mode === "match-current" ? "Match Current" : mode === "predict" ? "Predict" : "Power Puzzle"}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {gameMode !== "predict" && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Voltage (V)</label>
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min={1} max={20} step={0.5} value={voltage}
                  onChange={(e) => setVoltage(Number(e.target.value))}
                  className="flex-1 accent-yellow-500" />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{voltage} V</span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resistance (\u03A9)</label>
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min={10} max={1000} step={10} value={resistance}
                  onChange={(e) => setResistance(Number(e.target.value))}
                  className="flex-1 accent-blue-500" />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{resistance}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Match current challenge */}
      {gameMode === "match-current" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Target Current: <span className="text-amber-500">{targetCurrent.toFixed(1)} mA</span>
            </h3>
            <div className="flex gap-2">
              {!matchSubmitted ? (
                <button
                  onClick={handleMatchSubmit}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
                >
                  Check
                </button>
              ) : (
                <button
                  onClick={generateMatchChallenge}
                  className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adjust V and R to achieve the target current. Your current: {(current * 1000).toFixed(1)} mA
          </p>
          {matchSubmitted && (
            <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
              Error: {Math.abs(current * 1000 - targetCurrent).toFixed(1)} mA ({((Math.abs(current * 1000 - targetCurrent) / targetCurrent) * 100).toFixed(1)}%)
            </p>
          )}
        </div>
      )}

      {/* Predict mode */}
      {gameMode === "predict" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Predict the Current
            </h3>
            <div className="flex gap-2">
              {predictionRevealed && (
                <button
                  onClick={generatePredictChallenge}
                  className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
              V = {predictVoltage} V
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
              R = {predictResistance} {"\u03A9"}
            </div>
          </div>
          {!predictionSubmitted ? (
            <div className="flex gap-2 items-center">
              <label className="text-xs text-gray-500 dark:text-gray-400">I =</label>
              <input
                type="number"
                step="0.1"
                value={userPrediction}
                onChange={(e) => setUserPrediction(e.target.value)}
                placeholder="? mA"
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                onKeyDown={(e) => { if (e.key === "Enter") handlePredictSubmit(); }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">mA</span>
              <button
                onClick={handlePredictSubmit}
                disabled={!userPrediction}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Submit
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-mono">Your answer: {userPrediction} mA</span>
              {predictionRevealed && (
                <span className="ml-2 font-mono">| Actual: {((predictVoltage / predictResistance) * 1000).toFixed(1)} mA</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Power puzzle */}
      {gameMode === "power-puzzle" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Target Power: <span className="text-amber-500">{targetPower.toFixed(0)} mW</span>
            </h3>
            <div className="flex gap-2">
              {!powerSubmitted ? (
                <button
                  onClick={handlePowerSubmit}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
                >
                  Check
                </button>
              ) : (
                <button
                  onClick={generatePowerPuzzle}
                  className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Find V and R that produce the target power dissipation. Current: {(power * 1000).toFixed(0)} mW (P = V{"\u00B2"}/R)
          </p>
          {powerSubmitted && (
            <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
              Error: {Math.abs(power * 1000 - targetPower).toFixed(0)} mW ({((Math.abs(power * 1000 - targetPower) / targetPower) * 100).toFixed(1)}%)
            </p>
          )}
        </div>
      )}

      {/* Score display */}
      {challengeState.active && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Challenge Score</span>
              <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">{challengeState.score}</div>
            </div>
            <div className="text-right text-sm text-amber-600 dark:text-amber-400">
              <div>{challengeState.attempts} attempts</div>
              {challengeState.streak > 0 && <div className="font-bold">Streak: {challengeState.streak}</div>}
              {challengeState.bestStreak > 1 && <div>Best: {challengeState.bestStreak}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Key equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="V = IR" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="P = IV" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="P = I^2 R" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="P = V^2/R" /></div>
        </div>
      </div>
    </div>
  );
}
