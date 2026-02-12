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
import { drawMeter } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";
// interaction utilities available if needed


type EngineMode = "sandbox" | "challenge" | "comparison";

interface RealEngine {
  name: string;
  tHot: number;
  tCold: number;
  realEff: number;
  color: string;
}

const REAL_ENGINES: RealEngine[] = [
  { name: "Car Engine", tHot: 600, tCold: 300, realEff: 0.25, color: "#ef4444" },
  { name: "Power Plant", tHot: 800, tCold: 300, realEff: 0.40, color: "#3b82f6" },
  { name: "Diesel", tHot: 900, tCold: 300, realEff: 0.35, color: "#f59e0b" },
  { name: "Jet Turbine", tHot: 1400, tCold: 500, realEff: 0.36, color: "#22c55e" },
  { name: "Stirling", tHot: 700, tCold: 300, realEff: 0.30, color: "#a855f7" },
];

export default function HeatEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [tHot, setTHot] = useState(600);
  const [tCold, setTCold] = useState(300);
  const [isRunning, setIsRunning] = useState(true);
  const [engineMode, setEngineMode] = useState<EngineMode>("sandbox");
  const [targetEff, setTargetEff] = useState(0.55);
  const [showComparison, setShowComparison] = useState(false);

  const progressRef = useRef(0);
  const timeRef = useRef(0);
  const cycleCountRef = useRef(0);
  const totalWorkRef = useRef(0);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());

  // Piston animation state
  const pistonPosRef = useRef(0.5); // 0=compressed, 1=expanded

  // Carnot efficiency
  const efficiency = 1 - tCold / tHot;

  // PV diagram points for Carnot cycle
  const nMoles = 1;
  const R = 8.314;
  const gamma = 5 / 3;

  const getCarnotPoints = useCallback(() => {
    const V_A = 1;
    const V_B = 3;
    const V_C = V_B * Math.pow(tHot / tCold, 1 / (gamma - 1));
    const V_D = V_A * Math.pow(tHot / tCold, 1 / (gamma - 1));

    return {
      A: { V: V_A, P: nMoles * R * tHot / V_A },
      B: { V: V_B, P: nMoles * R * tHot / V_B },
      C: { V: V_C, P: nMoles * R * tCold / V_C },
      D: { V: V_D, P: nMoles * R * tCold / V_D },
    };
  }, [tHot, tCold, gamma]);

  // Generate a new efficiency target for challenge mode
  const newChallengeTarget = useCallback(() => {
    const targets = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75];
    setTargetEff(targets[Math.floor(Math.random() * targets.length)]);
    progressRef.current = 0;
    cycleCountRef.current = 0;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const progress = progressRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const pts = getCarnotPoints();

    // --- Left: PV Diagram ---
    const pvX = 60;
    const pvY = 40;
    const pvW = W * 0.35 - 40;
    const pvH = H - 80;

    // Find ranges
    const allV = [pts.A.V, pts.B.V, pts.C.V, pts.D.V];
    const allP = [pts.A.P, pts.B.P, pts.C.P, pts.D.P];
    const maxV = Math.max(...allV) * 1.15;
    const maxP = Math.max(...allP) * 1.15;

    const toX = (v: number) => pvX + (v / maxV) * pvW;
    const toY = (p: number) => pvY + pvH - (p / maxP) * pvH;

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pvX, pvY);
    ctx.lineTo(pvX, pvY + pvH);
    ctx.lineTo(pvX + pvW, pvY + pvH);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("V (m^3)", pvX + pvW / 2, pvY + pvH + 20);
    ctx.save();
    ctx.translate(pvX - 25, pvY + pvH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("P (Pa)", 0, 0);
    ctx.restore();

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(pvX, pvY + (pvH * i) / 6);
      ctx.lineTo(pvX + pvW, pvY + (pvH * i) / 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pvX + (pvW * i) / 6, pvY);
      ctx.lineTo(pvX + (pvW * i) / 6, pvY + pvH);
      ctx.stroke();
    }

    // Draw cycle path with shading
    ctx.fillStyle = "rgba(139,92,246,0.08)";
    ctx.beginPath();
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.A.V + (pts.B.V - pts.A.V) * f;
      const p = nMoles * R * tHot / v;
      if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
    }
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.B.V + (pts.C.V - pts.B.V) * f;
      const t = tHot * Math.pow(pts.B.V / v, gamma - 1);
      const p = nMoles * R * t / v;
      ctx.lineTo(toX(v), toY(p));
    }
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.C.V + (pts.D.V - pts.C.V) * f;
      const p = nMoles * R * tCold / v;
      ctx.lineTo(toX(v), toY(p));
    }
    for (let f = 0; f <= 1; f += 0.02) {
      const v = pts.D.V + (pts.A.V - pts.D.V) * f;
      const t = tCold * Math.pow(pts.D.V / v, gamma - 1);
      const p = nMoles * R * t / v;
      ctx.lineTo(toX(v), toY(p));
    }
    ctx.closePath();
    ctx.fill();

    // Draw cycle lines
    const stageColors = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];
    const stageNames = ["Isothermal Expansion", "Adiabatic Expansion", "Isothermal Compression", "Adiabatic Compression"];

    const segments: Array<{ start: typeof pts.A; end: typeof pts.A; isothermal: boolean; T?: number; startV: number }> = [
      { start: pts.A, end: pts.B, isothermal: true, T: tHot, startV: pts.A.V },
      { start: pts.B, end: pts.C, isothermal: false, startV: pts.B.V },
      { start: pts.C, end: pts.D, isothermal: true, T: tCold, startV: pts.C.V },
      { start: pts.D, end: pts.A, isothermal: false, startV: pts.D.V },
    ];

    segments.forEach((seg, idx) => {
      const active = progress >= idx && progress < idx + 1;
      ctx.strokeStyle = stageColors[idx];
      ctx.lineWidth = active ? 3 : 2;
      ctx.shadowColor = active ? stageColors[idx] : "rgba(0,0,0,0)";
      ctx.shadowBlur = active ? 8 : 0;
      ctx.beginPath();
      for (let f = 0; f <= 1; f += 0.02) {
        const v = seg.start.V + (seg.end.V - seg.start.V) * f;
        let p: number;
        if (seg.isothermal && seg.T !== undefined) {
          p = nMoles * R * seg.T / v;
        } else {
          const tStart = idx === 1 ? tHot : tCold;
          const curT = tStart * Math.pow(seg.startV / v, gamma - 1);
          p = nMoles * R * curT / v;
        }
        if (f === 0) ctx.moveTo(toX(v), toY(p)); else ctx.lineTo(toX(v), toY(p));
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Current position indicator
    const stage = Math.floor(progress) % 4;
    const frac = progress - stage;
    let curV = 0, curP = 0;

    if (stage === 0) {
      curV = pts.A.V + (pts.B.V - pts.A.V) * frac;
      curP = nMoles * R * tHot / curV;
    } else if (stage === 1) {
      curV = pts.B.V + (pts.C.V - pts.B.V) * frac;
      const curT = tHot * Math.pow(pts.B.V / curV, gamma - 1);
      curP = nMoles * R * curT / curV;
    } else if (stage === 2) {
      curV = pts.C.V + (pts.D.V - pts.C.V) * frac;
      curP = nMoles * R * tCold / curV;
    } else {
      curV = pts.D.V + (pts.A.V - pts.D.V) * frac;
      const curT = tCold * Math.pow(pts.D.V / curV, gamma - 1);
      curP = nMoles * R * curT / curV;
    }

    // Dot glow
    const dotGrad = ctx.createRadialGradient(toX(curV), toY(curP), 0, toX(curV), toY(curP), 15);
    dotGrad.addColorStop(0, `${stageColors[stage]}80`);
    dotGrad.addColorStop(1, `${stageColors[stage]}00`);
    ctx.fillStyle = dotGrad;
    ctx.beginPath();
    ctx.arc(toX(curV), toY(curP), 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(toX(curV), toY(curP), 5, 0, Math.PI * 2);
    ctx.fill();

    // Point labels
    const pointNames = ["A", "B", "C", "D"];
    const pointArr = [pts.A, pts.B, pts.C, pts.D];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(pointNames[i], toX(pointArr[i].V), toY(pointArr[i].P) - 10);
    }

    // --- Center: Animated Piston ---
    const pistonCX = W * 0.43;
    const pistonCY = H * 0.5;
    const pistonW2 = W * 0.14;
    const pistonH2 = H * 0.65;

    // Update piston position based on current volume
    const vRange = Math.max(...allV) - Math.min(...allV);
    const vMin = Math.min(...allV);
    pistonPosRef.current = (curV - vMin) / vRange;
    const pPos = pistonPosRef.current;

    // Cylinder body
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    const cylX = pistonCX - pistonW2 / 2;
    const cylY = pistonCY - pistonH2 / 2;
    ctx.beginPath();
    ctx.moveTo(cylX, cylY);
    ctx.lineTo(cylX, cylY + pistonH2);
    ctx.lineTo(cylX + pistonW2, cylY + pistonH2);
    ctx.lineTo(cylX + pistonW2, cylY);
    ctx.stroke();

    // Piston head
    const pistonY = cylY + pistonH2 * (1 - pPos) * 0.7 + pistonH2 * 0.05;
    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.fillRect(cylX + 2, pistonY, pistonW2 - 4, 12);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(cylX + 2, pistonY, pistonW2 - 4, 12);

    // Piston rod
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pistonCX, pistonY);
    ctx.lineTo(pistonCX, cylY - 15);
    ctx.stroke();

    // Flywheel
    const fwX = pistonCX;
    const fwY = cylY - 30;
    const fwR = 12;
    const angle = timeRef.current * 3;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fwX, fwY, fwR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(fwX + Math.cos(angle) * fwR * 0.7, fwY + Math.sin(angle) * fwR * 0.7, 3, 0, Math.PI * 2);
    ctx.fill();

    // Gas molecules in cylinder
    const gasTop = pistonY + 14;
    const gasBot = cylY + pistonH2 - 2;
    const gasH = gasBot - gasTop;
    if (gasH > 5) {
      // Temperature-based color
      const tFrac = (stage === 0 || stage === 1) ? 1 : (stage === 2 || stage === 3) ? 0 :
        (stage === 0 ? 1 : (stage === 1 ? 1 - frac : (stage === 2 ? 0 : frac)));
      const gasColor = tFrac > 0.5 ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)";
      ctx.fillStyle = gasColor;
      ctx.fillRect(cylX + 3, gasTop, pistonW2 - 6, gasH);

      // Animated gas particles
      const numDots = Math.floor(6 + pPos * 8);
      for (let i = 0; i < numDots; i++) {
        const seed = i * 137.508;
        const mx = cylX + 8 + ((seed + timeRef.current * 80 * (1 + tFrac)) % (pistonW2 - 16));
        const my = gasTop + 4 + ((seed * 1.3 + timeRef.current * 60 * (1 + tFrac)) % Math.max(4, gasH - 8));
        ctx.fillStyle = tFrac > 0.5 ? "rgba(252,165,165,0.7)" : "rgba(147,197,253,0.7)";
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Heat source/sink indicators
    // Hot reservoir (bottom during expansion)
    if (stage === 0) {
      ctx.save();
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 12;
      ctx.fillRect(cylX - 5, cylY + pistonH2, pistonW2 + 10, 8);
      ctx.restore();
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText("HOT", pistonCX, cylY + pistonH2 + 20);
    } else if (stage === 2) {
      ctx.save();
      ctx.fillStyle = "rgba(59,130,246,0.2)";
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 12;
      ctx.fillRect(cylX - 5, cylY + pistonH2, pistonW2 + 10, 8);
      ctx.restore();
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "center";
      ctx.fillText("COLD", pistonCX, cylY + pistonH2 + 20);
    }

    // Stage label under piston
    ctx.font = "bold 9px ui-monospace";
    ctx.fillStyle = stageColors[stage];
    ctx.textAlign = "center";
    ctx.fillText(stageNames[stage], pistonCX, cylY + pistonH2 + 34);

    // --- Right: Info panel ---
    const panelX = W * 0.6;
    const panelW2 = W * 0.38;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(panelX, 15, panelW2, H - 30, 10);
    ctx.fill();

    let y = 38;
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CARNOT ENGINE", panelX + 15, y);
    y += 25;

    // Current stage
    ctx.fillStyle = stageColors[stage];
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillText(`Stage: ${stageNames[stage]}`, panelX + 15, y);
    y += 22;

    // Temperatures
    ctx.fillStyle = "#ef4444";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(`T_hot  = ${tHot} K`, panelX + 15, y);
    y += 18;
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`T_cold = ${tCold} K`, panelX + 15, y);
    y += 22;

    // Efficiency
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.fillText(`eta = ${(efficiency * 100).toFixed(1)}%`, panelX + 15, y);
    y += 20;

    // Work output meter
    const Q_H = nMoles * R * tHot * Math.log(pts.B.V / pts.A.V);
    const Q_C = nMoles * R * tCold * Math.log(pts.C.V / pts.D.V);
    const W_net = Q_H - Q_C;

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("Work Output", panelX + 15, y);
    y += 4;
    drawMeter(ctx, panelX + 15, y, panelW2 - 30, 14, Math.abs(W_net), Math.abs(Q_H), "#fbbf24",
      `${W_net.toFixed(0)} / ${Q_H.toFixed(0)} J`);
    y += 26;

    // Heat values
    ctx.fillStyle = "#ef4444";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`Q_H = ${Q_H.toFixed(0)} J`, panelX + 15, y);
    y += 16;
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`Q_C = ${Q_C.toFixed(0)} J`, panelX + 15, y);
    y += 16;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`W_net = ${W_net.toFixed(0)} J`, panelX + 15, y);
    y += 18;

    // Current state
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`V = ${curV.toFixed(2)} m^3`, panelX + 15, y);
    y += 14;
    ctx.fillText(`P = ${curP.toFixed(0)} Pa`, panelX + 15, y);
    y += 14;
    ctx.fillText(`Cycles: ${cycleCountRef.current}`, panelX + 15, y);
    y += 18;

    // Legend
    ctx.font = "9px ui-monospace, monospace";
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = stageColors[i];
      ctx.fillRect(panelX + 15, y - 7, 10, 10);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(stageNames[i], panelX + 30, y);
      y += 14;
    }

    // --- Challenge mode overlay ---
    if (engineMode === "challenge") {
      renderScoreboard(ctx, W - 155, 12, 140, 110, challengeRef.current);

      // Target efficiency display
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(pvX, pvY - 30, pvW, 24, 6);
      ctx.fill();
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`TARGET: eta = ${(targetEff * 100).toFixed(0)}%`, pvX + pvW / 2, pvY - 13);
    }

    // --- Comparison mode overlay ---
    if (engineMode === "comparison" && showComparison) {
      const compX = pvX;
      const compY = pvY - 5;
      const barH2 = 18;
      const barW2 = pvW;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(compX - 5, compY - 18, barW2 + 10, REAL_ENGINES.length * (barH2 + 6) + 50, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("REAL vs CARNOT EFFICIENCY", compX + 5, compY);

      REAL_ENGINES.forEach((eng, idx) => {
        const ey = compY + 14 + idx * (barH2 + 6);
        const carnotEff = 1 - eng.tCold / eng.tHot;

        // Engine name
        ctx.fillStyle = eng.color;
        ctx.font = "9px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(eng.name, compX + 5, ey);

        // Carnot bar (background)
        const carnW = carnotEff * barW2 * 0.8;
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.roundRect(compX + 5, ey + 3, barW2 * 0.8, barH2 - 6, 3);
        ctx.fill();

        // Carnot efficiency line
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(compX + 5 + carnW, ey + 3);
        ctx.lineTo(compX + 5 + carnW, ey + barH2 - 3);
        ctx.stroke();
        ctx.setLineDash([]);

        // Real efficiency bar
        const realW = eng.realEff * barW2 * 0.8;
        ctx.fillStyle = eng.color;
        ctx.beginPath();
        ctx.roundRect(compX + 5, ey + 3, realW, barH2 - 6, 3);
        ctx.fill();

        // Percentages
        ctx.font = "8px ui-monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "right";
        ctx.fillText(`${(eng.realEff * 100).toFixed(0)}% / ${(carnotEff * 100).toFixed(0)}%`, compX + barW2 * 0.85, ey + barH2 - 4);
      });
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, performance.now())
    );
  }, [tHot, tCold, efficiency, getCarnotPoints, gamma, engineMode, targetEff, showComparison]);

  const animate = useCallback(() => {
    progressRef.current += 0.008;
    if (progressRef.current >= 4) {
      progressRef.current = 0;
      cycleCountRef.current += 1;

      const pts = getCarnotPoints();
      const Q_H = nMoles * R * tHot * Math.log(pts.B.V / pts.A.V);
      const Q_C = nMoles * R * tCold * Math.log(pts.C.V / pts.D.V);
      totalWorkRef.current += Q_H - Q_C;

      // Challenge mode: check after each cycle
      if (engineMode === "challenge" && cycleCountRef.current > 0 && cycleCountRef.current % 3 === 0) {
        // Auto-evaluate
      }
    }
    timeRef.current += 0.016;

    particlesRef.current.update(0.016);

    // Emit heat particles
    const canvas = canvasRef.current;
    if (canvas) {
      const stage = Math.floor(progressRef.current) % 4;
      const pistonCX = canvas.width * 0.43;
      const cylBot = canvas.height * 0.5 + canvas.height * 0.65 / 2;
      if (stage === 0 && Math.random() < 0.15) {
        particlesRef.current.emit(pistonCX + (Math.random() - 0.5) * 40, cylBot + 5, 1, "#ef4444", {
          speed: 30, lifetime: 0.6, size: 3, gravity: 40, shape: "circle", angle: Math.PI / 2, spread: 0.5,
        });
      } else if (stage === 2 && Math.random() < 0.15) {
        particlesRef.current.emit(pistonCX + (Math.random() - 0.5) * 40, cylBot + 5, 1, "#3b82f6", {
          speed: 30, lifetime: 0.6, size: 3, gravity: -40, shape: "circle", angle: -Math.PI / 2, spread: 0.5,
        });
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, getCarnotPoints, tHot, tCold, engineMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.5), _isMobile ? 500 : 440);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const handleChallengeSubmit = () => {
    const currentEff = efficiency;
    const result = calculateAccuracy(currentEff, targetEff, 1.0);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / 2 : 400;
    const cy2 = canvas ? canvas.height / 2 : 200;
    popupsRef.current.push({
      text: `${result.label} (${(currentEff * 100).toFixed(1)}% vs ${(targetEff * 100).toFixed(0)}%)`,
      points: result.points,
      x: cx,
      y: cy2,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(cx, cy2, 20);
    } else {
      playSFX("incorrect");
    }

    setTimeout(() => newChallengeTarget(), 1500);
  };

  const switchMode = (newMode: EngineMode) => {
    setEngineMode(newMode);
    progressRef.current = 0;
    cycleCountRef.current = 0;
    totalWorkRef.current = 0;
    if (newMode === "challenge") {
      challengeRef.current = createChallengeState();
      challengeRef.current.active = true;
      newChallengeTarget();
    }
    if (newMode === "comparison") {
      setShowComparison(true);
    } else {
      setShowComparison(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "challenge", "comparison"] as EngineMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              engineMode === m
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {m === "sandbox" ? "Sandbox" : m === "challenge" ? "Efficiency Challenge" : "Real Engine Comparison"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Challenge mode submit */}
      {engineMode === "challenge" && (
        <div className="rounded-xl border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
            Adjust T_hot and T_cold to achieve the target Carnot efficiency of{" "}
            <span className="font-bold">{(targetEff * 100).toFixed(0)}%</span>.
            Your current efficiency is{" "}
            <span className="font-bold">{(efficiency * 100).toFixed(1)}%</span>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleChallengeSubmit}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Lock In Efficiency
            </button>
            <button
              onClick={newChallengeTarget}
              className="px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              Skip
            </button>
          </div>
          {challengeRef.current.lastResult && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Last: {challengeRef.current.lastResult.label} | Score: {challengeRef.current.score} | Streak: {challengeRef.current.streak}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">T_hot (K)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={400} max={1500} step={10} value={tHot}
              onChange={(e) => setTHot(Number(e.target.value))}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{tHot}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">T_cold (K)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={200} max={tHot - 50} step={10} value={tCold}
              onChange={(e) => setTCold(Number(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{tCold}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={() => { progressRef.current = 0; cycleCountRef.current = 0; totalWorkRef.current = 0; draw(); }}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset Cycle
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\eta_{Carnot} = 1 - \frac{T_C}{T_H}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="W = Q_H - Q_C" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\eta = W/Q_H" /> = {(efficiency * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}
