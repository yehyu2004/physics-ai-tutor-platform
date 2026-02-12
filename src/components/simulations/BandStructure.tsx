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
import { SimMath } from "@/components/simulations/SimMath";

// --- Types ---

type MaterialType = "conductor" | "semiconductor" | "insulator";
type DopingType = "intrinsic" | "n-type" | "p-type";
type GameMode = "sandbox" | "match-conductivity";

interface BandElectron {
  x: number; // 0-1 horizontal position within the band
  y: number; // absolute pixel y (set during draw based on band)
  band: "valence" | "conduction" | "donor" | "acceptor";
  vx: number;
  vy: number;
  exciteTimer: number; // countdown to jump attempt
  jumping: boolean;
}

interface Hole {
  x: number;
  y: number;
  vx: number;
}

// --- Physics constants ---
const kB = 8.617e-5; // eV/K  Boltzmann constant

function bandGapForMaterial(mat: MaterialType): number {
  switch (mat) {
    case "conductor":
      return 0;
    case "semiconductor":
      return 1.1; // Si-like
    case "insulator":
      return 5.0;
  }
}

/** Carrier concentration (arbitrary units, exponential in Eg/2kBT) */
function carrierConcentration(
  Eg: number,
  T: number,
  doping: DopingType,
  dopingLevel: number,
): number {
  if (T <= 0) return doping !== "intrinsic" ? dopingLevel * 1e12 : 0;
  const intrinsic = 1e15 * Math.exp(-Eg / (2 * kB * T));
  if (doping === "intrinsic") return intrinsic;
  // Doping dominates when dopingLevel * 1e15 >> intrinsic
  const dopingCarriers = dopingLevel * 1e15;
  return Math.max(intrinsic, dopingCarriers) + intrinsic;
}

/** Conductivity in arbitrary S/m (sigma = n * q * mu) */
function conductivity(n: number): number {
  const q = 1.6e-19;
  const mu = 0.14; // m^2/Vs  approximate Si electron mobility
  return n * q * mu;
}

/** Format a number into scientific notation string */
function sciNotation(val: number, digits = 2): string {
  if (val === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(val)));
  const mantissa = val / Math.pow(10, exp);
  return `${mantissa.toFixed(digits)}e${exp}`;
}

