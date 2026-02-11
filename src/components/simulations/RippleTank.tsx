"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX } from "@/lib/simulation/sound";
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { renderScoreboard, renderScorePopup, createChallengeState, updateChallengeState, calculateAccuracy, type ScorePopup, type ChallengeState } from "@/lib/simulation/scoring";

interface WaveSource {
  x: number;
  y: number;
  phase: number;
  id: number;
}

interface BarrierSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ProbePoint {
  x: number;
  y: number;
  history: number[];
}

interface WavelengthMeasurement {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type InteractionMode = "source" | "barrier" | "probe" | "wavelength";

const GRID_W = 300;
const GRID_H = 200;
const MAX_SOURCES = 5;
const PROBE_HISTORY_LEN = 120;

// Challenge patterns: target source configurations
interface ChallengePattern {
  name: string;
  description: string;
  sources: { x: number; y: number; phase: number }[];
  frequency: number;
  tolerance: number;
}

const CHALLENGE_PATTERNS: ChallengePattern[] = [
  {
    name: "Two-Source Interference",
    description: "Place 2 sources 0.3 apart horizontally, centered vertically",
    sources: [
      { x: 0.35, y: 0.5, phase: 0 },
      { x: 0.65, y: 0.5, phase: 0 },
    ],
    frequency: 4,
    tolerance: 0.08,
  },
  {
    name: "Close Spacing",
    description: "Place 2 sources very close together (0.1 apart)",
    sources: [
      { x: 0.45, y: 0.5, phase: 0 },
      { x: 0.55, y: 0.5, phase: 0 },
    ],
    frequency: 6,
    tolerance: 0.06,
  },
  {
    name: "Triangle Formation",
    description: "Place 3 sources in an equilateral triangle",
    sources: [
      { x: 0.5, y: 0.3, phase: 0 },
      { x: 0.35, y: 0.6, phase: 0 },
      { x: 0.65, y: 0.6, phase: 0 },
    ],
    frequency: 5,
    tolerance: 0.08,
  },
];

// Sound: tone matching wave frequency
let toneOsc: OscillatorNode | null = null;
let toneGain: GainNode | null = null;
let toneCtx: AudioContext | null = null;

function startTone(freq: number) {
  if (typeof window === "undefined") return;
  try {
    if (!toneCtx) toneCtx = new AudioContext();
    if (toneCtx.state === "suspended") toneCtx.resume();
    if (toneOsc) return;
    toneOsc = toneCtx.createOscillator();
    toneGain = toneCtx.createGain();
    toneOsc.type = "sine";
    toneOsc.frequency.value = 220 + freq * 40;
    toneGain.gain.value = 0.04;
    toneOsc.connect(toneGain);
    toneGain.connect(toneCtx.destination);
    toneOsc.start();
  } catch { /* audio not available */ }
}

function updateTone(freq: number) {
  if (toneOsc) toneOsc.frequency.value = 220 + freq * 40;
}

function stopTone() {
  if (toneOsc) {
    try { toneOsc.stop(); } catch { /* already stopped */ }
    toneOsc = null;
  }
  toneGain = null;
}

export default function RippleTank() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const barrierGridRef = useRef<Uint8Array>(new Uint8Array(GRID_W * GRID_H));

