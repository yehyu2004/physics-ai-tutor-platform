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
import { createDragHandler } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type SimMode = "sandbox" | "break" | "predict" | "release";

interface FlyingObject {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  trail: { x: number; y: number }[];
  alive: boolean;
}

interface OrbitObject {
  angle: number;
  radius: number; // in px
  speed: number; // m/s
  mass: number;
  color: string;
  trail: { x: number; y: number; a: number }[];
}

const ORBIT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ec4899", "#a855f7"];

export default function CircularMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [radius, setRadius] = useState(150);
  const [speed, setSpeed] = useState(3);
  const [mass, setMass] = useState(1);
  const [stringTension, setStringTension] = useState(50); // max tension in N
  const [showVectors, setShowVectors] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<SimMode>("sandbox");
  const [predictionInput, setPredictionInput] = useState("");
  const [predictionSubmitted, setPredictionSubmitted] = useState(false);
  const [multiOrbit, setMultiOrbit] = useState(false);

  const angleRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number; a: number }[]>([]);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const flyingObjectsRef = useRef<FlyingObject[]>([]);
  const extraOrbitsRef = useRef<OrbitObject[]>([]);
  const stringBrokenRef = useRef(false);
  const breakSpeedRef = useRef(0);
  const pxPerMeter = 50;

  // Check if string should break
  const getCentripetalForce = useCallback((v: number, rMeters: number, m: number) => {
    return (m * v * v) / Math.max(rMeters, 0.1);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W * 0.45;
    const cy = H * 0.5;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const theta = angleRef.current;
    const R = Math.min(radius, Math.min(W, H) * 0.35);
    const radiusMeters = R / pxPerMeter;

    // Draw extra orbits (multi-orbit mode)
    if (multiOrbit) {
      const extras = extraOrbitsRef.current;
      for (const orb of extras) {
        const orbR = Math.min(orb.radius, Math.min(W, H) * 0.35);
        const obx = cx + orbR * Math.cos(orb.angle);
        const oby = cy - orbR * Math.sin(orb.angle);

        // Orbit path
        ctx.strokeStyle = `${orb.color}22`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Trail
        if (orb.trail.length > 1) {
          for (let i = 1; i < orb.trail.length; i++) {
            const alpha = (i / orb.trail.length) * 0.3;
            ctx.strokeStyle = `${orb.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(orb.trail[i - 1].x, orb.trail[i - 1].y);
            ctx.lineTo(orb.trail[i].x, orb.trail[i].y);
            ctx.stroke();
          }
        }

        // String
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(obx, oby);
        ctx.stroke();

        // Ball
        const bGrad = ctx.createRadialGradient(obx - 2, oby - 2, 0, obx, oby, 8);
        bGrad.addColorStop(0, orb.color);
        bGrad.addColorStop(1, `${orb.color}88`);
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(obx, oby, 8, 0, Math.PI * 2);
        ctx.fill();

        // Mass label
        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.textAlign = "center";
        ctx.fillText(`${orb.mass}kg`, obx, oby + 18);
      }
    }

    // Orbit path (main)
    if (!stringBrokenRef.current) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Radius line / string
    const bx = cx + R * Math.cos(theta);
    const by = cy - R * Math.sin(theta);

    if (!stringBrokenRef.current) {
      // String with tension visualization
      const fc = getCentripetalForce(speed, radiusMeters, mass);
      const tensionRatio = mode === "break" ? Math.min(fc / stringTension, 1) : 0;
      const stringColor = tensionRatio > 0.8
        ? `rgba(239,68,68,${0.3 + tensionRatio * 0.5})`
        : tensionRatio > 0.5
          ? `rgba(251,191,36,${0.2 + tensionRatio * 0.3})`
          : "rgba(255,255,255,0.15)";

      ctx.strokeStyle = stringColor;
      ctx.lineWidth = tensionRatio > 0.8 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // String strain effect (wobble when near breaking)
      if (tensionRatio > 0.7) {
        const wobble = Math.sin(performance.now() / 50) * tensionRatio * 3;
        ctx.strokeStyle = "rgba(239,68,68,0.2)";
        ctx.lineWidth = 1;
        const midX = (cx + bx) / 2;
        const midY = (cy + by) / 2;
        const perpX = -(by - cy) / R;
        const perpY = (bx - cx) / R;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(midX + perpX * wobble, midY + perpY * wobble, bx, by);
        ctx.stroke();
      }
    }

    // Trail (fading) - main
    const trail = trailRef.current;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.4;
        ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }

    // Flying objects (after release/break)
    for (const obj of flyingObjectsRef.current) {
      if (!obj.alive) continue;
      // Trail
      if (obj.trail.length > 1) {
        for (let i = 1; i < obj.trail.length; i++) {
          const alpha = (i / obj.trail.length) * 0.5;
          ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(obj.trail[i - 1].x, obj.trail[i - 1].y);
          ctx.lineTo(obj.trail[i].x, obj.trail[i].y);
          ctx.stroke();
        }
      }
      // Object
      const grad = ctx.createRadialGradient(obj.x - 2, obj.y - 2, 0, obj.x, obj.y, 10);
      grad.addColorStop(0, "#fbbf24");
      grad.addColorStop(1, "#f59e0b");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Angle arc
    if (!stringBrokenRef.current) {
      const arcR = 30;
      ctx.strokeStyle = "rgba(251,191,36,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (theta >= 0) {
        ctx.arc(cx, cy, arcR, 0, -theta, true);
      } else {
        ctx.arc(cx, cy, arcR, 0, -theta, false);
      }
      ctx.stroke();

      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      const degAngle = ((theta * 180) / Math.PI) % 360;
      ctx.fillText(`${degAngle.toFixed(0)}°`, cx + 42 * Math.cos(-theta / 2), cy + 42 * Math.sin(-theta / 2));
    }

    // Center point
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    if (showVectors && !stringBrokenRef.current) {
      const omega = speed / Math.max(radiusMeters, 0.1);
      const velMag = speed * 15;
      const accelMag = (speed * speed / Math.max(radiusMeters, 0.1)) * 4;

      // Velocity vector (tangential)
      const vx = -Math.sin(theta) * velMag;
      const vy = -Math.cos(theta) * velMag;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + vx, by + vy);
      ctx.stroke();
      const vmag = Math.sqrt(vx * vx + vy * vy);
      if (vmag > 5) {
        const nvx = vx / vmag;
        const nvy = vy / vmag;
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(bx + vx, by + vy);
        ctx.lineTo(bx + vx - nvx * 8 - nvy * 4, by + vy - nvy * 8 + nvx * 4);
        ctx.lineTo(bx + vx - nvx * 8 + nvy * 4, by + vy - nvy * 8 - nvx * 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = "11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.fillText("v", bx + vx * 0.5 + 12, by + vy * 0.5 + 5);

      // Centripetal acceleration (toward center)
      const ax = cx - bx;
      const ay = cy - by;
      const amag = Math.sqrt(ax * ax + ay * ay);
      const accelLen = Math.min(accelMag, amag * 0.7);
      const anx = ax / amag;
      const any = ay / amag;

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + anx * accelLen, by + any * accelLen);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(bx + anx * accelLen, by + any * accelLen);
      ctx.lineTo(bx + anx * (accelLen - 8) - any * 4, by + any * (accelLen - 8) + anx * 4);
      ctx.lineTo(bx + anx * (accelLen - 8) + any * 4, by + any * (accelLen - 8) - anx * 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillText("ac", bx + anx * accelLen * 0.5 - 15, by + any * accelLen * 0.5);

      // Legend
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(12, 12, 140, 55, 6);
      ctx.fill();
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = "#22c55e";
      ctx.fillText("-- velocity (tangent)", 22, 30);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("-- centripetal accel", 22, 48);

      // Omega display
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(12, 72, 140, 30, 6);
      ctx.fill();
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`\u03c9 = ${omega.toFixed(2)} rad/s`, 22, 92);
    }

    // Ball glow (main)
    if (!stringBrokenRef.current) {
      const ballGlow = ctx.createRadialGradient(bx, by, 0, bx, by, 25);
      ballGlow.addColorStop(0, "rgba(59,130,246,0.4)");
      ballGlow.addColorStop(1, "rgba(59,130,246,0)");
      ctx.fillStyle = ballGlow;
      ctx.beginPath();
      ctx.arc(bx, by, 25, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      const ballGrad = ctx.createRadialGradient(bx - 3, by - 3, 0, bx, by, 12);
      ballGrad.addColorStop(0, "#93c5fd");
      ballGrad.addColorStop(1, "#2563eb");
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(bx, by, 12, 0, Math.PI * 2);
      ctx.fill();

      // Mass label on ball
      ctx.font = "bold 9px ui-monospace";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(`${mass}kg`, bx, by + 3);
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now),
    );

    // Info panel
    const period = (2 * Math.PI * radiusMeters) / speed;
    const ac = (speed * speed) / radiusMeters;
    const fc = getCentripetalForce(speed, radiusMeters, mass);

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const panelH = mode === "break" ? 128 : 95;
    ctx.beginPath();
    ctx.roundRect(W - 195, 12, 183, panelH, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CIRCULAR MOTION", W - 183, 30);
    ctx.font = "12px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Speed:  ${speed.toFixed(1)} m/s`, W - 183, 48);
    ctx.fillText(`Radius: ${radiusMeters.toFixed(1)} m`, W - 183, 63);
    ctx.fillText(`Period: ${period.toFixed(2)} s`, W - 183, 78);
    ctx.fillText(`a_c:    ${ac.toFixed(1)} m/s\u00B2`, W - 183, 93);

    if (mode === "break") {
      ctx.fillStyle = fc > stringTension ? "#ef4444" : "#e2e8f0";
      ctx.fillText(`Force:  ${fc.toFixed(1)} N`, W - 183, 108);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Max T:  ${stringTension} N`, W - 183, 123);
    }

    // Tension meter for break mode
    if (mode === "break" && !stringBrokenRef.current) {
      drawMeter(ctx, W - 195, panelH + 20, 183, 12, fc, stringTension,
        fc / stringTension > 0.8 ? "#ef4444" : fc / stringTension > 0.5 ? "#f59e0b" : "#22c55e",
        `${Math.round((fc / stringTension) * 100)}% tension`
      );
    }

    // Break mode scoreboard
    if (mode === "break" || mode === "predict") {
      renderScoreboard(ctx, 12, H - 120, 150, 110, challengeRef.current);
    }

    // String broken notification
    if (stringBrokenRef.current) {
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.beginPath();
      const tw = 200;
      ctx.roundRect(W / 2 - tw / 2, 40, tw, 30, 8);
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("STRING BROKEN!", W / 2, 60);
    }

    // Mode badge
    if (mode !== "sandbox") {
      const labels: Record<SimMode, string> = {
        sandbox: "",
        break: "BREAK THE STRING",
        predict: "PREDICT a_c",
        release: "RELEASE MODE",
      };
      const badgeText = labels[mode];
      const badgeColor = mode === "break" ? "#ef4444" : mode === "predict" ? "#f59e0b" : "#22c55e";
      ctx.fillStyle = `${badgeColor}33`;
      ctx.beginPath();
      const badgeW = ctx.measureText(badgeText).width + 20;
      ctx.roundRect(W / 2 - badgeW / 2, H - 30, badgeW, 22, 6);
      ctx.fill();
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = badgeColor;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, W / 2, H - 15);
    }
  }, [radius, speed, mass, showVectors, mode, stringTension, getCentripetalForce, multiOrbit]);

  const animate = useCallback(() => {
    const R = Math.min(radius, 200);
    const radiusMeters = R / pxPerMeter;
    const omega = speed / Math.max(radiusMeters, 0.1);
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    // Update particles
    particlesRef.current.update(dt);

    const canvas = canvasRef.current;
    if (!canvas) { animRef.current = requestAnimationFrame(animate); return; }

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W * 0.45;
    const cy = H * 0.5;

    if (!stringBrokenRef.current) {
      angleRef.current += omega * dt;

      const R2 = Math.min(radius, Math.min(W, H) * 0.35);
      const bx = cx + R2 * Math.cos(angleRef.current);
      const by = cy - R2 * Math.sin(angleRef.current);
      trailRef.current.push({ x: bx, y: by, a: angleRef.current });
      if (trailRef.current.length > 120) trailRef.current.shift();

      // Check for string break
      if (mode === "break") {
        const fc = getCentripetalForce(speed, radiusMeters, mass);
        if (fc > stringTension) {
          stringBrokenRef.current = true;
          breakSpeedRef.current = speed;

          // Create flying object
          const theta = angleRef.current;
          const tangentVx = -Math.sin(theta) * speed * pxPerMeter;
          const tangentVy = -Math.cos(theta) * speed * pxPerMeter;

          flyingObjectsRef.current.push({
            x: bx,
            y: by,
            vx: tangentVx,
            vy: tangentVy,
            mass,
            color: "#fbbf24",
            trail: [{ x: bx, y: by }],
            alive: true,
          });

          // Emit break particles
          particlesRef.current.emitSparks(bx, by, 20, "#ef4444");
          particlesRef.current.emitSparks(cx, cy, 10, "#f59e0b");
          playSFX("collision");

          // Scoring for break mode
          const result = { points: 3, tier: "perfect" as const, label: "String Broken!" };
          challengeRef.current = updateChallengeState(challengeRef.current, result);
          scorePopupsRef.current.push({
            text: "SNAP!",
            points: 3,
            x: bx,
            y: by - 30,
            startTime: performance.now(),
          });
          playScore(3);
        }
      }
    }

    // Update flying objects
    for (const obj of flyingObjectsRef.current) {
      if (!obj.alive) continue;
      obj.vy += 300 * dt; // gravity on flying objects (visual scale)
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.trail.push({ x: obj.x, y: obj.y });
      if (obj.trail.length > 60) obj.trail.shift();

      // Emit trail sparks
      if (Math.random() < 0.3) {
        particlesRef.current.emitTrail(obj.x, obj.y, Math.atan2(obj.vy, obj.vx), "#f59e0b");
      }

      // Remove if off screen
      if (obj.x < -50 || obj.x > W + 50 || obj.y > H + 50 || obj.y < -50) {
        obj.alive = false;
      }
    }

    // Update extra orbits
    if (multiOrbit) {
      for (const orb of extraOrbitsRef.current) {
        const orbR = Math.min(orb.radius, Math.min(W, H) * 0.35);
        const orbRMeters = orbR / pxPerMeter;
        const orbOmega = orb.speed / Math.max(orbRMeters, 0.1);
        orb.angle += orbOmega * dt;
        const obx = cx + orbR * Math.cos(orb.angle);
        const oby = cy - orbR * Math.sin(orb.angle);
        orb.trail.push({ x: obx, y: oby, a: orb.angle });
        if (orb.trail.length > 80) orb.trail.shift();
      }
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [radius, speed, mass, draw, mode, stringTension, getCentripetalForce, multiOrbit]);

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

  // Release mode click handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "release") return;

    const cleanup = createDragHandler(canvas, {
      onClick: () => {
        if (!stringBrokenRef.current && isRunning) {
          const R2 = Math.min(radius, Math.min(canvas.clientWidth, canvas.clientHeight) * 0.35);
          const cx = canvas.clientWidth * 0.45;
          const cy = canvas.clientHeight * 0.5;
          const theta = angleRef.current;
          const bx = cx + R2 * Math.cos(theta);
          const by = cy - R2 * Math.sin(theta);

          // Tangential velocity
          const tangentVx = -Math.sin(theta) * speed * pxPerMeter;
          const tangentVy = -Math.cos(theta) * speed * pxPerMeter;

          flyingObjectsRef.current.push({
            x: bx,
            y: by,
            vx: tangentVx,
            vy: tangentVy,
            mass,
            color: "#fbbf24",
            trail: [{ x: bx, y: by }],
            alive: true,
          });

          stringBrokenRef.current = true;
          particlesRef.current.emitSparks(bx, by, 15, "#22c55e");
          playSFX("whoosh");
        }
      },
    });

    return cleanup;
  }, [mode, isRunning, radius, speed, mass]);

  const reset = () => {
    angleRef.current = 0;
    trailRef.current = [];
    lastTsRef.current = null;
    stringBrokenRef.current = false;
    flyingObjectsRef.current = [];
    particlesRef.current.clear();
    scorePopupsRef.current = [];
    setPredictionSubmitted(false);
    setPredictionInput("");
    draw();
  };

  const switchMode = (newMode: SimMode) => {
    reset();
    setMode(newMode);
    challengeRef.current = createChallengeState();
    if (newMode === "break") {
      setSpeed(3);
    }
  };

  const submitPrediction = () => {
    const predicted = parseFloat(predictionInput);
    if (isNaN(predicted) || predicted < 0) return;

    const radiusMeters = Math.min(radius, 200) / pxPerMeter;
    const actual = (speed * speed) / radiusMeters;
    const result = calculateAccuracy(predicted, actual, actual * 0.5 + 2);

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.clientWidth * 0.45 : 300;
    const cy = canvas ? canvas.clientHeight * 0.5 : 200;
    scorePopupsRef.current.push({
      text: `${result.label} (${actual.toFixed(1)} m/s\u00B2)`,
      points: result.points,
      x: cx,
      y: cy - 60,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
    } else {
      playSFX("incorrect");
    }

    setPredictionSubmitted(true);
    // Randomize for next round
    setTimeout(() => {
      setSpeed(Math.round((1 + Math.random() * 9) * 10) / 10);
      setRadius(50 + Math.round(Math.random() * 150));
      setPredictionSubmitted(false);
      setPredictionInput("");
    }, 2000);
  };

  const addExtraOrbit = () => {
    const orbitCount = extraOrbitsRef.current.length;
    if (orbitCount >= 4) return;
    const r = 60 + Math.random() * 140;
    const s = 1 + Math.random() * 8;
    const m = 1 + Math.round(Math.random() * 9);
    extraOrbitsRef.current.push({
      angle: Math.random() * Math.PI * 2,
      radius: r,
      speed: s,
      mass: m,
      color: ORBIT_COLORS[(orbitCount + 1) % ORBIT_COLORS.length],
      trail: [],
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className={`w-full ${mode === "release" ? "cursor-pointer" : ""}`}
        />
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Game Mode
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => switchMode("sandbox")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "sandbox"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Sandbox
          </button>
          <button
            onClick={() => switchMode("break")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "break"
                ? "bg-red-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Break the String
          </button>
          <button
            onClick={() => switchMode("predict")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "predict"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Predict a_c
          </button>
          <button
            onClick={() => switchMode("release")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "release"
                ? "bg-green-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Release Mode
          </button>
          <button
            onClick={() => { setMultiOrbit(!multiOrbit); if (!multiOrbit && extraOrbitsRef.current.length === 0) addExtraOrbit(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              multiOrbit
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Multi-Orbit {multiOrbit ? "ON" : "OFF"}
          </button>
        </div>
        {mode === "break" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Increase speed until centripetal force exceeds string tension ({stringTension} N). The object will fly off tangentially!
          </p>
        )}
        {mode === "predict" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Calculate the centripetal acceleration from the speed and radius shown, then enter your prediction below.
          </p>
        )}
        {mode === "release" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Click on the canvas to release the object. It will fly off tangentially at the current velocity!
          </p>
        )}
      </div>

      {/* Prediction input */}
      {mode === "predict" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Your Prediction: a_c = ? m/s&sup2;
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              value={predictionInput}
              onChange={(e) => setPredictionInput(e.target.value)}
              disabled={predictionSubmitted}
              placeholder="Enter centripetal acceleration..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono"
            />
            <button
              onClick={submitPrediction}
              disabled={predictionSubmitted || !predictionInput}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors"
            >
              {predictionSubmitted ? "Submitted" : "Check"}
            </button>
          </div>
          {predictionSubmitted && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              New values coming in 2 seconds...
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Radius</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={50} max={200} value={radius}
              onChange={(e) => { setRadius(Number(e.target.value)); reset(); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{(radius / pxPerMeter).toFixed(1)} m</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={15} step={0.1} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{speed.toFixed(1)} m/s</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mass</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={10} step={0.5} value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{mass} kg</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-2">
          {mode === "break" && (
            <>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Max Tension</label>
              <div className="flex items-center gap-3">
                <input type="range" min={10} max={200} step={5} value={stringTension}
                  onChange={(e) => { setStringTension(Number(e.target.value)); reset(); }}
                  className="flex-1 accent-red-500" />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{stringTension} N</span>
              </div>
            </>
          )}
          {mode !== "break" && (
            <div className="flex items-end gap-2 flex-1">
              <button onClick={() => setShowVectors(!showVectors)}
                className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                  showVectors ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}>
                Vectors {showVectors ? "ON" : "OFF"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors">
            {isRunning ? "Pause" : "Play"}
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
          {multiOrbit && (
            <button onClick={addExtraOrbit}
              disabled={extraOrbitsRef.current.length >= 4}
              className="h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors">
              + Orbit
            </button>
          )}
        </div>

        {/* Score display */}
        {(mode === "break" || mode === "predict") && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Score
                </label>
                <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {challengeRef.current.score}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {challengeRef.current.attempts} attempts
                </p>
                {challengeRef.current.streak > 0 && (
                  <p className="text-xs text-amber-500 font-medium">
                    Streak: {challengeRef.current.streak}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="a_c = \frac{v^2}{r}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="T = \frac{2\pi r}{v}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="F_c = \frac{mv^2}{r}" /></div>
        </div>
      </div>
    </div>
  );
}
