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
import { createDragHandler, getCanvasMousePos } from "@/lib/simulation/interaction";

// Material presets for challenges and multi-object mode
interface MaterialPreset {
  name: string;
  density: number;
  color: string;
}

const MATERIALS: MaterialPreset[] = [
  { name: "Cork", density: 120, color: "#d4a574" },
  { name: "Pine Wood", density: 500, color: "#c4956a" },
  { name: "Ice", density: 917, color: "#a5d8ff" },
  { name: "Water", density: 1000, color: "#60a5fa" },
  { name: "Bone", density: 1900, color: "#e8dcc8" },
  { name: "Brick", density: 2000, color: "#c0392b" },
  { name: "Aluminum", density: 2700, color: "#b0bec5" },
  { name: "Iron", density: 7874, color: "#78909c" },
  { name: "Copper", density: 8960, color: "#e67e22" },
  { name: "Lead", density: 11340, color: "#636e72" },
  { name: "Gold", density: 19320, color: "#f1c40f" },
];

const FLUIDS: { name: string; density: number }[] = [
  { name: "Gasoline", density: 700 },
  { name: "Water", density: 1000 },
  { name: "Seawater", density: 1025 },
  { name: "Glycerin", density: 1260 },
  { name: "Mercury", density: 13600 },
];

interface DroppedObject {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  material: MaterialPreset;
}

type GameMode = "sandbox" | "predict" | "target-depth";

