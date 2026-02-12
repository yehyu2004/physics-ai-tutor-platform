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
import { drawInfoPanel, drawMeter } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

type Mode = "sandbox" | "predict-vt" | "target-landing";
type ObjectShape = "sphere" | "cube" | "plate";

interface WindStreak {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  thickness: number;
}

const SHAPE_INFO: Record<ObjectShape, { name: string; cd: number; icon: string }> = {
  sphere: { name: "Sphere", cd: 0.47, icon: "●" },
  cube: { name: "Cube", cd: 1.05, icon: "■" },
  plate: { name: "Flat Plate", cd: 1.98, icon: "▬" },
};

export default function DragTerminalVelocity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [mass, setMass] = useState(5);
  const [dragCoeff, setDragCoeff] = useState(0.47);
  const [crossArea, setCrossArea] = useState(0.1);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<Mode>("sandbox");
  const [objectShape, setObjectShape] = useState<ObjectShape>("sphere");
  const [parachuteDeployed, setParachuteDeployed] = useState(false);
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [prediction, setPrediction] = useState("");
  const [targetSpeed, setTargetSpeed] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [waitingForPrediction, setWaitingForPrediction] = useState(false);
  const [landed, setLanded] = useState(false);
  const [, setResetCounter] = useState(0);

  const posRef = useRef(0);
  const velRef = useRef(0);
  const historyRef = useRef<{ t: number; v: number; y: number }[]>([]);
  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const animTimeRef = useRef(0);

  // Parachute state refs
  const parachuteDeployedRef = useRef(false);
  const parachuteOpenProgress = useRef(0); // 0-1 animation

  // Wind streaks
  const windStreaksRef = useRef<WindStreak[]>([]);

  // Particle system
  const particleSystemRef = useRef(new ParticleSystem());

  // Score popups
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Landing altitude
  const landingAltitude = 500; // meters

  const g = 9.8;
  const rho = 1.225; // air density

  const getEffectiveDragCoeff = useCallback(() => {
    return parachuteDeployedRef.current ? dragCoeff + 1.5 : dragCoeff;
  }, [dragCoeff]);

  const getEffectiveArea = useCallback(() => {
    return parachuteDeployedRef.current ? crossArea + 2.0 : crossArea;
  }, [crossArea]);

  const terminalVel = Math.sqrt((2 * mass * g) / (rho * dragCoeff * crossArea));
  const terminalVelWithChute = Math.sqrt((2 * mass * g) / (rho * (dragCoeff + 1.5) * (crossArea + 2.0)));

  // Initialize wind streaks
  const initWindStreaks = useCallback((H: number, splitX: number) => {
    const streaks: WindStreak[] = [];
    for (let i = 0; i < 30; i++) {
      streaks.push({
        x: Math.random() * splitX,
        y: Math.random() * H,
        len: 10 + Math.random() * 30,
        speed: 0.5 + Math.random() * 1.5,
        alpha: 0.02 + Math.random() * 0.08,
        thickness: 0.5 + Math.random() * 1.5,
      });
    }
    windStreaksRef.current = streaks;
  }, []);

  const generateChallenge = useCallback((currentMode: Mode) => {
    if (currentMode === "predict-vt") {
      // Randomize params
      const newMass = 2 + Math.floor(Math.random() * 15);
      const shapes: ObjectShape[] = ["sphere", "cube", "plate"];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const newArea = 0.05 + Math.round(Math.random() * 0.3 * 100) / 100;
      setMass(newMass);
      setObjectShape(shape);
      setDragCoeff(SHAPE_INFO[shape].cd);
      setCrossArea(newArea);
      setPrediction("");
      setWaitingForPrediction(true);
      setShowResult(false);
    } else if (currentMode === "target-landing") {
      const target = 5 + Math.floor(Math.random() * 20);
      setTargetSpeed(target);
      setMass(5);
      setObjectShape("sphere");
      setDragCoeff(SHAPE_INFO.sphere.cd);
      setCrossArea(0.1);
      setParachuteDeployed(false);
      parachuteDeployedRef.current = false;
      parachuteOpenProgress.current = 0;
      setShowResult(false);
      setLanded(false);
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Split: left = animation, right = graph
    const splitX = W * 0.4;

    // --- Left: falling object ---
    // Sky gradient changes with altitude
    const altFraction = Math.min(1, posRef.current / landingAltitude);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (altFraction < 0.8) {
      skyGrad.addColorStop(0, "#1e3a5f");
      skyGrad.addColorStop(1, "#0f172a");
    } else {
      // Near landing - show ground approaching
      skyGrad.addColorStop(0, "#1e3a5f");
      skyGrad.addColorStop(0.7, "#1e293b");
      skyGrad.addColorStop(1, "#374151");
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, splitX, H);

    // Ground visible near landing
    if (altFraction > 0.7) {
      const groundVisible = (altFraction - 0.7) / 0.3;
      const groundY = H - groundVisible * H * 0.15;
      const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
      groundGrad.addColorStop(0, "#374151");
      groundGrad.addColorStop(1, "#1f2937");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY, splitX, H - groundY);

      // Ground texture
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < splitX; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // Target landing zone for target-landing mode
      if (mode === "target-landing" && targetSpeed > 0) {
        const pulse = (Math.sin(animTimeRef.current * 3) + 1) / 2;
        ctx.strokeStyle = `rgba(245,158,11,${0.3 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(splitX * 0.2, groundY + 2);
        ctx.lineTo(splitX * 0.8, groundY + 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`Land at ${targetSpeed} m/s`, splitX / 2, groundY + 16);
      }
    }

    // --- Wind streaks (enhanced) ---
    const windSpeed = velRef.current;
    const windScale = Math.min(windSpeed / (terminalVel || 30), 1);
    const streaks = windStreaksRef.current;

    for (const s of streaks) {
      const streakLen = s.len * (0.3 + windScale * 2);
      const streakAlpha = s.alpha * (0.3 + windScale * 2);

      // Main streak
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(streakAlpha, 0.3)})`;
      ctx.lineWidth = s.thickness;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + (Math.random() - 0.5) * 4, s.y - streakLen);
      ctx.stroke();

      // Glow on fast streaks
      if (windScale > 0.5) {
        ctx.strokeStyle = `rgba(100,200,255,${streakAlpha * windScale * 0.3})`;
        ctx.lineWidth = s.thickness + 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y - streakLen * 0.7);
        ctx.stroke();
      }
    }

    // Update wind streak positions
    for (const s of streaks) {
      s.y = (s.y + s.speed * (1 + windScale * 3)) % H;
      s.x += (Math.random() - 0.5) * 0.5;
      if (s.x < 0) s.x = splitX;
      if (s.x > splitX) s.x = 0;
    }

    // Object (centered, doesn't move but world moves around it)
    const objX = splitX * 0.5;
    const objY = H * 0.4;
    const objR = 12 + mass * 0.5;

    // Draw parachute if deployed
    if (parachuteDeployedRef.current) {
      const openProg = parachuteOpenProgress.current;
      const chuteW = (40 + mass * 2) * openProg;
      const chuteH = (30 + mass) * openProg;
      const chuteY = objY - objR - 10 - chuteH;

      // Parachute canopy
      ctx.fillStyle = `rgba(239,68,68,${0.6 * openProg})`;
      ctx.beginPath();
      ctx.ellipse(objX, chuteY + chuteH * 0.3, chuteW, chuteH * 0.6, 0, Math.PI, 0);
      ctx.fill();

      // Parachute highlights
      ctx.strokeStyle = `rgba(255,100,100,${0.4 * openProg})`;
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(objX + i * chuteW * 0.3, chuteY);
        ctx.quadraticCurveTo(
          objX + i * chuteW * 0.15,
          chuteY + chuteH * 0.5,
          objX + i * chuteW * 0.3,
          chuteY + chuteH * 0.6
        );
        ctx.stroke();
      }

      // Suspension lines
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * openProg})`;
      ctx.lineWidth = 0.5;
      const linePoints = [-0.8, -0.4, 0, 0.4, 0.8];
      for (const lp of linePoints) {
        ctx.beginPath();
        ctx.moveTo(objX + lp * chuteW, chuteY + chuteH * 0.5);
        ctx.lineTo(objX, objY - objR);
        ctx.stroke();
      }

      // Animate opening
      if (parachuteOpenProgress.current < 1) {
        parachuteOpenProgress.current = Math.min(1, parachuteOpenProgress.current + 0.02);
      }
    }

    // Glow
    const glow = ctx.createRadialGradient(objX, objY, 0, objX, objY, objR * 2);
    glow.addColorStop(0, "rgba(251,191,36,0.2)");
    glow.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(objX, objY, objR * 2, 0, Math.PI * 2);
    ctx.fill();

    // Object drawn based on shape
    if (objectShape === "sphere") {
      const objGrad = ctx.createRadialGradient(objX - 3, objY - 3, 0, objX, objY, objR);
      objGrad.addColorStop(0, "#fef08a");
      objGrad.addColorStop(1, "#f59e0b");
      ctx.fillStyle = objGrad;
      ctx.beginPath();
      ctx.arc(objX, objY, objR, 0, Math.PI * 2);
      ctx.fill();
    } else if (objectShape === "cube") {
      const cubeGrad = ctx.createLinearGradient(objX - objR, objY - objR, objX + objR, objY + objR);
      cubeGrad.addColorStop(0, "#93c5fd");
      cubeGrad.addColorStop(1, "#3b82f6");
      ctx.fillStyle = cubeGrad;
      ctx.beginPath();
      ctx.roundRect(objX - objR, objY - objR, objR * 2, objR * 2, 3);
      ctx.fill();
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (objectShape === "plate") {
      const plateGrad = ctx.createLinearGradient(objX - objR * 1.5, objY, objX + objR * 1.5, objY);
      plateGrad.addColorStop(0, "#86efac");
      plateGrad.addColorStop(1, "#22c55e");
      ctx.fillStyle = plateGrad;
      ctx.beginPath();
      ctx.roundRect(objX - objR * 1.5, objY - objR * 0.3, objR * 3, objR * 0.6, 2);
      ctx.fill();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Mass label
    ctx.fillStyle = objectShape === "sphere" ? "#000" : "#fff";
    ctx.font = `bold ${Math.max(9, 11 - mass * 0.2)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${mass}kg`, objX, objY);

    // Force arrows
    // Gravity (down)
    const gForce = mass * g;
    const maxForce = mass * g;
    const gLen = (gForce / maxForce) * 60;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(objX, objY + objR + 5);
    ctx.lineTo(objX, objY + objR + 5 + gLen);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(objX, objY + objR + 5 + gLen);
    ctx.lineTo(objX - 5, objY + objR + 5 + gLen - 8);
    ctx.lineTo(objX + 5, objY + objR + 5 + gLen - 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("mg", objX + 10, objY + objR + 5 + gLen / 2);

    // Drag (up)
    const effectiveCd = getEffectiveDragCoeff();
    const effectiveA = getEffectiveArea();
    const dragForce = 0.5 * rho * effectiveCd * effectiveA * velRef.current * Math.abs(velRef.current);
    const dLen = Math.min((dragForce / maxForce) * 60, 80);
    if (dLen > 2) {
      ctx.strokeStyle = parachuteDeployedRef.current ? "#a855f7" : "#3b82f6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(objX, objY - objR - 5);
      ctx.lineTo(objX, objY - objR - 5 - dLen);
      ctx.stroke();
      ctx.fillStyle = parachuteDeployedRef.current ? "#a855f7" : "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(objX, objY - objR - 5 - dLen);
      ctx.lineTo(objX - 5, objY - objR - 5 - dLen + 8);
      ctx.lineTo(objX + 5, objY - objR - 5 - dLen + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillText("F_drag", objX + 10, objY - objR - 5 - dLen / 2);
    }

    // Altitude indicator
    const altLeft = splitX - 30;
    const altTop = 30;
    const altH = H - 60;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(altLeft - 5, altTop - 10, 30, altH + 20, 4);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(altLeft + 10, altTop);
    ctx.lineTo(altLeft + 10, altTop + altH);
    ctx.stroke();

    // Altitude marker
    const altMarkerY = altTop + altFraction * altH;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(altLeft + 10, altMarkerY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(landingAltitude - posRef.current)}m`, altLeft + 10, altTop - 3);

    // --- Right: velocity graph ---
    const graphX = splitX + 30;
    const graphW = W - graphX - 30;
    const graphY = 40;
    const graphH = H - 80;

    // Graph background
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(graphX - 15, graphY - 20, graphW + 30, graphH + 50, 8);
    ctx.fill();

    // Title
    ctx.font = "bold 11px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("VELOCITY vs TIME", graphX, graphY - 5);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, graphY);
    ctx.lineTo(graphX, graphY + graphH);
    ctx.lineTo(graphX + graphW, graphY + graphH);
    ctx.stroke();

    // Terminal velocity line (dashed)
    const maxV = Math.max(terminalVel, parachuteDeployedRef.current ? terminalVel : 20) * 1.2;
    const vtY = graphY + graphH - (terminalVel / maxV) * graphH;
    ctx.strokeStyle = "rgba(239,68,68,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(graphX, vtY);
    ctx.lineTo(graphX + graphW, vtY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "right";
    ctx.fillText(`v_t = ${terminalVel.toFixed(1)} m/s`, graphX + graphW, vtY - 5);

    // Terminal velocity with parachute (if deployed)
    if (parachuteDeployedRef.current) {
      const vtChuteY = graphY + graphH - (terminalVelWithChute / maxV) * graphH;
      ctx.strokeStyle = "rgba(168,85,247,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(graphX, vtChuteY);
      ctx.lineTo(graphX + graphW, vtChuteY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a855f7";
      ctx.textAlign = "right";
      ctx.fillText(`v_t(chute) = ${terminalVelWithChute.toFixed(1)} m/s`, graphX + graphW, vtChuteY - 5);
    }

    // Target speed line (in target-landing mode)
    if (mode === "target-landing" && targetSpeed > 0) {
      const tsY = graphY + graphH - (targetSpeed / maxV) * graphH;
      const pulse = (Math.sin(animTimeRef.current * 3) + 1) / 2;
      ctx.strokeStyle = `rgba(245,158,11,${0.3 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(graphX, tsY);
      ctx.lineTo(graphX + graphW, tsY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "right";
      ctx.fillText(`target: ${targetSpeed} m/s`, graphX + graphW, tsY + 14);
    }

    // Plot history
    const history = historyRef.current;
    if (history.length > 1) {
      const maxT = Math.max(history[history.length - 1].t, 5);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(34,197,94,0.4)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = graphX + (history[i].t / maxT) * graphW;
        const py = graphY + graphH - (history[i].v / maxV) * graphH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Axis labels
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("time (s)", graphX + graphW / 2, graphY + graphH + 20);
    ctx.save();
    ctx.translate(graphX - 10, graphY + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("v (m/s)", 0, 0);
    ctx.restore();

    // --- Info panel ---
    const vRatio = velRef.current / terminalVel;
    drawInfoPanel(ctx, 12, H - 100, 170, 90, "FALL DATA", [
      { label: "v", value: `${velRef.current.toFixed(1)} m/s`, color: "#22c55e" },
      { label: "v/v_t", value: `${(vRatio * 100).toFixed(0)}%`, color: vRatio > 0.95 ? "#ef4444" : "#e2e8f0" },
      { label: "t", value: `${timeRef.current.toFixed(1)} s`, color: "#e2e8f0" },
      { label: "alt", value: `${Math.max(0, Math.round(landingAltitude - posRef.current))} m`, color: "#60a5fa" },
    ]);

    // Velocity meter on left side
    drawMeter(ctx, 12, H - 110, 120, 8, velRef.current, terminalVel * 1.1, "#22c55e", `${velRef.current.toFixed(0)} m/s`);

    // --- Challenge scoreboard ---
    if (mode !== "sandbox") {
      renderScoreboard(ctx, graphX - 5, graphY + graphH - 110, 140, 100, challengeState);
    }

    // --- Particle system ---
    particleSystemRef.current.draw(ctx);

    // --- Score popups ---
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter(p => renderScorePopup(ctx, p, now));

    // Shape indicator
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 100, 30, 6);
    ctx.fill();
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillStyle = objectShape === "sphere" ? "#f59e0b" : objectShape === "cube" ? "#3b82f6" : "#22c55e";
    ctx.textAlign = "left";
    ctx.fillText(`${SHAPE_INFO[objectShape].icon} ${SHAPE_INFO[objectShape].name}`, 22, 31);

    // Parachute status
    if (parachuteDeployedRef.current) {
      ctx.fillStyle = "rgba(168,85,247,0.2)";
      ctx.beginPath();
      ctx.roundRect(12, 48, 100, 22, 6);
      ctx.fill();
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#a855f7";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText("CHUTE OPEN", 22, 63);
    }

    // Mode label
    if (mode !== "sandbox") {
      const labelText = mode === "predict-vt" ? "PREDICT V_T" : "TARGET LANDING";
      ctx.fillStyle = "rgba(245,158,11,0.15)";
      ctx.beginPath();
      const labelW = ctx.measureText(labelText).width + 20;
      ctx.roundRect(splitX / 2 - labelW / 2, H - 16, labelW, 14, 5);
      ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(labelText, splitX / 2, H - 6);
    }
  }, [mass, dragCoeff, crossArea, terminalVel, terminalVelWithChute, mode, challengeState, objectShape, targetSpeed, getEffectiveDragCoeff, getEffectiveArea]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;
    animTimeRef.current += dt;

    const v = velRef.current;
    const effectiveCd = getEffectiveDragCoeff();
    const effectiveA = getEffectiveArea();
    const dragForce = 0.5 * rho * effectiveCd * effectiveA * v * Math.abs(v);
    const netForce = mass * g - dragForce;
    const accel = netForce / mass;

    velRef.current += accel * dt;
    if (velRef.current < 0) velRef.current = 0;
    posRef.current += velRef.current * dt;

    historyRef.current.push({ t: timeRef.current, v: velRef.current, y: posRef.current });
    if (historyRef.current.length > 800) historyRef.current.shift();

    // Update particle system
    particleSystemRef.current.update(dt);

    // Emit trail particles at high speed
    if (velRef.current > terminalVel * 0.5 && Math.random() < 0.2) {
      const canvas = canvasRef.current;
      if (canvas) {
        const splitX = canvas.width * 0.4;
        const objX = splitX * 0.5;
        const objY = canvas.height * 0.4;
        particleSystemRef.current.emitTrail(objX, objY - 12 - mass * 0.5, -Math.PI / 2, "#60a5fa");
      }
    }

    // Check landing
    if (posRef.current >= landingAltitude && !landed) {
      setLanded(true);
      setIsRunning(false);
      playSFX("collision");

      const canvas = canvasRef.current;
      if (canvas) {
        const splitX = canvas.width * 0.4;
        particleSystemRef.current.emitSparks(splitX * 0.5, canvas.height * 0.85, 15, "#f59e0b");
      }

      // Check target landing
      if (mode === "target-landing" && targetSpeed > 0) {
        const result = calculateAccuracy(velRef.current, targetSpeed, targetSpeed);
        const newState = updateChallengeState(challengeState, result);
        setChallengeState(newState);

        if (result.points > 0) {
          playSFX("correct");
          playScore(result.points);
        } else {
          playSFX("incorrect");
        }

        setResultMessage(`${result.label} Landing speed: ${velRef.current.toFixed(1)} m/s (target: ${targetSpeed} m/s)`);
        setShowResult(true);

        if (canvas) {
          scorePopupsRef.current.push({
            text: `${result.label} ${velRef.current.toFixed(1)} m/s`,
            points: result.points,
            x: canvas.width * 0.2,
            y: canvas.height * 0.3,
            startTime: performance.now(),
          });
          if (result.points >= 2) {
            particleSystemRef.current.emitConfetti(canvas.width * 0.2, canvas.height * 0.3, 25);
          }
        }
      }
    }

    draw();
    if (isRunning && !landed && posRef.current < landingAltitude) {
      animRef.current = requestAnimationFrame(animate);
    }
  }, [mass, dragCoeff, crossArea, draw, getEffectiveDragCoeff, getEffectiveArea, terminalVel, mode, targetSpeed, challengeState, landed, isRunning]);

  // Canvas setup and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 480);
      initWindStreaks(canvas.height, canvas.width * 0.4);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw, initWindStreaks]);

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    velRef.current = 0;
    posRef.current = 0;
    timeRef.current = 0;
    historyRef.current = [];
    lastTsRef.current = null;
    animTimeRef.current = 0;
    parachuteDeployedRef.current = false;
    parachuteOpenProgress.current = 0;
    setParachuteDeployed(false);
    setLanded(false);
    setIsRunning(false);
    setShowResult(false);
    particleSystemRef.current.clear();
    scorePopupsRef.current = [];
    setResetCounter(c => c + 1);
    draw();
  };

  const deployParachute = () => {
    if (parachuteDeployedRef.current || landed) return;
    parachuteDeployedRef.current = true;
    parachuteOpenProgress.current = 0;
    setParachuteDeployed(true);
    playSFX("whoosh");

    const canvas = canvasRef.current;
    if (canvas) {
      const splitX = canvas.width * 0.4;
      particleSystemRef.current.emitGlow(splitX * 0.5, canvas.height * 0.3, 8, "#a855f7");
    }
  };

  const submitVtPrediction = () => {
    const predicted = parseFloat(prediction);
    if (isNaN(predicted)) return;

    const actualVt = Math.sqrt((2 * mass * g) / (rho * dragCoeff * crossArea));
    const result = calculateAccuracy(predicted, actualVt, actualVt);
    const newState = updateChallengeState(challengeState, result);
    setChallengeState(newState);

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }

    setResultMessage(`${result.label} Actual v_t = ${actualVt.toFixed(1)} m/s (you predicted ${predicted} m/s)`);
    setShowResult(true);
    setWaitingForPrediction(false);

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height * 0.3,
        startTime: performance.now(),
      });
      if (result.points >= 2) {
        particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height * 0.3, 20);
      }
      draw();
    }
  };

  const switchMode = (newMode: Mode) => {
    reset();
    setMode(newMode);
    setChallengeState(createChallengeState());
    setWaitingForPrediction(false);
    setShowResult(false);
    setIsRunning(newMode === "sandbox");
    if (newMode !== "sandbox") {
      generateChallenge(newMode);
    }
  };

  const selectShape = (shape: ObjectShape) => {
    setObjectShape(shape);
    setDragCoeff(SHAPE_INFO[shape].cd);
    reset();
    if (mode === "sandbox") setIsRunning(true);
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "predict-vt", "target-landing"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {m === "sandbox" ? "Sandbox" : m === "predict-vt" ? "Predict V_t" : "Target Landing"}
          </button>
        ))}
      </div>

      {/* Predict challenge prompt */}
      {mode === "predict-vt" && waitingForPrediction && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Predict the Terminal Velocity
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            Object: {SHAPE_INFO[objectShape].name} (Cd = {dragCoeff.toFixed(2)}), mass = {mass} kg, A = {crossArea.toFixed(2)} m^2, rho = {rho} kg/m^3
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Hint: v_t = sqrt(2mg / (rho * Cd * A))
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              placeholder="Your prediction (m/s)..."
              className="flex-1 h-9 px-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
              onKeyDown={(e) => e.key === "Enter" && submitVtPrediction()}
            />
            <button
              onClick={submitVtPrediction}
              className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Result feedback */}
      {showResult && (
        <div className={`rounded-xl border p-3 text-sm font-medium ${
          challengeState.lastResult && challengeState.lastResult.points >= 2
            ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
            : challengeState.lastResult && challengeState.lastResult.points >= 1
            ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200"
            : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
        }`}>
          {resultMessage}
          <button
            onClick={() => { reset(); generateChallenge(mode); setIsRunning(mode === "target-landing"); }}
            className="ml-3 px-3 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Next Challenge
          </button>
        </div>
      )}

      {/* Target landing prompt */}
      {mode === "target-landing" && targetSpeed > 0 && !showResult && (
        <div className="rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 p-3">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
            Land at exactly {targetSpeed} m/s! Use the parachute and adjust parameters to hit the target speed.
            Altitude: {Math.max(0, Math.round(landingAltitude - posRef.current))} m remaining.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Shape selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Object Shape</label>
        <div className="flex gap-2">
          {(["sphere", "cube", "plate"] as ObjectShape[]).map((shape) => (
            <button
              key={shape}
              onClick={() => selectShape(shape)}
              disabled={mode === "predict-vt" && waitingForPrediction}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                objectShape === shape
                  ? shape === "sphere"
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
                    : shape === "cube"
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700"
                    : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750"
              }`}
            >
              <span className="font-mono mr-1">{SHAPE_INFO[shape].icon}</span>
              {SHAPE_INFO[shape].name}
              <span className="block text-[10px] opacity-60">Cd = {SHAPE_INFO[shape].cd}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={20} step={0.5} value={mass}
              onChange={(e) => { setMass(Number(e.target.value)); reset(); if (mode === "sandbox") setIsRunning(true); }}
              disabled={mode === "predict-vt" && waitingForPrediction}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{mass} kg</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Drag Coefficient</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={2} step={0.01} value={dragCoeff}
              onChange={(e) => { setDragCoeff(Number(e.target.value)); reset(); if (mode === "sandbox") setIsRunning(true); }}
              disabled={mode === "predict-vt" && waitingForPrediction}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{dragCoeff.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cross-Section Area</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.01} max={0.5} step={0.01} value={crossArea}
              onChange={(e) => { setCrossArea(Number(e.target.value)); reset(); if (mode === "sandbox") setIsRunning(true); }}
              disabled={mode === "predict-vt" && waitingForPrediction}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{crossArea.toFixed(2)} m^2</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-2">
          <button onClick={deployParachute} disabled={parachuteDeployed || landed || !isRunning}
            className={`flex-1 h-10 rounded-lg font-medium text-sm transition-colors ${
              parachuteDeployed
                ? "bg-purple-600 text-white cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            } disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500`}>
            {parachuteDeployed ? "Chute Deployed" : "Deploy Parachute"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
              setLanded(false);
            }
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : landed ? "Resume" : "Play"}
          </button>
          <button onClick={() => { reset(); }}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Drag Force</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="F_{drag} = \frac{1}{2}\rho C_d A v^2" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="v_t = \sqrt{\frac{2mg}{\rho C_d A}}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="v_t" /> = {terminalVel.toFixed(1)} m/s{parachuteDeployed ? ` (chute: ${terminalVelWithChute.toFixed(1)})` : ""}</div>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Try different object shapes (sphere, cube, plate) to see how drag coefficient affects terminal velocity. Deploy the parachute mid-fall to dramatically slow down!
      </p>
    </div>
  );
}
