"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX } from "@/lib/simulation/sound";
import { drawMeter, drawInfoPanel as drawInfoPanelUtil } from "@/lib/simulation/drawing";
import { renderScoreboard, createChallengeState, updateChallengeState, renderScorePopup, type ScorePopup, type ChallengeState } from "@/lib/simulation/scoring";
import { SimMath } from "@/components/simulations/SimMath";

interface Point {
  x: number;
  y: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

function catmullRomDerivative(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * ((-p0 + p2) + (4 * p0 - 10 * p1 + 8 * p2 - 2 * p3) * t + (-3 * p0 + 9 * p1 - 9 * p2 + 3 * p3) * t * t);
}

function catmullRomSecondDerivative(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * ((4 * p0 - 10 * p1 + 8 * p2 - 2 * p3) + 2 * (-3 * p0 + 9 * p1 - 9 * p2 + 3 * p3) * t);
}

const PRESET_LOOP: Point[] = [
  { x: 0.08, y: 0.85 },
  { x: 0.2, y: 0.45 },
  { x: 0.32, y: 0.2 },
  { x: 0.42, y: 0.55 },
  { x: 0.5, y: 0.75 },
  { x: 0.58, y: 0.55 },
  { x: 0.68, y: 0.2 },
  { x: 0.78, y: 0.45 },
  { x: 0.92, y: 0.7 },
];

const PRESET_HILLS: Point[] = [
  { x: 0.05, y: 0.15 },
  { x: 0.15, y: 0.55 },
  { x: 0.28, y: 0.25 },
  { x: 0.42, y: 0.6 },
  { x: 0.55, y: 0.3 },
  { x: 0.68, y: 0.65 },
  { x: 0.82, y: 0.35 },
  { x: 0.95, y: 0.7 },
];

const PRESET_VALLEY: Point[] = [
  { x: 0.05, y: 0.2 },
  { x: 0.18, y: 0.45 },
  { x: 0.32, y: 0.75 },
  { x: 0.45, y: 0.88 },
  { x: 0.55, y: 0.88 },
  { x: 0.68, y: 0.75 },
  { x: 0.82, y: 0.45 },
  { x: 0.95, y: 0.2 },
];

const MAX_POINTS = 12;
const SPLINE_SAMPLES = 500;
const BALL_RADIUS = 10;

// Sound: rumble via Web Audio API
let rumbleOsc: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;
let rumbleCtx: AudioContext | null = null;

function startRumble() {
  if (typeof window === "undefined") return;
  try {
    if (!rumbleCtx) {
      rumbleCtx = new AudioContext();
    }
    if (rumbleCtx.state === "suspended") rumbleCtx.resume();
    if (rumbleOsc) return; // already running
    rumbleOsc = rumbleCtx.createOscillator();
    rumbleGain = rumbleCtx.createGain();
    rumbleOsc.type = "sawtooth";
    rumbleOsc.frequency.value = 40;
    rumbleGain.gain.value = 0;
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(rumbleCtx.destination);
    rumbleOsc.start();
  } catch {
    // Audio not available
  }
}

function updateRumble(speed: number) {
  if (!rumbleGain || !rumbleOsc) return;
  // speed 0-15 mapped to volume 0 - 0.08 and freq 30-80
  const normalizedSpeed = Math.min(speed / 12, 1);
  rumbleGain.gain.value = normalizedSpeed * 0.06;
  rumbleOsc.frequency.value = 30 + normalizedSpeed * 50;
}

function stopRumble() {
  if (rumbleOsc) {
    try { rumbleOsc.stop(); } catch { /* already stopped */ }
    rumbleOsc = null;
  }
  if (rumbleGain) {
    rumbleGain = null;
  }
}

export default function RollerCoasterDesigner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"draw" | "simulate">("draw");
  const [friction, setFriction] = useState(0);
  const [preset, setPreset] = useState<"loop" | "hills" | "valley" | "custom">("hills");
  const [controlPoints, setControlPoints] = useState<Point[]>([...PRESET_HILLS]);
  const [startHeight, setStartHeight] = useState(0.15);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const dragIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);

  // Simulation state
  const ballParamRef = useRef(0);
  const ballVelRef = useRef(0);
  const splineLengthsRef = useRef<number[]>([]);
  const totalEnergyRef = useRef(0);
  const energyHistoryRef = useRef<{ ke: number; pe: number; total: number }[]>([]);

  // Precomputed spline points
  const splinePointsRef = useRef<Point[]>([]);
  const splineDerivativesRef = useRef<Point[]>([]);
  const splineSecondDerivsRef = useRef<Point[]>([]);

  // Enhanced features
  const particleSystemRef = useRef(new ParticleSystem());
  const gForceRef = useRef(1.0);
  const maxGForceRef = useRef(1.0);
  const completedRef = useRef(false);
  const fellOffRef = useRef(false);
  const loopDetectedRef = useRef(false);
  const loopSuccessRef = useRef(false);
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const sparkTimerRef = useRef(0);
  const frameCountRef = useRef(0);

  const toCanvas = useCallback((pt: Point, W: number, H: number, margin: number): Point => {
    const trackW = W - margin * 2;
    const trackH = H * 0.65;
    const trackTop = H * 0.05;
    return {
      x: margin + pt.x * trackW,
      y: trackTop + pt.y * trackH,
    };
  }, []);

  const fromCanvas = useCallback((cx: number, cy: number, W: number, H: number, margin: number): Point => {
    const trackW = W - margin * 2;
    const trackH = H * 0.65;
    const trackTop = H * 0.05;
    return {
      x: Math.max(0.02, Math.min(0.98, (cx - margin) / trackW)),
      y: Math.max(0.05, Math.min(0.95, (cy - trackTop) / trackH)),
    };
  }, []);

  const computeSpline = useCallback((points: Point[]) => {
    if (points.length < 2) {
      splinePointsRef.current = [];
      splineDerivativesRef.current = [];
      splineSecondDerivsRef.current = [];
      return;
    }

    const n = points.length;
    const splinePoints: Point[] = [];
    const splineDerivatives: Point[] = [];
    const splineSecondDerivs: Point[] = [];
    const samplesPerSegment = Math.ceil(SPLINE_SAMPLES / Math.max(1, n - 1));

    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(n - 1, i + 1)];
      const p3 = points[Math.min(n - 1, i + 2)];

      for (let s = 0; s <= samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        if (i > 0 && s === 0) continue;

        splinePoints.push({
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
          y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        });
        splineDerivatives.push({
          x: catmullRomDerivative(p0.x, p1.x, p2.x, p3.x, t),
          y: catmullRomDerivative(p0.y, p1.y, p2.y, p3.y, t),
        });
        splineSecondDerivs.push({
          x: catmullRomSecondDerivative(p0.x, p1.x, p2.x, p3.x, t),
          y: catmullRomSecondDerivative(p0.y, p1.y, p2.y, p3.y, t),
        });
      }
    }

    splinePointsRef.current = splinePoints;
    splineDerivativesRef.current = splineDerivatives;
    splineSecondDerivsRef.current = splineSecondDerivs;

    // Compute arc-length segments
    const lengths: number[] = [0];
    for (let i = 1; i < splinePoints.length; i++) {
      const dx = splinePoints[i].x - splinePoints[i - 1].x;
      const dy = splinePoints[i].y - splinePoints[i - 1].y;
      lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    splineLengthsRef.current = lengths;

    // Detect loops: track segments where the track curves upward past vertical (curvature check)
    loopDetectedRef.current = false;
    for (let i = 10; i < splinePoints.length - 10; i++) {
      // A "loop" is when the track goes from descending to ascending back around
      // Detect by checking if there's a region where dy/dx reverses sign (track goes up then down then up)
      const prev = splinePoints[Math.max(0, i - 10)];
      const curr = splinePoints[i];
      const next = splinePoints[Math.min(splinePoints.length - 1, i + 10)];
      // Check curvature: if the second derivative indicates strong curvature inward
      const d1 = splineDerivatives[i];
      const d2 = splineSecondDerivs[i];
      const dMag = Math.sqrt(d1.x * d1.x + d1.y * d1.y);
      if (dMag < 0.0001) continue;
      // Curvature = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
      const curvature = Math.abs(d1.x * d2.y - d1.y * d2.x) / (dMag * dMag * dMag);
      // If curvature is very high and the point is above neighbors, it's likely a loop top
      if (curvature > 50 && curr.y < prev.y && curr.y < next.y) {
        loopDetectedRef.current = true;
        break;
      }
    }
  }, []);

  const getSplinePointAtParam = useCallback((param: number): { pos: Point; deriv: Point; secondDeriv: Point } => {
    const pts = splinePointsRef.current;
    const derivs = splineDerivativesRef.current;
    const secondDerivs = splineSecondDerivsRef.current;
    if (pts.length === 0) return { pos: { x: 0.5, y: 0.5 }, deriv: { x: 1, y: 0 }, secondDeriv: { x: 0, y: 0 } };

    const idx = Math.max(0, Math.min(pts.length - 1, Math.floor(param)));
    const frac = param - idx;

    if (idx >= pts.length - 1) {
      return { pos: pts[pts.length - 1], deriv: derivs[derivs.length - 1], secondDeriv: secondDerivs[secondDerivs.length - 1] };
    }

    const pos = {
      x: pts[idx].x + frac * (pts[idx + 1].x - pts[idx].x),
      y: pts[idx].y + frac * (pts[idx + 1].y - pts[idx].y),
    };
    const deriv = {
      x: derivs[idx].x + frac * (derivs[idx + 1].x - derivs[idx].x),
      y: derivs[idx].y + frac * (derivs[idx + 1].y - derivs[idx].y),
    };
    const secondDeriv = {
      x: secondDerivs[idx].x + frac * (secondDerivs[idx + 1].x - secondDerivs[idx].x),
      y: secondDerivs[idx].y + frac * (secondDerivs[idx + 1].y - secondDerivs[idx].y),
    };
    return { pos, deriv, secondDeriv };
  }, []);

  // Calculate G-force at current position
  const calculateGForce = useCallback((deriv: Point, secondDeriv: Point, speed: number): number => {
    const dMag = Math.sqrt(deriv.x * deriv.x + deriv.y * deriv.y);
    if (dMag < 0.0001) return 1.0;
    // Curvature = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
    const curvature = (deriv.x * secondDeriv.y - deriv.y * secondDeriv.x) / (dMag * dMag * dMag);
    // Centripetal acceleration = v^2 * curvature
    const centripetal = speed * speed * curvature;
    // Gravity component along normal
    // G-force = (centripetal + gravity component along normal) / g
    // But in our coordinate system y increases downward, so gravity = +9.8 in y
    const gForce = 1.0 + (centripetal * 30) / 9.8; // scale factor for visual
    return gForce;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const margin = 30;
    const trackH = H * 0.65;
    const trackTop = H * 0.05;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let gx = margin; gx <= W - margin; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, trackTop);
      ctx.lineTo(gx, trackTop + trackH);
      ctx.stroke();
    }
    for (let gy = trackTop; gy <= trackTop + trackH; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(margin, gy);
      ctx.lineTo(W - margin, gy);
      ctx.stroke();
    }

    const pts = splinePointsRef.current;

    // Draw track
    if (pts.length >= 2) {
      // Track fill below
      ctx.beginPath();
      const firstScreen = toCanvas(pts[0], W, H, margin);
      ctx.moveTo(firstScreen.x, firstScreen.y);
      for (let i = 1; i < pts.length; i++) {
        const sp = toCanvas(pts[i], W, H, margin);
        ctx.lineTo(sp.x, sp.y);
      }
      const lastScreen = toCanvas(pts[pts.length - 1], W, H, margin);
      ctx.lineTo(lastScreen.x, trackTop + trackH + 20);
      ctx.lineTo(firstScreen.x, trackTop + trackH + 20);
      ctx.closePath();
      const fillGrad = ctx.createLinearGradient(0, trackTop, 0, trackTop + trackH + 20);
      fillGrad.addColorStop(0, "rgba(51,65,85,0.2)");
      fillGrad.addColorStop(1, "rgba(30,41,59,0.5)");
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Track line
      ctx.beginPath();
      const firstPt = toCanvas(pts[0], W, H, margin);
      ctx.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < pts.length; i++) {
        const sp = toCanvas(pts[i], W, H, margin);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Track highlight
      ctx.beginPath();
      ctx.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < pts.length; i++) {
        const sp = toCanvas(pts[i], W, H, margin);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.strokeStyle = "rgba(148,163,184,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw control points
    if (mode === "draw") {
      for (let i = 0; i < controlPoints.length; i++) {
        const sp = toCanvas(controlPoints[i], W, H, margin);
        const isHovered = hoverIndexRef.current === i;
        const isDragging = dragIndexRef.current === i;

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, isHovered || isDragging ? 10 : 8, 0, Math.PI * 2);
        ctx.fillStyle = isDragging ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.1)";
        ctx.fill();
        ctx.strokeStyle = isHovered || isDragging ? "#3b82f6" : "rgba(148,163,184,0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#fbbf24" : "#ffffff";
        ctx.fill();

        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = "rgba(148,163,184,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(`${i + 1}`, sp.x, sp.y - 14);
      }

      if (controlPoints.length < 2) {
        ctx.font = "14px system-ui";
        ctx.fillStyle = "rgba(148,163,184,0.6)";
        ctx.textAlign = "center";
        ctx.fillText("Click to place control points (min 2, max 12)", W / 2, H / 2);
      } else if (controlPoints.length < MAX_POINTS) {
        ctx.font = "11px system-ui";
        ctx.fillStyle = "rgba(148,163,184,0.4)";
        ctx.textAlign = "center";
        ctx.fillText(`${controlPoints.length}/${MAX_POINTS} points — click to add, drag to move`, W / 2, trackTop + trackH + 18);
      }

      // Loop detection indicator
      if (loopDetectedRef.current && controlPoints.length >= 2) {
        ctx.font = "bold 10px ui-monospace";
        ctx.fillStyle = "#a855f7";
        ctx.textAlign = "left";
        ctx.fillText("LOOP DETECTED", margin, trackTop + 14);
      }
    }

    // Simulation: draw ball, particles, G-force, energy, scoring
    if (mode === "simulate" && pts.length >= 2) {
      const { pos, deriv } = getSplinePointAtParam(ballParamRef.current);
      const screenPos = toCanvas(pos, W, H, margin);

      const maxY = Math.max(...controlPoints.map(p => p.y));
      const refLineScreenY = trackTop + maxY * trackH;

      // Height indicator
      ctx.strokeStyle = "rgba(59,130,246,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(screenPos.x, screenPos.y);
      ctx.lineTo(screenPos.x, refLineScreenY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw particles (speed lines and sparks)
      particleSystemRef.current.draw(ctx);

      // Ball glow - intensify with speed
      const speed = Math.abs(ballVelRef.current) * 0.3;
      const glowIntensity = Math.min(speed / 8, 1);
      const glowRadius = 30 + glowIntensity * 20;
      const glow = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, glowRadius);
      glow.addColorStop(0, `rgba(251,191,36,${0.4 + glowIntensity * 0.3})`);
      glow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      const ballGrad = ctx.createRadialGradient(
        screenPos.x - 3, screenPos.y - 3, 0,
        screenPos.x, screenPos.y, BALL_RADIUS
      );
      if (fellOffRef.current) {
        ballGrad.addColorStop(0, "#fca5a5");
        ballGrad.addColorStop(1, "#ef4444");
      } else {
        ballGrad.addColorStop(0, "#fef08a");
        ballGrad.addColorStop(1, "#f59e0b");
      }
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = fellOffRef.current ? "rgba(239,68,68,0.6)" : "rgba(251,191,36,0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Velocity arrow
      if (Math.abs(ballVelRef.current) > 0.5) {
        const dMag = Math.sqrt(deriv.x * deriv.x + deriv.y * deriv.y);
        if (dMag > 0.001) {
          const dir = ballVelRef.current > 0 ? 1 : -1;
          const arrowLen = Math.min(Math.abs(ballVelRef.current) * 3, 60);
          const nx = (deriv.x / dMag) * dir;
          const ny = (deriv.y / dMag) * dir;
          const arrEndX = screenPos.x + nx * arrowLen;
          const arrEndY = screenPos.y + ny * arrowLen * (trackH / (W - margin * 2));

          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 2.5;
          ctx.shadowColor = "#22c55e";
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(arrEndX, arrEndY);
          ctx.stroke();

          const headLen = 8;
          const angle = Math.atan2(arrEndY - screenPos.y, arrEndX - screenPos.x);
          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.moveTo(arrEndX, arrEndY);
          ctx.lineTo(arrEndX - headLen * Math.cos(angle - 0.4), arrEndY - headLen * Math.sin(angle - 0.4));
          ctx.lineTo(arrEndX - headLen * Math.cos(angle + 0.4), arrEndY - headLen * Math.sin(angle + 0.4));
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // --- G-force meter (top-right area) ---
      const gForce = gForceRef.current;
      const gMeterX = W - margin - 140;
      const gMeterY = trackTop + 5;

      drawInfoPanelUtil(ctx, gMeterX, gMeterY, 135, 75, "G-FORCE", [
        { label: "Current", value: `${gForce.toFixed(1)} G`, color: gForce > 4 ? "#ef4444" : gForce > 2 ? "#f59e0b" : "#22c55e" },
        { label: "Max", value: `${maxGForceRef.current.toFixed(1)} G`, color: "#c4b5fd" },
        { label: "Status", value: gForce > 5 ? "DANGER!" : gForce > 3 ? "Thrilling!" : "Smooth", color: gForce > 5 ? "#ef4444" : gForce > 3 ? "#f59e0b" : "#94a3b8" },
      ]);

      // G-force bar
      const gBarColor = gForce > 5 ? "#ef4444" : gForce > 3 ? "#f59e0b" : gForce > 1.5 ? "#3b82f6" : "#22c55e";
      drawMeter(ctx, gMeterX + 5, gMeterY + 72, 125, 8, Math.abs(gForce), 6, gBarColor);

      // --- Loop success indicator ---
      if (loopDetectedRef.current) {
        const loopX = margin + 5;
        const loopY = trackTop + 5;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath();
        ctx.roundRect(loopX, loopY, 120, 30, 6);
        ctx.fill();
        ctx.font = "bold 10px ui-monospace";
        if (loopSuccessRef.current) {
          ctx.fillStyle = "#22c55e";
          ctx.textAlign = "left";
          ctx.fillText("LOOP: CLEARED!", loopX + 10, loopY + 19);
        } else if (fellOffRef.current) {
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "left";
          ctx.fillText("LOOP: FAILED!", loopX + 10, loopY + 19);
        } else {
          ctx.fillStyle = "#f59e0b";
          ctx.textAlign = "left";
          ctx.fillText("LOOP: IN PROGRESS", loopX + 10, loopY + 19);
        }
      }

      // --- "Survive the ride" scoring panel ---
      const challenge = challengeRef.current;
      if (challenge.active) {
        renderScoreboard(ctx, W - margin - 140, trackTop + 90, 135, 95, challenge);
      }

      // Score popups
      for (let i = scorePopupsRef.current.length - 1; i >= 0; i--) {
        const alive = renderScorePopup(ctx, scorePopupsRef.current[i], performance.now());
        if (!alive) scorePopupsRef.current.splice(i, 1);
      }

      // Energy bar chart
      const g = 9.8;
      const mass = 1;
      const maxTrackY = Math.max(...controlPoints.map(p => p.y));
      const h = (maxTrackY - pos.y);
      const KE = 0.5 * mass * speed * speed;
      const PE = mass * g * Math.max(0, h);
      const TE = KE + PE;

      if (energyHistoryRef.current.length === 0) {
        totalEnergyRef.current = TE;
      }
      energyHistoryRef.current.push({ ke: KE, pe: PE, total: TE });
      if (energyHistoryRef.current.length > 300) {
        energyHistoryRef.current.shift();
      }

      const barAreaX = margin;
      const barAreaY = trackTop + trackH + 30;
      const barAreaW = W - margin * 2;
      const barAreaH = H - barAreaY - 15;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(barAreaX - 10, barAreaY - 20, barAreaW + 20, barAreaH + 30, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("ENERGY", barAreaX, barAreaY - 6);

      const maxE = Math.max(totalEnergyRef.current * 1.2, 1);
      const barH = 16;
      const barY = barAreaY + 8;

      const keW = Math.max(0, (KE / maxE) * barAreaW);
      ctx.fillStyle = "#ef4444";
      if (keW > 2) {
        ctx.beginPath();
        ctx.roundRect(barAreaX, barY, keW, barH, 3);
        ctx.fill();
      }

      const peW = Math.max(0, (PE / maxE) * barAreaW);
      ctx.fillStyle = "#3b82f6";
      if (peW > 2) {
        ctx.beginPath();
        ctx.roundRect(barAreaX + keW, barY, peW, barH, 3);
        ctx.fill();
      }

      const teX = barAreaX + (TE / maxE) * barAreaW;
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(teX, barY - 3);
      ctx.lineTo(teX, barY + barH + 3);
      ctx.stroke();
      ctx.setLineDash([]);

      const initTeX = barAreaX + (totalEnergyRef.current / maxE) * barAreaW;
      ctx.strokeStyle = "rgba(168,85,247,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(initTeX, barY - 3);
      ctx.lineTo(initTeX, barY + barH + 3);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "11px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fca5a5";
      ctx.fillText(`KE = ${KE.toFixed(1)} J`, barAreaX, barY + barH + 16);

      ctx.textAlign = "center";
      ctx.fillStyle = "#93c5fd";
      ctx.fillText(`PE = ${PE.toFixed(1)} J`, barAreaX + barAreaW / 2, barY + barH + 16);

      ctx.textAlign = "right";
      ctx.fillStyle = "#c4b5fd";
      ctx.fillText(`Total = ${TE.toFixed(1)} J`, barAreaX + barAreaW, barY + barH + 16);

      ctx.font = "10px ui-monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = "#86efac";
      ctx.fillText(`v = ${speed.toFixed(1)} m/s`, barAreaX + barAreaW, barAreaY - 6);

      ctx.textAlign = "center";
      ctx.fillStyle = "#93c5fd";
      ctx.fillText(`h = ${h.toFixed(2)} m`, barAreaX + barAreaW / 2, barAreaY - 6);

      // Fell-off warning
      if (fellOffRef.current) {
        ctx.fillStyle = "rgba(239,68,68,0.15)";
        ctx.fillRect(0, 0, W, H);
        ctx.font = "bold 24px system-ui";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText("RIDER FELL OFF!", W / 2, trackTop + trackH / 2);
        ctx.font = "14px system-ui";
        ctx.fillStyle = "rgba(239,68,68,0.7)";
        ctx.fillText("G-force too high! Try a gentler design.", W / 2, trackTop + trackH / 2 + 30);
      }

      // Completed message
      if (completedRef.current && !fellOffRef.current) {
        ctx.font = "bold 20px system-ui";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "center";
        ctx.fillText("RIDE COMPLETE!", W / 2, trackTop + trackH / 2 - 10);
        ctx.font = "12px ui-monospace";
        ctx.fillStyle = "#86efac";
        ctx.fillText(`Max G: ${maxGForceRef.current.toFixed(1)} | Score: ${challengeRef.current.score}`, W / 2, trackTop + trackH / 2 + 15);
      }
    }

    // Mode indicator
    ctx.font = "bold 11px ui-monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = mode === "draw" ? "rgba(34,197,94,0.6)" : "rgba(251,191,36,0.6)";
    ctx.fillText(mode === "draw" ? "DESIGN MODE" : "SIMULATION MODE", W - margin, trackTop + 14);
  }, [mode, controlPoints, toCanvas, getSplinePointAtParam]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pts = splinePointsRef.current;
    if (pts.length < 2) return;

    const dt = 0.3;
    const g = 9.8;
    const totalPts = pts.length;
    const W = canvas.width;
    const H = canvas.height;
    const margin = 30;
    const trackH = H * 0.65;

    frameCountRef.current++;

    if (!fellOffRef.current && !completedRef.current) {
      const { pos: currentPos, deriv: currentDeriv, secondDeriv: currentSecondDeriv } = getSplinePointAtParam(ballParamRef.current);
      const dMag = Math.sqrt(currentDeriv.x * currentDeriv.x + currentDeriv.y * currentDeriv.y);

      if (dMag < 0.0001) {
        draw();
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const tangentY = currentDeriv.y / dMag;
      const gAccel = g * tangentY;
      const frictionAccel = -friction * ballVelRef.current * 2;

      // Velocity Verlet integration
      const accel1 = gAccel + frictionAccel;
      const velHalf = ballVelRef.current + accel1 * dt * 0.5;
      const newParam = ballParamRef.current + velHalf * dt;

      const { deriv: newDeriv } = getSplinePointAtParam(Math.max(0, Math.min(totalPts - 1, newParam)));
      const newDMag = Math.sqrt(newDeriv.x * newDeriv.x + newDeriv.y * newDeriv.y);
      const newTangentY = newDMag > 0.0001 ? newDeriv.y / newDMag : 0;
      const gAccel2 = g * newTangentY;
      const frictionAccel2 = -friction * velHalf * 2;
      const accel2 = gAccel2 + frictionAccel2;

      ballVelRef.current = velHalf + accel2 * dt * 0.5;
      ballParamRef.current = newParam;

      // Calculate G-force
      const speed = Math.abs(ballVelRef.current) * 0.3;
      const gForce = calculateGForce(currentDeriv, currentSecondDeriv, speed);
      gForceRef.current = gForce;
      maxGForceRef.current = Math.max(maxGForceRef.current, Math.abs(gForce));

      // Check for "fell off" (G-force exceeds safe threshold for sustained period)
      if (Math.abs(gForce) > 6.0) {
        fellOffRef.current = true;
        if (soundEnabled) playSFX("fail");
        // Spark explosion at failure point
        const screenPos = toCanvas(currentPos, W, H, margin);
        particleSystemRef.current.emitSparks(screenPos.x, screenPos.y, 40, "#ef4444");
        particleSystemRef.current.emitGlow(screenPos.x, screenPos.y, 10, "#ef4444");
        challengeRef.current = updateChallengeState(challengeRef.current, { points: 0, tier: "miss", label: "Fell Off!" });
        scorePopupsRef.current.push({ text: "Fell Off!", points: 0, x: screenPos.x, y: screenPos.y, startTime: performance.now() });
      }

      // Speed-based particle effects
      const screenPos = toCanvas(currentPos, W, H, margin);
      sparkTimerRef.current += dt;

      if (speed > 4 && sparkTimerRef.current > 0.1) {
        sparkTimerRef.current = 0;
        const moveAngle = Math.atan2(currentDeriv.y, currentDeriv.x);
        // Speed lines (trail behind the ball)
        particleSystemRef.current.emitTrail(screenPos.x, screenPos.y, moveAngle, "rgba(251,191,36,0.5)");

        // Sparks at very high speed
        if (speed > 8) {
          particleSystemRef.current.emitSparks(
            screenPos.x + (Math.random() - 0.5) * 10,
            screenPos.y + (Math.random() - 0.5) * 10,
            Math.floor(speed / 4),
            "#fbbf24"
          );
        }
      }

      // Update sound rumble
      if (soundEnabled) {
        updateRumble(speed);
      }

      // Boundary conditions
      if (ballParamRef.current <= 0) {
        ballParamRef.current = 0;
        ballVelRef.current = Math.abs(ballVelRef.current) * 0.9;
      }
      if (ballParamRef.current >= totalPts - 1) {
        ballParamRef.current = totalPts - 1;
        // Track completed!
        if (!completedRef.current) {
          completedRef.current = true;
          if (soundEnabled) playSFX("success");
          particleSystemRef.current.emitConfetti(screenPos.x, screenPos.y, 40);

          // Score based on max G and completion
          let points = 3;
          let label = "Perfect Ride!";
          if (maxGForceRef.current > 5) { points = 1; label = "Rough Ride!"; }
          else if (maxGForceRef.current > 3) { points = 2; label = "Thrilling Ride!"; }
          if (loopDetectedRef.current) {
            loopSuccessRef.current = true;
            points = Math.min(points + 1, 3);
            label = "Loop Cleared! " + label;
          }
          challengeRef.current = updateChallengeState(challengeRef.current, { points, tier: points === 3 ? "perfect" : points === 2 ? "great" : "close", label });
          scorePopupsRef.current.push({ text: label, points, x: W / 2, y: trackH / 2, startTime: performance.now() });
        }
        ballVelRef.current = -Math.abs(ballVelRef.current) * 0.9;
      }
    }

    // Update particles
    particleSystemRef.current.update(0.016);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [getSplinePointAtParam, friction, draw, calculateGForce, toCanvas, soundEnabled]);

  // Recompute spline whenever control points change
  useEffect(() => {
    computeSpline(controlPoints);
    draw();
  }, [controlPoints, computeSpline, draw]);

  // Start/stop animation
  useEffect(() => {
    if (isRunning && mode === "simulate") {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, mode, animate]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.6, 520);
      computeSpline(controlPoints);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, computeSpline]);

  // Mouse handlers for drawing mode
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;

    const getMousePos = (e: MouseEvent): { cx: number; cy: number } => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        cx: (e.clientX - rect.left) * scaleX,
        cy: (e.clientY - rect.top) * scaleY,
      };
    };

    const margin = 30;
    const findNearPoint = (cx: number, cy: number): number => {
      for (let i = 0; i < controlPoints.length; i++) {
        const sp = toCanvas(controlPoints[i], canvas.width, canvas.height, margin);
        const dx = cx - sp.x;
        const dy = cy - sp.y;
        if (dx * dx + dy * dy < 225) return i;
      }
      return -1;
    };

    const handleMouseDown = (e: MouseEvent) => {
      const { cx, cy } = getMousePos(e);
      const nearIdx = findNearPoint(cx, cy);

      if (nearIdx >= 0) {
        dragIndexRef.current = nearIdx;
      } else if (controlPoints.length < MAX_POINTS) {
        const newPt = fromCanvas(cx, cy, canvas.width, canvas.height, margin);
        const newPoints = [...controlPoints];
        let insertIdx = newPoints.length;
        for (let i = 0; i < newPoints.length; i++) {
          if (newPt.x < newPoints[i].x) {
            insertIdx = i;
            break;
          }
        }
        newPoints.splice(insertIdx, 0, newPt);
        setControlPoints(newPoints);
        setPreset("custom");
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const { cx, cy } = getMousePos(e);

      if (dragIndexRef.current !== null) {
        const newPt = fromCanvas(cx, cy, canvas.width, canvas.height, margin);
        setControlPoints(prev => {
          const updated = [...prev];
          updated[dragIndexRef.current!] = newPt;
          return updated;
        });
        if (dragIndexRef.current === 0) {
          setStartHeight(fromCanvas(cx, cy, canvas.width, canvas.height, margin).y);
        }
        setPreset("custom");
      } else {
        const nearIdx = findNearPoint(cx, cy);
        if (nearIdx !== hoverIndexRef.current) {
          hoverIndexRef.current = nearIdx;
          canvas.style.cursor = nearIdx >= 0 ? "grab" : (controlPoints.length < MAX_POINTS ? "crosshair" : "default");
          draw();
        }
      }
    };

    const handleMouseUp = () => {
      if (dragIndexRef.current !== null) {
        setControlPoints(prev => {
          const sorted = [...prev].sort((a, b) => a.x - b.x);
          return sorted;
        });
      }
      dragIndexRef.current = null;
      canvas.style.cursor = controlPoints.length < MAX_POINTS ? "crosshair" : "default";
    };

    const handleMouseLeave = () => {
      dragIndexRef.current = null;
      hoverIndexRef.current = null;
      draw();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    canvas.style.cursor = controlPoints.length < MAX_POINTS ? "crosshair" : "default";

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [mode, controlPoints, toCanvas, fromCanvas, draw]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      stopRumble();
    };
  }, []);

  const loadPreset = (type: "loop" | "hills" | "valley" | "custom") => {
    setPreset(type);
    setIsRunning(false);
    setMode("draw");
    if (type === "loop") setControlPoints([...PRESET_LOOP]);
    else if (type === "hills") setControlPoints([...PRESET_HILLS]);
    else if (type === "valley") setControlPoints([...PRESET_VALLEY]);
    else setControlPoints([]);
  };

  const startSimulation = () => {
    if (controlPoints.length < 2) return;
    setMode("simulate");
    ballParamRef.current = 0;
    ballVelRef.current = 0;
    energyHistoryRef.current = [];
    totalEnergyRef.current = 0;
    gForceRef.current = 1.0;
    maxGForceRef.current = 1.0;
    completedRef.current = false;
    fellOffRef.current = false;
    loopSuccessRef.current = false;
    particleSystemRef.current.clear();
    scorePopupsRef.current = [];
    challengeRef.current = { ...challengeRef.current, active: true };
    sparkTimerRef.current = 0;
    frameCountRef.current = 0;
    computeSpline(controlPoints);
    if (soundEnabled) {
      startRumble();
      playSFX("launch");
    }
    setIsRunning(true);
  };

  const stopSimulation = () => {
    setIsRunning(false);
    setMode("draw");
    cancelAnimationFrame(animRef.current);
    stopRumble();
  };

  const resetSimulation = () => {
    ballParamRef.current = 0;
    ballVelRef.current = 0;
    energyHistoryRef.current = [];
    totalEnergyRef.current = 0;
    gForceRef.current = 1.0;
    maxGForceRef.current = 1.0;
    completedRef.current = false;
    fellOffRef.current = false;
    loopSuccessRef.current = false;
    particleSystemRef.current.clear();
    scorePopupsRef.current = [];
    sparkTimerRef.current = 0;
    if (soundEnabled) {
      startRumble();
    }
    draw();
  };

  // Update first control point when startHeight slider changes
  useEffect(() => {
    if (controlPoints.length > 0 && mode === "draw") {
      setControlPoints(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], y: startHeight };
        return updated;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startHeight]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Preset Tracks */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Preset Tracks
          </label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(["hills", "loop", "valley", "custom"] as const).map((t) => (
              <button
                key={t}
                onClick={() => loadPreset(t)}
                className={`h-9 rounded-lg text-xs font-medium capitalize transition-colors ${
                  preset === t
                    ? "bg-amber-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Friction */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Friction
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={friction}
              onChange={(e) => setFriction(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {friction.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {friction === 0 ? "No friction — total energy conserved" : "Energy dissipated as heat"}
          </p>
        </div>

        {/* Start Height */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Start Height
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.05}
              max={0.9}
              step={0.01}
              value={startHeight}
              onChange={(e) => setStartHeight(Number(e.target.value))}
              className="flex-1 accent-blue-500"
              disabled={mode === "simulate"}
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {((1 - startHeight) * 10).toFixed(1)}m
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Drag first point or use slider
          </p>
        </div>

        {/* Controls */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Simulation
          </label>
          {mode === "draw" ? (
            <div className="flex gap-2 mt-1">
              <button
                onClick={startSimulation}
                disabled={controlPoints.length < 2}
                className={`flex-1 h-10 rounded-lg font-medium text-sm transition-colors ${
                  controlPoints.length < 2
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
                }`}
              >
                Run
              </button>
              <button
                onClick={() => { setControlPoints([]); setPreset("custom"); }}
                className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setIsRunning(!isRunning)}
                className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
              >
                {isRunning ? "Pause" : "Play"}
              </button>
              <button
                onClick={resetSimulation}
                className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
              >
                Reset
              </button>
              <button
                onClick={stopSimulation}
                className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sound toggle and score display */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Sound Effects
          </label>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) {
                  // Initialize audio context on user gesture
                  startRumble();
                  stopRumble();
                }
              }}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                soundEnabled
                  ? "bg-amber-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Sound: {soundEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Rumble increases with speed
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Ride Score
          </label>
          <div className="flex items-center gap-4 mt-2">
            <div className="text-2xl font-bold font-mono text-amber-500">
              {challengeRef.current.score}
            </div>
            <div className="text-xs text-gray-400">
              <div>Attempts: {challengeRef.current.attempts}</div>
              <div>Best Streak: {challengeRef.current.bestStreak}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Conservation of Energy
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            KE = ½mv²
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            PE = mgh
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            E_total = KE + PE
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            G = a_n / g
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Design your own roller coaster track by clicking to place control points. The ball will follow the track
          under gravity. The G-force meter shows forces experienced by the rider — exceed 6G and the rider falls off!
          Complete the track to score points. Loops earn bonus points. With zero friction, total mechanical energy
          is conserved — the purple total-energy line stays flat.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E = \frac{1}{2}mv^2 + mgh" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="v = \sqrt{2g\Delta h}" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Click to place track points and design your coaster. The ball must have enough energy to clear each hill!
      </p>
    </div>
  );
}