export default function Buoyancy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [objectDensity, setObjectDensity] = useState(500);
  const [fluidDensity, setFluidDensity] = useState(1000);
  const [objectSize, setObjectSize] = useState(60);
  const [isRunning, setIsRunning] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");

  // Challenge state
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [predictionMade, setPredictionMade] = useState(false);
  const [predictedOutcome, setPredictedOutcome] = useState<"float" | "sink" | null>(null);
  const [revealResult, setRevealResult] = useState(false);
  const [challengeMaterial, setChallengeMaterial] = useState<MaterialPreset | null>(null);
  const [challengeFluid, setChallengeFluid] = useState<{ name: string; density: number } | null>(null);

  // Target depth challenge
  const [targetDepth, setTargetDepth] = useState(50); // percent submerged
  const [depthSubmitted, setDepthSubmitted] = useState(false);

  const posRef = useRef(0.2);
  const velRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  // Multi-object mode
  const droppedObjectsRef = useRef<DroppedObject[]>([]);
  const nextIdRef = useRef(1);

  // Drag state
  const dragRef = useRef<{
    isDragging: boolean;
    dragObjId: number | null;
    ghostX: number;
    ghostY: number;
    showGhost: boolean;
  }>({ isDragging: false, dragObjId: null, ghostX: 0, ghostY: 0, showGhost: false });

  // Particles
  const particlesRef = useRef(new ParticleSystem());

  // Score popups
  const popupsRef = useRef<ScorePopup[]>([]);

  // Mouse position for hover effects
  const mouseRef = useRef({ x: 0, y: 0 });

  // Bubble timer
  const bubbleTimerRef = useRef(0);

  const generateChallenge = useCallback(() => {
    // Pick a random material and fluid
    const mat = MATERIALS[Math.floor(Math.random() * MATERIALS.length)];
    const fluid = FLUIDS[Math.floor(Math.random() * FLUIDS.length)];
    setChallengeMaterial(mat);
    setChallengeFluid(fluid);
    setPredictionMade(false);
    setPredictedOutcome(null);
    setRevealResult(false);
    // Reset position
    posRef.current = 0.2;
    velRef.current = 0;
    lastTsRef.current = null;
  }, []);

  const generateDepthChallenge = useCallback(() => {
    const target = Math.round(20 + Math.random() * 60); // 20-80%
    setTargetDepth(target);
    setDepthSubmitted(false);
    setObjectDensity(500);
    posRef.current = 0.2;
    velRef.current = 0;
    lastTsRef.current = null;
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
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const waterLevel = H * 0.35;
    const objY = posRef.current * H;
    const objX = W * 0.35;
    const objR = objectSize / 2;

    // Determine effective densities based on mode
    const effObjDensity = gameMode === "predict" && challengeMaterial ? challengeMaterial.density : objectDensity;
    const effFluidDensity = gameMode === "predict" && challengeFluid ? challengeFluid.density : fluidDensity;

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, waterLevel);
    skyGrad.addColorStop(0, "#1e3a5f");
    skyGrad.addColorStop(1, "#0f2847");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, waterLevel);

    // Water
    const waterGrad = ctx.createLinearGradient(0, waterLevel, 0, H);
    waterGrad.addColorStop(0, "rgba(14, 116, 144, 0.6)");
    waterGrad.addColorStop(1, "rgba(8, 51, 68, 0.8)");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, waterLevel, W, H - waterLevel);

    // Water surface ripple
    ctx.strokeStyle = "rgba(103, 232, 249, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < W; x += 2) {
      const y = waterLevel + Math.sin(x * 0.03 + now * 0.002) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --- Draw dropped objects (multi-object mode) ---
    for (const obj of droppedObjectsRef.current) {
      const oR = obj.size / 2;
      const subFrac = Math.max(0, Math.min(1, (obj.y + oR - waterLevel) / (oR * 2)));

      // Shadow in water
      if (subFrac > 0) {
        ctx.fillStyle = `rgba(0,0,0,0.15)`;
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y + oR + 8, oR * 0.7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Object body
      ctx.fillStyle = obj.material.color;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(obj.x - oR, obj.y - oR, oR * 2, oR * 2, 6);
      ctx.fill();
      ctx.stroke();

      // Name label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obj.material.name, obj.x, obj.y - 3);
      ctx.font = "8px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`${obj.material.density} kg/m\u00B3`, obj.x, obj.y + 10);
    }

    // --- Main object ---
    const submergedFraction = Math.max(0, Math.min(1, (objY + objR - waterLevel) / (objR * 2)));

    // Object color based on density
    let objColor: string;
    if (gameMode === "predict" && challengeMaterial) {
      objColor = revealResult ? challengeMaterial.color : "#94a3b8";
    } else {
      const densityRatio = effObjDensity / 2000;
      const r = Math.round(100 + densityRatio * 155);
      const g = Math.round(150 - densityRatio * 100);
      const b = Math.round(200 - densityRatio * 150);
      objColor = `rgb(${r},${g},${b})`;
    }

    // Object shadow in water
    if (submergedFraction > 0) {
      ctx.fillStyle = `rgba(0,0,0,0.15)`;
      ctx.beginPath();
      ctx.ellipse(objX, objY + objR + 10, objR * 0.8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Object body
    ctx.fillStyle = objColor;
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(objX - objR, objY - objR, objR * 2, objR * 2, 6);
    ctx.fill();
    ctx.stroke();

    // Density label on object
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (gameMode === "predict" && challengeMaterial && !revealResult) {
      ctx.fillText("???", objX, objY - 2);
      ctx.font = "9px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(challengeMaterial.name, objX, objY + 12);
    } else {
      ctx.fillText(`${effObjDensity}`, objX, objY - 5);
      ctx.font = "9px system-ui";
      ctx.fillText("kg/m\u00B3", objX, objY + 10);
    }

    // Force arrows
    const vol = (objectSize / 100) ** 3;
    const weight = effObjDensity * vol * 9.8;
    const subVol = vol * submergedFraction;
    const buoyantForce = effFluidDensity * subVol * 9.8;
    const maxF = Math.max(weight, buoyantForce, 1) * 1.2;
    const arrowScale = 80 / maxF;

    // Weight (down)
    if (gameMode !== "predict" || revealResult) {
      const wLen = weight * arrowScale;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(objX + objR + 20, objY);
      ctx.lineTo(objX + objR + 20, objY + wLen);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(objX + objR + 20, objY + wLen);
      ctx.lineTo(objX + objR + 15, objY + wLen - 8);
      ctx.lineTo(objX + objR + 25, objY + wLen - 8);
      ctx.closePath();
      ctx.fill();
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`W = ${weight.toFixed(1)} N`, objX + objR + 30, objY + wLen / 2);

      // Buoyant force (up)
      if (buoyantForce > 0.1) {
        const bLen = buoyantForce * arrowScale;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(objX - objR - 20, objY);
        ctx.lineTo(objX - objR - 20, objY - bLen);
        ctx.stroke();
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(objX - objR - 20, objY - bLen);
        ctx.lineTo(objX - objR - 25, objY - bLen + 8);
        ctx.lineTo(objX - objR - 15, objY - bLen + 8);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = "right";
        ctx.fillText(`F_b = ${buoyantForce.toFixed(1)} N`, objX - objR - 30, objY - bLen / 2);
      }
    }

    // --- Target depth line ---
    if (gameMode === "target-depth") {
      const targetSubmergedPx = (targetDepth / 100) * objR * 2;

      // Draw target zone
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(objX - objR - 40, waterLevel + targetSubmergedPx - objR);
      ctx.lineTo(objX + objR + 40, waterLevel + targetSubmergedPx - objR);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target label
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace";
      ctx.textAlign = "right";
      ctx.fillText(`Target: ${targetDepth}% submerged`, objX - objR - 45, waterLevel + targetSubmergedPx - objR + 4);

      // Current depth indicator
      ctx.fillStyle = "rgba(103,232,249,0.7)";
      ctx.font = "11px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Current: ${(submergedFraction * 100).toFixed(0)}%`, objX + objR + 30, objY + objR + 20);
    }

    // Waterline marker
    ctx.fillStyle = "rgba(103,232,249,0.5)";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "left";
    ctx.fillText("water surface", 15, waterLevel - 10);

    // --- Ghost object (drag preview) ---
    if (dragRef.current.showGhost) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(dragRef.current.ghostX - 20, dragRef.current.ghostY - 20, 40, 40, 6);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // --- Info panel ---
    const equilibriumFraction = effObjDensity / effFluidDensity;
    const status = equilibriumFraction >= 1 ? "SINKS" : "FLOATS";

    if (gameMode !== "predict" || revealResult) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 220, 12, 208, 115, 8);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("BUOYANCY DATA", W - 208, 28);
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`\u03C1_obj = ${effObjDensity} kg/m\u00B3`, W - 208, 46);
      ctx.fillText(`\u03C1_fluid = ${effFluidDensity} kg/m\u00B3`, W - 208, 62);
      ctx.fillText(`Submerged: ${(submergedFraction * 100).toFixed(0)}%`, W - 208, 78);
      ctx.fillText(`\u03C1_obj/\u03C1_fluid = ${equilibriumFraction.toFixed(2)}`, W - 208, 94);
      ctx.fillStyle = status === "FLOATS" ? "#22c55e" : "#ef4444";
      ctx.font = "bold 12px ui-monospace";
      ctx.fillText(status, W - 208, 114);
    }

    // --- Predict mode UI ---
    if (gameMode === "predict" && challengeMaterial && challengeFluid) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W - 230, 12, 218, predictionMade ? 160 : 130, 8);
      ctx.fill();

      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "left";
      ctx.fillText("PREDICT: FLOAT OR SINK?", W - 218, 30);

      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Material: ${challengeMaterial.name}`, W - 218, 52);
      ctx.fillText(`Fluid: ${challengeFluid.name}`, W - 218, 70);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`\u03C1_fluid = ${challengeFluid.density} kg/m\u00B3`, W - 218, 88);

      if (!predictionMade) {
        // Draw FLOAT button
        const floatBtnX = W - 218;
        const floatBtnY = 100;
        const sinkBtnX = W - 110;
        const sinkBtnY = 100;
        const btnW = 95;
        const btnH = 28;

        const mX = mouseRef.current.x;
        const mY = mouseRef.current.y;
        const hoverFloat = mX >= floatBtnX && mX <= floatBtnX + btnW && mY >= floatBtnY && mY <= floatBtnY + btnH;
        const hoverSink = mX >= sinkBtnX && mX <= sinkBtnX + btnW && mY >= sinkBtnY && mY <= sinkBtnY + btnH;

        ctx.fillStyle = hoverFloat ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.1)";
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(floatBtnX, floatBtnY, btnW, btnH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 13px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText("FLOAT", floatBtnX + btnW / 2, floatBtnY + 18);

        ctx.fillStyle = hoverSink ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.1)";
        ctx.strokeStyle = "#ef4444";
        ctx.beginPath();
        ctx.roundRect(sinkBtnX, sinkBtnY, btnW, btnH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 13px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText("SINK", sinkBtnX + btnW / 2, sinkBtnY + 18);
      } else if (revealResult) {
        const actual = challengeMaterial.density < challengeFluid.density ? "float" : "sink";
        const correct = predictedOutcome === actual;

        ctx.fillStyle = correct ? "#22c55e" : "#ef4444";
        ctx.font = "bold 14px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(correct ? "CORRECT!" : "WRONG!", W - 218, 110);

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "11px ui-monospace";
        ctx.fillText(`\u03C1_obj = ${challengeMaterial.density} kg/m\u00B3`, W - 218, 130);
        ctx.fillText(`It ${actual === "float" ? "FLOATS" : "SINKS"}!`, W - 218, 148);

        // Next button
        const nextBtnX = W - 218;
        const nextBtnY = 155;
        const nextBtnW = 200;
        const nextBtnH = 24;
        const mX = mouseRef.current.x;
        const mY = mouseRef.current.y;
        const hoverNext = mX >= nextBtnX && mX <= nextBtnX + nextBtnW && mY >= nextBtnY && mY <= nextBtnY + nextBtnH;

        ctx.fillStyle = hoverNext ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.1)";
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(nextBtnX, nextBtnY, nextBtnW, nextBtnH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#3b82f6";
        ctx.font = "bold 11px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText("NEXT CHALLENGE", nextBtnX + nextBtnW / 2, nextBtnY + 16);
      }
    }

    // --- Scoreboard ---
    if (challengeState.active && (gameMode === "predict" || gameMode === "target-depth")) {
      renderScoreboard(ctx, 12, 12, 150, 110, challengeState);
    }

    // --- Material palette (sandbox multi-object) ---
    if (gameMode === "sandbox") {
      const palX = W - 160;
      const palY = H - 120;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(palX - 8, palY - 22, 160, 115, 8);
      ctx.fill();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 9px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText("DRAG TO DROP", palX, palY - 8);

      const cols = 4;
      const boxSize = 30;
      const gap = 6;
      for (let i = 0; i < Math.min(MATERIALS.length, 8); i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx = palX + col * (boxSize + gap);
        const by = palY + row * (boxSize + gap);

        ctx.fillStyle = MATERIALS[i].color;
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxSize, boxSize, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "7px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(MATERIALS[i].name.substring(0, 5), bx + boxSize / 2, by + boxSize / 2 + 3);
      }
    }

    // Fluid density label
    ctx.fillStyle = "rgba(103,232,249,0.4)";
    ctx.font = "10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText(`\u03C1 = ${effFluidDensity} kg/m\u00B3`, W / 2, H - 20);

    // --- Particles (bubbles) ---
    particlesRef.current.draw(ctx);

    // --- Score popups ---
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [objectDensity, fluidDensity, objectSize, gameMode, challengeMaterial, challengeFluid, predictionMade, predictedOutcome, revealResult, challengeState, targetDepth]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const waterLevel = H * 0.35;
    const objR = objectSize / 2;
    const objY = posRef.current * H;
    const objX = W * 0.35;

    const effObjDensity = gameMode === "predict" && challengeMaterial ? challengeMaterial.density : objectDensity;
    const effFluidDensity = gameMode === "predict" && challengeFluid ? challengeFluid.density : fluidDensity;

    // Physics for main object (only animate when not waiting for prediction)
    const shouldAnimate = gameMode !== "predict" || revealResult;
    if (shouldAnimate) {
      const vol = (objectSize / 100) ** 3;
      const submergedFraction = Math.max(0, Math.min(1, (objY + objR - waterLevel) / (objR * 2)));
      const subVol = vol * submergedFraction;

      const weight = effObjDensity * vol * 9.8;
      const buoyantForce = effFluidDensity * subVol * 9.8;
      const netForce = weight - buoyantForce;

      const accel = netForce / (effObjDensity * vol);
      velRef.current += accel * dt * 0.0003;
      velRef.current *= Math.pow(0.98, dt / 0.016);
      posRef.current += velRef.current * (dt / 0.016);

      if (posRef.current > 0.85) { posRef.current = 0.85; velRef.current *= -0.3; }
      if (posRef.current < 0.1) { posRef.current = 0.1; velRef.current *= -0.3; }

      // Emit bubbles from submerged objects
      const mainSubFrac = Math.max(0, Math.min(1, (posRef.current * H + objR - waterLevel) / (objR * 2)));
      if (mainSubFrac > 0.1 && Math.abs(velRef.current) > 0.0005) {
        bubbleTimerRef.current += dt;
        if (bubbleTimerRef.current > 0.15) {
          bubbleTimerRef.current = 0;
          particlesRef.current.emitBubbles(
            objX + (Math.random() - 0.5) * objR,
            objY + objR * 0.5,
            1 + Math.floor(Math.abs(velRef.current) * 200),
          );
        }
      }
    }

    // Physics for dropped objects
    for (const obj of droppedObjectsRef.current) {
      const oR = obj.size / 2;
      const subFrac = Math.max(0, Math.min(1, (obj.y + oR - waterLevel) / (oR * 2)));
      const oVol = (obj.size / 100) ** 3;
      const oWeight = obj.material.density * oVol * 9.8;
      const oBuoyant = effFluidDensity * oVol * subFrac * 9.8;
      const oNet = oWeight - oBuoyant;
      const oAccel = oNet / (obj.material.density * oVol);

      obj.vy += oAccel * dt * 0.0003;
      // Drag in water
      if (subFrac > 0) {
        obj.vy *= Math.pow(0.96, dt / 0.016);
        obj.vx *= Math.pow(0.97, dt / 0.016);
      } else {
        obj.vy *= Math.pow(0.999, dt / 0.016);
      }
      obj.x += obj.vx * (dt / 0.016);
      obj.y += obj.vy * (dt / 0.016);

      // Bounds
      if (obj.y > H * 0.85) { obj.y = H * 0.85; obj.vy *= -0.3; }
      if (obj.y < H * 0.05) { obj.y = H * 0.05; obj.vy *= -0.3; }
      if (obj.x < oR) { obj.x = oR; obj.vx *= -0.5; }
      if (obj.x > W - oR) { obj.x = W - oR; obj.vx *= -0.5; }

      // Bubbles from sinking objects
      if (subFrac > 0.1 && Math.abs(obj.vy) > 0.001) {
        if (Math.random() < 0.1) {
          particlesRef.current.emitBubbles(
            obj.x + (Math.random() - 0.5) * oR,
            obj.y - oR * 0.3,
            1,
          );
        }
      }
    }

    // Ambient bubbles in water
    if (Math.random() < 0.02) {
      particlesRef.current.emitBubbles(
        Math.random() * W,
        H - 20,
        1,
        "rgba(100,200,255,0.3)",
      );
    }

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [objectDensity, fluidDensity, objectSize, draw, gameMode, challengeMaterial, challengeFluid, revealResult]);

  // Canvas setup and interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.6, 500);
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

  const handlePrediction = useCallback((prediction: "float" | "sink") => {
    if (!challengeMaterial || !challengeFluid) return;
    setPredictionMade(true);
    setPredictedOutcome(prediction);
    playSFX("click");

    // Reveal after brief delay
    setTimeout(() => {
      setRevealResult(true);
      posRef.current = 0.2;
      velRef.current = 0;

      const actual = challengeMaterial.density < challengeFluid.density ? "float" : "sink";
      const correct = prediction === actual;

      if (correct) {
        const result = { points: 3, tier: "perfect" as const, label: "Correct!" };
        setChallengeState((prev) => updateChallengeState(prev, result));
        playSFX("correct");
        playScore(3);
        const canvas = canvasRef.current;
        if (canvas) {
          particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, 25);
          popupsRef.current.push({
            text: "Correct! +3",
            points: 3,
            x: canvas.width / 2,
            y: canvas.height / 3,
            startTime: performance.now(),
          });
        }
      } else {
        const result = { points: 0, tier: "miss" as const, label: "Wrong!" };
        setChallengeState((prev) => updateChallengeState(prev, result));
        playSFX("incorrect");
        popupsRef.current.push({
          text: "Wrong!",
          points: 0,
          x: canvasRef.current ? canvasRef.current.width / 2 : 300,
          y: canvasRef.current ? canvasRef.current.height / 3 : 100,
          startTime: performance.now(),
        });
      }
    }, 500);
  }, [challengeMaterial, challengeFluid]);

  // Mouse/touch interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.width;
    const H = canvas.height;
    const waterLevel = H * 0.35;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        // Check material palette for drag-drop
        if (gameMode === "sandbox") {
          const palX = W - 160;
          const palY = H - 120;
          const cols = 4;
          const boxSize = 30;
          const gap = 6;
          for (let i = 0; i < Math.min(MATERIALS.length, 8); i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const bx = palX + col * (boxSize + gap);
            const by = palY + row * (boxSize + gap);
            if (x >= bx && x <= bx + boxSize && y >= by && y <= by + boxSize) {
              dragRef.current.isDragging = true;
              dragRef.current.dragObjId = i;
              dragRef.current.ghostX = x;
              dragRef.current.ghostY = y;
              dragRef.current.showGhost = true;
              return true;
            }
          }
        }
        return false;
      },
      onDrag: (x, y) => {
        if (dragRef.current.isDragging) {
          dragRef.current.ghostX = x;
          dragRef.current.ghostY = y;
        }
      },
      onDragEnd: (x, y) => {
        if (dragRef.current.isDragging && dragRef.current.dragObjId !== null) {
          const matIndex = dragRef.current.dragObjId;
          const mat = MATERIALS[matIndex];
          const newObj: DroppedObject = {
            id: nextIdRef.current++,
            x,
            y: Math.min(y, waterLevel - 10),
            vx: 0,
            vy: 0,
            size: 40,
            material: mat,
          };
          droppedObjectsRef.current.push(newObj);
          playSFX("drop");

          // Splash particles
          if (y >= waterLevel - 20) {
            particlesRef.current.emitBubbles(x, waterLevel, 8);
          }
        }
        dragRef.current.isDragging = false;
        dragRef.current.dragObjId = null;
        dragRef.current.showGhost = false;
      },
      onClick: (x, y) => {
        // Predict mode button clicks
        if (gameMode === "predict" && challengeMaterial && !predictionMade) {
          const W = canvas.width;
          const floatBtnX = W - 218;
          const floatBtnY = 100;
          const sinkBtnX = W - 110;
          const sinkBtnY = 100;
          const btnW = 95;
          const btnH = 28;

          if (x >= floatBtnX && x <= floatBtnX + btnW && y >= floatBtnY && y <= floatBtnY + btnH) {
            handlePrediction("float");
            return;
          }
          if (x >= sinkBtnX && x <= sinkBtnX + btnW && y >= sinkBtnY && y <= sinkBtnY + btnH) {
            handlePrediction("sink");
            return;
          }
        }

        // Next challenge button
        if (gameMode === "predict" && revealResult) {
          const W = canvas.width;
          const nextBtnX = W - 218;
          const nextBtnY = 155;
          const nextBtnW = 200;
          const nextBtnH = 24;
          if (x >= nextBtnX && x <= nextBtnX + nextBtnW && y >= nextBtnY && y <= nextBtnY + nextBtnH) {
            generateChallenge();
            return;
          }
        }
      },
    });

    // Track mouse for hover effects
    const handleMouseMove = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      mouseRef.current = pos;
    };
    canvas.addEventListener("mousemove", handleMouseMove);

    return () => {
      cleanup();
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [gameMode, challengeMaterial, predictionMade, revealResult, generateChallenge, handlePrediction]);

  const handleDepthSubmit = () => {
    const equilibriumFraction = objectDensity / fluidDensity;
    const actualPercent = Math.min(equilibriumFraction * 100, 100);
    const result = calculateAccuracy(actualPercent, targetDepth, 100);

    setChallengeState((prev) => updateChallengeState(prev, result));
    setDepthSubmitted(true);

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
      text: `${result.label} (${actualPercent.toFixed(0)}%)`,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width * 0.35 : 250,
      y: canvasRef.current ? canvasRef.current.height * 0.3 : 100,
      startTime: performance.now(),
    });
  };

  const reset = () => {
    posRef.current = 0.2;
    velRef.current = 0;
    lastTsRef.current = null;
    droppedObjectsRef.current = [];
    particlesRef.current.clear();
    draw();
  };

  const switchMode = (mode: GameMode) => {
    setGameMode(mode);
    reset();
    setPredictionMade(false);
    setPredictedOutcome(null);
    setRevealResult(false);
    setDepthSubmitted(false);

    if (mode === "predict") {
      setChallengeState({ ...createChallengeState(), active: true });
      // Generate first challenge
      const mat = MATERIALS[Math.floor(Math.random() * MATERIALS.length)];
      const fluid = FLUIDS[Math.floor(Math.random() * FLUIDS.length)];
      setChallengeMaterial(mat);
      setChallengeFluid(fluid);
    } else if (mode === "target-depth") {
      setChallengeState({ ...createChallengeState(), active: true });
      const target = Math.round(20 + Math.random() * 60);
      setTargetDepth(target);
    } else {
      setChallengeState(createChallengeState());
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        {(["sandbox", "predict", "target-depth"] as GameMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => switchMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              gameMode === mode
                ? "bg-cyan-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {mode === "sandbox" ? "Sandbox" : mode === "predict" ? "Float or Sink?" : "Target Depth"}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {gameMode !== "predict" && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Density (kg/m³)</label>
            <div className="flex items-center gap-3 mt-2">
              <input type="range" min={100} max={3000} step={50} value={objectDensity}
                onChange={(e) => { setObjectDensity(Number(e.target.value)); posRef.current = 0.2; velRef.current = 0; lastTsRef.current = null; }}
                className="flex-1 accent-amber-500" />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{objectDensity}</span>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fluid Density (kg/m³)</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={500} max={13600} step={100} value={fluidDensity}
              onChange={(e) => { setFluidDensity(Number(e.target.value)); posRef.current = 0.2; velRef.current = 0; lastTsRef.current = null; }}
              className="flex-1 accent-cyan-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{fluidDensity}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Size</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={30} max={100} value={objectSize}
              onChange={(e) => { setObjectSize(Number(e.target.value)); posRef.current = 0.2; velRef.current = 0; lastTsRef.current = null; }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{objectSize}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
        </div>
      </div>

      {/* Target depth challenge controls */}
      {gameMode === "target-depth" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Target: {targetDepth}% submerged
            </h3>
            <div className="flex gap-2">
              {!depthSubmitted ? (
                <button
                  onClick={handleDepthSubmit}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
                >
                  Check Answer
                </button>
              ) : (
                <button
                  onClick={() => {
                    generateDepthChallenge();
                  }}
                  className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Next Challenge
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adjust the object density so that exactly {targetDepth}% of the object is submerged. The formula is: % submerged = rho_obj / rho_fluid
          </p>
          {depthSubmitted && (
            <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
              Ideal density: {Math.round(fluidDensity * targetDepth / 100)} kg/m\u00B3 | Your density: {objectDensity} kg/m\u00B3
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

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Archimedes&apos; Principle</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">F_b = rho_fluid x V_sub x g</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Floats if rho_obj &lt; rho_fluid</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">% submerged = rho_obj/rho_fluid</div>
        </div>
      </div>

      {/* Sandbox instructions */}
      {gameMode === "sandbox" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Drag materials from the palette (bottom-right of canvas) to drop objects into the fluid. Each object has its own density and will float or sink independently.
          </p>
        </div>
      )}
    </div>
  );
}
