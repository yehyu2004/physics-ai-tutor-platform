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
import { drawMeter } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

// Material definitions with real specific heats
interface Material {
  name: string;
  label: string;
  specificHeat: number; // J/(kg*C)
  color: string;
  icon: string;
}

const MATERIALS: Material[] = [
  { name: "water", label: "Water", specificHeat: 4186, color: "#3b82f6", icon: "H\u2082O" },
  { name: "aluminum", label: "Aluminum", specificHeat: 900, color: "#94a3b8", icon: "Al" },
  { name: "iron", label: "Iron", specificHeat: 449, color: "#78716c", icon: "Fe" },
  { name: "copper", label: "Copper", specificHeat: 385, color: "#f59e0b", icon: "Cu" },
];

// Heat flow particle between objects
interface HeatParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export default function ThermalEquilibrium() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [t1, setT1] = useState(90); // Object 1 initial temp (C)
  const [t2, setT2] = useState(20); // Object 2 initial temp (C)
  const [m1, setM1] = useState(2); // mass 1 (kg)
  const [m2, setM2] = useState(3); // mass 2 (kg)
  const [mat1Idx, setMat1Idx] = useState(1); // aluminum
  const [mat2Idx, setMat2Idx] = useState(0); // water
  const [isRunning, setIsRunning] = useState(false); // Start paused, user must click Mix
  const [isMixed, setIsMixed] = useState(false);

  // Challenge mode
  const [challengeMode, setChallengeMode] = useState(false);
  const [prediction, setPrediction] = useState("");
  const [challengeScore, setChallengeScore] = useState(0);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const [predictionLocked, setPredictionLocked] = useState(false);
  const [predictionResult, setPredictionResult] = useState<string | null>(null);

  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const temp1Ref = useRef(t1);
  const temp2Ref = useRef(t2);
  const historyRef = useRef<{ t: number; t1: number; t2: number }[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const heatParticlesRef = useRef<HeatParticle[]>([]);

  // Layout positions
  const layoutRef = useRef({
    b1x: 0, b1y: 0, block1W: 0, block1H: 0,
    b2x: 0, b2y: 0, block2W: 0, block2H: 0,
    objCX: 0, objCY: 0,
  });

  const c1 = MATERIALS[mat1Idx].specificHeat;
  const c2 = MATERIALS[mat2Idx].specificHeat;
  const mat1 = MATERIALS[mat1Idx];
  const mat2 = MATERIALS[mat2Idx];

  // Equilibrium temperature
  const tEq = (m1 * c1 * t1 + m2 * c2 * t2) / (m1 * c1 + m2 * c2);

  // Reset temperatures when params change
  useEffect(() => {
    temp1Ref.current = t1;
    temp2Ref.current = t2;
    historyRef.current = [];
    timeRef.current = 0;
    setIsMixed(false);
    setIsRunning(false);
    heatParticlesRef.current = [];
    setPredictionLocked(false);
    setPredictionResult(null);
  }, [t1, t2, m1, m2, mat1Idx, mat2Idx]);

  const tempToColor = (temp: number): string => {
    // Blue (cold) to red (hot) with smooth transition
    const norm = Math.max(0, Math.min(1, (temp - 0) / 100));
    if (norm < 0.5) {
      // Cold: deep blue to white-blue
      const t2 = norm * 2;
      const r = Math.floor(30 + t2 * 100);
      const g = Math.floor(60 + t2 * 80);
      const b = Math.floor(230 - t2 * 30);
      return `rgb(${r},${g},${b})`;
    } else {
      // Hot: orange to red
      const t2 = (norm - 0.5) * 2;
      const r = Math.floor(200 + t2 * 55);
      const g = Math.floor(140 - t2 * 100);
      const b = Math.floor(80 - t2 * 60);
      return `rgb(${r},${g},${b})`;
    }
  };

  // Emit heat flow particles between objects
  const emitHeatParticles = useCallback(() => {
    const diff = temp1Ref.current - temp2Ref.current;
    if (Math.abs(diff) < 0.5 || !isMixed) return;

    const L = layoutRef.current;
    const count = Math.min(Math.ceil(Math.abs(diff) / 15), 3);

    for (let i = 0; i < count; i++) {
      const fromHot = diff > 0;
      const sx = fromHot ? L.b1x + L.block1W : L.b2x;
      const sy = L.objCY + (Math.random() - 0.5) * Math.min(L.block1H, L.block2H) * 0.6;
      const tx = fromHot ? L.b2x : L.b1x + L.block1W;
      const dist = Math.abs(tx - sx);

      heatParticlesRef.current.push({
        x: sx,
        y: sy,
        vx: ((tx - sx) / dist) * (80 + Math.random() * 40),
        vy: (Math.random() - 0.5) * 30,
        life: 1.2,
        maxLife: 1.2,
        size: 3 + Math.random() * 2,
      });
    }

    // Limit particle count
    if (heatParticlesRef.current.length > 80) {
      heatParticlesRef.current.splice(0, heatParticlesRef.current.length - 80);
    }
  }, [isMixed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cur1 = temp1Ref.current;
    const cur2 = temp2Ref.current;
    const time = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // --- Left: Objects visualization ---
    const objW = W * 0.5;
    const objCX = objW * 0.5;
    const objCY = H * 0.5;

    // Object 1 (material block)
    const block1W = 70 + m1 * 10;
    const block1H = 50 + m1 * 8;
    const b1x = isMixed ? objCX - block1W / 2 - 2 : objCX - block1W - 25;
    const b1y = objCY - block1H / 2;

    // Object 2
    const block2W = 70 + m2 * 10;
    const block2H = 50 + m2 * 8;
    const b2x = isMixed ? objCX - block2W / 2 + 2 : objCX + 25;
    const b2y = objCY - block2H / 2;

    // Store layout for interactions
    layoutRef.current = {
      b1x, b1y, block1W, block1H,
      b2x, b2y, block2W, block2H,
      objCX, objCY,
    };

    // --- Temperature-based glow effect ---
    // Object 1 glow
    const glowR1 = block1W * 1.3;
    const glow1 = ctx.createRadialGradient(
      b1x + block1W / 2, b1y + block1H / 2, 0,
      b1x + block1W / 2, b1y + block1H / 2, glowR1,
    );
    const c1rgb = tempToColor(cur1).match(/\d+/g)!;
    const glowIntensity1 = 0.15 + (cur1 / 100) * 0.2;
    glow1.addColorStop(0, `rgba(${c1rgb[0]},${c1rgb[1]},${c1rgb[2]},${glowIntensity1})`);
    glow1.addColorStop(1, `rgba(${c1rgb[0]},${c1rgb[1]},${c1rgb[2]},0)`);
    ctx.fillStyle = glow1;
    ctx.beginPath();
    ctx.arc(b1x + block1W / 2, b1y + block1H / 2, glowR1, 0, Math.PI * 2);
    ctx.fill();

    // Object 2 glow
    const glowR2 = block2W * 1.3;
    const glow2 = ctx.createRadialGradient(
      b2x + block2W / 2, b2y + block2H / 2, 0,
      b2x + block2W / 2, b2y + block2H / 2, glowR2,
    );
    const c2rgb = tempToColor(cur2).match(/\d+/g)!;
    const glowIntensity2 = 0.15 + (cur2 / 100) * 0.2;
    glow2.addColorStop(0, `rgba(${c2rgb[0]},${c2rgb[1]},${c2rgb[2]},${glowIntensity2})`);
    glow2.addColorStop(1, `rgba(${c2rgb[0]},${c2rgb[1]},${c2rgb[2]},0)`);
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(b2x + block2W / 2, b2y + block2H / 2, glowR2, 0, Math.PI * 2);
    ctx.fill();

    // Draw Object 1 (with temperature color)
    const obj1Color = tempToColor(cur1);
    const obj1Grad = ctx.createLinearGradient(b1x, b1y, b1x + block1W, b1y + block1H);
    obj1Grad.addColorStop(0, obj1Color);
    const c1darker = tempToColor(cur1 * 0.85);
    obj1Grad.addColorStop(1, c1darker);
    ctx.fillStyle = obj1Grad;
    ctx.beginPath();
    ctx.roundRect(b1x, b1y, block1W, block1H, 6);
    ctx.fill();

    // Shimmer effect for hot objects
    if (cur1 > 60) {
      const shimmer = 0.05 + Math.sin(time * 5) * 0.03;
      ctx.fillStyle = `rgba(255,255,200,${shimmer})`;
      ctx.beginPath();
      ctx.roundRect(b1x, b1y, block1W, block1H, 6);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(b1x, b1y, block1W, block1H, 6);
    ctx.stroke();

    // Material-specific texture for object 1
    if (mat1.name === "water") {
      // Wave effect
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let x = b1x + 5; x < b1x + block1W - 5; x += 2) {
          const wy = b1y + block1H * 0.3 + i * 12 + Math.sin((x - b1x) * 0.1 + time * 2 + i) * 3;
          if (x === b1x + 5) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
    } else {
      // Metal grain pattern
      ctx.strokeStyle = `rgba(255,255,255,0.06)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        const lx = b1x + block1W * (0.2 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(lx, b1y + 4);
        ctx.lineTo(lx + (Math.random() - 0.5) * 4, b1y + block1H - 4);
        ctx.stroke();
      }
    }

    // Object 1 labels
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(mat1.icon, b1x + block1W / 2, b1y + block1H / 2 - 8);
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillText(`${cur1.toFixed(1)}\u00B0C`, b1x + block1W / 2, b1y + block1H / 2 + 10);

    // Draw Object 2 (with temperature color)
    const obj2Color = tempToColor(cur2);
    const obj2Grad = ctx.createLinearGradient(b2x, b2y, b2x + block2W, b2y + block2H);
    obj2Grad.addColorStop(0, obj2Color);
    const c2darker = tempToColor(cur2 * 0.85);
    obj2Grad.addColorStop(1, c2darker);
    ctx.fillStyle = obj2Grad;
    ctx.beginPath();
    ctx.roundRect(b2x, b2y, block2W, block2H, 6);
    ctx.fill();

    // Shimmer effect for hot objects
    if (cur2 > 60) {
      const shimmer = 0.05 + Math.sin(time * 5 + 1) * 0.03;
      ctx.fillStyle = `rgba(255,255,200,${shimmer})`;
      ctx.beginPath();
      ctx.roundRect(b2x, b2y, block2W, block2H, 6);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(b2x, b2y, block2W, block2H, 6);
    ctx.stroke();

    // Material-specific texture for object 2
    if (mat2.name === "water") {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let x = b2x + 5; x < b2x + block2W - 5; x += 2) {
          const wy = b2y + block2H * 0.3 + i * 12 + Math.sin((x - b2x) * 0.1 + time * 2 + i) * 3;
          if (x === b2x + 5) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = `rgba(255,255,255,0.06)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        const lx = b2x + block2W * (0.2 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(lx, b2y + 4);
        ctx.lineTo(lx + (Math.random() - 0.5) * 4, b2y + block2H - 4);
        ctx.stroke();
      }
    }

    // Object 2 labels
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(mat2.icon, b2x + block2W / 2, b2y + block2H / 2 - 8);
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillText(`${cur2.toFixed(1)}\u00B0C`, b2x + block2W / 2, b2y + block2H / 2 + 10);

    // --- Heat flow particles ---
    const hParticles = heatParticlesRef.current;
    const diff = cur1 - cur2;
    for (const hp of hParticles) {
      const alphaFrac = hp.life / hp.maxLife;
      const hotColor = diff > 0;

      // Particle glow
      const pglow = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, hp.size * 2);
      if (hotColor) {
        pglow.addColorStop(0, `rgba(255,100,50,${alphaFrac * 0.8})`);
        pglow.addColorStop(0.5, `rgba(255,60,20,${alphaFrac * 0.4})`);
        pglow.addColorStop(1, `rgba(255,60,20,0)`);
      } else {
        pglow.addColorStop(0, `rgba(100,150,255,${alphaFrac * 0.8})`);
        pglow.addColorStop(0.5, `rgba(60,100,255,${alphaFrac * 0.4})`);
        pglow.addColorStop(1, `rgba(60,100,255,0)`);
      }
      ctx.fillStyle = pglow;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, hp.size * 2, 0, Math.PI * 2);
      ctx.fill();

      // Bright center
      ctx.fillStyle = hotColor
        ? `rgba(255,200,100,${alphaFrac})`
        : `rgba(150,200,255,${alphaFrac})`;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, hp.size * alphaFrac, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heat flow direction arrows (when not mixed yet)
    if (!isMixed && Math.abs(t1 - t2) > 5) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Click Mix! to start", objCX, objCY + Math.max(block1H, block2H) / 2 + 40);
    } else if (isMixed && Math.abs(diff) > 0.5) {
      // Animated Q label
      const arrowAlpha = 0.4 + Math.abs(Math.sin(time * 3)) * 0.4;

      // Direction arrow
      const arrowX1 = diff > 0 ? b1x + block1W + 5 : b2x - 5;
      const arrowX2 = diff > 0 ? b2x - 5 : b1x + block1W + 5;

      if (!isMixed || Math.abs(b1x + block1W - b2x) > 10) {
        ctx.strokeStyle = diff > 0 ? `rgba(255,100,50,${arrowAlpha})` : `rgba(100,150,255,${arrowAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(arrowX1, objCY);
        ctx.lineTo(arrowX2, objCY);
        ctx.stroke();

        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        if (diff > 0) {
          ctx.moveTo(arrowX2 + 6, objCY);
          ctx.lineTo(arrowX2 - 2, objCY - 5);
          ctx.lineTo(arrowX2 - 2, objCY + 5);
        } else {
          ctx.moveTo(arrowX2 - 6, objCY);
          ctx.lineTo(arrowX2 + 2, objCY - 5);
          ctx.lineTo(arrowX2 + 2, objCY + 5);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("Q \u2192", objCX, objCY + Math.max(block1H, block2H) / 2 + 25);
    } else if (isMixed && Math.abs(diff) <= 0.5) {
      // Equilibrium reached
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      const eqPulse = 0.7 + Math.sin(time * 2) * 0.3;
      ctx.globalAlpha = eqPulse;
      ctx.fillText("EQUILIBRIUM REACHED", objCX, objCY + Math.max(block1H, block2H) / 2 + 25);
      ctx.globalAlpha = 1;
    }

    // Labels below objects
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(`${mat1.label} ${m1}kg`, b1x + block1W / 2, b1y - 14);
    ctx.fillText(`c=${c1} J/kg\u00B0C`, b1x + block1W / 2, b1y - 4);
    ctx.fillText(`${mat2.label} ${m2}kg`, b2x + block2W / 2, b2y - 14);
    ctx.fillText(`c=${c2} J/kg\u00B0C`, b2x + block2W / 2, b2y - 4);

    // Temperature color scale legend (bottom left)
    const scaleX = 15;
    const scaleY = H - 30;
    const scaleW = objW - 30;
    const scaleH = 8;
    const gradient = ctx.createLinearGradient(scaleX, 0, scaleX + scaleW, 0);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      gradient.addColorStop(t, tempToColor(t * 100));
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(scaleX, scaleY, scaleW, scaleH, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("0\u00B0C", scaleX, scaleY + 18);
    ctx.textAlign = "right";
    ctx.fillText("100\u00B0C", scaleX + scaleW, scaleY + 18);
    ctx.textAlign = "center";
    ctx.fillText("50\u00B0C", scaleX + scaleW / 2, scaleY + 18);

    // --- Right: Temperature graph ---
    const graphX = objW + 30;
    const graphW2 = W - graphX - 25;
    const graphTop = 30;
    const graphH2 = H - 80;
    const history = historyRef.current;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 10, graphTop - 10, graphW2 + 20, graphH2 + 50, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("TEMPERATURE vs TIME", graphX, graphTop + 8);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphTop + 20);
    ctx.lineTo(graphX, graphTop + graphH2);
    ctx.lineTo(graphX + graphW2, graphTop + graphH2);
    ctx.stroke();

    // Y-axis labels
    const maxTemp = Math.max(t1, t2) + 5;
    const minTemp = Math.min(t1, t2) - 5;
    const tRange = maxTemp - minTemp;

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "right";
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const t = minTemp + (tRange / ySteps) * i;
      const yp = graphTop + graphH2 - ((t - minTemp) / tRange) * (graphH2 - 25);
      ctx.fillText(`${t.toFixed(0)}\u00B0`, graphX - 4, yp + 3);
      // Grid line
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(graphX, yp);
      ctx.lineTo(graphX + graphW2, yp);
      ctx.stroke();
    }

    // Equilibrium line
    const eqY = graphTop + graphH2 - ((tEq - minTemp) / tRange) * (graphH2 - 25);
    ctx.strokeStyle = "rgba(251,191,36,0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, eqY);
    ctx.lineTo(graphX + graphW2, eqY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 9px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`T_eq = ${tEq.toFixed(1)}\u00B0C`, graphX + graphW2 - 90, eqY - 5);

    if (history.length > 1) {
      const maxTime = Math.max(history[history.length - 1].t, 1);

      // T1 line with color gradient based on temperature
      ctx.lineWidth = 2.5;
      ctx.shadowColor = `rgba(${c1rgb[0]},${c1rgb[1]},${c1rgb[2]},0.4)`;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = tempToColor(cur1);
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxTime) * graphW2;
        const py = graphTop + graphH2 - ((history[i].t1 - minTemp) / tRange) * (graphH2 - 25);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // T2 line
      ctx.strokeStyle = tempToColor(cur2);
      ctx.lineWidth = 2.5;
      ctx.shadowColor = `rgba(${c2rgb[0]},${c2rgb[1]},${c2rgb[2]},0.4)`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxTime) * graphW2;
        const py = graphTop + graphH2 - ((history[i].t2 - minTemp) / tRange) * (graphH2 - 25);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Current point indicators
      const lastH = history[history.length - 1];
      const cpx1 = graphX + (lastH.t / maxTime) * graphW2;
      const cpy1 = graphTop + graphH2 - ((lastH.t1 - minTemp) / tRange) * (graphH2 - 25);
      const cpx2 = graphX + (lastH.t / maxTime) * graphW2;
      const cpy2 = graphTop + graphH2 - ((lastH.t2 - minTemp) / tRange) * (graphH2 - 25);

      // Pulsing dots
      const dotPulse = 3 + Math.sin(time * 4) * 1;
      ctx.fillStyle = tempToColor(cur1);
      ctx.beginPath();
      ctx.arc(cpx1, cpy1, dotPulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tempToColor(cur2);
      ctx.beginPath();
      ctx.arc(cpx2, cpy2, dotPulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // Legend
    ctx.fillStyle = tempToColor(cur1);
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`T1 (${mat1.icon})`, graphX + 5, graphTop + graphH2 + 18);
    ctx.fillStyle = tempToColor(cur2);
    ctx.fillText(`T2 (${mat2.icon})`, graphX + 85, graphTop + graphH2 + 18);

    // Energy transferred bar
    if (isMixed && history.length > 0) {
      const qTransferred = Math.abs(m1 * c1 * (temp1Ref.current - t1));
      const maxQ = Math.abs(m1 * c1 * (t1 - tEq)) * 1.2;
      const barY = graphTop + graphH2 + 28;

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("HEAT TRANSFERRED", graphX, barY);

      drawMeter(
        ctx, graphX, barY + 10, graphW2, 10, qTransferred, maxQ, "#f59e0b",
        `Q = ${qTransferred.toFixed(0)} J`,
      );
    }

    // --- Particle system ---
    particlesRef.current.draw(ctx);

    // --- Score popups ---
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Challenge mode prediction indicator
    if (challengeMode && predictionLocked && predictionResult === null) {
      ctx.fillStyle = "rgba(245,158,11,0.15)";
      ctx.beginPath();
      ctx.roundRect(graphX - 5, graphTop + graphH2 + 44, graphW2 + 10, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`Your prediction: ${prediction}\u00B0C`, graphX + graphW2 / 2, graphTop + graphH2 + 58);
    }
  }, [t1, t2, m1, m2, c1, c2, tEq, mat1, mat2, isMixed, challengeMode, predictionLocked, predictionResult, prediction]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;

    if (isMixed) {
      // Newton's law of cooling between two objects
      const k = 50; // heat transfer coefficient
      const diff = temp1Ref.current - temp2Ref.current;
      const dQ = k * diff * dt;

      temp1Ref.current -= dQ / (m1 * c1);
      temp2Ref.current += dQ / (m2 * c2);

      historyRef.current.push({
        t: timeRef.current,
        t1: temp1Ref.current,
        t2: temp2Ref.current,
      });
      if (historyRef.current.length > 1000) historyRef.current.shift();

      // Emit heat flow particles
      if (Math.random() < 0.3) {
        emitHeatParticles();
      }

      // Check if equilibrium reached for challenge mode
      if (
        challengeMode &&
        predictionLocked &&
        predictionResult === null &&
        Math.abs(diff) < 0.3
      ) {
        // Score the prediction
        const predVal = parseFloat(prediction);
        if (!isNaN(predVal)) {
          const result = calculateAccuracy(predVal, tEq, 100);
          const newState = updateChallengeState(challengeRef.current, result);
          challengeRef.current = newState;
          setChallengeScore(newState.score);
          setChallengeAttempts(newState.attempts);
          setPredictionResult(result.label);

          const canvas = canvasRef.current;
          if (canvas) {
            popupsRef.current.push({
              text: `${result.label} (T_eq = ${tEq.toFixed(1)}\u00B0C)`,
              points: result.points,
              x: canvas.width / 2,
              y: canvas.height * 0.3,
              startTime: performance.now(),
            });

            if (result.points > 0) {
              playSFX("correct");
              playScore(result.points);
              particlesRef.current.emitConfetti(canvas.width / 2, canvas.height * 0.3, 30);
            } else {
              playSFX("incorrect");
            }
          }
        }
      }
    }

    // Update heat flow particles
    const hParticles = heatParticlesRef.current;
    for (let i = hParticles.length - 1; i >= 0; i--) {
      const hp = hParticles[i];
      hp.life -= dt;
      if (hp.life <= 0) {
        hParticles.splice(i, 1);
        continue;
      }
      hp.x += hp.vx * dt;
      hp.y += hp.vy * dt;
      hp.vy += (Math.random() - 0.5) * 50 * dt; // wobble
    }

    // Update particle system
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [m1, m2, c1, c2, draw, isMixed, emitHeatParticles, challengeMode, predictionLocked, predictionResult, prediction, tEq]);

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

  const reset = () => {
    temp1Ref.current = t1;
    temp2Ref.current = t2;
    historyRef.current = [];
    timeRef.current = 0;
    lastTsRef.current = null;
    setIsMixed(false);
    setIsRunning(false);
    heatParticlesRef.current = [];
    setPredictionLocked(false);
    setPredictionResult(null);
    draw();
  };

  const handleMix = () => {
    if (challengeMode && !predictionLocked) {
      // In challenge mode, must predict first
      playSFX("fail");
      return;
    }
    setIsMixed(true);
    setIsRunning(true);
    playSFX("collision");

    // Emit particles at contact point
    const canvas = canvasRef.current;
    if (canvas) {
      const L = layoutRef.current;
      particlesRef.current.emitSparks(L.objCX, L.objCY, 15, "#f59e0b");
    }
  };

  const handlePredictionSubmit = () => {
    const val = parseFloat(prediction);
    if (isNaN(val) || val < 0 || val > 100) return;
    setPredictionLocked(true);
    playSFX("click");
  };

  // Generate new challenge scenario
  const generateNewChallenge = useCallback(() => {
    const newT1 = 20 + Math.floor(Math.random() * 80);
    const newT2 = Math.floor(Math.random() * (newT1 - 10));
    const newM1 = 1 + Math.floor(Math.random() * 9);
    const newM2 = 1 + Math.floor(Math.random() * 9);
    const newMat1 = Math.floor(Math.random() * MATERIALS.length);
    const newMat2 = Math.floor(Math.random() * MATERIALS.length);

    setT1(newT1);
    setT2(Math.max(0, newT2));
    setM1(newM1);
    setM2(newM2);
    setMat1Idx(newMat1);
    setMat2Idx(newMat2);
    setPrediction("");
    setPredictionLocked(false);
    setPredictionResult(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Mix button and challenge controls */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {!isMixed ? (
              <button
                onClick={handleMix}
                disabled={challengeMode && !predictionLocked}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  challengeMode && !predictionLocked
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95"
                }`}
              >
                Mix!
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsRunning(!isRunning)}
                  className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium"
                >
                  {isRunning ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={reset}
                  className="h-9 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Challenge</span>
            <button
              onClick={() => {
                const next = !challengeMode;
                setChallengeMode(next);
                if (next) {
                  challengeRef.current = createChallengeState();
                  setChallengeScore(0);
                  setChallengeAttempts(0);
                  generateNewChallenge();
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                challengeMode
                  ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              {challengeMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Challenge prediction input */}
        {challengeMode && (
          <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Predict the equilibrium temperature before mixing:
            </p>
            <p className="text-xs text-gray-400">
              <span className="font-medium text-gray-600 dark:text-gray-300">
                {mat1.label} ({m1}kg, {t1}&deg;C, c={c1})
              </span>
              {" + "}
              <span className="font-medium text-gray-600 dark:text-gray-300">
                {mat2.label} ({m2}kg, {t2}&deg;C, c={c2})
              </span>
            </p>
            {!predictionLocked ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="T_eq in &deg;C"
                  value={prediction}
                  onChange={(e) => setPrediction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePredictionSubmit()}
                  className="flex-1 h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono"
                />
                <button
                  onClick={handlePredictionSubmit}
                  disabled={!prediction}
                  className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Lock In
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-amber-500 font-bold">
                  Prediction: {prediction}&deg;C
                </span>
                {predictionResult && (
                  <span
                    className={`text-xs font-bold ${
                      predictionResult === "Perfect!" || predictionResult === "Great!" || predictionResult === "Good!"
                        ? "text-green-500"
                        : predictionResult === "Close!"
                        ? "text-amber-500"
                        : "text-red-500"
                    }`}
                  >
                    {predictionResult}
                  </span>
                )}
                {predictionResult && (
                  <button
                    onClick={() => {
                      reset();
                      generateNewChallenge();
                    }}
                    className="text-xs text-blue-500 hover:text-blue-400 font-medium ml-auto"
                  >
                    Next Challenge
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-green-500 font-bold">Score: {challengeScore}</span>
              <span className="text-gray-400">Attempts: {challengeAttempts}</span>
              {challengeRef.current.streak > 0 && (
                <span className="text-amber-500 font-bold">
                  Streak: {challengeRef.current.streak}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            T1 (&deg;C)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={10}
              max={100}
              value={t1}
              onChange={(e) => setT1(Number(e.target.value))}
              disabled={isMixed}
              className="flex-1 accent-red-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {t1}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            T2 (&deg;C)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={0}
              max={90}
              value={t2}
              onChange={(e) => setT2(Number(e.target.value))}
              disabled={isMixed}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {t2}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            m1 (kg)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={1}
              max={10}
              value={m1}
              onChange={(e) => setM1(Number(e.target.value))}
              disabled={isMixed}
              className="flex-1 accent-red-400"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {m1}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            m2 (kg)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={1}
              max={10}
              value={m2}
              onChange={(e) => setM2(Number(e.target.value))}
              disabled={isMixed}
              className="flex-1 accent-blue-400"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {m2}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Material 1
          </label>
          <select
            value={mat1Idx}
            onChange={(e) => setMat1Idx(Number(e.target.value))}
            disabled={isMixed}
            className="mt-1.5 w-full h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 px-2"
          >
            {MATERIALS.map((m, i) => (
              <option key={m.name} value={i}>
                {m.label} (c={m.specificHeat})
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Material 2
          </label>
          <select
            value={mat2Idx}
            onChange={(e) => setMat2Idx(Number(e.target.value))}
            disabled={isMixed}
            className="mt-1.5 w-full h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 px-2"
          >
            {MATERIALS.map((m, i) => (
              <option key={m.name} value={i}>
                {m.label} (c={m.specificHeat})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="Q = mc\Delta T" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="Q_{lost} = Q_{gained}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="T_{eq} = \frac{m_1c_1T_1 + m_2c_2T_2}{m_1c_1 + m_2c_2}" /> = {tEq.toFixed(1)}&deg;C
          </div>
        </div>
      </div>
    </div>
  );
}
