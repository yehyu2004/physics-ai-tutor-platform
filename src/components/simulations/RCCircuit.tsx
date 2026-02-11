"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  calculateAccuracy,
  createChallengeState,
  updateChallengeState,
  renderScoreboard,
  renderScorePopup,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { createDragHandler, isPointInRect } from "@/lib/simulation/interaction";

interface Electron {
  pos: number; // 0-1 position along the circuit path
  speed: number;
}

interface CircuitPreset {
  name: string;
  R: number;
  C: number;
  V: number;
  description: string;
}

const PRESETS: CircuitPreset[] = [
  { name: "Fast", R: 100, C: 50, V: 10, description: "Low R, Low C -- fast charge" },
  { name: "Standard", R: 1000, C: 100, V: 10, description: "Standard RC circuit" },
  { name: "Slow", R: 5000, C: 500, V: 12, description: "High R, High C -- slow charge" },
  { name: "High V", R: 2000, C: 200, V: 20, description: "High voltage source" },
  { name: "Tiny", R: 500, C: 20, V: 5, description: "Small capacitor, low voltage" },
];

export default function RCCircuit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [resistance, setResistance] = useState(1000);
  const [capacitance, setCapacitance] = useState(100);
  const [voltage, setVoltage] = useState(10);
  const [isCharging, setIsCharging] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const [switchClosed, setSwitchClosed] = useState(true);
  const [challengeActive, setChallengeActive] = useState(false);
  const [tauPrediction, setTauPrediction] = useState("");
  const [tauSubmitted, setTauSubmitted] = useState(false);
  const [activePreset, setActivePreset] = useState(1);

  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; vC: number; i: number }[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const electronsRef = useRef<Electron[]>([]);

  // Challenge state
  const targetVoltageRef = useRef(0);
  const challengeRoundActiveRef = useRef(false);

  const tau = (resistance * capacitance) / 1000000; // R*C in seconds

  // Initialize electrons
  const initElectrons = useCallback(() => {
    const electrons: Electron[] = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      electrons.push({
        pos: i / count,
        speed: 1,
      });
    }
    electronsRef.current = electrons;
  }, []);

  useEffect(() => {
    initElectrons();
  }, [initElectrons]);

  // Get circuit path point from 0-1 parameter
  const getCircuitPoint = useCallback(
    (t: number, cx: number, cy: number, size: number): { x: number; y: number } => {
      // Circuit is a rectangle: top (left to right), right (top to bottom),
      // bottom (right to left), left (bottom to top)
      const segment = t * 4; // which segment (0-1 each side)

      if (segment < 1) {
        // Top: left to right
        const frac = segment;
        return { x: cx - size + frac * 2 * size, y: cy - size };
      } else if (segment < 2) {
        // Right: top to bottom
        const frac = segment - 1;
        return { x: cx + size, y: cy - size + frac * 2 * size };
      } else if (segment < 3) {
        // Bottom: right to left
        const frac = segment - 2;
        return { x: cx + size - frac * 2 * size, y: cy + size };
      } else {
        // Left: bottom to top
        const frac = segment - 3;
        return { x: cx - size, y: cy + size - frac * 2 * size };
      }
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
    const t = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Current values
    let vC: number, current: number;
    if (!switchClosed) {
      // Switch open: no current, voltage holds
      const lastH = historyRef.current;
      vC = lastH.length > 0 ? lastH[lastH.length - 1].vC : 0;
      current = 0;
    } else {
      vC = isCharging
        ? voltage * (1 - Math.exp(-t / tau))
        : voltage * Math.exp(-t / tau);
      current = isCharging
        ? (voltage / resistance) * Math.exp(-t / tau)
        : -(voltage / resistance) * Math.exp(-t / tau);
    }

    // --- Left: Circuit diagram ---
    const circW = W * 0.35;
    const cx = circW * 0.5;
    const cy = H * 0.5;
    const size = Math.min(circW * 0.35, H * 0.35);

    // Battery
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx - size, cy + size);
    ctx.stroke();
    // Battery symbol
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - size - 8, cy - size * 0.3);
    ctx.lineTo(cx - size + 8, cy - size * 0.3);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size - 12, cy - size * 0.15);
    ctx.lineTo(cx - size + 12, cy - size * 0.15);
    ctx.stroke();
    ctx.font = "bold 11px system-ui";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.fillText(`${voltage}V`, cx - size - 25, cy);

    // ---- Switch ----
    const switchX = cx - size * 0.6;
    const switchY = cy - size;
    const switchLen = 30;

    // Switch base dots
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(switchX, switchY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(switchX + switchLen, switchY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Switch arm
    if (switchClosed) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(switchX, switchY);
      ctx.lineTo(switchX + switchLen, switchY);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(switchX, switchY);
      ctx.lineTo(switchX + switchLen * 0.7, switchY - 15);
      ctx.stroke();
    }

    // Switch label
    ctx.fillStyle = switchClosed ? "#22c55e" : "#ef4444";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(switchClosed ? "CLOSED" : "OPEN", switchX + switchLen / 2, switchY - 18);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "8px system-ui";
    ctx.fillText("(click)", switchX + switchLen / 2, switchY + 14);

    // Top wire (with gap for switch)
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(switchX, cy - size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(switchX + switchLen, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.stroke();

    // Resistor (zigzag) on top wire
    const rStart = cx - size * 0.1;
    const rEnd = cx + size * 0.4;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(switchX + switchLen, cy - size);
    ctx.lineTo(rStart, cy - size);
    const steps = 6;
    const stepW = (rEnd - rStart) / steps;
    for (let i = 0; i < steps; i++) {
      ctx.lineTo(rStart + stepW * (i + 0.25), cy - size - 8);
      ctx.lineTo(rStart + stepW * (i + 0.75), cy - size + 8);
    }
    ctx.lineTo(rEnd, cy - size);
    ctx.lineTo(cx + size, cy - size);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`R=${resistance}\u03A9`, (rStart + rEnd) / 2, cy - size - 18);

    // Right wire down
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + size, cy - size);
    ctx.lineTo(cx + size, cy + size);
    ctx.stroke();

    // ---- Capacitor with visual fill ----
    const capY = cy;
    const plateGap = 12;
    const plateW = 24;
    const plateH = 3;

    // Capacitor charge fill (colored region between plates)
    const chargeFraction = Math.min(1, Math.max(0, vC / voltage));
    if (chargeFraction > 0.01) {
      const fillH = chargeFraction * 50;
      const gradient = ctx.createLinearGradient(
        cx + size - plateW / 2,
        capY - fillH / 2,
        cx + size + plateW / 2,
        capY + fillH / 2
      );
      gradient.addColorStop(0, `rgba(59,130,246,${chargeFraction * 0.6})`);
      gradient.addColorStop(0.5, `rgba(96,165,250,${chargeFraction * 0.4})`);
      gradient.addColorStop(1, `rgba(59,130,246,${chargeFraction * 0.6})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(
        cx + size - plateW / 2 - 2,
        capY - fillH / 2,
        plateW + 4,
        fillH,
        4
      );
      ctx.fill();

      // Glow effect when charged
      if (chargeFraction > 0.5) {
        const glowR = 20 + chargeFraction * 20;
        const glow = ctx.createRadialGradient(
          cx + size, capY, 5,
          cx + size, capY, glowR
        );
        glow.addColorStop(0, `rgba(59,130,246,${chargeFraction * 0.2})`);
        glow.addColorStop(1, "rgba(59,130,246,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx + size, capY, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Capacitor plates
    ctx.lineWidth = plateH;
    ctx.strokeStyle = "#60a5fa";
    ctx.beginPath();
    ctx.moveTo(cx + size - plateW / 2, capY - plateGap / 2);
    ctx.lineTo(cx + size + plateW / 2, capY - plateGap / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + size - plateW / 2, capY + plateGap / 2);
    ctx.lineTo(cx + size + plateW / 2, capY + plateGap / 2);
    ctx.stroke();

    // + and - charge indicators on plates
    if (chargeFraction > 0.1) {
      ctx.font = `bold ${10 + chargeFraction * 4}px ui-monospace`;
      ctx.fillStyle = `rgba(239,68,68,${chargeFraction * 0.8})`;
      ctx.textAlign = "center";
      ctx.fillText("+", cx + size + plateW / 2 + 10, capY - plateGap / 2 + 4);
      ctx.fillStyle = `rgba(59,130,246,${chargeFraction * 0.8})`;
      ctx.fillText("\u2212", cx + size + plateW / 2 + 10, capY + plateGap / 2 + 4);
    }

    ctx.fillStyle = "#3b82f6";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText(`C=${capacitance}\u00B5F`, cx + size + 20, capY + 5);

    // Bottom wire
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + size, cy + size);
    ctx.lineTo(cx - size, cy + size);
    ctx.lineTo(cx - size, cy - size * 0.15);
    ctx.stroke();

    // ---- Animated electrons ----
    if (switchClosed) {
      const currentScale = Math.abs(current) * resistance;
      const electronSpeed = currentScale * 0.8;

      for (const electron of electronsRef.current) {
        electron.speed = electronSpeed;
        const dir = isCharging ? 1 : -1;
        electron.pos += dir * electron.speed * 0.00004;
        if (electron.pos > 1) electron.pos -= 1;
        if (electron.pos < 0) electron.pos += 1;

        const pt = getCircuitPoint(electron.pos, cx, cy, size);

        // Draw electron
        const eSize = 3 + currentScale * 1.5;
        const eAlpha = 0.3 + currentScale * 0.5;

        // Electron glow
        const eGlow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, eSize * 2);
        eGlow.addColorStop(0, `rgba(96,165,250,${eAlpha})`);
        eGlow.addColorStop(1, "rgba(96,165,250,0)");
        ctx.fillStyle = eGlow;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, eSize * 2, 0, Math.PI * 2);
        ctx.fill();

        // Electron core
        ctx.fillStyle = `rgba(147,197,253,${eAlpha + 0.2})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, eSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- Current arrows (animated) ----
    const currentScale = Math.abs(current) * resistance;
    if (currentScale > 0.1 && switchClosed) {
      const arrowColor = isCharging ? "#22c55e" : "#f59e0b";
      ctx.fillStyle = arrowColor;
      const offset = (t * 100) % 40;
      // Top wire arrows
      for (let ax = cx - size + offset; ax < cx + size; ax += 40) {
        ctx.beginPath();
        ctx.moveTo(ax, cy - size - 3);
        ctx.lineTo(ax - 5, cy - size - 7);
        ctx.lineTo(ax - 5, cy - size + 1);
        ctx.closePath();
        ctx.globalAlpha = currentScale * 0.5;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Current value label
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`I = ${(current * 1000).toFixed(1)} mA`, cx, cy + size + 20);

    // V_C label
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`V_C = ${vC.toFixed(2)} V`, cx + size, cy + size + 20);

    // Capacitor fill percentage
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 14px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${(chargeFraction * 100).toFixed(0)}%`, cx + size, cy + size + 38);

    // ---- Draw particles ----
    particlesRef.current.draw(ctx);

    // --- Right: Graphs ---
    const graphX = circW + 30;
    const graphW = W - graphX - 25;
    const graphH = (H - 60) / 2 - 10;

    const history = historyRef.current;
    const maxT = Math.max(tau * 5, t + 0.5);

    // Voltage graph
    const vGraphY = 25;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, vGraphY, graphW + 20, graphH, 6);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.textAlign = "left";
    ctx.fillText("Capacitor Voltage V_C(t)", graphX, vGraphY + 14);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, vGraphY + 20);
    ctx.lineTo(graphX, vGraphY + graphH - 5);
    ctx.lineTo(graphX + graphW, vGraphY + graphH - 5);
    ctx.stroke();

    // V_max line
    ctx.strokeStyle = "rgba(251,191,36,0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, vGraphY + 22);
    ctx.lineTo(graphX + graphW, vGraphY + 22);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "9px ui-monospace";
    ctx.fillText(`${voltage}V`, graphX + graphW + 3, vGraphY + 25);

    // Target voltage line in challenge mode
    if (challengeRef.current.active && challengeRoundActiveRef.current) {
      const targetV = targetVoltageRef.current;
      const targetFrac = targetV / voltage;
      const plotH = graphH - 30;
      const targetPy = vGraphY + graphH - 5 - targetFrac * plotH;
      ctx.strokeStyle = "rgba(245,158,11,0.5)";
      ctx.setLineDash([6, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(graphX, targetPy);
      ctx.lineTo(graphX + graphW, targetPy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 10px ui-monospace";
      ctx.textAlign = "right";
      ctx.fillText(`Target: ${targetV.toFixed(1)}V`, graphX + graphW, targetPy - 5);
    }

    // tau line
    if (tau < maxT) {
      const tauX = graphX + (tau / maxT) * graphW;
      ctx.strokeStyle = "rgba(239,68,68,0.3)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tauX, vGraphY + 20);
      ctx.lineTo(tauX, vGraphY + graphH - 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ef4444";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText("\u03C4", tauX - 3, vGraphY + graphH + 8);
    }

    // Plot V_C
    if (history.length > 1) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(59,130,246,0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const plotH = graphH - 30;
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT) * graphW;
        const py = vGraphY + graphH - 5 - (history[i].vC / voltage) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Current graph
    const iGraphY = vGraphY + graphH + 20;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, iGraphY, graphW + 20, graphH, 6);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText("Current I(t)", graphX, iGraphY + 14);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, iGraphY + 20);
    ctx.lineTo(graphX, iGraphY + graphH - 5);
    ctx.lineTo(graphX + graphW, iGraphY + graphH - 5);
    ctx.stroke();

    // Plot current
    if (history.length > 1) {
      const maxI = voltage / resistance;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const plotH = graphH - 30;
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT) * graphW;
        const py = iGraphY + graphH - 5 - (Math.abs(history[i].i) / maxI) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tau info
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, H - 35, 200, 25, 4);
    ctx.fill();
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.fillText(
      `\u03C4 = RC = ${(tau * 1000).toFixed(1)} ms | t = ${(t * 1000).toFixed(0)} ms`,
      20,
      H - 18
    );

    // ---- Challenge mode overlay ----
    if (challengeRef.current.active) {
      renderScoreboard(ctx, W - 170, H - 130, 155, 120, challengeRef.current);

      if (challengeRoundActiveRef.current) {
        const targetV = targetVoltageRef.current;
        // Info panel showing target
        drawInfoPanel(ctx, graphX - 10, iGraphY + graphH + 12, graphW + 20, 50,
          "CHALLENGE: Charge to Target", [
            {
              label: "Target",
              value: `${targetV.toFixed(1)} V`,
              color: "#f59e0b",
            },
            {
              label: "Current V_C",
              value: `${vC.toFixed(2)} V`,
              color: Math.abs(vC - targetV) < targetV * 0.05 ? "#22c55e" : "#3b82f6",
            },
          ]);
      }
    }

    // ---- Score popups ----
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [resistance, capacitance, voltage, isCharging, tau, switchClosed, getCircuitPoint]);

  const startNewChallengeRound = useCallback(() => {
    // Random target between 30% and 90% of voltage
    targetVoltageRef.current = voltage * (0.3 + Math.random() * 0.6);
    challengeRoundActiveRef.current = true;
    timeRef.current = 0;
    historyRef.current = [];
    setSwitchClosed(true);
    setIsCharging(true);
  }, [voltage]);

  const animate = useCallback(() => {
    if (!switchClosed) {
      // Switch open: just redraw, don't advance time
      draw();
      animRef.current = requestAnimationFrame(animate);
      return;
    }

    timeRef.current += 0.002;
    const t = timeRef.current;
    const vC = isCharging
      ? voltage * (1 - Math.exp(-t / tau))
      : voltage * Math.exp(-t / tau);
    const current = isCharging
      ? (voltage / resistance) * Math.exp(-t / tau)
      : -(voltage / resistance) * Math.exp(-t / tau);

    historyRef.current.push({ t, vC, i: current });
    if (historyRef.current.length > 1000) historyRef.current.shift();

    // Update particles
    particlesRef.current.update(0.016);

    // Spark effects when charging fast
    const currentMag = Math.abs(current) * resistance;
    if (currentMag > 0.7) {
      const canvas = canvasRef.current;
      if (canvas) {
        const circW = canvas.width * 0.35;
        const cx2 = circW * 0.5;
        const cy2 = canvas.height * 0.5;
        const sz = Math.min(circW * 0.35, canvas.height * 0.35);
        // Sparks near the capacitor
        particlesRef.current.emitSparks(
          cx2 + sz + (Math.random() - 0.5) * 10,
          cy2 + (Math.random() - 0.5) * 20,
          1,
          "#60a5fa"
        );
      }
    }

    // Challenge: check if capacitor voltage matches target
    if (challengeRef.current.active && challengeRoundActiveRef.current) {
      const targetV = targetVoltageRef.current;
      // Check if we've reached the target (within 2%)
      if (Math.abs(vC - targetV) < targetV * 0.02 && isCharging) {
        challengeRoundActiveRef.current = false;
        // Score based on how long it took relative to tau
        const timeTaken = t;
        const expectedTime = -tau * Math.log(1 - targetV / voltage);
        const result = calculateAccuracy(timeTaken, expectedTime, tau);

        challengeRef.current = updateChallengeState(challengeRef.current, result);

        const canvas = canvasRef.current;
        popupsRef.current.push({
          text: `${result.label}`,
          points: result.points,
          x: canvas ? canvas.width * 0.5 : 400,
          y: canvas ? canvas.height * 0.4 : 200,
          startTime: performance.now(),
        });

        if (result.points > 0) {
          playScore(result.points);
          if (canvas) {
            particlesRef.current.emitConfetti(canvas.width * 0.5, canvas.height * 0.3, result.points * 10);
          }
        } else {
          playSFX("fail");
        }

        // New round after delay
        setTimeout(() => {
          if (challengeRef.current.active) {
            startNewChallengeRound();
          }
        }, 2500);
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [resistance, voltage, isCharging, tau, draw, switchClosed, startNewChallengeRound]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 480);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Animation loop
  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Click handler for switch
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        const circW = canvas.width * 0.35;
        const ccx = circW * 0.5;
        const ccy = canvas.height * 0.5;
        const sz = Math.min(circW * 0.35, canvas.height * 0.35);
        const switchX = ccx - sz * 0.6;
        const switchY = ccy - sz;

        // Check if click is on the switch area
        if (isPointInRect(x, y, switchX - 10, switchY - 25, 50, 45)) {
          setSwitchClosed((prev) => {
            const newState = !prev;
            playSFX(newState ? "click" : "pop");
            if (!newState) {
              // Opening switch: freeze current voltage
            } else {
              // Closing switch: reset time to continue from current state
              // Keep history but reset time
            }
            return newState;
          });
        }
      },
    });

    return cleanup;
  }, []);

  const reset = () => {
    timeRef.current = 0;
    historyRef.current = [];
    particlesRef.current.clear();
    popupsRef.current = [];
    setSwitchClosed(true);
    draw();
  };

  const applyPreset = (index: number) => {
    const preset = PRESETS[index];
    setActivePreset(index);
    setResistance(preset.R);
    setCapacitance(preset.C);
    setVoltage(preset.V);
    timeRef.current = 0;
    historyRef.current = [];
    particlesRef.current.clear();
    setSwitchClosed(true);
    setIsCharging(true);
    playSFX("click");
  };

  const toggleChallenge = () => {
    const newActive = !challengeActive;
    setChallengeActive(newActive);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = newActive;
    if (newActive) {
      playSFX("powerup");
      startNewChallengeRound();
    } else {
      challengeRoundActiveRef.current = false;
    }
  };

  const submitTauPrediction = () => {
    const predicted = parseFloat(tauPrediction);
    if (isNaN(predicted) || predicted <= 0) return;

    const actualTauMs = tau * 1000;
    const result = calculateAccuracy(predicted, actualTauMs, actualTauMs);
    setTauSubmitted(true);

    popupsRef.current.push({
      text: `${result.label} (\u03C4=${actualTauMs.toFixed(1)}ms)`,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width * 0.5 : 400,
      y: canvasRef.current ? canvasRef.current.height * 0.3 : 150,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }
  };

  const actualTauMs = tau * 1000;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>

      {/* Preset circuits */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Circuit Presets
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => applyPreset(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activePreset === i
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
              title={preset.description}
            >
              {preset.name} (R={preset.R}, C={preset.C})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            R ({"\u03A9"})
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={resistance}
              onChange={(e) => {
                setResistance(Number(e.target.value));
                setTauSubmitted(false);
                reset();
              }}
              className="flex-1 accent-amber-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {resistance}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            C ({"\u00B5"}F)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={capacitance}
              onChange={(e) => {
                setCapacitance(Number(e.target.value));
                setTauSubmitted(false);
                reset();
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {capacitance}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            V (V)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={1}
              max={20}
              value={voltage}
              onChange={(e) => {
                setVoltage(Number(e.target.value));
                reset();
              }}
              className="flex-1 accent-yellow-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {voltage}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => {
              setIsCharging(!isCharging);
              reset();
            }}
            className={`w-full h-9 rounded-lg text-xs font-medium transition-colors ${
              isCharging ? "bg-green-600 text-white" : "bg-orange-500 text-white"
            }`}
          >
            {isCharging ? "Charging" : "Discharging"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={toggleChallenge}
            className={`w-full h-9 rounded-lg text-xs font-medium transition-colors ${
              challengeActive
                ? "bg-yellow-500 text-black"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {challengeActive ? "Challenge ON" : "Challenge"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Tau prediction mini-game */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Predict {"\u03C4"} (Time Constant)
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Calculate {"\u03C4"} = R {"\u00D7"} C from the current R and C values. Enter your prediction in milliseconds.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder={"\u03C4 in ms"}
            value={tauPrediction}
            onChange={(e) => {
              setTauPrediction(e.target.value);
              setTauSubmitted(false);
            }}
            className="flex-1 h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 text-sm font-mono text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={submitTauPrediction}
            disabled={tauSubmitted || !tauPrediction}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            Check
          </button>
          {tauSubmitted && (
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              Actual: {actualTauMs.toFixed(1)} ms
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          RC Circuit Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {"\u03C4"} = RC = {actualTauMs.toFixed(1)} ms
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            V_C = V{"\u2080"}(1 {"\u2212"} e^({"\u2212"}t/{"\u03C4"}))
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            I = (V{"\u2080"}/R)e^({"\u2212"}t/{"\u03C4"})
          </div>
        </div>
      </div>

      {challengeActive && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <h3 className="text-sm font-semibold text-yellow-500 mb-1">
            Charge to Target Voltage
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The capacitor must charge to the target voltage. Use the switch to control when
            charging starts. Click the switch on the circuit to open/close it. Try different
            R and C values to change the charging speed.
            Score: {challengeRef.current.score} pts | Attempts: {challengeRef.current.attempts}
          </p>
        </div>
      )}
    </div>
  );
}
