"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { calculateAccuracy } from "@/lib/simulation/scoring";
import { getCanvasMousePos } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

interface Metal {
  name: string;
  workFunction: number; // eV
  color: string;
}

interface Electron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ke: number; // kinetic energy in eV
}

// Individual photon particle
interface Photon {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  arrived: boolean;
  size: number;
}

const METALS: Metal[] = [
  { name: "Cesium", workFunction: 2.1, color: "#b8860b" },
  { name: "Sodium", workFunction: 2.28, color: "#94a3b8" },
  { name: "Copper", workFunction: 4.7, color: "#d97706" },
  { name: "Platinum", workFunction: 5.65, color: "#a1a1aa" },
];

const H_PLANCK = 4.136e-15; // eV·s

function frequencyToColor(freq: number): [number, number, number] {
  // freq in Hz: map to visible spectrum + UV
  // Visible: ~4.3e14 (red 700nm) to ~7.5e14 (violet 400nm)
  // Below 4.3e14: infrared → dark red
  // Above 7.5e14: UV → purple-white
  const f14 = freq / 1e14; // in units of 10^14 Hz

  let r = 0, g = 0, b = 0;

  if (f14 < 4.3) {
    // Infrared / deep red
    r = 180;
    g = 0;
    b = 0;
  } else if (f14 < 5.0) {
    // Red
    r = 255;
    g = 0;
    b = 0;
  } else if (f14 < 5.5) {
    // Orange
    const t = (f14 - 5.0) / 0.5;
    r = 255;
    g = Math.round(165 * t);
    b = 0;
  } else if (f14 < 6.0) {
    // Yellow
    const t = (f14 - 5.5) / 0.5;
    r = 255;
    g = Math.round(165 + 90 * t);
    b = 0;
  } else if (f14 < 6.5) {
    // Green
    const t = (f14 - 6.0) / 0.5;
    r = Math.round(255 * (1 - t));
    g = 255;
    b = 0;
  } else if (f14 < 7.0) {
    // Cyan-Blue
    const t = (f14 - 6.5) / 0.5;
    r = 0;
    g = Math.round(255 * (1 - t));
    b = Math.round(255 * t);
  } else if (f14 < 7.5) {
    // Violet
    const t = (f14 - 7.0) / 0.5;
    r = Math.round(148 * t);
    g = 0;
    b = 255;
  } else {
    // UV: purple-white (increasingly white)
    const t = Math.min((f14 - 7.5) / 5.0, 1);
    r = Math.round(148 + 107 * t);
    g = Math.round(0 + 200 * t);
    b = 255;
  }

  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

export default function PhotoelectricEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const electronsRef = useRef<Electron[]>([]);
  const spawnTimerRef = useRef(0);

  const [frequency, setFrequency] = useState(8.0); // in units of 10^14 Hz
  const [intensity, setIntensity] = useState(5);
  const [selectedMetal, setSelectedMetal] = useState(0); // index into METALS
  const [isRunning, setIsRunning] = useState(true);

  // Challenge mode
  const [workFunctionGuess, setWorkFunctionGuess] = useState("");
  const [planckGuess, setPlanckGuess] = useState("");
  const [wfResult, setWfResult] = useState<string | null>(null);
  const [planckResult, setPlanckResult] = useState<string | null>(null);
  const [totalScore, setTotalScore] = useState(0);

  // Electron KE measurement
  const [measuredElectronKE, setMeasuredElectronKE] = useState<number | null>(null);

  // Photon particles
  const photonsRef = useRef<Photon[]>([]);
  const photonSpawnRef = useRef(0);

  const metal = METALS[selectedMetal];
  const freqHz = frequency * 1e14;
  const photonEnergy = H_PLANCK * freqHz; // eV
  const thresholdFreq = metal.workFunction / H_PLANCK; // Hz
  const thresholdFreq14 = thresholdFreq / 1e14; // in 10^14 Hz
  const keMax = Math.max(0, photonEnergy - metal.workFunction);
  const isEmitting = frequency > thresholdFreq14;

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

    // Layout: left half = experiment, right half = graph
    const dividerX = W * 0.52;

    // ========== LEFT SIDE: Metal surface with incoming light ==========

    const plateY = H * 0.72;
    const plateW = W * 0.32;
    const plateH = 18;
    const plateX = W * 0.1;

    // Metal plate
    ctx.fillStyle = metal.color;
    ctx.fillRect(plateX, plateY, plateW, plateH);
    // Plate highlight
    const plateGrad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
    plateGrad.addColorStop(0, "rgba(255,255,255,0.25)");
    plateGrad.addColorStop(0.5, "rgba(255,255,255,0.0)");
    plateGrad.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = plateGrad;
    ctx.fillRect(plateX, plateY, plateW, plateH);

    // Metal label
    ctx.font = "bold 11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${metal.name} (φ = ${metal.workFunction} eV)`, plateX + plateW / 2, plateY + plateH + 6);

    // Spawn individual photon particles
    photonSpawnRef.current += 1;
    const photonRate = Math.max(3, 15 - intensity * 1.5);
    if (photonSpawnRef.current >= photonRate) {
      photonSpawnRef.current = 0;
      const spawnCount = Math.ceil(intensity / 4);
      for (let pi = 0; pi < spawnCount; pi++) {
        const frac = Math.random();
        const endX = plateX + frac * plateW;
        const startX = plateX - 10 + frac * plateW * 0.3;
        photonsRef.current.push({
          x: startX,
          y: H * 0.05,
          targetX: endX,
          targetY: plateY,
          speed: 3 + Math.random() * 2,
          arrived: false,
          size: 3 + Math.random() * 2,
        });
      }
    }

    // Update and draw photon particles
    const [cr, cg, cb] = frequencyToColor(frequency * 1e14);
    photonsRef.current = photonsRef.current.filter(ph => {
      const dx = ph.targetX - ph.x;
      const dy = ph.targetY - ph.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) {
        // Arrived at metal - create flash
        return false;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      ph.x += nx * ph.speed;
      ph.y += ny * ph.speed;
      return true;
    });

    // Draw photon particles as bright dots
    for (const ph of photonsRef.current) {
      // Photon glow
      const phGlow = ctx.createRadialGradient(ph.x, ph.y, 0, ph.x, ph.y, ph.size * 3);
      phGlow.addColorStop(0, `rgba(${cr},${cg},${cb},0.6)`);
      phGlow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = phGlow;
      ctx.beginPath();
      ctx.arc(ph.x, ph.y, ph.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Photon core
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.9)`;
      ctx.beginPath();
      ctx.arc(ph.x, ph.y, ph.size, 0, Math.PI * 2);
      ctx.fill();

      // Wave packet lines
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.3)`;
      ctx.lineWidth = 1;
      const waveAngle = Math.atan2(ph.targetY - ph.y, ph.targetX - ph.x);
      const perp = waveAngle + Math.PI / 2;
      for (let w = -1; w <= 1; w += 2) {
        ctx.beginPath();
        ctx.moveTo(ph.x + Math.cos(perp) * ph.size * w, ph.y + Math.sin(perp) * ph.size * w);
        ctx.lineTo(ph.x + Math.cos(perp) * ph.size * 2 * w, ph.y + Math.sin(perp) * ph.size * 2 * w);
        ctx.stroke();
      }
    }

    // Light rays coming from top-left hitting the plate (dimmer, as background)
    const lightColor = `rgb(${cr},${cg},${cb})`;
    const numRays = Math.max(3, Math.floor(intensity * 1.2));
    const rayStartX = plateX - 10;
    const rayStartY = H * 0.05;
    const rayEndY = plateY;

    for (let i = 0; i < numRays; i++) {
      const frac = (i + 0.5) / numRays;
      const endX = plateX + frac * plateW;
      const startX = rayStartX + frac * plateW * 0.3;

      // Ray line
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.6)`;
      ctx.lineWidth = 2;
      ctx.shadowColor = `rgba(${cr},${cg},${cb},0.3)`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(startX, rayStartY);
      ctx.lineTo(endX, rayEndY);
      ctx.stroke();

      // Photon arrow heads (animated, moving along rays)
      const arrowCount = 2;
      for (let a = 0; a < arrowCount; a++) {
        const phase = ((t * 0.8 + a * 0.5 + i * 0.2) % 1.2);
        if (phase > 1) continue;
        const px = startX + (endX - startX) * phase;
        const py = rayStartY + (rayEndY - rayStartY) * phase;

        // Arrow direction
        const dx = endX - startX;
        const dy = rayEndY - rayStartY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;

        // Arrowhead
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.moveTo(px + ux * 6, py + uy * 6);
        ctx.lineTo(px - ux * 3 + uy * 4, py - uy * 3 - ux * 4);
        ctx.lineTo(px - ux * 3 - uy * 4, py - uy * 3 + ux * 4);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    // Glow on metal plate where light hits
    const hitGlow = ctx.createRadialGradient(
      plateX + plateW / 2, plateY, 0,
      plateX + plateW / 2, plateY, plateW * 0.6
    );
    hitGlow.addColorStop(0, `rgba(${cr},${cg},${cb},0.2)`);
    hitGlow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = hitGlow;
    ctx.beginPath();
    ctx.arc(plateX + plateW / 2, plateY, plateW * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Electrons
    if (isEmitting) {
      // Spawn electrons
      spawnTimerRef.current += 1;
      const spawnRate = Math.max(2, 12 - intensity);
      if (spawnTimerRef.current >= spawnRate) {
        spawnTimerRef.current = 0;
        const numToSpawn = Math.ceil(intensity / 3);
        for (let i = 0; i < numToSpawn; i++) {
          const spawnX = plateX + Math.random() * plateW;
          const electronKE = Math.random() * keMax; // Random KE up to KE_max
          const speed = Math.sqrt(keMax) * 1.5 + Math.random() * 0.5;
          electronsRef.current.push({
            x: spawnX,
            y: plateY - 2,
            vx: (Math.random() - 0.5) * speed * 0.8,
            vy: -(speed * 0.8 + Math.random() * speed * 0.5),
            life: 1.0,
            ke: electronKE,
          });
        }
      }

      // Update & draw electrons
      electronsRef.current = electronsRef.current.filter((e) => {
        e.x += e.vx;
        e.y += e.vy;
        e.vy += 0.02; // slight gravity
        e.life -= 0.008;
        return e.life > 0 && e.y > -10 && e.x > 0 && e.x < dividerX;
      });

      for (const e of electronsRef.current) {
        const alpha = Math.min(1, e.life * 1.5);
        ctx.fillStyle = `rgba(59,130,246,${alpha})`;
        ctx.shadowColor = "rgba(59,130,246,0.5)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // "e⁻" label near electrons
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("e⁻", plateX + plateW + 8, plateY - 30);
    } else {
      // Clear electrons when below threshold
      electronsRef.current = [];

      // "NO EMISSION" text
      ctx.font = "bold 14px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("NO EMISSION", plateX + plateW / 2, plateY - 40);
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`f < f₀ = ${thresholdFreq14.toFixed(2)} × 10¹⁴ Hz`, plateX + plateW / 2, plateY - 22);
    }

    // Info panel (bottom-left of canvas)
    const panelX = 12;
    const panelY = H - 100;
    const panelW = dividerX * 0.65;
    const panelH = 88;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("PHOTOELECTRIC DATA", panelX + 12, panelY + 8);

    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`E = hf = ${photonEnergy.toFixed(3)} eV`, panelX + 12, panelY + 26);
    ctx.fillText(`φ = ${metal.workFunction.toFixed(2)} eV`, panelX + 12, panelY + 42);
    ctx.fillStyle = isEmitting ? "#22c55e" : "#ef4444";
    ctx.fillText(`KE_max = ${keMax.toFixed(3)} eV`, panelX + 12, panelY + 58);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`f₀ = ${thresholdFreq14.toFixed(2)} × 10¹⁴ Hz`, panelX + 12, panelY + 74);

    // ========== RIGHT SIDE: KE_max vs frequency graph ==========

    const graphMargin = { left: 55, right: 20, top: 35, bottom: 50 };
    const graphX = dividerX + graphMargin.left;
    const graphY = graphMargin.top;
    const graphW = W - dividerX - graphMargin.left - graphMargin.right;
    const graphH = H - graphMargin.top - graphMargin.bottom;

    // Divider line
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, 10);
    ctx.lineTo(dividerX, H - 10);
    ctx.stroke();

    // Graph title
    ctx.font = "bold 12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("KE_max vs Frequency", dividerX + (W - dividerX) / 2, 10);

    // Graph axes
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(graphX, graphY);
    ctx.lineTo(graphX, graphY + graphH);
    ctx.stroke();
    // X-axis
    ctx.beginPath();
    ctx.moveTo(graphX, graphY + graphH);
    ctx.lineTo(graphX + graphW, graphY + graphH);
    ctx.stroke();

    // Axis labels
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("f (× 10¹⁴ Hz)", graphX + graphW / 2, graphY + graphH + 30);

    ctx.save();
    ctx.translate(dividerX + 15, graphY + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("KE_max (eV)", 0, 0);
    ctx.restore();

    // Graph ranges
    const fMin = 2; // 10^14 Hz
    const fMax = 15;
    const keMaxRange = 4.5; // eV

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let fTick = 2; fTick <= 15; fTick += 1) {
      const px = graphX + ((fTick - fMin) / (fMax - fMin)) * graphW;
      ctx.beginPath();
      ctx.moveTo(px, graphY);
      ctx.lineTo(px, graphY + graphH);
      ctx.stroke();

      if (fTick % 2 === 0) {
        ctx.fillStyle = "#64748b";
        ctx.font = "9px ui-monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(fTick.toString(), px, graphY + graphH + 5);
      }
    }
    for (let keTick = 0; keTick <= keMaxRange; keTick += 1) {
      const py = graphY + graphH - (keTick / keMaxRange) * graphH;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.moveTo(graphX, py);
      ctx.lineTo(graphX + graphW, py);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(keTick.toString(), graphX - 6, py);
    }

    // Threshold frequency vertical dashed line
    const threshPx = graphX + ((thresholdFreq14 - fMin) / (fMax - fMin)) * graphW;
    if (threshPx >= graphX && threshPx <= graphX + graphW) {
      ctx.strokeStyle = "rgba(239,68,68,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(threshPx, graphY);
      ctx.lineTo(threshPx, graphY + graphH);
      ctx.stroke();
      ctx.setLineDash([]);

      // f₀ label
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("f₀", threshPx, graphY - 2);
    }

    // KE_max = hf - φ line (only above threshold)
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(34,197,94,0.3)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    let started = false;
    for (let fPlot = fMin; fPlot <= fMax; fPlot += 0.05) {
      const keVal = H_PLANCK * fPlot * 1e14 - metal.workFunction;
      if (keVal < 0) continue;
      const px = graphX + ((fPlot - fMin) / (fMax - fMin)) * graphW;
      const py = graphY + graphH - (keVal / keMaxRange) * graphH;
      if (py < graphY) continue;
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Zero line (KE = 0) below threshold
    ctx.strokeStyle = "rgba(239,68,68,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const zeroY = graphY + graphH;
    const startPx = graphX;
    const endPx = Math.min(threshPx, graphX + graphW);
    if (endPx > startPx) {
      ctx.moveTo(startPx, zeroY);
      ctx.lineTo(endPx, zeroY);
      ctx.stroke();
    }

    // Work function label: -φ on y-axis
    const phiPy = graphY + graphH + (metal.workFunction / keMaxRange) * graphH;
    if (phiPy <= graphY + graphH + 20) {
      // Show -φ intersection hint
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // Extrapolated line dashed
      ctx.strokeStyle = "rgba(34,197,94,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      // From threshold down to y-intercept (f=0 => KE = -φ)
      const f0Px = graphX + ((0 - fMin) / (fMax - fMin)) * graphW;
      const phiIntPy = graphY + graphH + (metal.workFunction / keMaxRange) * graphH;
      const threshKePx = graphX + ((thresholdFreq14 - fMin) / (fMax - fMin)) * graphW;
      if (threshKePx > graphX) {
        ctx.moveTo(threshKePx, zeroY);
        ctx.lineTo(Math.max(graphX, f0Px), Math.min(phiIntPy, graphY + graphH + 15));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Current operating point
    const currentPx = graphX + ((frequency - fMin) / (fMax - fMin)) * graphW;
    const currentKe = Math.max(0, H_PLANCK * frequency * 1e14 - metal.workFunction);
    const currentPy = graphY + graphH - (currentKe / keMaxRange) * graphH;

    if (currentPx >= graphX && currentPx <= graphX + graphW) {
      // Glowing dot
      const dotGlow = ctx.createRadialGradient(currentPx, currentPy, 0, currentPx, currentPy, 14);
      dotGlow.addColorStop(0, isEmitting ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)");
      dotGlow.addColorStop(1, isEmitting ? "rgba(34,197,94,0)" : "rgba(239,68,68,0)");
      ctx.fillStyle = dotGlow;
      ctx.beginPath();
      ctx.arc(currentPx, currentPy, 14, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = isEmitting ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.arc(currentPx, currentPy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Value label near dot
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      const labelOffsetX = currentPx > graphX + graphW - 80 ? -70 : 10;
      const labelOffsetY = currentPy < graphY + 25 ? 20 : -8;
      ctx.fillText(
        `(${frequency.toFixed(1)}, ${currentKe.toFixed(2)} eV)`,
        currentPx + labelOffsetX,
        currentPy + labelOffsetY
      );
    }

    // "slope = h" label on the line
    if (started) {
      const labelF = Math.max(thresholdFreq14 + 1.5, (thresholdFreq14 + fMax) / 2);
      if (labelF < fMax - 1) {
        const lPx = graphX + ((labelF - fMin) / (fMax - fMin)) * graphW;
        const lKe = H_PLANCK * labelF * 1e14 - metal.workFunction;
        const lPy = graphY + graphH - (lKe / keMaxRange) * graphH;
        if (lPy > graphY + 15) {
          ctx.font = "10px ui-monospace";
          ctx.fillStyle = "#22c55e";
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText("slope = h", lPx + 5, lPy - 5);
        }
      }
    }
  }, [frequency, intensity, selectedMetal, metal, photonEnergy, keMax, thresholdFreq14, isEmitting]);

  const animate = useCallback(() => {
    timeRef.current += 0.02;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

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
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Clear electrons when metal changes
  useEffect(() => {
    electronsRef.current = [];
    photonsRef.current = [];
  }, [selectedMetal]);

  // Click-to-measure electron KE
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleClick = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      // Check if click is near any electron
      for (const el of electronsRef.current) {
        const dx = pos.x - el.x;
        const dy = pos.y - el.y;
        if (dx * dx + dy * dy < 100) {
          setMeasuredElectronKE(el.ke);
          playSFX("click");
          return;
        }
      }
    };
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Metal selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Metal Surface
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {METALS.map((m, i) => (
            <button
              key={m.name}
              onClick={() => setSelectedMetal(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedMetal === i
                  ? "bg-purple-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {m.name} (φ = {m.workFunction} eV)
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Light Frequency
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={2}
              max={15}
              step={0.1}
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[5.5rem] text-right">
              {frequency.toFixed(1)} × 10¹⁴ Hz
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Light Intensity
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2rem] text-right">
              {intensity}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      {/* Display values */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Photon Energy
          </div>
          <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100 mt-1">
            {photonEnergy.toFixed(3)} eV
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Work Function
          </div>
          <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100 mt-1">
            {metal.workFunction.toFixed(2)} eV
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            KE_max
          </div>
          <div className={`text-lg font-mono font-bold mt-1 ${isEmitting ? "text-green-500" : "text-red-500"}`}>
            {keMax.toFixed(3)} eV
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Threshold Freq
          </div>
          <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100 mt-1">
            {thresholdFreq14.toFixed(2)}
            <span className="text-xs font-normal text-gray-500 ml-1">× 10¹⁴ Hz</span>
          </div>
        </div>
      </div>

      {/* Electron KE Measurement */}
      {measuredElectronKE !== null && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
            Electron KE Measurement
          </h3>
          <p className="text-sm font-mono text-blue-700 dark:text-blue-300">
            Measured KE = {measuredElectronKE.toFixed(3)} eV
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            KE_max = {keMax.toFixed(3)} eV | This electron: {((measuredElectronKE / Math.max(keMax, 0.001)) * 100).toFixed(0)}% of max
          </p>
          <button
            onClick={() => setMeasuredElectronKE(null)}
            className="text-xs text-blue-500 hover:text-blue-400 mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Challenge Mode */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Measurement Challenges
          </h3>
          <span className="text-xs font-mono font-bold text-amber-500">Score: {totalScore}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Click electrons to measure KE. Vary frequency to find the threshold. Use the graph to determine h and the work function.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Work function challenge */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-3">
            <label className="text-xs font-medium text-amber-500 uppercase tracking-wider">
              Determine Work Function
            </label>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              Find f₀ where emission starts, then compute phi = hf₀
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                step={0.01}
                value={workFunctionGuess}
                onChange={(e) => setWorkFunctionGuess(e.target.value)}
                placeholder="phi (eV)"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => {
                  const actual = metal.workFunction;
                  const predicted = Number(workFunctionGuess);
                  const result = calculateAccuracy(predicted, actual, actual * 0.5);
                  setTotalScore(prev => prev + result.points);
                  setWfResult(`Actual: ${actual.toFixed(2)} eV | ${result.label} +${result.points}pts`);
                  if (result.points >= 2) { playSFX("success"); playScore(result.points); }
                  else if (result.points > 0) { playSFX("correct"); playScore(result.points); }
                  else playSFX("incorrect");
                }}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
              >
                Check
              </button>
            </div>
            {wfResult && <p className="text-xs mt-1 font-mono text-gray-600 dark:text-gray-400">{wfResult}</p>}
          </div>

          {/* Planck constant challenge */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-3">
            <label className="text-xs font-medium text-purple-500 uppercase tracking-wider">
              Measure Planck Constant
            </label>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              From graph slope: h = dKE/df. Units: eV·s (x10⁻¹⁵)
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                step={0.01}
                value={planckGuess}
                onChange={(e) => setPlanckGuess(e.target.value)}
                placeholder="h (x10⁻¹⁵)"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={() => {
                  const actual = 4.136; // h in units of 10^-15 eV·s
                  const predicted = Number(planckGuess);
                  const result = calculateAccuracy(predicted, actual, actual * 0.5);
                  setTotalScore(prev => prev + result.points);
                  setPlanckResult(`Actual: ${actual.toFixed(3)} | ${result.label} +${result.points}pts`);
                  if (result.points >= 2) { playSFX("success"); playScore(result.points); }
                  else if (result.points > 0) { playSFX("correct"); playScore(result.points); }
                  else playSFX("incorrect");
                }}
                className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium"
              >
                Check
              </button>
            </div>
            {planckResult && <p className="text-xs mt-1 font-mono text-gray-600 dark:text-gray-400">{planckResult}</p>}
          </div>
        </div>
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="KE_{max} = hf - \phi" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E = hf" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\lambda = \frac{hc}{E}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Adjust light frequency and intensity. Below the threshold frequency, no electrons are emitted regardless of intensity!</p>
    </div>
  );
}
