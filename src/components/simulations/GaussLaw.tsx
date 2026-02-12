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
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { createDragHandler } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

type ChargeConfig = "point" | "line" | "sphere" | "plane";

const EPSILON_0 = 8.854187817e-12; // C^2 / (N*m^2)

/** Format a number in scientific notation for display */
function sciNotation(val: number, digits = 2): string {
  if (val === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(val)));
  const mantissa = val / Math.pow(10, exp);
  return `${mantissa.toFixed(digits)}e${exp}`;
}

export default function GaussLaw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [config, setConfig] = useState<ChargeConfig>("point");
  const [chargeMagnitude, setChargeMagnitude] = useState(5); // in nC
  const [surfaceRadius, setSurfaceRadius] = useState(120); // pixels
  const [showFieldArrows, setShowFieldArrows] = useState(true);
  const [showFluxVisualization, setShowFluxVisualization] = useState(true);
  const [gameMode, setGameMode] = useState<"sandbox" | "challenge">("sandbox");

  // Challenge state
  const [challengeQ, setChallengeQ] = useState(0);
  const [challengeConfig, setChallengeConfig] = useState<ChargeConfig>("point");
  const [userGuess, setUserGuess] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const timeRef = useRef(0);
  const surfaceDraggingRef = useRef(false);
  const surfaceCenterRef = useRef({ x: 0.5, y: 0.5 }); // normalized coords

  // Refs to avoid stale closures
  const configRef = useRef(config);
  const chargeMagRef = useRef(chargeMagnitude);
  const surfaceRadiusRef = useRef(surfaceRadius);
  const showFieldRef = useRef(showFieldArrows);
  const showFluxRef = useRef(showFluxVisualization);
  const gameModeRef = useRef(gameMode);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { chargeMagRef.current = chargeMagnitude; }, [chargeMagnitude]);
  useEffect(() => { surfaceRadiusRef.current = surfaceRadius; }, [surfaceRadius]);
  useEffect(() => { showFieldRef.current = showFieldArrows; }, [showFieldArrows]);
  useEffect(() => { showFluxRef.current = showFluxVisualization; }, [showFluxVisualization]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  /** Compute the enclosed charge for a given configuration and surface radius */
  const getEnclosedCharge = useCallback(
    (cfg: ChargeConfig, qNano: number, surfR: number, W: number, H: number): number => {
      const cx = surfaceCenterRef.current.x * W;
      const cy = surfaceCenterRef.current.y * H;
      const chargeX = W / 2;
      const chargeY = H / 2;

      // Distance from surface center to charge center
      const dx = cx - chargeX;
      const dy = cy - chargeY;
      const distToCharge = Math.sqrt(dx * dx + dy * dy);

      const qC = qNano * 1e-9; // convert nC to C

      switch (cfg) {
        case "point": {
          // Point charge: enclosed if charge is inside the surface
          return distToCharge < surfR ? qC : 0;
        }
        case "line": {
          // Infinite line charge (vertical): lambda = q/L per unit length
          // For a 2D cross-section, the line intersects the plane at (chargeX, chargeY)
          // Enclosed if the line passes through the Gaussian circle
          const horizontalDist = Math.abs(cx - chargeX);
          return horizontalDist < surfR ? qC : 0;
        }
        case "sphere": {
          // Uniformly charged sphere of fixed radius
          const sphereR = 50; // pixels
          if (distToCharge + sphereR <= surfR) {
            // Entire sphere is inside the surface
            return qC;
          } else if (distToCharge >= surfR + sphereR) {
            // Sphere is entirely outside
            return 0;
          } else {
            // Partial overlap: approximate as volume fraction
            // For simplicity, use the fraction of the sphere radius enclosed
            const overlap = surfR - (distToCharge - sphereR);
            const fraction = Math.min(1, Math.max(0, overlap / (2 * sphereR)));
            return qC * fraction;
          }
        }
        case "plane": {
          // Infinite charged plane (horizontal): sigma = Q/A surface charge density
          // The plane always passes through the Gaussian surface (it's infinite)
          return qC;
        }
        default:
          return 0;
      }
    },
    []
  );

  /** Compute the electric field magnitude at a given distance from the charge */
  const getFieldMagnitude = useCallback(
    (cfg: ChargeConfig, qNano: number, r: number): number => {
      const qC = qNano * 1e-9;
      const k = 8.99e9;
      const rMeters = r * 0.002; // scale pixels to meters (arbitrary scale)
      if (rMeters < 0.001) return 0;

      switch (cfg) {
        case "point":
          return (k * Math.abs(qC)) / (rMeters * rMeters);
        case "line": {
          // E = lambda / (2 * pi * epsilon_0 * r) -- for infinite line
          const lambda = Math.abs(qC) / 0.1; // charge per unit length
          return lambda / (2 * Math.PI * EPSILON_0 * rMeters);
        }
        case "sphere": {
          const sphereRMeters = 50 * 0.002;
          if (rMeters > sphereRMeters) {
            return (k * Math.abs(qC)) / (rMeters * rMeters);
          } else {
            // Inside sphere: E = k * Q * r / R^3
            return (k * Math.abs(qC) * rMeters) / (sphereRMeters * sphereRMeters * sphereRMeters);
          }
        }
        case "plane": {
          // E = sigma / (2 * epsilon_0), uniform everywhere
          const sigma = Math.abs(qC) / 0.01; // surface charge density
          return sigma / (2 * EPSILON_0);
        }
        default:
          return 0;
      }
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const now = performance.now();
    const cfg = configRef.current;
    const qNano = chargeMagRef.current;
    const surfR = surfaceRadiusRef.current;
    const scx = surfaceCenterRef.current.x * W;
    const scy = surfaceCenterRef.current.y * H;
    const chargeX = W / 2;
    const chargeY = H / 2;

    // Clear and background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Draw the charge configuration
    switch (cfg) {
      case "point": {
        // Glow
        const glow = ctx.createRadialGradient(chargeX, chargeY, 0, chargeX, chargeY, 45);
        glow.addColorStop(0, qNano >= 0 ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)");
        glow.addColorStop(1, qNano >= 0 ? "rgba(239,68,68,0)" : "rgba(59,130,246,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(chargeX, chargeY, 45, 0, Math.PI * 2);
        ctx.fill();

        // Charge body
        ctx.fillStyle = qNano >= 0 ? "#ef4444" : "#3b82f6";
        ctx.beginPath();
        ctx.arc(chargeX, chargeY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = qNano >= 0 ? "#fca5a5" : "#93c5fd";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(qNano >= 0 ? "+" : "\u2212", chargeX, chargeY + 1);
        ctx.textBaseline = "alphabetic";

        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`${qNano} nC`, chargeX, chargeY + 32);
        break;
      }
      case "line": {
        // Vertical infinite line charge
        const lineGlow = ctx.createLinearGradient(chargeX - 20, 0, chargeX + 20, 0);
        lineGlow.addColorStop(0, "rgba(168,85,247,0)");
        lineGlow.addColorStop(0.5, "rgba(168,85,247,0.25)");
        lineGlow.addColorStop(1, "rgba(168,85,247,0)");
        ctx.fillStyle = lineGlow;
        ctx.fillRect(chargeX - 20, 0, 40, H);

        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(chargeX, 0);
        ctx.lineTo(chargeX, H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dots along line
        for (let y = 20; y < H; y += 30) {
          ctx.fillStyle = "#a855f7";
          ctx.beginPath();
          ctx.arc(chargeX, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#c4b5fd";
        ctx.textAlign = "center";
        ctx.fillText("line charge", chargeX + 35, 20);
        ctx.fillText(`\u03BB ~ ${qNano} nC/m`, chargeX + 35, 34);
        break;
      }
      case "sphere": {
        const sphereR = 50;

        // Sphere fill
        const sphereGrad = ctx.createRadialGradient(
          chargeX - 10, chargeY - 10, 5,
          chargeX, chargeY, sphereR
        );
        sphereGrad.addColorStop(0, "rgba(34,197,94,0.4)");
        sphereGrad.addColorStop(0.7, "rgba(34,197,94,0.15)");
        sphereGrad.addColorStop(1, "rgba(34,197,94,0.05)");
        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(chargeX, chargeY, sphereR, 0, Math.PI * 2);
        ctx.fill();

        // Sphere outline
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(chargeX, chargeY, sphereR, 0, Math.PI * 2);
        ctx.stroke();

        // Label
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#86efac";
        ctx.textAlign = "center";
        ctx.fillText(`R = 50px`, chargeX, chargeY + sphereR + 16);
        ctx.fillText(`Q = ${qNano} nC`, chargeX, chargeY + sphereR + 30);

        // Center dot
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(chargeX, chargeY, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "plane": {
        // Horizontal infinite plane
        const planeGlow = ctx.createLinearGradient(0, chargeY - 20, 0, chargeY + 20);
        planeGlow.addColorStop(0, "rgba(245,158,11,0)");
        planeGlow.addColorStop(0.5, "rgba(245,158,11,0.2)");
        planeGlow.addColorStop(1, "rgba(245,158,11,0)");
        ctx.fillStyle = planeGlow;
        ctx.fillRect(0, chargeY - 20, W, 40);

        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, chargeY);
        ctx.lineTo(W, chargeY);
        ctx.stroke();

        // + signs along plane
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let x = 30; x < W; x += 40) {
          ctx.fillText("+", x, chargeY);
        }
        ctx.textBaseline = "alphabetic";

        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#fcd34d";
        ctx.fillText(`\u03C3 ~ ${qNano} nC/m\u00B2`, W - 80, chargeY - 14);
        break;
      }
    }

    // Draw E-field arrows
    if (showFieldRef.current) {
      const arrowCount = 24;
      for (let i = 0; i < arrowCount; i++) {
        const angle = (i / arrowCount) * Math.PI * 2;
        // Draw arrows at various distances
        const distances = [60, 100, 150, 200];
        for (const dist of distances) {
          let ax: number, ay: number;
          let dirX: number, dirY: number;

          if (cfg === "plane") {
            // For a plane, E-field is perpendicular (up and down)
            if (i >= arrowCount / 2) continue; // only half needed
            ax = 40 + (i / (arrowCount / 2)) * (W - 80);
            const sign = dist > 120 ? -1 : 1; // above or below
            ay = chargeY + sign * (30 + (dist - 60) * 0.5);
            dirX = 0;
            dirY = sign * (qNano >= 0 ? -1 : 1);
          } else if (cfg === "line") {
            // Radial from the line
            ax = chargeX + Math.cos(angle) * dist;
            ay = chargeY + Math.sin(angle) * dist;
            // Only horizontal arrows (perpendicular to line)
            const hDist = ax - chargeX;
            if (Math.abs(hDist) < 10) continue;
            dirX = hDist > 0 ? 1 : -1;
            dirY = 0;
            // Actually radial in 2D cross-section
            dirX = Math.cos(angle);
            dirY = Math.sin(angle);
          } else {
            ax = chargeX + Math.cos(angle) * dist;
            ay = chargeY + Math.sin(angle) * dist;
            dirX = Math.cos(angle);
            dirY = Math.sin(angle);
          }

          if (ax < 10 || ax > W - 10 || ay < 10 || ay > H - 10) continue;

          // Field magnitude determines arrow length and opacity
          const rFromCharge = Math.sqrt(
            (ax - chargeX) * (ax - chargeX) + (ay - chargeY) * (ay - chargeY)
          );
          const fieldMag = getFieldMagnitude(cfg, qNano, rFromCharge);
          const maxField = getFieldMagnitude(cfg, qNano, 60);
          const normalizedField = maxField > 0 ? Math.min(fieldMag / maxField, 1) : 0;

          const arrowLen = 8 + normalizedField * 22;
          const alpha = 0.2 + normalizedField * 0.6;

          // If negative charge, reverse direction
          if (qNano < 0 && cfg !== "plane") {
            dirX = -dirX;
            dirY = -dirY;
          }

          // Arrow shaft
          ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + dirX * arrowLen, ay + dirY * arrowLen);
          ctx.stroke();

          // Arrowhead
          const tipX = ax + dirX * arrowLen;
          const tipY = ay + dirY * arrowLen;
          const headSize = 5;
          ctx.fillStyle = `rgba(56,189,248,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(
            tipX - dirX * headSize - dirY * headSize * 0.4,
            tipY - dirY * headSize + dirX * headSize * 0.4
          );
          ctx.lineTo(
            tipX - dirX * headSize + dirY * headSize * 0.4,
            tipY - dirY * headSize - dirX * headSize * 0.4
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw Gaussian surface
    const pulse = Math.sin(timeRef.current * 2) * 0.15 + 1;
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.shadowColor = "#22c55e";
    ctx.shadowBlur = 8 * pulse;
    ctx.beginPath();
    ctx.arc(scx, scy, surfR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Gaussian surface label
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#4ade80";
    ctx.textAlign = "center";
    ctx.fillText("Gaussian Surface", scx, scy - surfR - 10);

    // Draw E-field arrows ON the Gaussian surface (flux visualization)
    if (showFluxRef.current) {
      const fluxArrowCount = 20;

      for (let i = 0; i < fluxArrowCount; i++) {
        const angle = (i / fluxArrowCount) * Math.PI * 2;
        const sx = scx + Math.cos(angle) * surfR;
        const sy = scy + Math.sin(angle) * surfR;

        // Normal direction (outward from surface center)
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);

        // E-field at this point on the surface
        const rFromCharge = Math.sqrt(
          (sx - chargeX) * (sx - chargeX) + (sy - chargeY) * (sy - chargeY)
        );
        const fieldMag = getFieldMagnitude(cfg, qNano, rFromCharge);
        const maxField = getFieldMagnitude(cfg, qNano, 40);
        const normalizedField = maxField > 0 ? Math.min(fieldMag / maxField, 1) : 0;

        // Direction of E at this point on surface
        let edx = sx - chargeX;
        let edy = sy - chargeY;
        const edist = Math.sqrt(edx * edx + edy * edy);

        if (cfg === "plane") {
          // E points away from the plane
          edx = 0;
          edy = sy < chargeY ? -1 : 1;
        } else if (edist > 1) {
          edx /= edist;
          edy /= edist;
        }

        if (qNano < 0 && cfg !== "plane") {
          edx = -edx;
          edy = -edy;
        }

        // E dot dA (how much E is along the normal)
        const eDotN = edx * nx + edy * ny;
        const arrowLen = Math.abs(eDotN) * normalizedField * 28;
        if (arrowLen < 2) continue;

        // Color based on E dot n: green if positive (outgoing), red if negative (incoming)
        const arrowColor = eDotN >= 0
          ? `rgba(34,197,94,${0.5 + normalizedField * 0.4})`
          : `rgba(239,68,68,${0.5 + normalizedField * 0.4})`;

        const arrowDirX = nx * Math.sign(eDotN);
        const arrowDirY = ny * Math.sign(eDotN);

        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + arrowDirX * arrowLen, sy + arrowDirY * arrowLen);
        ctx.stroke();

        // Arrowhead
        const atipX = sx + arrowDirX * arrowLen;
        const atipY = sy + arrowDirY * arrowLen;
        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        ctx.moveTo(atipX, atipY);
        ctx.lineTo(
          atipX - arrowDirX * 5 - arrowDirY * 3,
          atipY - arrowDirY * 5 + arrowDirX * 3
        );
        ctx.lineTo(
          atipX - arrowDirX * 5 + arrowDirY * 3,
          atipY - arrowDirY * 5 - arrowDirX * 3
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // Compute enclosed charge and flux
    const qEnc = getEnclosedCharge(cfg, qNano, surfR, W, H);
    const flux = qEnc / EPSILON_0;

    // Info panel (hide Q_enc and Flux values in challenge mode to avoid answer leak)
    const isChallenge = gameModeRef.current === "challenge";
    drawInfoPanel(ctx, 12, 12, 220, 100, "GAUSS\u2019S LAW", [
      { label: "Config:", value: cfg.charAt(0).toUpperCase() + cfg.slice(1), color: "#94a3b8" },
      { label: "Q_enc:", value: isChallenge ? "???" : `${sciNotation(qEnc)} C`, color: isChallenge ? "#94a3b8" : (qEnc !== 0 ? "#22c55e" : "#94a3b8") },
      { label: "Flux \u03A6:", value: isChallenge ? "???" : `${sciNotation(flux)} N\u00B7m\u00B2/C`, color: isChallenge ? "#94a3b8" : "#38bdf8" },
      { label: "Surface R:", value: `${surfR}px`, color: "#a78bfa" },
    ]);

    // Draw "enclosed charge" indicator on the surface
    if (qEnc !== 0) {
      // Pulsing ring inside the Gaussian surface
      const encPulse = (timeRef.current * 0.8) % 1;
      ctx.strokeStyle = `rgba(34,197,94,${0.3 - encPulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(scx, scy, surfR * (0.3 + encPulse * 0.7), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Flux magnitude bar (hidden in challenge mode to avoid answer leak)
    if (!isChallenge) {
      const maxFluxDisplay = Math.abs(10e-9 / EPSILON_0);
      const fluxFraction = Math.min(Math.abs(flux) / maxFluxDisplay, 1);
      const barX = 12;
      const barY = H - 40;
      const barW = 200;
      const barH = 12;

      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(barX - 4, barY - 20, barW + 8, barH + 32, 6);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#38bdf8";
      ctx.textAlign = "left";
      ctx.fillText(`|\u03A6| = ${Math.abs(flux).toExponential(2)} N\u00B7m\u00B2/C`, barX, barY - 6);

      ctx.fillStyle = "rgba(56,189,248,0.15)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, barH / 2);
      ctx.fill();

      if (fluxFraction > 0) {
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * fluxFraction, barH, barH / 2);
        ctx.fill();
      }
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Scoreboard for challenge mode
    if (challengeRef.current.active) {
      renderScoreboard(ctx, W - 172, H - 140, 160, 120, challengeRef.current);
    }

    // Instructions
    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "left";
    ctx.fillText("Drag the Gaussian surface \u2022 Resize with slider", 12, H - 50);
  }, [getEnclosedCharge, getFieldMagnitude]);

  // Animation loop
  const animate = useCallback(() => {
    timeRef.current += 0.016;
    particlesRef.current.update(0.016);
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
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 500));
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Start animation
  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // Drag handler for Gaussian surface
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const scx = surfaceCenterRef.current.x * W;
        const scy = surfaceCenterRef.current.y * H;
        const dist = Math.sqrt((x - scx) * (x - scx) + (y - scy) * (y - scy));
        // Allow drag if clicking near the surface edge or inside
        if (dist < surfaceRadiusRef.current + 20) {
          surfaceDraggingRef.current = true;
          return true;
        }
        return false;
      },
      onDrag: (x, y) => {
        if (surfaceDraggingRef.current) {
          const W = canvas.clientWidth;
          const H = canvas.clientHeight;
          surfaceCenterRef.current = {
            x: Math.max(0.1, Math.min(0.9, x / W)),
            y: Math.max(0.1, Math.min(0.9, y / H)),
          };
        }
      },
      onDragEnd: () => {
        surfaceDraggingRef.current = false;
      },
    });

    return cleanup;
  }, []);

  // Generate a new challenge question
  const generateChallenge = useCallback(() => {
    const configs: ChargeConfig[] = ["point", "line", "sphere", "plane"];
    const randomConfig = configs[Math.floor(Math.random() * configs.length)];
    const randomQ = Math.round((Math.random() * 18 - 9) * 10) / 10; // -9.0 to 9.0 nC

    setChallengeConfig(randomConfig);
    setChallengeQ(randomQ);
    setUserGuess("");
    setFeedback(null);
  }, []);

  // Check the user's answer in challenge mode
  const checkAnswer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const qC = challengeQ * 1e-9;
    // For the challenge, the Gaussian surface always encloses the entire charge
    const actualFlux = qC / EPSILON_0;
    const guessVal = parseFloat(userGuess);

    if (isNaN(guessVal)) {
      setFeedback("Please enter a valid number (in N\u00B7m\u00B2/C).");
      return;
    }

    // Calculate accuracy
    const tolerance = Math.abs(actualFlux) * 0.5 || 100;
    const result = calculateAccuracy(guessVal, actualFlux, tolerance);
    challengeRef.current = updateChallengeState(challengeRef.current, result);

    popupsRef.current.push({
      text: result.label,
      points: result.points,
      x: canvas.clientWidth / 2,
      y: canvas.clientHeight / 2,
      startTime: performance.now(),
    });

    if (result.points > 0) {
      playSFX("correct");
      playScore(result.points);
      if (result.tier === "perfect") {
        particlesRef.current.emitConfetti(canvas.clientWidth / 2, canvas.clientHeight / 2, 20);
      } else {
        particlesRef.current.emitGlow(canvas.clientWidth / 2, canvas.clientHeight / 2, 10, "#22c55e");
      }
      setFeedback(
        `${result.label} Actual \u03A6 = ${actualFlux.toExponential(2)} N\u00B7m\u00B2/C`
      );
      // Auto-generate next challenge after a delay
      setTimeout(() => generateChallenge(), 2000);
    } else {
      playSFX("incorrect");
      setFeedback(
        `Not quite. Hint: \u03A6 = Q_enc/\u03B5\u2080. Q_enc = ${qC.toExponential(2)} C.`
      );
    }
  }, [challengeQ, userGuess, generateChallenge]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* Charge Configuration Selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Charge Configuration
        </label>
        <div className="flex flex-wrap gap-2">
          {(["point", "line", "sphere", "plane"] as ChargeConfig[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                setConfig(c);
                surfaceCenterRef.current = { x: 0.5, y: 0.5 };
                playSFX("click");
              }}
              className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
                config === c
                  ? c === "point"
                    ? "bg-red-600 text-white"
                    : c === "line"
                    ? "bg-purple-600 text-white"
                    : c === "sphere"
                    ? "bg-green-600 text-white"
                    : "bg-amber-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {c === "point"
                ? "Point Charge"
                : c === "line"
                ? "Line Charge"
                : c === "sphere"
                ? "Charged Sphere"
                : "Charged Plane"}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Charge Magnitude
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={chargeMagnitude}
              onChange={(e) => setChargeMagnitude(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 w-16 text-right">
              {chargeMagnitude} nC
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Gaussian Surface Radius
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={30}
              max={220}
              step={5}
              value={surfaceRadius}
              onChange={(e) => setSurfaceRadius(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 w-16 text-right">
              {surfaceRadius} px
            </span>
          </div>
        </div>
      </div>

      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowFieldArrows(!showFieldArrows)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showFieldArrows
              ? "bg-cyan-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          E-Field Arrows
        </button>
        <button
          onClick={() => setShowFluxVisualization(!showFluxVisualization)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            showFluxVisualization
              ? "bg-green-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Flux at Surface
        </button>
        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
        <button
          onClick={() => {
            if (gameMode === "sandbox") {
              setGameMode("challenge");
              challengeRef.current = {
                ...createChallengeState(),
                active: true,
                description: "Predict the flux",
              };
              generateChallenge();
              playSFX("powerup");
            } else {
              setGameMode("sandbox");
              challengeRef.current = createChallengeState();
              setFeedback(null);
            }
          }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            gameMode === "challenge"
              ? "bg-amber-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          {gameMode === "challenge" ? "Exit Challenge" : "Predict the Flux"}
        </button>
        <button
          onClick={() => {
            surfaceCenterRef.current = { x: 0.5, y: 0.5 };
            setSurfaceRadius(120);
            setChargeMagnitude(5);
            playSFX("pop");
          }}
          className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Challenge Mode Panel */}
      {gameMode === "challenge" && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Predict the Flux Challenge
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
            A <strong>{challengeConfig}</strong> charge configuration with{" "}
            <strong>Q = {challengeQ} nC</strong> is fully enclosed by a Gaussian
            surface. What is the electric flux {"\u03A6"} through the surface?
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={userGuess}
                onChange={(e) => setUserGuess(e.target.value)}
                placeholder="Enter flux (e.g., 565 or 5.65e2)"
                className="w-full h-10 px-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                N{"\u00B7"}m{"\u00B2"}/C
              </span>
            </div>
            <button
              onClick={checkAnswer}
              className="px-6 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Check
            </button>
            <button
              onClick={generateChallenge}
              className="px-4 h-10 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              Skip
            </button>
          </div>
          {feedback && (
            <p
              className={`text-xs mt-2 font-medium ${
                feedback.startsWith("Not")
                  ? "text-red-600 dark:text-red-400"
                  : feedback.startsWith("Please")
                  ? "text-gray-500"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {feedback}
            </p>
          )}
          <div className="mt-2 flex gap-4 text-xs font-mono text-amber-700 dark:text-amber-400">
            <span>Score: {challengeRef.current.score}</span>
            <span>Attempts: {challengeRef.current.attempts}</span>
            <span>Streak: {challengeRef.current.streak}</span>
          </div>
        </div>
      )}

      {/* Key Insight */}
      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
        <h3 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">
          Key Insight
        </h3>
        <p className="text-xs text-green-700 dark:text-green-400">
          The electric flux through a closed Gaussian surface depends{" "}
          <strong>only on the enclosed charge</strong>, not on the shape or size of
          the surface. Move the surface and change its radius to see this in action:
          as long as the same charge is enclosed, the net flux stays the same.
        </p>
      </div>

      {/* Key Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="\Phi = \oint \vec{E} \cdot d\vec{A} = \frac{Q_{enc}}{\varepsilon_0}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="\varepsilon_0 = 8.85 \times 10^{-12} \text{ C}^2/\text{N·m}^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="E_{\text{point}} = \frac{1}{4\pi\varepsilon_0}\frac{Q}{r^2}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="E_{\text{plane}} = \frac{\sigma}{2\varepsilon_0}" />
          </div>
        </div>
      </div>
    </div>
  );
}
