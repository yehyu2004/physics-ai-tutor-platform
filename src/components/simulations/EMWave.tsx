"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

// EM Spectrum regions
interface SpectrumRegion {
  name: string;
  minFreq: number; // Hz (log10)
  maxFreq: number;
  color: string;
  label: string;
}

const SPECTRUM_REGIONS: SpectrumRegion[] = [
  { name: "radio", minFreq: 3, maxFreq: 9, color: "#a855f7", label: "Radio" },
  { name: "microwave", minFreq: 9, maxFreq: 11.5, color: "#6366f1", label: "Microwave" },
  { name: "infrared", minFreq: 11.5, maxFreq: 14.15, color: "#ef4444", label: "Infrared" },
  { name: "visible", minFreq: 14.15, maxFreq: 14.85, color: "#22c55e", label: "Visible" },
  { name: "ultraviolet", minFreq: 14.85, maxFreq: 16.5, color: "#8b5cf6", label: "UV" },
  { name: "xray", minFreq: 16.5, maxFreq: 19, color: "#06b6d4", label: "X-ray" },
  { name: "gamma", minFreq: 19, maxFreq: 24, color: "#f59e0b", label: "Gamma" },
];

// Visible light wavelength to RGB color
function wavelengthToColor(wavelengthNm: number): string {
  // Attempt spectral locus approximation for 380-780 nm
  let r = 0,
    g = 0,
    b = 0;
  if (wavelengthNm >= 380 && wavelengthNm < 440) {
    r = -(wavelengthNm - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelengthNm >= 440 && wavelengthNm < 490) {
    r = 0;
    g = (wavelengthNm - 440) / (490 - 440);
    b = 1;
  } else if (wavelengthNm >= 490 && wavelengthNm < 510) {
    r = 0;
    g = 1;
    b = -(wavelengthNm - 510) / (510 - 490);
  } else if (wavelengthNm >= 510 && wavelengthNm < 580) {
    r = (wavelengthNm - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelengthNm >= 580 && wavelengthNm < 645) {
    r = 1;
    g = -(wavelengthNm - 645) / (645 - 580);
    b = 0;
  } else if (wavelengthNm >= 645 && wavelengthNm <= 780) {
    r = 1;
    g = 0;
    b = 0;
  }

  // Intensity fall-off at edges
  let factor: number;
  if (wavelengthNm >= 380 && wavelengthNm < 420) {
    factor = 0.3 + (0.7 * (wavelengthNm - 380)) / (420 - 380);
  } else if (wavelengthNm >= 420 && wavelengthNm <= 700) {
    factor = 1.0;
  } else if (wavelengthNm > 700 && wavelengthNm <= 780) {
    factor = 0.3 + (0.7 * (780 - wavelengthNm)) / (780 - 700);
  } else {
    factor = 0;
  }

  r = Math.round(255 * Math.pow(r * factor, 0.8));
  g = Math.round(255 * Math.pow(g * factor, 0.8));
  b = Math.round(255 * Math.pow(b * factor, 0.8));

  return `rgb(${r},${g},${b})`;
}

// Convert EM frequency (log10 Hz) to a region name
function getSpectrumRegion(logFreq: number): string {
  for (const region of SPECTRUM_REGIONS) {
    if (logFreq >= region.minFreq && logFreq < region.maxFreq) {
      return region.name;
    }
  }
  return "gamma";
}

// Challenge question for spectrum identification
interface SpectrumChallenge {
  logFreq: number; // log10(Hz)
  displayFreq: string;
  correctRegion: string;
  options: string[];
}

function generateSpectrumChallenge(): SpectrumChallenge {
  // Pick random region, then random freq within it
  const regionIdx = Math.floor(Math.random() * SPECTRUM_REGIONS.length);
  const region = SPECTRUM_REGIONS[regionIdx];
  const logFreq =
    region.minFreq + Math.random() * (region.maxFreq - region.minFreq);
  const freq = Math.pow(10, logFreq);

  // Format the frequency for display
  let displayFreq: string;
  if (freq < 1e6) {
    displayFreq = `${(freq / 1e3).toFixed(1)} kHz`;
  } else if (freq < 1e9) {
    displayFreq = `${(freq / 1e6).toFixed(1)} MHz`;
  } else if (freq < 1e12) {
    displayFreq = `${(freq / 1e9).toFixed(1)} GHz`;
  } else if (freq < 1e15) {
    displayFreq = `${(freq / 1e12).toFixed(1)} THz`;
  } else if (freq < 1e18) {
    displayFreq = `${(freq / 1e15).toFixed(1)} PHz`;
  } else {
    displayFreq = `${(freq / 1e18).toFixed(1)} EHz`;
  }

  // Shuffle options (all region names)
  const allNames = SPECTRUM_REGIONS.map((r) => r.label);
  const shuffled = [...allNames].sort(() => Math.random() - 0.5);

  return {
    logFreq,
    displayFreq,
    correctRegion: region.label,
    options: shuffled,
  };
}

export default function EMWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [wavelength, setWavelength] = useState(100);
  const [amplitude, setAmplitude] = useState(60);
  const [intensity, setIntensity] = useState(1.0); // 0..1 intensity multiplier
  const [showE, setShowE] = useState(true);
  const [showB, setShowB] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  // Polarization angle (drag to rotate E-field plane)
  const [polarAngle, setPolarAngle] = useState(0); // radians
  const isDraggingPolarRef = useRef(false);
  const dragStartAngleRef = useRef(0);
  const dragStartPolarRef = useRef(0);

  // EM frequency slider (log scale: log10 Hz from 3 to 24)
  const [logFreq, setLogFreq] = useState(14.5); // ~3e14 Hz = visible green

  // Challenge mode
  const [challengeActive, setChallengeActive] = useState(false);
  const challengeStateRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const [spectrumChallenge, setSpectrumChallenge] =
    useState<SpectrumChallenge | null>(null);
  const [challengeFeedback, setChallengeFeedback] = useState<string | null>(
    null,
  );

  // Particle system + score popups
  const particlesRef = useRef(new ParticleSystem());
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Polarization handle position for drag detection
  const polarHandleRef = useRef({ x: 0, y: 0, r: 16 });

  // Derived EM spectrum values
  const emFreq = Math.pow(10, logFreq);
  const c = 3e8; // m/s
  const emWavelength = c / emFreq; // meters
  const currentRegion = getSpectrumRegion(logFreq);

  // Visible light color (only in visible range)
  const isVisible = logFreq >= 14.15 && logFreq <= 14.85;
  const visibleWavelengthNm = isVisible ? emWavelength * 1e9 : 0;
  const visibleColor = isVisible
    ? wavelengthToColor(visibleWavelengthNm)
    : null;

  // Format wavelength for display
  const formatWavelength = (wl: number): string => {
    if (wl >= 1) return `${wl.toFixed(1)} m`;
    if (wl >= 1e-3) return `${(wl * 1e3).toFixed(1)} mm`;
    if (wl >= 1e-6) return `${(wl * 1e6).toFixed(1)} um`;
    if (wl >= 1e-9) return `${(wl * 1e9).toFixed(1)} nm`;
    if (wl >= 1e-12) return `${(wl * 1e12).toFixed(1)} pm`;
    return `${(wl * 1e15).toFixed(1)} fm`;
  };

  const formatFreq = (f: number): string => {
    if (f < 1e6) return `${(f / 1e3).toFixed(1)} kHz`;
    if (f < 1e9) return `${(f / 1e6).toFixed(1)} MHz`;
    if (f < 1e12) return `${(f / 1e9).toFixed(1)} GHz`;
    if (f < 1e15) return `${(f / 1e12).toFixed(1)} THz`;
    if (f < 1e18) return `${(f / 1e15).toFixed(1)} PHz`;
    return `${(f / 1e18).toFixed(1)} EHz`;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background: slightly tinted if visible light
    if (isVisible && visibleColor) {
      // Subtle background glow in visible color
      const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      bgGrad.addColorStop(0, `rgba(${visibleColor.slice(4, -1)},${0.04 * intensity})`);
      bgGrad.addColorStop(1, "#020617");
      ctx.fillStyle = bgGrad;
    } else {
      ctx.fillStyle = "#020617";
    }
    ctx.fillRect(0, 0, W, H);

    const cy = H * 0.45;
    const k = (2 * Math.PI) / wavelength;
    const omega = k * 3;
    const effectiveAmplitude = amplitude * intensity;

    // === Propagation axis ===
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, cy);
    ctx.lineTo(W - 15, cy);
    ctx.stroke();
    // Arrow
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(W - 15, cy);
    ctx.lineTo(W - 25, cy - 4);
    ctx.lineTo(W - 25, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "right";
    ctx.fillText("x (propagation)", W - 30, cy - 8);

    // === E-field (polarized by polarAngle) ===
    // The E-field oscillates in a plane at angle polarAngle from y-axis
    // On screen: y-component shows as vertical, z-component shows as perspective
    const cosP = Math.cos(polarAngle);
    const sinP = Math.sin(polarAngle);

    if (showE) {
      // E-field color: use visible color if in visible range, else red
      const eColor = isVisible && visibleColor ? visibleColor : "#ef4444";
      const eColorAlpha = isVisible && visibleColor
        ? `rgba(${visibleColor.slice(4, -1)},0.3)`
        : "rgba(239,68,68,0.3)";

      ctx.strokeStyle = eColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = eColorAlpha;
      ctx.shadowBlur = 8 * intensity;

      // Draw E-field wave: y-component (vertical)
      ctx.beginPath();
      for (let px = 30; px < W - 20; px += 2) {
        const x = px - 30;
        const Eval = effectiveAmplitude * Math.sin(k * x - omega * t);
        const screenY = cy - Eval * cosP;
        if (px === 30) ctx.moveTo(px, screenY);
        else ctx.lineTo(px, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // E field vectors
      ctx.strokeStyle = `${eColor}33`;
      ctx.lineWidth = 1;
      for (let px = 40; px < W - 20; px += 25) {
        const x = px - 30;
        const Eval = effectiveAmplitude * Math.sin(k * x - omega * t);
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px, cy - Eval * cosP);
        ctx.stroke();
        // Small arrowhead
        if (Math.abs(Eval * cosP) > 5) {
          ctx.fillStyle = `${eColor}44`;
          ctx.beginPath();
          const dir = Eval * cosP > 0 ? -1 : 1;
          ctx.moveTo(px, cy - Eval * cosP);
          ctx.lineTo(px - 2, cy - Eval * cosP + dir * 5);
          ctx.lineTo(px + 2, cy - Eval * cosP + dir * 5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // If polarization has z-component, draw a perspective wave too
      if (Math.abs(sinP) > 0.05) {
        ctx.strokeStyle = `${eColor}88`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        for (let px = 30; px < W - 20; px += 2) {
          const x = px - 30;
          const Eval = effectiveAmplitude * Math.sin(k * x - omega * t);
          const perspX = px + Eval * sinP * 0.4;
          const perspY = cy + Eval * sinP * 0.25;
          if (px === 30) ctx.moveTo(perspX, perspY);
          else ctx.lineTo(perspX, perspY);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      ctx.fillStyle = eColor;
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("E (electric)", 35, 25);
    }

    // === B-field (perpendicular to E, perpendicular to propagation) ===
    if (showB) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(59,130,246,0.3)";
      ctx.shadowBlur = 8 * intensity;

      const bScale = effectiveAmplitude * 0.6;
      // B-field is rotated 90 degrees from E polarization
      const bCosP = Math.cos(polarAngle + Math.PI / 2);
      const bSinP = Math.sin(polarAngle + Math.PI / 2);

      ctx.beginPath();
      for (let px = 30; px < W - 20; px += 2) {
        const x = px - 30;
        const Bz = bScale * Math.sin(k * x - omega * t);
        const screenX = px + Bz * bSinP * 0.5;
        const screenY = cy - Bz * bCosP + Bz * bSinP * 0.3;
        if (px === 30) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // B vectors
      ctx.strokeStyle = "rgba(59,130,246,0.2)";
      ctx.lineWidth = 1;
      for (let px = 40; px < W - 20; px += 25) {
        const x = px - 30;
        const Bz = bScale * Math.sin(k * x - omega * t);
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px + Bz * bSinP * 0.5, cy - Bz * bCosP + Bz * bSinP * 0.3);
        ctx.stroke();
      }

      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("B (magnetic)", 35, 45);
    }

    // === Polarization handle (draggable circle) ===
    const polarHandleX = 30;
    const polarHandleY = cy;
    const polarHandleR = 16;
    polarHandleRef.current = {
      x: polarHandleX,
      y: polarHandleY,
      r: polarHandleR,
    };

    // Draw polarization indicator
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(polarHandleX, polarHandleY, polarHandleR, 0, Math.PI * 2);
    ctx.stroke();

    // Polarization direction line
    const pLineLen = polarHandleR - 2;
    ctx.strokeStyle = isDraggingPolarRef.current
      ? "#f59e0b"
      : "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(polarHandleX, polarHandleY);
    ctx.lineTo(
      polarHandleX + Math.sin(polarAngle) * pLineLen,
      polarHandleY - Math.cos(polarAngle) * pLineLen,
    );
    ctx.stroke();

    // Dot at end
    ctx.fillStyle = isDraggingPolarRef.current
      ? "#f59e0b"
      : "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(
      polarHandleX + Math.sin(polarAngle) * pLineLen,
      polarHandleY - Math.cos(polarAngle) * pLineLen,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Label
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("Pol.", polarHandleX, polarHandleY + polarHandleR + 12);
    ctx.fillText(
      `${((polarAngle * 180) / Math.PI).toFixed(0)}deg`,
      polarHandleX,
      polarHandleY + polarHandleR + 22,
    );

    // === EM Spectrum Bar (bottom of canvas) ===
    const specBarY = H - 40;
    const specBarH = 16;
    const specBarX = 30;
    const specBarW = W - 60;

    // Draw spectrum bar background
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(specBarX - 5, specBarY - 18, specBarW + 10, specBarH + 32, 6);
    ctx.fill();

    ctx.font = "bold 9px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("EM SPECTRUM", specBarX, specBarY - 5);

    // Draw each spectrum region
    const totalLogRange = 24 - 3; // from 10^3 to 10^24
    for (const region of SPECTRUM_REGIONS) {
      const x1 =
        specBarX + ((region.minFreq - 3) / totalLogRange) * specBarW;
      const x2 =
        specBarX + ((region.maxFreq - 3) / totalLogRange) * specBarW;
      const w = x2 - x1;

      // Fill with region color
      ctx.fillStyle =
        region.name === currentRegion
          ? region.color
          : `${region.color}44`;
      ctx.beginPath();
      ctx.roundRect(x1, specBarY, w, specBarH, 2);
      ctx.fill();

      // Visible range: rainbow gradient
      if (region.name === "visible") {
        const grad = ctx.createLinearGradient(x1, 0, x2, 0);
        grad.addColorStop(0, "rgba(148,0,211,0.8)"); // violet
        grad.addColorStop(0.17, "rgba(75,0,130,0.8)"); // indigo
        grad.addColorStop(0.33, "rgba(0,0,255,0.8)"); // blue
        grad.addColorStop(0.5, "rgba(0,255,0,0.8)"); // green
        grad.addColorStop(0.67, "rgba(255,255,0,0.8)"); // yellow
        grad.addColorStop(0.83, "rgba(255,127,0,0.8)"); // orange
        grad.addColorStop(1, "rgba(255,0,0,0.8)"); // red
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x1, specBarY, w, specBarH, 2);
        ctx.fill();
      }

      // Label
      ctx.fillStyle =
        region.name === currentRegion
          ? "#ffffff"
          : "rgba(255,255,255,0.4)";
      ctx.font = "8px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText(region.label, x1 + w / 2, specBarY + specBarH + 10);
    }

    // Current position marker on spectrum bar
    const markerX =
      specBarX + ((logFreq - 3) / totalLogRange) * specBarW;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(markerX, specBarY - 2);
    ctx.lineTo(markerX - 4, specBarY - 8);
    ctx.lineTo(markerX + 4, specBarY - 8);
    ctx.closePath();
    ctx.fill();

    // Glow at marker
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(markerX, specBarY + specBarH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // === Info panel (top right) ===
    const regionObj = SPECTRUM_REGIONS.find((r) => r.name === currentRegion);
    drawInfoPanel(ctx, W - 220, 12, 208, 95, "EM WAVE", [
      { label: "f", value: formatFreq(emFreq), color: "#e2e8f0" },
      {
        label: "lambda",
        value: formatWavelength(emWavelength),
        color: "#93c5fd",
      },
      { label: "c = lambda*f", value: "3.00e8 m/s", color: "#f59e0b" },
      {
        label: "Region",
        value: regionObj?.label ?? "Unknown",
        color: regionObj?.color ?? "#94a3b8",
      },
      ...(isVisible
        ? [
            {
              label: "Color",
              value: `${visibleWavelengthNm.toFixed(0)} nm`,
              color: visibleColor ?? "#ffffff",
            },
          ]
        : []),
    ]);

    // === c = lambda*f visual demonstration ===
    // Small box showing the relationship
    const relBoxX = W - 220;
    const relBoxY = 115;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(relBoxX, relBoxY, 208, 35, 6);
    ctx.fill();
    ctx.font = "11px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("c = lambda * f", relBoxX + 104, relBoxY + 14);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "10px ui-monospace";
    ctx.fillText(
      `${formatWavelength(emWavelength)} x ${formatFreq(emFreq)}`,
      relBoxX + 104,
      relBoxY + 28,
    );

    // === Visible color swatch ===
    if (isVisible && visibleColor) {
      ctx.fillStyle = visibleColor;
      ctx.shadowColor = visibleColor;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.roundRect(relBoxX, relBoxY + 40, 208, 20, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#000000";
      ctx.font = "bold 10px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `Visible: ${visibleWavelengthNm.toFixed(0)} nm`,
        relBoxX + 104,
        relBoxY + 54,
      );
    }

    // Axes labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("y", 18, cy - 40);
    ctx.fillText("z", 45, H - 60);

    // === Challenge scoreboard ===
    if (challengeActive) {
      renderScoreboard(ctx, 10, H - 160, 120, 100, challengeStateRef.current);
    }

    // Score popups
    const now = Date.now();
    for (let j = scorePopupsRef.current.length - 1; j >= 0; j--) {
      const alive = renderScorePopup(ctx, scorePopupsRef.current[j], now);
      if (!alive) scorePopupsRef.current.splice(j, 1);
    }

    // Particle system
    particlesRef.current.draw(ctx);
  }, [
    wavelength,
    amplitude,
    intensity,
    showE,
    showB,
    polarAngle,
    logFreq,
    emFreq,
    emWavelength,
    currentRegion,
    isVisible,
    visibleColor,
    visibleWavelengthNm,
    challengeActive,
  ]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;
    particlesRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas resize
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

  // Animation loop
  useEffect(() => {
    if (isRunning) {
      lastTsRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Polarization drag interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const handle = polarHandleRef.current;
        const dx = x - handle.x;
        const dy = y - handle.y;
        if (dx * dx + dy * dy <= (handle.r + 8) * (handle.r + 8)) {
          isDraggingPolarRef.current = true;
          dragStartAngleRef.current = Math.atan2(
            x - handle.x,
            -(y - handle.y),
          );
          dragStartPolarRef.current = polarAngle;
          return true;
        }
        return false;
      },
      onDrag: (x, y) => {
        if (isDraggingPolarRef.current) {
          const handle = polarHandleRef.current;
          const angle = Math.atan2(x - handle.x, -(y - handle.y));
          const delta = angle - dragStartAngleRef.current;
          setPolarAngle(dragStartPolarRef.current + delta);
        }
      },
      onDragEnd: () => {
        isDraggingPolarRef.current = false;
      },
    });

    return cleanup;
  }, [polarAngle]);

  // Challenge: answer spectrum question
  const answerChallenge = (answer: string) => {
    if (!spectrumChallenge) return;
    const correct = answer === spectrumChallenge.correctRegion;

    const result = {
      points: correct ? 3 : 0,
      tier: correct ? ("perfect" as const) : ("miss" as const),
      label: correct ? "Correct!" : `Wrong! It's ${spectrumChallenge.correctRegion}`,
    };

    const newState = updateChallengeState(challengeStateRef.current, result);
    challengeStateRef.current = newState;
    setChallengeScore(newState.score);
    setChallengeAttempts(newState.attempts);

    if (correct) {
      playSFX("correct");
      playScore(3);
      particlesRef.current.emitConfetti(
        canvasRef.current ? canvasRef.current.width / 2 : 300,
        canvasRef.current ? canvasRef.current.height / 3 : 150,
        15,
      );
    } else {
      playSFX("incorrect");
    }

    scorePopupsRef.current.push({
      text: result.label,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 3 : 150,
      startTime: Date.now(),
    });

    setChallengeFeedback(result.label);

    // Next question after delay
    setTimeout(() => {
      setSpectrumChallenge(generateSpectrumChallenge());
      setChallengeFeedback(null);
    }, 1500);
  };

  const startChallenge = () => {
    setChallengeActive(true);
    challengeStateRef.current = createChallengeState();
    challengeStateRef.current.active = true;
    challengeStateRef.current.description = "Identify the EM spectrum region";
    setChallengeScore(0);
    setChallengeAttempts(0);
    setSpectrumChallenge(generateSpectrumChallenge());
    setChallengeFeedback(null);
    playSFX("powerup");
  };

  const stopChallenge = () => {
    setChallengeActive(false);
    setSpectrumChallenge(null);
    setChallengeFeedback(null);
    challengeStateRef.current = createChallengeState();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Controls Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Wavelength
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={40}
              max={200}
              value={wavelength}
              onChange={(e) => setWavelength(Number(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {wavelength}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Amplitude
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={20}
              max={100}
              value={amplitude}
              onChange={(e) => setAmplitude(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {amplitude}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Intensity
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(intensity * 100)}
              onChange={(e) => setIntensity(Number(e.target.value) / 100)}
              className="flex-1 accent-yellow-500"
            />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
              {Math.round(intensity * 100)}%
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => setShowE(!showE)}
            className={`w-full h-8 rounded text-xs font-medium ${
              showE
                ? "bg-red-500 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            E field {showE ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => setShowB(!showB)}
            className={`w-full h-8 rounded text-xs font-medium ${
              showB
                ? "bg-blue-500 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
            }`}
          >
            B field {showB ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
          <button
            onClick={() => {
              if (!isRunning) {
                lastTsRef.current = null;
              }
              setIsRunning(!isRunning);
            }}
            className="w-full h-8 rounded-lg bg-purple-600 text-white text-xs font-medium"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      {/* EM Frequency slider + Spectrum display */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            EM Frequency (log scale)
          </label>
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-mono font-bold px-2 py-0.5 rounded"
              style={{
                backgroundColor:
                  (SPECTRUM_REGIONS.find((r) => r.name === currentRegion)
                    ?.color ?? "#666") + "22",
                color:
                  SPECTRUM_REGIONS.find((r) => r.name === currentRegion)
                    ?.color ?? "#94a3b8",
              }}
            >
              {SPECTRUM_REGIONS.find((r) => r.name === currentRegion)?.label}
            </span>
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
              {formatFreq(emFreq)} | {formatWavelength(emWavelength)}
            </span>
          </div>
        </div>
        {/* Rainbow gradient slider track */}
        <div className="relative">
          <div
            className="absolute inset-y-0 left-0 right-0 h-2 top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
            style={{
              background:
                "linear-gradient(to right, #a855f7 0%, #6366f1 28%, #ef4444 40%, violet 53%, blue 54%, cyan 55%, green 56%, yellow 57%, orange 57.5%, red 58%, #8b5cf6 65%, #06b6d4 78%, #f59e0b 90%)",
            }}
          />
          <input
            type="range"
            min={300}
            max={2400}
            step={1}
            value={Math.round(logFreq * 100)}
            onChange={(e) => setLogFreq(Number(e.target.value) / 100)}
            className="relative w-full accent-white z-10"
            style={{ opacity: 0.9 }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-mono">
          <span>Radio (kHz)</span>
          <span>Microwave</span>
          <span>IR</span>
          <span>Vis</span>
          <span>UV</span>
          <span>X-ray</span>
          <span>Gamma</span>
        </div>
      </div>

      {/* c = lambda * f demonstration */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Speed of Light: c = lambda * f
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-3 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              lambda
            </div>
            <div className="text-sm font-mono font-bold text-blue-500">
              {formatWavelength(emWavelength)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-3 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              f
            </div>
            <div className="text-sm font-mono font-bold text-amber-500">
              {formatFreq(emFreq)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-3 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              c
            </div>
            <div className="text-sm font-mono font-bold text-green-500">
              3.00 x 10^8 m/s
            </div>
          </div>
        </div>
        {isVisible && visibleColor && (
          <div className="mt-3 flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-white/20"
              style={{ backgroundColor: visibleColor }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Visible light at {visibleWavelengthNm.toFixed(0)} nm
            </span>
          </div>
        )}
      </div>

      {/* Challenge Mode */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Challenge: Identify the EM Region
          </h3>
          {!challengeActive ? (
            <button
              onClick={startChallenge}
              className="h-8 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
            >
              Start Challenge
            </button>
          ) : (
            <button
              onClick={stopChallenge}
              className="h-8 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              End ({challengeScore} pts / {challengeAttempts})
            </button>
          )}
        </div>

        {challengeActive && spectrumChallenge && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 text-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Given frequency:
              </span>
              <span className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                {spectrumChallenge.displayFreq}
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {spectrumChallenge.options.map((option) => {
                const region = SPECTRUM_REGIONS.find(
                  (r) => r.label === option,
                );
                return (
                  <button
                    key={option}
                    onClick={() => answerChallenge(option)}
                    disabled={!!challengeFeedback}
                    className="h-9 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-50"
                    style={{
                      backgroundColor: `${region?.color ?? "#666"}22`,
                      color: region?.color ?? "#94a3b8",
                      border: `1px solid ${region?.color ?? "#666"}44`,
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {challengeFeedback && (
              <p
                className={`text-sm font-medium text-center ${
                  challengeFeedback === "Correct!"
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {challengeFeedback}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="c = \frac{1}{\sqrt{\mu_0\varepsilon_0}}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E_0 = cB_0" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="c = f\lambda" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Watch the coupled E and B fields propagate as an electromagnetic wave at the speed of light!</p>
    </div>
  );
}