export default function BandStructure() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Controls
  const [material, setMaterial] = useState<MaterialType>("semiconductor");
  const [temperature, setTemperature] = useState(300); // K
  const [doping, setDoping] = useState<DopingType>("intrinsic");
  const [dopingLevel, setDopingLevel] = useState(1); // 1-10 arbitrary units

  // Game mode
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const [targetConductivity, setTargetConductivity] = useState(0);
  const [matchSubmitted, setMatchSubmitted] = useState(false);

  // Refs for animation
  const electronsRef = useRef<BandElectron[]>([]);
  const holesRef = useRef<Hole[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const popupsRef = useRef<ScorePopup[]>([]);
  const timeRef = useRef(0);

  // Keep state refs for animation closure
  const materialRef = useRef(material);
  const temperatureRef = useRef(temperature);
  const dopingRef = useRef(doping);
  const dopingLevelRef = useRef(dopingLevel);

  useEffect(() => { materialRef.current = material; }, [material]);
  useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
  useEffect(() => { dopingRef.current = doping; }, [doping]);
  useEffect(() => { dopingLevelRef.current = dopingLevel; }, [dopingLevel]);

  // Derived physics values
  const Eg = bandGapForMaterial(material);
  const n = carrierConcentration(Eg, temperature, doping, dopingLevel);
  const sigma = conductivity(n);
  // Initialize electrons in valence band
  useEffect(() => {
    const electrons: BandElectron[] = [];
    for (let i = 0; i < 30; i++) {
      electrons.push({
        x: Math.random(),
        y: 0,
        band: "valence",
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0,
        exciteTimer: 1 + Math.random() * 3,
        jumping: false,
      });
    }
    electronsRef.current = electrons;
    holesRef.current = [];
  }, []);

  // Rebuild electron populations when material/doping changes
  useEffect(() => {
    const electrons: BandElectron[] = [];
    // Always start with valence electrons
    for (let i = 0; i < 30; i++) {
      electrons.push({
        x: Math.random(),
        y: 0,
        band: "valence",
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0,
        exciteTimer: 1 + Math.random() * 3,
        jumping: false,
      });
    }
    // Add donor / acceptor electrons
    if (doping === "n-type") {
      const count = Math.round(dopingLevel * 2);
      for (let i = 0; i < count; i++) {
        electrons.push({
          x: Math.random(),
          y: 0,
          band: "donor",
          vx: (Math.random() - 0.5) * 0.3,
          vy: 0,
          exciteTimer: 0.3 + Math.random() * 0.8,
          jumping: false,
        });
      }
    }
    electronsRef.current = electrons;
    holesRef.current = doping === "p-type"
      ? Array.from({ length: Math.round(dopingLevel * 2) }, () => ({
          x: Math.random(),
          y: 0,
          vx: (Math.random() - 0.5) * 0.2,
        }))
      : [];
  }, [material, doping, dopingLevel]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const now = performance.now();
    const mat = materialRef.current;
    const T = temperatureRef.current;
    const dop = dopingRef.current;
    const dopLvl = dopingLevelRef.current;
    const eg = bandGapForMaterial(mat);

    // Clear
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // --- Layout ---
    const bandAreaX = 40;
    const bandAreaW = W * 0.55 - bandAreaX;
    const bandAreaTop = 30;
    const bandAreaBottom = H - 30;
    const bandAreaH = bandAreaBottom - bandAreaTop;

    // Energy scale: map energy levels to vertical positions
    // Conduction band top, valence band bottom
    const conductionBandTop = bandAreaTop + bandAreaH * 0.05;
    const conductionBandH = bandAreaH * 0.25;
    const conductionBandBot = conductionBandTop + conductionBandH;

    const valenceBandBot = bandAreaBottom - bandAreaH * 0.05;
    const valenceBandH = bandAreaH * 0.25;
    const valenceBandTop2 = valenceBandBot - valenceBandH;

    // Band gap region is between conductionBandBot and valenceBandTop2
    const gapTop = conductionBandBot;
    const gapBot = valenceBandTop2;
    const gapH = gapBot - gapTop;

    // For conductor (Eg=0), bands overlap
    const effectiveGapH = mat === "conductor" ? 0 : gapH;
    const effGapTop = mat === "conductor" ? (conductionBandBot + valenceBandTop2) / 2 : gapTop;
    const effGapBot = mat === "conductor" ? (conductionBandBot + valenceBandTop2) / 2 : gapBot;
    const effConductionBot = mat === "conductor" ? (conductionBandBot + valenceBandTop2) / 2 + conductionBandH * 0.1 : conductionBandBot;
    const effValenceTop = mat === "conductor" ? (conductionBandBot + valenceBandTop2) / 2 - valenceBandH * 0.1 : valenceBandTop2;

    // Title
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("ENERGY BAND DIAGRAM", bandAreaX + bandAreaW / 2, 18);

    // --- Draw Conduction Band ---
    // Outlined region
    ctx.strokeStyle = "rgba(96,165,250,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(bandAreaX, conductionBandTop, bandAreaW, effConductionBot - conductionBandTop);
    ctx.setLineDash([]);

    // Light fill
    ctx.fillStyle = "rgba(96,165,250,0.05)";
    ctx.fillRect(bandAreaX, conductionBandTop, bandAreaW, effConductionBot - conductionBandTop);

    // Conduction band label
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("Conduction Band (Ec)", bandAreaX + 6, conductionBandTop + 16);

    // --- Draw Valence Band ---
    // Filled region (purple/blue gradient)
    const valGrad = ctx.createLinearGradient(0, effValenceTop, 0, valenceBandBot);
    valGrad.addColorStop(0, "rgba(139,92,246,0.35)");
    valGrad.addColorStop(1, "rgba(79,70,229,0.5)");
    ctx.fillStyle = valGrad;
    ctx.fillRect(bandAreaX, effValenceTop, bandAreaW, valenceBandBot - effValenceTop);

    // Valence band border
    ctx.strokeStyle = "rgba(139,92,246,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bandAreaX, effValenceTop, bandAreaW, valenceBandBot - effValenceTop);

    // Valence band label
    ctx.fillStyle = "#a78bfa";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("Valence Band (Ev)", bandAreaX + 6, valenceBandBot - 6);

    // --- Band Gap ---
    if (mat !== "conductor") {
      // Band gap region shading
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(bandAreaX, effGapTop, bandAreaW, effectiveGapH);

      // Gap label
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      const gapMid = effGapTop + effectiveGapH / 2;
      ctx.fillText(`Eg = ${eg.toFixed(1)} eV`, bandAreaX + bandAreaW / 2, gapMid + 4);

      // Gap arrows
      ctx.strokeStyle = "rgba(245,158,11,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bandAreaX + bandAreaW / 2 - 50, effGapTop + 2);
      ctx.lineTo(bandAreaX + bandAreaW / 2 - 50, effGapBot - 2);
      ctx.stroke();
      // top arrow head
      ctx.beginPath();
      ctx.moveTo(bandAreaX + bandAreaW / 2 - 50, effGapTop + 2);
      ctx.lineTo(bandAreaX + bandAreaW / 2 - 54, effGapTop + 8);
      ctx.lineTo(bandAreaX + bandAreaW / 2 - 46, effGapTop + 8);
      ctx.closePath();
      ctx.fillStyle = "rgba(245,158,11,0.5)";
      ctx.fill();
      // bottom arrow head
      ctx.beginPath();
      ctx.moveTo(bandAreaX + bandAreaW / 2 - 50, effGapBot - 2);
      ctx.lineTo(bandAreaX + bandAreaW / 2 - 54, effGapBot - 8);
      ctx.lineTo(bandAreaX + bandAreaW / 2 - 46, effGapBot - 8);
      ctx.closePath();
      ctx.fill();

      // Fermi level (dashed line)
      const fLevelFrac = dop === "n-type" ? 0.75 : dop === "p-type" ? 0.25 : 0.5;
      const fermiY = effGapBot - effectiveGapH * fLevelFrac;
      ctx.strokeStyle = "rgba(34,197,94,0.7)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(bandAreaX, fermiY);
      ctx.lineTo(bandAreaX + bandAreaW, fermiY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#22c55e";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText("Ef", bandAreaX + bandAreaW - 4, fermiY - 5);

      // --- Donor level (n-type) ---
      if (dop === "n-type") {
        const donorY = effGapTop + effectiveGapH * 0.12;
        ctx.strokeStyle = "rgba(251,191,36,0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bandAreaX + 20, donorY);
        ctx.lineTo(bandAreaX + bandAreaW - 20, donorY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#fbbf24";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.fillText("Donor level", bandAreaX + bandAreaW - 24, donorY - 4);
      }

      // --- Acceptor level (p-type) ---
      if (dop === "p-type") {
        const acceptorY = effGapBot - effectiveGapH * 0.12;
        ctx.strokeStyle = "rgba(239,68,68,0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bandAreaX + 20, acceptorY);
        ctx.lineTo(bandAreaX + bandAreaW - 20, acceptorY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#ef4444";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.fillText("Acceptor level", bandAreaX + bandAreaW - 24, acceptorY - 4);
      }
    } else {
      // Conductor: overlapping bands label
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Bands overlap (Eg = 0)", bandAreaX + bandAreaW / 2, (conductionBandBot + valenceBandTop2) / 2 + 4);
    }

    // --- Energy axis ---
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bandAreaX - 10, bandAreaTop);
    ctx.lineTo(bandAreaX - 10, bandAreaBottom);
    ctx.stroke();
    // Arrow on top
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(bandAreaX - 10, bandAreaTop);
    ctx.lineTo(bandAreaX - 14, bandAreaTop + 8);
    ctx.lineTo(bandAreaX - 6, bandAreaTop + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(bandAreaX - 24, bandAreaTop + bandAreaH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Energy (eV)", 0, 0);
    ctx.restore();

    // --- Draw Electrons ---
    for (const el of electronsRef.current) {
      let ey: number;
      if (el.band === "conduction") {
        ey = conductionBandTop + 20 + el.y * (effConductionBot - conductionBandTop - 30);
      } else if (el.band === "donor") {
        const donorY = mat !== "conductor" ? effGapTop + effectiveGapH * 0.12 : conductionBandTop + 30;
        ey = donorY + el.y * 8 - 4;
      } else {
        // valence
        ey = effValenceTop + 10 + el.y * (valenceBandBot - effValenceTop - 20);
      }

      const ex = bandAreaX + 10 + el.x * (bandAreaW - 20);

      // Glow
      const glowGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, 8);
      glowGrad.addColorStop(0, "rgba(96,165,250,0.7)");
      glowGrad.addColorStop(0.5, "rgba(96,165,250,0.2)");
      glowGrad.addColorStop(1, "rgba(96,165,250,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(ex, ey, 8, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();

      // Jumping animation: draw arc trail
      if (el.jumping) {
        ctx.strokeStyle = "rgba(96,165,250,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex, ey - 15);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- Draw Holes (red open circles) ---
    for (const hole of holesRef.current) {
      let hy: number;
      if (dop === "p-type" && mat !== "conductor") {
        // Holes live in valence band or acceptor level
        hy = effValenceTop + 10 + hole.y * (valenceBandBot - effValenceTop - 20);
      } else {
        hy = effValenceTop + 15 + hole.y * (valenceBandBot - effValenceTop - 30);
      }
      const hx = bandAreaX + 10 + hole.x * (bandAreaW - 20);

      // Glow
      const hGlow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 8);
      hGlow.addColorStop(0, "rgba(239,68,68,0.6)");
      hGlow.addColorStop(0.5, "rgba(239,68,68,0.15)");
      hGlow.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = hGlow;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();

      // Open circle
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.stroke();

      // Plus sign inside
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy);
      ctx.lineTo(hx + 2, hy);
      ctx.moveTo(hx, hy - 2);
      ctx.lineTo(hx, hy + 2);
      ctx.stroke();
    }

    // --- Right side: Conductivity meter and data ---
    const rightX = W * 0.58;
    const rightW = W - rightX - 15;

    // Conductivity meter
    const meterX = rightX;
    const meterY = 30;
    const meterW = rightW;
    const meterH = H * 0.3;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(meterX, meterY, meterW, meterH, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CONDUCTIVITY METER", meterX + meterW / 2, meterY + 18);

    // Calculate log-scale conductivity for meter
    const curN = carrierConcentration(eg, T, dop, dopLvl);
    const curSigma = conductivity(curN);
    const logSigma = curSigma > 0 ? Math.log10(curSigma) : -20;
    const logMin = -15;
    const logMax = 8;
    const meterFrac = Math.max(0, Math.min(1, (logSigma - logMin) / (logMax - logMin)));

    // Meter bar background
    const barX = meterX + 15;
    const barY = meterY + 34;
    const barW = meterW - 30;
    const barH = 18;

    // Gradient bar
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, "rgba(239,68,68,0.3)");
    barGrad.addColorStop(0.3, "rgba(245,158,11,0.3)");
    barGrad.addColorStop(0.6, "rgba(34,197,94,0.3)");
    barGrad.addColorStop(1, "rgba(96,165,250,0.4)");
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fill();

    // Fill portion
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW * meterFrac, 0);
    fillGrad.addColorStop(0, "#ef4444");
    fillGrad.addColorStop(0.4, "#f59e0b");
    fillGrad.addColorStop(0.7, "#22c55e");
    fillGrad.addColorStop(1, "#3b82f6");
    if (meterFrac > 0.01) {
      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(barX, barY, barW * meterFrac, barH, barH / 2);
      ctx.fill();
    }

    // Pointer
    const pointerX = barX + barW * meterFrac;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(pointerX, barY - 4);
    ctx.lineTo(pointerX - 4, barY - 10);
    ctx.lineTo(pointerX + 4, barY - 10);
    ctx.closePath();
    ctx.fill();

    // Scale labels
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("Insulator", barX, barY + barH + 12);
    ctx.textAlign = "center";
    ctx.fillText("Semi", barX + barW * 0.5, barY + barH + 12);
    ctx.textAlign = "right";
    ctx.fillText("Conductor", barX + barW, barY + barH + 12);

    // Conductivity value
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`\u03C3 = ${sciNotation(curSigma)} S/m`, meterX + meterW / 2, barY + barH + 32);

    // Material label
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px ui-monospace, monospace";
    const matLabel = mat === "conductor" ? "Conductor (Metal)" : mat === "semiconductor" ? "Semiconductor (Si)" : "Insulator";
    ctx.fillText(matLabel, meterX + meterW / 2, barY + barH + 48);

    // Target line for challenge mode
    if (gameMode === "match-conductivity" && targetConductivity > 0) {
      const logTarget = Math.log10(targetConductivity);
      const targetFrac = Math.max(0, Math.min(1, (logTarget - logMin) / (logMax - logMin)));
      const targetX = barX + barW * targetFrac;

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(targetX, barY - 12);
      ctx.lineTo(targetX, barY + barH + 4);
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("TARGET", targetX, barY - 14);
    }

    // --- Data Panel ---
    const dataY = meterY + meterH + 15;
    const dataH = H - dataY - 15;

    drawInfoPanel(ctx, meterX, dataY, meterW, Math.min(dataH, 130), "BAND DATA", [
      { label: "Band gap (Eg)", value: `${eg.toFixed(2)} eV`, color: "#f59e0b" },
      { label: "Temperature", value: `${T} K`, color: "#ef4444" },
      { label: "Fermi level", value: mat === "conductor" ? "in band" : `${(eg * (dop === "n-type" ? 0.75 : dop === "p-type" ? 0.25 : 0.5)).toFixed(2)} eV`, color: "#22c55e" },
      { label: "Carrier conc.", value: sciNotation(curN) + " /m\u00B3", color: "#60a5fa" },
      { label: "Conductivity", value: sciNotation(curSigma) + " S/m", color: "#a78bfa" },
      { label: "Doping", value: dop === "intrinsic" ? "Intrinsic" : dop === "n-type" ? "N-type" : "P-type", color: dop === "n-type" ? "#fbbf24" : dop === "p-type" ? "#ef4444" : "#94a3b8" },
    ]);

    // --- Temperature indicator (thermometer) ---
    const thermoY = dataY + Math.min(dataH, 130) + 20;
    const thermoH2 = Math.max(50, H - thermoY - 20);

    if (thermoY + thermoH2 < H - 5) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(meterX, thermoY - 8, meterW, thermoH2 + 16, 8);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("THERMAL EXCITATION", meterX + 10, thermoY + 8);

      // Animation: arrows showing electrons being thermally excited
      const exciteProb = T > 0 ? Math.exp(-eg / (2 * kB * T)) : 0;
      const exciteLevel = Math.min(1, exciteProb * 1e6);
      const numArrows = Math.round(exciteLevel * 6);

      ctx.strokeStyle = `rgba(239,68,68,${0.3 + exciteLevel * 0.5})`;
      ctx.lineWidth = 1;
      const arrowBaseY = thermoY + 26;
      const arrowH2 = Math.min(30, thermoH2 - 30);
      for (let i = 0; i < numArrows; i++) {
        const ax = meterX + 30 + i * ((meterW - 60) / Math.max(numArrows - 1, 1));
        const waveOffset = Math.sin(timeRef.current * 3 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(ax, arrowBaseY + arrowH2);
        ctx.lineTo(ax + waveOffset, arrowBaseY);
        ctx.stroke();
        // arrowhead
        ctx.fillStyle = `rgba(239,68,68,${0.3 + exciteLevel * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(ax + waveOffset, arrowBaseY);
        ctx.lineTo(ax + waveOffset - 3, arrowBaseY + 5);
        ctx.lineTo(ax + waveOffset + 3, arrowBaseY + 5);
        ctx.closePath();
        ctx.fill();
      }

      if (numArrows === 0 && mat !== "conductor") {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("Too cold / gap too large", meterX + meterW / 2, arrowBaseY + arrowH2 / 2);
      }
    }

    // --- Scoreboard ---
    if (challengeState.active) {
      renderScoreboard(ctx, W - 170, H - 120, 155, 108, challengeState);
    }

    // --- Particles ---
    particlesRef.current.draw(ctx);

    // --- Score popups ---
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [gameMode, challengeState, targetConductivity]);

  const animate = useCallback(() => {
    const dt = 0.016;
    timeRef.current += dt;
    const mat = materialRef.current;
    const T = temperatureRef.current;
    const eg = bandGapForMaterial(mat);

    // Thermal excitation probability per frame
    const exciteProb = T > 0 && eg > 0 ? Math.min(0.08, Math.exp(-eg / (2 * kB * T)) * 5e4) : (mat === "conductor" ? 0.05 : 0);

    // Update electrons
    for (const el of electronsRef.current) {
      // Horizontal drift
      el.x += el.vx * dt;
      if (el.x < 0) { el.x = 0; el.vx = Math.abs(el.vx); }
      if (el.x > 1) { el.x = 1; el.vx = -Math.abs(el.vx); }
      el.vx += (Math.random() - 0.5) * 0.5 * dt;
      el.vx = Math.max(-0.4, Math.min(0.4, el.vx));

      // Vertical drift within band
      el.y += (Math.random() - 0.5) * 0.2 * dt;
      el.y = Math.max(0, Math.min(1, el.y));

      // Thermal excitation
      el.exciteTimer -= dt;
      if (el.exciteTimer <= 0) {
        el.exciteTimer = 0.5 + Math.random() * 2;
        if (el.band === "valence" && Math.random() < exciteProb) {
          // Promote to conduction band
          el.band = "conduction";
          el.jumping = true;
          el.y = Math.random();
          setTimeout(() => { el.jumping = false; }, 300);

          // Create a hole
          holesRef.current.push({
            x: el.x,
            y: Math.random(),
            vx: (Math.random() - 0.5) * 0.2,
          });

          // Particle effect
          const canvas = canvasRef.current;
          if (canvas) {
            const ex = 40 + 10 + el.x * (canvas.width * 0.55 - 40 - 20);
            const midY = canvas.height * 0.45;
            particlesRef.current.emitGlow(ex, midY, 3, "#60a5fa");
          }
        } else if (el.band === "donor" && Math.random() < exciteProb * 20) {
          // Donor electrons easily jump to conduction band
          el.band = "conduction";
          el.y = Math.random();
          el.jumping = true;
          setTimeout(() => { el.jumping = false; }, 300);
        }
      }

      // Conduction band electrons occasionally fall back (recombination)
      if (el.band === "conduction" && mat !== "conductor") {
        const recombRate = 0.003;
        if (Math.random() < recombRate && holesRef.current.length > 0) {
          el.band = "valence";
          el.y = Math.random();
          // Remove a hole
          holesRef.current.pop();
          playSFX("pop");
        }
      }
    }

    // Update holes
    for (const hole of holesRef.current) {
      hole.x += hole.vx * dt;
      if (hole.x < 0) { hole.x = 0; hole.vx = Math.abs(hole.vx); }
      if (hole.x > 1) { hole.x = 1; hole.vx = -Math.abs(hole.vx); }
      hole.vx += (Math.random() - 0.5) * 0.3 * dt;
      hole.vx = Math.max(-0.3, Math.min(0.3, hole.vx));
      hole.y += (Math.random() - 0.5) * 0.15 * dt;
      hole.y = Math.max(0, Math.min(1, hole.y));
    }

    // For conductor: always have some electrons in conduction band
    if (mat === "conductor") {
      const conductionCount = electronsRef.current.filter((e) => e.band === "conduction").length;
      if (conductionCount < 15) {
        const valenceElectrons = electronsRef.current.filter((e) => e.band === "valence");
        if (valenceElectrons.length > 10) {
          const el = valenceElectrons[Math.floor(Math.random() * valenceElectrons.length)];
          el.band = "conduction";
          el.y = Math.random();
        }
      }
    }

    // Limit hole count
    while (holesRef.current.length > 30) {
      holesRef.current.shift();
    }

    // Update particles
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
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 480);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Animation loop
  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // Challenge generation
  const generateMatchChallenge = useCallback(() => {
    // Generate a random target conductivity (log-uniform between 1e-8 and 1e5)
    const logTarget = -8 + Math.random() * 10; // -8 to 2
    setTargetConductivity(Math.pow(10, logTarget));
    setMatchSubmitted(false);
    // Reset controls to default
    setMaterial("semiconductor");
    setTemperature(300);
    setDoping("intrinsic");
    setDopingLevel(1);
  }, []);

  const handleMatchSubmit = () => {
    const currentSigma = conductivity(carrierConcentration(Eg, temperature, doping, dopingLevel));
    // Use log-scale accuracy
    const logCurrent = Math.log10(Math.max(currentSigma, 1e-20));
    const logTarget = Math.log10(Math.max(targetConductivity, 1e-20));
    const result = calculateAccuracy(logCurrent, logTarget, 3);
    setChallengeState((prev) => updateChallengeState(prev, result));
    setMatchSubmitted(true);

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
      text: `${result.label}`,
      points: result.points,
      x: canvasRef.current ? canvasRef.current.width / 2 : 300,
      y: canvasRef.current ? canvasRef.current.height / 3 : 100,
      startTime: performance.now(),
    });
  };

  const switchMode = (mode: GameMode) => {
    setGameMode(mode);
    setMatchSubmitted(false);
    particlesRef.current.clear();

    if (mode === "sandbox") {
      setChallengeState(createChallengeState());
    } else {
      setChallengeState({ ...createChallengeState(), active: true });
      if (mode === "match-conductivity") generateMatchChallenge();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {(["sandbox", "match-conductivity"] as GameMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => switchMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              gameMode === mode
                ? "bg-yellow-500 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {mode === "sandbox" ? "Sandbox" : "Match Conductivity"}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Material selector */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Material Type</label>
          <div className="flex gap-2 mt-2">
            {(["conductor", "semiconductor", "insulator"] as MaterialType[]).map((m) => (
              <button
                key={m}
                onClick={() => setMaterial(m)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  material === m
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {m === "conductor" ? "Conductor" : m === "semiconductor" ? "Semi" : "Insulator"}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {material === "conductor" ? "Eg = 0 eV (overlapping bands)" : material === "semiconductor" ? "Eg = 1.1 eV (Silicon)" : "Eg = 5.0 eV (large gap)"}
          </p>
        </div>

        {/* Temperature */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Temperature (K)</label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={1200}
              step={10}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="flex-1 accent-red-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{temperature} K</span>
          </div>
        </div>

        {/* Doping type */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Doping Type</label>
          <div className="flex gap-2 mt-2">
            {(["intrinsic", "n-type", "p-type"] as DopingType[]).map((d) => (
              <button
                key={d}
                onClick={() => setDoping(d)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  doping === d
                    ? d === "n-type"
                      ? "bg-amber-500 text-white"
                      : d === "p-type"
                      ? "bg-red-500 text-white"
                      : "bg-gray-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {d === "intrinsic" ? "Intrinsic" : d === "n-type" ? "N-type" : "P-type"}
              </button>
            ))}
          </div>
        </div>

        {/* Doping level */}
        {doping !== "intrinsic" && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Doping Level ({doping === "n-type" ? "Donor" : "Acceptor"} concentration)
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={dopingLevel}
                onChange={(e) => setDopingLevel(Number(e.target.value))}
                className={`flex-1 ${doping === "n-type" ? "accent-amber-500" : "accent-red-500"}`}
              />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{dopingLevel}x</span>
            </div>
          </div>
        )}
      </div>

      {/* Match conductivity challenge */}
      {gameMode === "match-conductivity" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Target Conductivity: <span className="text-amber-500">{sciNotation(targetConductivity)} S/m</span>
            </h3>
            <div className="flex gap-2">
              {!matchSubmitted ? (
                <button
                  onClick={handleMatchSubmit}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
                >
                  Check
                </button>
              ) : (
                <button
                  onClick={generateMatchChallenge}
                  className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adjust material, temperature, and doping to match the target conductivity. Current: {sciNotation(sigma)} S/m
          </p>
          {matchSubmitted && (
            <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
              Log-scale difference: {Math.abs(Math.log10(Math.max(sigma, 1e-20)) - Math.log10(Math.max(targetConductivity, 1e-20))).toFixed(2)} decades
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

      {/* Key equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E_g = E_c - E_v" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="n \propto e^{-E_g/2k_BT}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\sigma = nq\mu" /></div>
        </div>
      </div>
    </div>
  );
}