  const [sources, setSources] = useState<WaveSource[]>([
    { x: 0.35, y: 0.5, phase: 0, id: 1 },
    { x: 0.65, y: 0.5, phase: 0, id: 2 },
  ]);
  const [barriers, setBarriers] = useState<BarrierSegment[]>([]);
  const [frequency, setFrequency] = useState(4);
  const [amplitude, setAmplitude] = useState(1.0);
  const [waveSpeed, setWaveSpeed] = useState(120);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<InteractionMode>("source");
  const [grayscale, setGrayscale] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showParticleTrails, setShowParticleTrails] = useState(false);
  const [challengeActive, setChallengeActive] = useState(false);
  const [currentChallenge, setCurrentChallenge] = useState(0);

  const nextIdRef = useRef(3);
  const drawingBarrierRef = useRef<{ x1: number; y1: number } | null>(null);
  const tempBarrierEndRef = useRef<{ x2: number; y2: number } | null>(null);

  // Enhanced features
  const probesRef = useRef<ProbePoint[]>([]);
  const wavelengthMeasRef = useRef<WavelengthMeasurement | null>(null);
  const wavelengthStartRef = useRef<{ x: number; y: number } | null>(null);
  const particleSystemRef = useRef(new ParticleSystem());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const soundEnabledRef = useRef(soundEnabled);
  const showParticleTrailsRef = useRef(showParticleTrails);
  const challengeActiveRef = useRef(challengeActive);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { showParticleTrailsRef.current = showParticleTrails; }, [showParticleTrails]);
  useEffect(() => { challengeActiveRef.current = challengeActive; }, [challengeActive]);

  // Rebuild barrier grid whenever barriers change
  const rebuildBarrierGrid = useCallback((barrierList: BarrierSegment[]) => {
    const grid = barrierGridRef.current;
    grid.fill(0);

    for (const seg of barrierList) {
      const gx1 = Math.round(seg.x1 * GRID_W);
      const gy1 = Math.round(seg.y1 * GRID_H);
      const gx2 = Math.round(seg.x2 * GRID_W);
      const gy2 = Math.round(seg.y2 * GRID_H);

      const dx = Math.abs(gx2 - gx1);
      const dy = Math.abs(gy2 - gy1);
      const sx = gx1 < gx2 ? 1 : -1;
      const sy = gy1 < gy2 ? 1 : -1;
      let err = dx - dy;
      let cx = gx1;
      let cy = gy1;

      const thickness = 2;
      const setThick = (px: number, py: number) => {
        for (let tx = -thickness; tx <= thickness; tx++) {
          for (let ty = -thickness; ty <= thickness; ty++) {
            const fx = px + tx;
            const fy = py + ty;
            if (fx >= 0 && fx < GRID_W && fy >= 0 && fy < GRID_H) {
              grid[fy * GRID_W + fx] = 1;
            }
          }
        }
      };

      while (true) {
        setThick(cx, cy);
        if (cx === gx2 && cy === gy2) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
      }
    }
  }, []);

  const applyPreset = useCallback((type: "single-slit" | "double-slit") => {
    const newBarriers: BarrierSegment[] = [];
    const wallX = 0.5;
    const gapWidth = 0.06;

    if (type === "single-slit") {
      newBarriers.push({ x1: wallX, y1: 0, x2: wallX, y2: 0.5 - gapWidth });
      newBarriers.push({ x1: wallX, y1: 0.5 + gapWidth, x2: wallX, y2: 1.0 });
      setSources([{ x: 0.2, y: 0.5, phase: 0, id: nextIdRef.current++ }]);
    } else {
      const sep = 0.1;
      newBarriers.push({ x1: wallX, y1: 0, x2: wallX, y2: 0.5 - sep - gapWidth });
      newBarriers.push({ x1: wallX, y1: 0.5 - sep + gapWidth, x2: wallX, y2: 0.5 + sep - gapWidth });
      newBarriers.push({ x1: wallX, y1: 0.5 + sep + gapWidth, x2: wallX, y2: 1.0 });
      setSources([{ x: 0.2, y: 0.5, phase: 0, id: nextIdRef.current++ }]);
    }

    setBarriers(newBarriers);
    rebuildBarrierGrid(newBarriers);
  }, [rebuildBarrierGrid]);

  // Calculate wave amplitude at a given point
  const getAmplitudeAt = useCallback((nx: number, ny: number, t: number): number => {
    const omega = 2 * Math.PI * frequency;
    const lambda = waveSpeed / frequency;
    const k = 2 * Math.PI / lambda;
    const barrierGrid = barrierGridRef.current;

    const gx = Math.round(nx * GRID_W);
    const gy = Math.round(ny * GRID_H);
    if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H && barrierGrid[gy * GRID_W + gx] === 1) return 0;

    const wx = nx * 600;
    const wy = ny * 400;
    let totalAmp = 0;

    for (const src of sources) {
      const sx = src.x * 600;
      const sy = src.y * 400;
      const dx = wx - sx;
      const dy = wy - sy;
      const r = Math.sqrt(dx * dx + dy * dy);

      if (r < 0.5) { totalAmp += amplitude; continue; }

      let blocked = false;
      const steps = Math.min(Math.ceil(r / 3), 80);
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        const checkGx = Math.round((sx + dx * frac) / 600 * GRID_W);
        const checkGy = Math.round((sy + dy * frac) / 400 * GRID_H);
        if (checkGx >= 0 && checkGx < GRID_W && checkGy >= 0 && checkGy < GRID_H) {
          if (barrierGrid[checkGy * GRID_W + checkGx] === 1) { blocked = true; break; }
        }
      }
      if (blocked) continue;

      const falloff = 1 / Math.sqrt(r + 1);
      totalAmp += amplitude * falloff * Math.sin(k * r - omega * t + src.phase);
    }
    return totalAmp;
  }, [sources, frequency, amplitude, waveSpeed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    if (!imageDataRef.current || imageDataRef.current.width !== GRID_W || imageDataRef.current.height !== GRID_H) {
      imageDataRef.current = ctx.createImageData(GRID_W, GRID_H);
    }
    const imgData = imageDataRef.current;
    const pixels = imgData.data;

    const t = timeRef.current;
    const omega = 2 * Math.PI * frequency;
    const lambda = waveSpeed / frequency;
    const k = 2 * Math.PI / lambda;
    const barrierGrid = barrierGridRef.current;

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const idx = gy * GRID_W + gx;
        const pidx = idx * 4;

        if (barrierGrid[idx] === 1) {
          pixels[pidx] = 71;
          pixels[pidx + 1] = 85;
          pixels[pidx + 2] = 105;
          pixels[pidx + 3] = 255;
          continue;
        }

        const wx = (gx / GRID_W) * 600;
        const wy = (gy / GRID_H) * 400;
        let totalAmp = 0;

        for (const src of sources) {
          const sx = src.x * 600;
          const sy = src.y * 400;
          const dx = wx - sx;
          const dy = wy - sy;
          const r = Math.sqrt(dx * dx + dy * dy);

          if (r < 0.5) { totalAmp += amplitude; continue; }

          let blocked = false;
          const steps = Math.min(Math.ceil(r / 3), 80);
          for (let s = 1; s < steps; s++) {
            const frac = s / steps;
            const checkGx = Math.round((sx + dx * frac) / 600 * GRID_W);
            const checkGy = Math.round((sy + dy * frac) / 400 * GRID_H);
            if (checkGx >= 0 && checkGx < GRID_W && checkGy >= 0 && checkGy < GRID_H) {
              if (barrierGrid[checkGy * GRID_W + checkGx] === 1) { blocked = true; break; }
            }
          }
          if (blocked) continue;

          const falloff = 1 / Math.sqrt(r + 1);
          totalAmp += amplitude * falloff * Math.sin(k * r - omega * t + src.phase);
        }

        const clamped = Math.max(-1, Math.min(1, totalAmp));

        if (grayscale) {
          const val = Math.round((clamped + 1) * 0.5 * 255);
          pixels[pidx] = val;
          pixels[pidx + 1] = val;
          pixels[pidx + 2] = val;
        } else {
          if (clamped > 0) {
            const v = clamped;
            pixels[pidx] = Math.round(v * 239);
            pixels[pidx + 1] = Math.round(v * 68);
            pixels[pidx + 2] = Math.round(v * 68);
          } else {
            const v = -clamped;
            pixels[pidx] = Math.round(v * 59);
            pixels[pidx + 1] = Math.round(v * 130);
            pixels[pidx + 2] = Math.round(v * 246);
          }
        }
        pixels[pidx + 3] = 255;
      }
    }

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = GRID_W;
    tmpCanvas.height = GRID_H;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (tmpCtx) {
      tmpCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";
      ctx.drawImage(tmpCanvas, 0, 0, W, H);
    }

    // Particle trails (showing energy flow direction)
    if (showParticleTrailsRef.current) {
      particleSystemRef.current.draw(ctx);
    }

    // Draw barrier preview line while dragging
    if (drawingBarrierRef.current && tempBarrierEndRef.current) {
      const b = drawingBarrierRef.current;
      const e = tempBarrierEndRef.current;
      ctx.strokeStyle = "rgba(71,85,105,0.8)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x1 * W, b.y1 * H);
      ctx.lineTo(e.x2 * W, e.y2 * H);
      ctx.stroke();
    }

    // Draw sources as pulsing dots
    for (const src of sources) {
      const sx = src.x * W;
      const sy = src.y * H;
      const pulseRadius = 6 + 2 * Math.sin(omega * t);

      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, pulseRadius * 3);
      glow.addColorStop(0, "rgba(0,255,255,0.6)");
      glow.addColorStop(0.5, "rgba(0,255,255,0.15)");
      glow.addColorStop(1, "rgba(0,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, pulseRadius * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,255,255,0.8)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sx, sy, pulseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw probes
    for (const probe of probesRef.current) {
      const px = probe.x * W;
      const py = probe.y * H;

      // Probe marker
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 12, py);
      ctx.lineTo(px - 6, py);
      ctx.moveTo(px + 6, py);
      ctx.lineTo(px + 12, py);
      ctx.moveTo(px, py - 12);
      ctx.lineTo(px, py - 6);
      ctx.moveTo(px, py + 6);
      ctx.lineTo(px, py + 12);
      ctx.stroke();

      // Amplitude vs time mini-graph
      if (probe.history.length > 2) {
        const graphW = 100;
        const graphH = 40;
        const graphX = Math.min(px + 15, W - graphW - 5);
        const graphY = Math.max(py - graphH - 5, 5);

        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(graphX, graphY, graphW, graphH, 4);
        ctx.fill();

        ctx.strokeStyle = "rgba(245,158,11,0.3)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(graphX, graphY + graphH / 2);
        ctx.lineTo(graphX + graphW, graphY + graphH / 2);
        ctx.stroke();

        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = graphW / Math.min(probe.history.length, PROBE_HISTORY_LEN);
        for (let i = 0; i < probe.history.length; i++) {
          const hx = graphX + i * step;
          const hy = graphY + graphH / 2 - probe.history[i] * graphH * 0.4;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.stroke();

        // Current amplitude label
        const currentAmp = probe.history[probe.history.length - 1] || 0;
        ctx.font = "8px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "left";
        ctx.fillText(`A=${currentAmp.toFixed(2)}`, graphX + 3, graphY + 10);
      }
    }

    // Wavelength measurement tool
    const wlMeas = wavelengthMeasRef.current;
    if (wlMeas) {
      const x1p = wlMeas.x1 * W;
      const y1p = wlMeas.y1 * H;
      const x2p = wlMeas.x2 * W;
      const y2p = wlMeas.y2 * H;

      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(x1p, y1p);
      ctx.lineTo(x2p, y2p);
      ctx.stroke();
      ctx.setLineDash([]);

      // Endpoint markers
      for (const p of [{ x: x1p, y: y1p }, { x: x2p, y: y2p }]) {
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Distance label
      const dx = (wlMeas.x2 - wlMeas.x1) * 600;
      const dy = (wlMeas.y2 - wlMeas.y1) * 400;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const lambdaVal = waveSpeed / frequency;
      const lambdas = dist / lambdaVal;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      const labelX = (x1p + x2p) / 2;
      const labelY = (y1p + y2p) / 2 - 15;
      ctx.beginPath();
      ctx.roundRect(labelX - 60, labelY - 12, 120, 28, 4);
      ctx.fill();

      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText(`d=${dist.toFixed(1)} = ${lambdas.toFixed(2)}\u03BB`, labelX, labelY + 5);
    }

    // Wavelength measurement in progress
    if (wavelengthStartRef.current && mode === "wavelength") {
      const sp = wavelengthStartRef.current;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(sp.x * W, sp.y * H, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Info panel
    const panelX = 10;
    const panelY = 10;

    drawInfoPanel(ctx, panelX, panelY, 170, 85, "RIPPLE TANK", [
      { label: "Sources", value: `${sources.length} / ${MAX_SOURCES}`, color: "#00ffff" },
      { label: "f", value: `${frequency.toFixed(1)} Hz`, color: "#e2e8f0" },
      { label: "\u03BB = v/f", value: `${(waveSpeed / frequency).toFixed(1)} units`, color: "#e2e8f0" },
      { label: "Probes", value: `${probesRef.current.length}`, color: "#f59e0b" },
    ]);

    // Challenge panel
    if (challengeActiveRef.current) {
      const challenge = CHALLENGE_PATTERNS[currentChallenge];
      renderScoreboard(ctx, W - 160, 10, 148, 100, challengeRef.current);

      // Challenge description
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 160, 116, 148, 40, 6);
      ctx.fill();
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(challenge.name, W - 86, 132);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "8px system-ui";
      // Word wrap description
      const words = challenge.description.split(" ");
      let line = "";
      let lineY = 144;
      for (const word of words) {
        const test = line + word + " ";
        if (ctx.measureText(test).width > 136) {
          ctx.fillText(line, W - 86, lineY);
          line = word + " ";
          lineY += 10;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, W - 86, lineY);
    }

    // Score popups
    for (let i = scorePopupsRef.current.length - 1; i >= 0; i--) {
      const alive = renderScorePopup(ctx, scorePopupsRef.current[i], performance.now());
      if (!alive) scorePopupsRef.current.splice(i, 1);
    }

    // Mode indicator
    const modeLabels: Record<InteractionMode, string> = {
      source: "Click: Place Source",
      barrier: "Click+Drag: Draw Barrier",
      probe: "Click: Place Probe",
      wavelength: "Click 2 Points: Measure",
    };
    const modeColors: Record<InteractionMode, string> = {
      source: "rgba(0,255,255,0.7)",
      barrier: "rgba(71,85,105,0.9)",
      probe: "rgba(245,158,11,0.7)",
      wavelength: "rgba(34,197,94,0.7)",
    };
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = modeColors[mode];
    ctx.textAlign = "right";
    ctx.fillText(modeLabels[mode], W - 10, H - 10);
  }, [sources, frequency, amplitude, waveSpeed, grayscale, mode, currentChallenge]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;

    // Update probes
    const t = timeRef.current;
    for (const probe of probesRef.current) {
      const amp = getAmplitudeAt(probe.x, probe.y, t);
      probe.history.push(Math.max(-1, Math.min(1, amp)));
      if (probe.history.length > PROBE_HISTORY_LEN) probe.history.shift();
    }

    // Emit particle trails to show energy flow direction
    if (showParticleTrailsRef.current && sources.length > 0) {
      const canvas = canvasRef.current;
      if (canvas && Math.random() < 0.3) {
        // Pick a random point and compute local gradient to find energy flow direction
        const rx = Math.random();
        const ry = Math.random();
        const amp = getAmplitudeAt(rx, ry, t);
        if (Math.abs(amp) > 0.3) {
          const dx = getAmplitudeAt(rx + 0.01, ry, t) - getAmplitudeAt(rx - 0.01, ry, t);
          const dy = getAmplitudeAt(rx, ry + 0.01, t) - getAmplitudeAt(rx, ry - 0.01, t);
          const gradMag = Math.sqrt(dx * dx + dy * dy);
          if (gradMag > 0.01) {
            const px = rx * canvas.width;
            const py = ry * canvas.height;
            const angle = Math.atan2(dy, dx);
            const color = amp > 0 ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)";
            particleSystemRef.current.emitTrail(px, py, angle + Math.PI, color);
          }
        }
      }
    }

    // Update particles
    particleSystemRef.current.update(dt);

    // Update tone
    if (soundEnabledRef.current) {
      updateTone(frequency);
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, getAmplitudeAt, frequency]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.6, 520);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Animation loop
  useEffect(() => {
    if (isRunning) {
      lastTsRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Sound management
  useEffect(() => {
    if (soundEnabled && isRunning) {
      startTone(frequency);
    } else {
      stopTone();
    }
    return () => stopTone();
  }, [soundEnabled, isRunning, frequency]);

  // Canvas interaction handlers
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (mode === "source") {
      if (sources.length >= MAX_SOURCES) return;
      setSources((prev) => [
        ...prev,
        { x: nx, y: ny, phase: 0, id: nextIdRef.current++ },
      ]);
    } else if (mode === "probe") {
      probesRef.current.push({ x: nx, y: ny, history: [] });
    } else if (mode === "wavelength") {
      if (!wavelengthStartRef.current) {
        wavelengthStartRef.current = { x: nx, y: ny };
      } else {
        wavelengthMeasRef.current = {
          x1: wavelengthStartRef.current.x,
          y1: wavelengthStartRef.current.y,
          x2: nx,
          y2: ny,
        };
        wavelengthStartRef.current = null;
      }
    }
  }, [mode, sources.length]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "barrier") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    drawingBarrierRef.current = { x1: nx, y1: ny };
    tempBarrierEndRef.current = { x2: nx, y2: ny };
  }, [mode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "barrier" || !drawingBarrierRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    tempBarrierEndRef.current = { x2: nx, y2: ny };
  }, [mode]);

  const handleMouseUp = useCallback(() => {
    if (mode !== "barrier" || !drawingBarrierRef.current || !tempBarrierEndRef.current) {
      drawingBarrierRef.current = null;
      tempBarrierEndRef.current = null;
      return;
    }
    const start = drawingBarrierRef.current;
    const end = tempBarrierEndRef.current;

    const dx = end.x2 - start.x1;
    const dy = end.y2 - start.y1;
    if (Math.sqrt(dx * dx + dy * dy) > 0.02) {
      const newBarriers = [...barriers, { x1: start.x1, y1: start.y1, x2: end.x2, y2: end.y2 }];
      setBarriers(newBarriers);
      rebuildBarrierGrid(newBarriers);
    }

    drawingBarrierRef.current = null;
    tempBarrierEndRef.current = null;
  }, [mode, barriers, rebuildBarrierGrid]);

  // Check challenge
  const checkChallenge = useCallback(() => {
    if (!challengeActive) return;
    const pattern = CHALLENGE_PATTERNS[currentChallenge];
    if (sources.length !== pattern.sources.length) {
      const result = { points: 0, tier: "miss" as const, label: `Need ${pattern.sources.length} sources` };
      challengeRef.current = updateChallengeState(challengeRef.current, result);
      const canvas = canvasRef.current;
      if (canvas) {
        scorePopupsRef.current.push({ text: result.label, points: 0, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
      }
      if (soundEnabledRef.current) playSFX("incorrect");
      return;
    }

    // Match sources to pattern (greedy closest match)
    const matched = new Set<number>();
    let totalError = 0;
    for (const target of pattern.sources) {
      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < sources.length; i++) {
        if (matched.has(i)) continue;
        const dx = sources[i].x - target.x;
        const dy = sources[i].y - target.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        matched.add(bestIdx);
        totalError += bestDist;
      }
    }

    const avgError = totalError / pattern.sources.length;
    const result = calculateAccuracy(0, avgError, pattern.tolerance);
    challengeRef.current = updateChallengeState(challengeRef.current, result);
    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({ text: result.label, points: result.points, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
    }
    if (soundEnabledRef.current) playSFX(result.points > 0 ? "correct" : "incorrect");

    // Move to next challenge
    if (result.points >= 2) {
      setTimeout(() => setCurrentChallenge((c) => (c + 1) % CHALLENGE_PATTERNS.length), 1500);
    }
  }, [challengeActive, currentChallenge, sources]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-cyan-500 uppercase tracking-wider">Frequency</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={1} max={10} step={0.1} value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="flex-1 accent-cyan-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {frequency.toFixed(1)} Hz
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-cyan-500 uppercase tracking-wider">Amplitude</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={2.0} step={0.05} value={amplitude}
              onChange={(e) => setAmplitude(Number(e.target.value))}
              className="flex-1 accent-cyan-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">
              {amplitude.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-cyan-500 uppercase tracking-wider">Wave Speed</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={40} max={300} step={5} value={waveSpeed}
              onChange={(e) => setWaveSpeed(Number(e.target.value))}
              className="flex-1 accent-cyan-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {waveSpeed}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-cyan-500 uppercase tracking-wider">Wavelength</label>
          <div className="mt-2">
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              {"\u03BB"} = v/f = {(waveSpeed / frequency).toFixed(1)} units
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => { if (!isRunning) lastTsRef.current = null; setIsRunning(!isRunning); }}
          className="px-6 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-sm transition-colors"
        >
          {isRunning ? "Pause" : "Play"}
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Mode toggles */}
        {(["source", "barrier", "probe", "wavelength"] as InteractionMode[]).map((m) => {
          const labels: Record<InteractionMode, string> = {
            source: "Add Source",
            barrier: "Add Barrier",
            probe: "Add Probe",
            wavelength: "Measure",
          };
          const activeColors: Record<InteractionMode, string> = {
            source: "bg-cyan-600 text-white",
            barrier: "bg-slate-600 text-white",
            probe: "bg-amber-600 text-white",
            wavelength: "bg-green-600 text-white",
          };
          return (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? activeColors[m] : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {labels[m]}
            </button>
          );
        })}

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        <button onClick={() => applyPreset("single-slit")}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 text-sm font-medium transition-colors">
          Single Slit
        </button>
        <button onClick={() => applyPreset("double-slit")}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 text-sm font-medium transition-colors">
          Double Slit
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        <button onClick={() => setGrayscale(!grayscale)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            grayscale ? "bg-gray-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}>
          {grayscale ? "Grayscale" : "Color"}
        </button>

        <button onClick={() => setShowParticleTrails(!showParticleTrails)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showParticleTrails ? "bg-red-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}>
          {showParticleTrails ? "Flow: ON" : "Flow: OFF"}
        </button>

        <button onClick={() => setSoundEnabled(!soundEnabled)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            soundEnabled ? "bg-amber-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}>
          Sound: {soundEnabled ? "ON" : "OFF"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setSources([])}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors">
          Clear Sources
        </button>
        <button onClick={() => { setBarriers([]); barrierGridRef.current.fill(0); }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors">
          Clear Barriers
        </button>
        <button onClick={() => { probesRef.current = []; }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors">
          Clear Probes
        </button>
        <button onClick={() => { wavelengthMeasRef.current = null; wavelengthStartRef.current = null; }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors">
          Clear Measure
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Challenge mode */}
        <button onClick={() => {
          setChallengeActive(!challengeActive);
          if (!challengeActive) {
            challengeRef.current = createChallengeState();
            challengeRef.current.active = true;
            setCurrentChallenge(0);
          }
        }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            challengeActive ? "bg-amber-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}>
          Challenge: {challengeActive ? "ON" : "OFF"}
        </button>
        {challengeActive && (
          <button onClick={checkChallenge}
            className="px-4 h-10 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
            Check Pattern
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Wave Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">y = A sin(kx - {"\u03C9"}t)</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">k = 2{"\u03C0"}/{"\u03BB"}</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{"\u03C9"} = 2{"\u03C0"}f</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Constructive: {"\u0394"}path = n{"\u03BB"}</div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Use Probes to measure amplitude vs time at any point. Use the Measure tool to click two points and see the
          distance in wavelengths. Enable Flow to visualize energy propagation through the wave field. Turn on
          Challenge mode to recreate target interference patterns.
        </p>
      </div>
    </div>
  );
}
