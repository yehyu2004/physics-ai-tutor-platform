"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { playSFX, playScore } from "@/lib/simulation/sound";

// --- Decay chain data ---
interface DecayStep {
  symbol: string;
  name: string;
  Z: number;
  A: number;
  halfLife: string;
  decayType: "alpha" | "beta-" | "beta+" | "stable";
}

const U238_CHAIN: DecayStep[] = [
  { symbol: "U", name: "Uranium", Z: 92, A: 238, halfLife: "4.47 Gy", decayType: "alpha" },
  { symbol: "Th", name: "Thorium", Z: 90, A: 234, halfLife: "24.1 d", decayType: "beta-" },
  { symbol: "Pa", name: "Protactinium", Z: 91, A: 234, halfLife: "1.17 min", decayType: "beta-" },
  { symbol: "U", name: "Uranium", Z: 92, A: 234, halfLife: "245 ky", decayType: "alpha" },
  { symbol: "Th", name: "Thorium", Z: 90, A: 230, halfLife: "75.4 ky", decayType: "alpha" },
  { symbol: "Ra", name: "Radium", Z: 88, A: 226, halfLife: "1600 y", decayType: "alpha" },
  { symbol: "Rn", name: "Radon", Z: 86, A: 222, halfLife: "3.82 d", decayType: "alpha" },
  { symbol: "Po", name: "Polonium", Z: 84, A: 218, halfLife: "3.10 min", decayType: "alpha" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 214, halfLife: "26.8 min", decayType: "beta-" },
  { symbol: "Bi", name: "Bismuth", Z: 83, A: 214, halfLife: "19.9 min", decayType: "beta-" },
  { symbol: "Po", name: "Polonium", Z: 84, A: 214, halfLife: "164 \u00B5s", decayType: "alpha" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 210, halfLife: "22.2 y", decayType: "beta-" },
  { symbol: "Bi", name: "Bismuth", Z: 83, A: 210, halfLife: "5.01 d", decayType: "beta-" },
  { symbol: "Po", name: "Polonium", Z: 84, A: 210, halfLife: "138 d", decayType: "alpha" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 206, halfLife: "Stable", decayType: "stable" },
];

const TH232_CHAIN: DecayStep[] = [
  { symbol: "Th", name: "Thorium", Z: 90, A: 232, halfLife: "14.0 Gy", decayType: "alpha" },
  { symbol: "Ra", name: "Radium", Z: 88, A: 228, halfLife: "5.75 y", decayType: "beta-" },
  { symbol: "Ac", name: "Actinium", Z: 89, A: 228, halfLife: "6.15 h", decayType: "beta-" },
  { symbol: "Th", name: "Thorium", Z: 90, A: 228, halfLife: "1.91 y", decayType: "alpha" },
  { symbol: "Ra", name: "Radium", Z: 88, A: 224, halfLife: "3.66 d", decayType: "alpha" },
  { symbol: "Rn", name: "Radon", Z: 86, A: 220, halfLife: "55.6 s", decayType: "alpha" },
  { symbol: "Po", name: "Polonium", Z: 84, A: 216, halfLife: "0.145 s", decayType: "alpha" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 212, halfLife: "10.6 h", decayType: "beta-" },
  { symbol: "Bi", name: "Bismuth", Z: 83, A: 212, halfLife: "60.6 min", decayType: "beta-" },
  { symbol: "Po", name: "Polonium", Z: 84, A: 212, halfLife: "0.299 \u00B5s", decayType: "alpha" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 208, halfLife: "Stable", decayType: "stable" },
];

const U235_CHAIN: DecayStep[] = [
  { symbol: "U", name: "Uranium", Z: 92, A: 235, halfLife: "704 My", decayType: "alpha" },
  { symbol: "Th", name: "Thorium", Z: 90, A: 231, halfLife: "25.5 h", decayType: "beta-" },
  { symbol: "Pa", name: "Protactinium", Z: 91, A: 231, halfLife: "32.8 ky", decayType: "alpha" },
  { symbol: "Ac", name: "Actinium", Z: 89, A: 227, halfLife: "21.8 y", decayType: "beta-" },
  { symbol: "Th", name: "Thorium", Z: 90, A: 227, halfLife: "18.7 d", decayType: "alpha" },
  { symbol: "Ra", name: "Radium", Z: 88, A: 223, halfLife: "11.4 d", decayType: "alpha" },
  { symbol: "Rn", name: "Radon", Z: 86, A: 219, halfLife: "3.96 s", decayType: "alpha" },
  { symbol: "Po", name: "Polonium", Z: 84, A: 215, halfLife: "1.78 ms", decayType: "alpha" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 211, halfLife: "36.1 min", decayType: "beta-" },
  { symbol: "Bi", name: "Bismuth", Z: 83, A: 211, halfLife: "2.14 min", decayType: "alpha" },
  { symbol: "Tl", name: "Thallium", Z: 81, A: 207, halfLife: "4.77 min", decayType: "beta-" },
  { symbol: "Pb", name: "Lead", Z: 82, A: 207, halfLife: "Stable", decayType: "stable" },
];

const CHAINS: Record<string, { label: string; data: DecayStep[] }> = {
  "U-238": { label: "\u00B2\u00B3\u2078U", data: U238_CHAIN },
  "Th-232": { label: "\u00B2\u00B3\u00B2Th", data: TH232_CHAIN },
  "U-235": { label: "\u00B2\u00B3\u2075U", data: U235_CHAIN },
};

// All known elements for generating wrong answer choices
const ELEMENTS: Record<number, { symbol: string; name: string }> = {
  81: { symbol: "Tl", name: "Thallium" },
  82: { symbol: "Pb", name: "Lead" },
  83: { symbol: "Bi", name: "Bismuth" },
  84: { symbol: "Po", name: "Polonium" },
  85: { symbol: "At", name: "Astatine" },
  86: { symbol: "Rn", name: "Radon" },
  87: { symbol: "Fr", name: "Francium" },
  88: { symbol: "Ra", name: "Radium" },
  89: { symbol: "Ac", name: "Actinium" },
  90: { symbol: "Th", name: "Thorium" },
  91: { symbol: "Pa", name: "Protactinium" },
  92: { symbol: "U", name: "Uranium" },
  93: { symbol: "Np", name: "Neptunium" },
  94: { symbol: "Pu", name: "Plutonium" },
};

// Particle animation state
interface EmittedParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: "alpha" | "beta-" | "beta+";
  age: number;
  trail: { x: number; y: number }[];
}

// Decay timeline event
interface DecayEvent {
  step: number;
  from: string;
  to: string;
  type: "alpha" | "beta-" | "beta+" | "stable";
  time: number; // monotonic step time
}

// Achievement badges
interface Badge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
}

function superscript(n: number): string {
  const sup: Record<string, string> = {
    "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3",
    "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077",
    "8": "\u2078", "9": "\u2079",
  };
  return String(n).split("").map(c => sup[c] || c).join("");
}

function subscript(n: number): string {
  const sub: Record<string, string> = {
    "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083",
    "4": "\u2084", "5": "\u2085", "6": "\u2086", "7": "\u2087",
    "8": "\u2088", "9": "\u2089",
  };
  return String(n).split("").map(c => sub[c] || c).join("");
}

function formatIsotope(step: DecayStep): string {
  return `${superscript(step.A)}${subscript(step.Z)}${step.symbol}`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DecayChain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [chainKey, setChainKey] = useState<string>("U-238");
  const [currentStep, setCurrentStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [gameMode, setGameMode] = useState(true);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // Quiz state
  const [quizPhase, setQuizPhase] = useState<"element" | "decayType" | "none">("none");
  const [choices, setChoices] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [feedbackTimer, setFeedbackTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Animation state
  const particlesRef = useRef<EmittedParticle[]>([]);
  const animatingDecayRef = useRef(false);
  const decayProgressRef = useRef(0);

  // Decay timeline
  const [decayTimeline, setDecayTimeline] = useState<DecayEvent[]>([]);

  // Achievement badges
  const [badges, setBadges] = useState<Badge[]>([
    { id: "complete", label: "Chain Complete", description: "Complete an entire decay chain", earned: false },
    { id: "perfect", label: "Perfect Quiz", description: "Answer all questions correctly", earned: false },
    { id: "streak5", label: "Hot Streak", description: "Get 5 correct answers in a row", earned: false },
    { id: "all-chains", label: "Nuclear Master", description: "Complete all 3 decay chains", earned: false },
  ]);
  const completedChainsRef = useRef<Set<string>>(new Set());

  const chain = CHAINS[chainKey].data;
  const current = chain[currentStep];
  const isStable = current.decayType === "stable";

  // Generate quiz choices
  const generateElementQuiz = useCallback((stepIndex: number, chainData: DecayStep[]) => {
    if (stepIndex >= chainData.length - 1) return;
    const daughter = chainData[stepIndex + 1];
    const correct = `${superscript(daughter.A)}${daughter.symbol} (${daughter.name})`;

    // Generate 3 wrong answers
    const wrongAnswers: string[] = [];
    const parentStep = chainData[stepIndex];
    const usedKeys = new Set<string>();
    usedKeys.add(`${daughter.Z}-${daughter.A}`);

    // Try plausible wrong answers based on decay type
    const possibleZ = [parentStep.Z - 2, parentStep.Z - 1, parentStep.Z, parentStep.Z + 1, parentStep.Z + 2];
    const possibleA = [parentStep.A - 4, parentStep.A - 3, parentStep.A - 2, parentStep.A - 1, parentStep.A, parentStep.A + 1];

    for (const z of possibleZ) {
      for (const a of possibleA) {
        if (wrongAnswers.length >= 3) break;
        const key = `${z}-${a}`;
        if (usedKeys.has(key)) continue;
        if (z < 81 || z > 94 || a < 200 || a > 240) continue;
        const el = ELEMENTS[z];
        if (!el) continue;
        usedKeys.add(key);
        wrongAnswers.push(`${superscript(a)}${el.symbol} (${el.name})`);
      }
      if (wrongAnswers.length >= 3) break;
    }

    // Fill remaining with random elements
    while (wrongAnswers.length < 3) {
      const z = 81 + Math.floor(Math.random() * 13);
      const a = 200 + Math.floor(Math.random() * 40);
      const key = `${z}-${a}`;
      if (usedKeys.has(key)) continue;
      const el = ELEMENTS[z];
      if (!el) continue;
      usedKeys.add(key);
      wrongAnswers.push(`${superscript(a)}${el.symbol} (${el.name})`);
    }

    const allChoices = shuffleArray([correct, ...wrongAnswers.slice(0, 3)]);
    setChoices(allChoices);
    setCorrectAnswer(correct);
    setSelectedAnswer(null);
    setQuizPhase("element");
  }, []);

  const generateDecayTypeQuiz = useCallback((stepIndex: number, chainData: DecayStep[]) => {
    if (stepIndex >= chainData.length - 1) return;
    const step = chainData[stepIndex];
    const correct = step.decayType === "alpha" ? "\u03B1 (Alpha)" : "\u03B2\u207B (Beta minus)";
    const wrong = step.decayType === "alpha" ? "\u03B2\u207B (Beta minus)" : "\u03B1 (Alpha)";
    const extras = ["\u03B2\u207A (Beta plus)", "\u03B3 (Gamma)"];
    const allChoices = shuffleArray([correct, wrong, ...extras]);
    setChoices(allChoices);
    setCorrectAnswer(correct);
    setSelectedAnswer(null);
    setQuizPhase("decayType");
  }, []);

  // Draw on canvas
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

    const chainData = CHAINS[chainKey].data;
    const step = chainData[currentStep];

    // === Main nucleus area (center-right) ===
    const nucCX = W * 0.55;
    const nucCY = H * 0.4;
    const baseR = Math.max(30, Math.min(60, (step.A / 238) * 55));

    // Nucleus glow
    const glow = ctx.createRadialGradient(nucCX, nucCY, 0, nucCX, nucCY, baseR * 2);
    glow.addColorStop(0, "rgba(139,92,246,0.2)");
    glow.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(nucCX, nucCY, baseR * 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw packed nucleons inside nucleus
    const numProtons = step.Z;
    const totalNucleons = step.A;

    // Place nucleons in a packed circle
    const nucleonR = Math.max(1.5, Math.min(3.5, baseR / Math.sqrt(totalNucleons) * 1.4));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    // Outer circle of nucleus
    ctx.strokeStyle = "rgba(139,92,246,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(nucCX, nucCY, baseR + 3, 0, Math.PI * 2);
    ctx.stroke();

    // Place nucleons in sunflower seed pattern
    for (let i = 0; i < totalNucleons; i++) {
      const r = baseR * Math.sqrt(i / totalNucleons) * 0.92;
      const theta = i * goldenAngle;
      const nx = nucCX + r * Math.cos(theta);
      const ny = nucCY + r * Math.sin(theta);

      if (i < numProtons) {
        ctx.fillStyle = "#ef4444"; // Protons = red
      } else {
        ctx.fillStyle = "#3b82f6"; // Neutrons = blue
      }
      ctx.beginPath();
      ctx.arc(nx, ny, nucleonR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nucleus label
    ctx.font = "bold 16px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(formatIsotope(step), nucCX, nucCY + baseR + 12);
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(step.name, nucCX, nucCY + baseR + 32);

    // === Draw emitted particles ===
    const particles = particlesRef.current;
    for (const p of particles) {
      const px = nucCX + p.x;
      const py = nucCY + p.y;
      const alpha = Math.max(0, 1 - p.age / 2.5);

      // Draw particle trail
      if (p.trail.length > 1) {
        for (let ti = 1; ti < p.trail.length; ti++) {
          const ta = (ti / p.trail.length) * alpha * 0.4;
          const trailColor = p.type === "alpha" ? `rgba(251,191,36,${ta})` : p.type === "beta-" ? `rgba(34,197,94,${ta})` : `rgba(239,68,68,${ta})`;
          ctx.strokeStyle = trailColor;
          ctx.lineWidth = p.type === "alpha" ? 3 : 1.5;
          ctx.beginPath();
          ctx.moveTo(nucCX + p.trail[ti - 1].x, nucCY + p.trail[ti - 1].y);
          ctx.lineTo(nucCX + p.trail[ti].x, nucCY + p.trail[ti].y);
          ctx.stroke();
        }
      }

      if (p.type === "alpha") {
        // Alpha particle: 2 protons + 2 neutrons cluster
        const pGlow = ctx.createRadialGradient(px, py, 0, px, py, 12);
        pGlow.addColorStop(0, `rgba(251,191,36,${alpha * 0.4})`);
        pGlow.addColorStop(1, `rgba(251,191,36,0)`);
        ctx.fillStyle = pGlow;
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fill();

        // 4 nucleons
        const offsets = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
        const colors = ["#ef4444", "#ef4444", "#3b82f6", "#3b82f6"];
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = colors[i];
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(px + offsets[i][0], py + offsets[i][1], 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Label
        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = `rgba(251,191,36,${alpha})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u2074He", px, py - 14);
      } else if (p.type === "beta-") {
        // Electron: small blue-green dot
        const eGlow = ctx.createRadialGradient(px, py, 0, px, py, 8);
        eGlow.addColorStop(0, `rgba(34,197,94,${alpha * 0.6})`);
        eGlow.addColorStop(1, `rgba(34,197,94,0)`);
        ctx.fillStyle = eGlow;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(34,197,94,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = `rgba(34,197,94,${alpha})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("e\u207B", px, py - 10);

        // Antineutrino (smaller, trailing)
        const nvx = px + p.vy * 15;
        const nvy = py - p.vx * 15;
        ctx.fillStyle = `rgba(148,163,184,${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(nvx, nvy, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "7px ui-monospace";
        ctx.fillStyle = `rgba(148,163,184,${alpha * 0.5})`;
        ctx.fillText("\u03BD\u0305", nvx, nvy - 6);
      } else if (p.type === "beta+") {
        // Positron: small red dot
        const eGlow = ctx.createRadialGradient(px, py, 0, px, py, 8);
        eGlow.addColorStop(0, `rgba(239,68,68,${alpha * 0.6})`);
        eGlow.addColorStop(1, `rgba(239,68,68,0)`);
        ctx.fillStyle = eGlow;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(239,68,68,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 9px ui-monospace";
        ctx.fillStyle = `rgba(239,68,68,${alpha})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("e\u207A", px, py - 10);
      }
    }

    // === Decay equation (top center) ===
    if (currentStep > 0) {
      const prev = chainData[currentStep - 1];
      let eqn = `${formatIsotope(prev)} \u2192 ${formatIsotope(step)}`;
      if (prev.decayType === "alpha") {
        eqn += ` + ${superscript(4)}${subscript(2)}He`;
      } else if (prev.decayType === "beta-") {
        eqn += " + e\u207B + \u03BD\u0305";
      } else if (prev.decayType === "beta+") {
        eqn += " + e\u207A + \u03BD";
      }

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W * 0.25, 10, W * 0.5, 30, 8);
      ctx.fill();
      ctx.font = "bold 13px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(eqn, W * 0.5, 25);
    }

    // === Info panel (top-left) ===
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 50, 175, 120, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CURRENT ISOTOPE", 22, 58);

    ctx.font = "bold 16px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`${formatIsotope(step)} ${step.name}`, 22, 76);

    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Z = ${step.Z}  A = ${step.A}`, 22, 100);
    ctx.fillText(`N = ${step.A - step.Z}`, 22, 116);
    ctx.fillText(`t\u00BD = ${step.halfLife}`, 22, 132);
    ctx.fillText(`Step: ${currentStep}/${chainData.length - 1}`, 22, 148);

    // === Score panel (top-right, game mode) ===
    if (gameMode) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 155, 50, 143, 80, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "left";
      ctx.fillText("GAME SCORE", W - 145, 58);

      ctx.font = "bold 20px ui-monospace";
      ctx.fillStyle = "#22c55e";
      ctx.fillText(`${score}`, W - 145, 80);

      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Streak: ${streak}`, W - 145, 106);
      ctx.fillText(`${totalAnswered} answered`, W - 75, 106);
    }

    // === N vs Z mini chart (bottom-left) ===
    const chartX = 12;
    const chartY = H - 190;
    const chartW = 175;
    const chartH = 165;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(chartX, chartY, chartW, chartH, 8);
    ctx.fill();

    ctx.font = "bold 9px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("N vs Z CHART", chartX + 8, chartY + 12);

    // Chart drawing area
    const plotX = chartX + 30;
    const plotY = chartY + 22;
    const plotW = chartW - 40;
    const plotH = chartH - 38;

    // Determine Z and N range from chain
    let minZ = 999, maxZ = 0, minN = 999, maxN = 0;
    for (const s of chainData) {
      const n = s.A - s.Z;
      minZ = Math.min(minZ, s.Z);
      maxZ = Math.max(maxZ, s.Z);
      minN = Math.min(minN, n);
      maxN = Math.max(maxN, n);
    }
    minZ -= 2; maxZ += 2;
    minN -= 2; maxN += 2;

    const zRange = maxZ - minZ;
    const nRange = maxN - minN;

    const toPlotX = (z: number) => plotX + ((z - minZ) / zRange) * plotW;
    const toPlotY = (n: number) => plotY + plotH - ((n - minN) / nRange) * plotH;

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotX, plotY);
    ctx.lineTo(plotX, plotY + plotH);
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.stroke();

    ctx.font = "7px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText("Z (protons)", plotX + plotW / 2, plotY + plotH + 12);
    ctx.save();
    ctx.translate(plotX - 12, plotY + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("N (neutrons)", 0, 0);
    ctx.restore();

    // Color-coded stability landscape
    // Alpha decay region (proton-rich heavy nuclei) - amber
    ctx.fillStyle = "rgba(245,158,11,0.06)";
    ctx.beginPath();
    for (let z = minZ; z <= maxZ; z++) {
      const nStable = Math.round(z * 1.55 - 20);
      const px = toPlotX(z);
      const py = toPlotY(nStable - 5);
      if (z === minZ) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(toPlotX(maxZ), toPlotY(minN));
    ctx.lineTo(toPlotX(minZ), toPlotY(minN));
    ctx.closePath();
    ctx.fill();

    // Beta- decay region (neutron-rich) - blue
    ctx.fillStyle = "rgba(59,130,246,0.06)";
    ctx.beginPath();
    for (let z = minZ; z <= maxZ; z++) {
      const nStable = Math.round(z * 1.55 - 20);
      const px = toPlotX(z);
      const py = toPlotY(nStable + 5);
      if (z === minZ) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(toPlotX(maxZ), toPlotY(maxN));
    ctx.lineTo(toPlotX(minZ), toPlotY(maxN));
    ctx.closePath();
    ctx.fill();

    // Stability band (green center)
    ctx.fillStyle = "rgba(34,197,94,0.1)";
    ctx.beginPath();
    for (let z = minZ; z <= maxZ; z++) {
      const nStable = Math.round(z * 1.55 - 20);
      const px = toPlotX(z);
      const py1 = toPlotY(nStable + 4);
      if (z === minZ) ctx.moveTo(px, py1);
      else ctx.lineTo(px, py1);
    }
    for (let z = maxZ; z >= minZ; z--) {
      const nStable = Math.round(z * 1.55 - 20);
      const px = toPlotX(z);
      const py2 = toPlotY(nStable - 4);
      ctx.lineTo(px, py2);
    }
    ctx.closePath();
    ctx.fill();

    // Stability region labels
    ctx.font = "6px system-ui";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(34,197,94,0.5)";
    ctx.fillText("stable", plotX + plotW - 32, plotY + plotH - 8);
    ctx.fillStyle = "rgba(59,130,246,0.4)";
    ctx.fillText("\u03B2\u207B", plotX + 3, plotY + 10);
    ctx.fillStyle = "rgba(245,158,11,0.4)";
    ctx.fillText("\u03B1", plotX + plotW - 12, plotY + plotH - 2);

    // Draw decay path trail
    ctx.strokeStyle = "rgba(251,191,36,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    for (let i = 0; i <= currentStep && i < chainData.length; i++) {
      const s = chainData[i];
      const n = s.A - s.Z;
      const px = toPlotX(s.Z);
      const py = toPlotY(n);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw past points
    for (let i = 0; i < currentStep && i < chainData.length; i++) {
      const s = chainData[i];
      const n = s.A - s.Z;
      const px = toPlotX(s.Z);
      const py = toPlotY(n);

      ctx.fillStyle = "rgba(251,191,36,0.3)";
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw arrows showing decay type
    for (let i = 0; i < currentStep && i < chainData.length - 1; i++) {
      const s1 = chainData[i];
      const s2 = chainData[i + 1];
      const px1 = toPlotX(s1.Z);
      const py1 = toPlotY(s1.A - s1.Z);
      const px2 = toPlotX(s2.Z);
      const py2 = toPlotY(s2.A - s2.Z);

      // Small arrow head
      const angle = Math.atan2(py2 - py1, px2 - px1);
      const headLen = 4;
      ctx.strokeStyle = s1.decayType === "alpha" ? "rgba(251,191,36,0.5)" : "rgba(34,197,94,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px2, py2);
      ctx.lineTo(px2 - headLen * Math.cos(angle - 0.5), py2 - headLen * Math.sin(angle - 0.5));
      ctx.moveTo(px2, py2);
      ctx.lineTo(px2 - headLen * Math.cos(angle + 0.5), py2 - headLen * Math.sin(angle + 0.5));
      ctx.stroke();
    }

    // Current position (highlighted)
    {
      const n = step.A - step.Z;
      const px = toPlotX(step.Z);
      const py = toPlotY(n);

      const ptGlow = ctx.createRadialGradient(px, py, 0, px, py, 10);
      ptGlow.addColorStop(0, "rgba(251,191,36,0.5)");
      ptGlow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = ptGlow;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stable indicator
    if (isStable) {
      ctx.fillStyle = "rgba(34,197,94,0.3)";
      ctx.beginPath();
      ctx.roundRect(W * 0.35, H * 0.72, W * 0.4, 36, 8);
      ctx.fill();
      ctx.font = "bold 16px ui-monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STABLE NUCLEUS REACHED", W * 0.55, H * 0.72 + 18);
    }

    // Proton/neutron legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(W - 155, H - 50, 143, 38, 6);
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(W - 140, H - 31, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "9px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("Proton", W - 132, H - 28);

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(W - 80, H - 31, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Neutron", W - 72, H - 28);
  }, [chainKey, currentStep, gameMode, score, streak, totalAnswered, isStable]);

  // Animation loop
  const animate = useCallback(() => {
    const particles = particlesRef.current;
    const dt = 0.016;
    let alive = false;

    for (const p of particles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 30) p.trail.shift();
      p.x += p.vx * dt * 120;
      p.y += p.vy * dt * 120;
      p.age += dt;
      if (p.age < 2.5) alive = true;
    }

    if (animatingDecayRef.current) {
      decayProgressRef.current += dt;
      if (decayProgressRef.current > 0.8) {
        animatingDecayRef.current = false;
      }
    }

    particlesRef.current = particles.filter(p => p.age < 2.5);

    draw();

    if (alive || animatingDecayRef.current) {
      animRef.current = requestAnimationFrame(animate);
    }
  }, [draw]);

  // Trigger a decay animation
  const triggerDecayAnimation = useCallback((decayType: "alpha" | "beta-" | "beta+") => {
    const angle = (Math.random() - 0.5) * 0.5;
    const speed = 1.5 + Math.random() * 0.5;

    // Play decay sound
    if (decayType === "alpha") {
      playSFX("pop");
    } else {
      playSFX("click");
    }

    if (decayType === "alpha") {
      particlesRef.current.push({
        x: 0, y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        type: "alpha",
        age: 0,
        trail: [],
      });
    } else if (decayType === "beta-") {
      particlesRef.current.push({
        x: 0, y: 0,
        vx: Math.cos(angle) * speed * 1.5,
        vy: Math.sin(angle) * speed * 1.5,
        type: "beta-",
        age: 0,
        trail: [],
      });
    } else if (decayType === "beta+") {
      particlesRef.current.push({
        x: 0, y: 0,
        vx: Math.cos(angle) * speed * 1.5,
        vy: Math.sin(angle) * speed * 1.5,
        type: "beta+",
        age: 0,
        trail: [],
      });
    }

    animatingDecayRef.current = true;
    decayProgressRef.current = 0;
    animRef.current = requestAnimationFrame(animate);
  }, [animate]);

  // Advance to next step
  const advanceStep = useCallback(() => {
    const chainData = CHAINS[chainKey].data;
    if (currentStep >= chainData.length - 1) return;

    const curDecay = chainData[currentStep].decayType;
    if (curDecay !== "stable") {
      triggerDecayAnimation(curDecay);
    }

    // Add to timeline
    const from = formatIsotope(chainData[currentStep]);
    const nextStep = currentStep + 1;
    const to = formatIsotope(chainData[nextStep]);
    setDecayTimeline(prev => [...prev, {
      step: currentStep,
      from,
      to,
      type: curDecay,
      time: Date.now(),
    }]);

    setCurrentStep(prev => {
      const next = prev + 1;
      // Check for chain completion badge
      if (next >= chainData.length - 1) {
        completedChainsRef.current.add(chainKey);
        setBadges(prev => prev.map(b => {
          if (b.id === "complete" && !b.earned) {
            playSFX("success");
            return { ...b, earned: true };
          }
          if (b.id === "all-chains" && completedChainsRef.current.size >= 3 && !b.earned) {
            playSFX("powerup");
            return { ...b, earned: true };
          }
          // Perfect quiz: completed chain with all correct (streak == totalAnswered and totalAnswered > 0)
          return b;
        }));
      }
      return next;
    });
  }, [chainKey, currentStep, triggerDecayAnimation]);

  // Handle stepping: either direct or via quiz
  const handleStep = useCallback(() => {
    const chainData = CHAINS[chainKey].data;
    if (currentStep >= chainData.length - 1) return;

    if (gameMode) {
      generateElementQuiz(currentStep, chainData);
    } else {
      advanceStep();
    }
  }, [chainKey, currentStep, gameMode, generateElementQuiz, advanceStep]);

  // Handle quiz answer
  const handleAnswer = useCallback((answer: string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(answer);
    const isCorrect = answer === correctAnswer;

    if (quizPhase === "element") {
      if (isCorrect) {
        playSFX("correct");
        setScore(s => s + 1);
        setStreak(s => {
          const newStreak = s + 1;
          if (newStreak >= 5) {
            setBadges(prev => prev.map(b =>
              b.id === "streak5" && !b.earned ? { ...b, earned: true } : b
            ));
          }
          return newStreak;
        });
      } else {
        playSFX("incorrect");
        setStreak(0);
      }
      setTotalAnswered(t => t + 1);

      // After feedback, ask decay type
      const timer = setTimeout(() => {
        const chainData = CHAINS[chainKey].data;
        generateDecayTypeQuiz(currentStep, chainData);
      }, 1200);
      setFeedbackTimer(timer);
    } else if (quizPhase === "decayType") {
      if (isCorrect) {
        playSFX("correct");
        playScore(2);
        setScore(s => s + 2); // Bonus points for decay type
        setStreak(s => s + 1);
      } else {
        playSFX("incorrect");
        setStreak(0);
      }
      setTotalAnswered(t => t + 1);

      // After feedback, advance
      const timer = setTimeout(() => {
        setQuizPhase("none");
        advanceStep();
      }, 1200);
      setFeedbackTimer(timer);
    }
  }, [selectedAnswer, correctAnswer, quizPhase, chainKey, currentStep, generateDecayTypeQuiz, advanceStep]);

  // Auto-play timer
  useEffect(() => {
    if (!autoPlay || isStable) return;
    if (gameMode && quizPhase !== "none") return;

    const interval = setInterval(() => {
      handleStep();
    }, speed * 1000);

    return () => clearInterval(interval);
  }, [autoPlay, speed, isStable, gameMode, quizPhase, handleStep]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 480);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Initial draw
  useEffect(() => {
    draw();
  }, [draw]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (feedbackTimer) clearTimeout(feedbackTimer);
      cancelAnimationFrame(animRef.current);
    };
  }, [feedbackTimer]);

  const reset = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (feedbackTimer) clearTimeout(feedbackTimer);
    setCurrentStep(0);
    setScore(0);
    setStreak(0);
    setTotalAnswered(0);
    setQuizPhase("none");
    setSelectedAnswer(null);
    setAutoPlay(false);
    particlesRef.current = [];
    animatingDecayRef.current = false;
    decayProgressRef.current = 0;
    setDecayTimeline([]);
  }, [feedbackTimer]);

  const selectChain = (key: string) => {
    reset();
    setChainKey(key);
  };

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Quiz area (game mode) */}
      {gameMode && quizPhase !== "none" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {quizPhase === "element"
              ? `What element does ${formatIsotope(chain[currentStep])} decay into?`
              : `What type of decay does ${formatIsotope(chain[currentStep])} undergo?`}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {choices.map((choice, i) => {
              let btnClass = "h-10 rounded-lg border text-sm font-medium transition-colors ";
              if (selectedAnswer === null) {
                btnClass += "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800";
              } else if (choice === correctAnswer) {
                btnClass += "border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400";
              } else if (choice === selectedAnswer && choice !== correctAnswer) {
                btnClass += "border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400";
              } else {
                btnClass += "border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600";
              }
              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(choice)}
                  disabled={selectedAnswer !== null}
                  className={btnClass}
                >
                  {choice}
                </button>
              );
            })}
          </div>
          {selectedAnswer && (
            <p className={`text-sm mt-2 font-medium ${selectedAnswer === correctAnswer ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {selectedAnswer === correctAnswer ? "Correct!" : `Incorrect. The answer is ${correctAnswer}.`}
            </p>
          )}
        </div>
      )}

      {/* Chain selector + controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chain selector */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Decay Chain</label>
          <div className="flex gap-2 mt-2">
            {Object.entries(CHAINS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => selectChain(key)}
                className={`flex-1 h-9 rounded-lg text-xs font-bold transition-colors ${
                  chainKey === key
                    ? "bg-purple-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode and speed */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Speed (Auto-play)</label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.25}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{speed}s</span>
          </div>
        </div>

        {/* Game mode toggle */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Game Mode</label>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setGameMode(true); reset(); }}
              className={`flex-1 h-9 rounded-lg text-xs font-bold transition-colors ${
                gameMode
                  ? "bg-amber-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Quiz On
            </button>
            <button
              onClick={() => { setGameMode(false); setQuizPhase("none"); }}
              className={`flex-1 h-9 rounded-lg text-xs font-bold transition-colors ${
                !gameMode
                  ? "bg-gray-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Quiz Off
            </button>
          </div>
        </div>

        {/* Step / Auto / Reset */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={handleStep}
            disabled={isStable || (gameMode && quizPhase !== "none")}
            className="flex-1 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
          >
            Step
          </button>
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            disabled={isStable}
            className={`flex-1 h-10 rounded-lg font-medium text-sm transition-colors ${
              autoPlay
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {autoPlay ? "Stop" : "Auto"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Decay Timeline */}
      {decayTimeline.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Decay Timeline</h3>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {decayTimeline.map((event, i) => (
              <React.Fragment key={i}>
                <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-mono font-bold ${
                  event.type === "alpha" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" :
                  event.type === "beta-" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" :
                  "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                }`}>
                  {event.from}
                </div>
                <div className={`flex-shrink-0 text-xs font-bold ${
                  event.type === "alpha" ? "text-amber-500" : event.type === "beta-" ? "text-green-500" : "text-red-500"
                }`}>
                  {event.type === "alpha" ? "\u03B1\u2192" : event.type === "beta-" ? "\u03B2\u207B\u2192" : "\u03B2\u207A\u2192"}
                </div>
              </React.Fragment>
            ))}
            <div className="flex-shrink-0 px-2 py-1 rounded text-xs font-mono font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              {formatIsotope(chain[currentStep])}
              {isStable && " (stable)"}
            </div>
          </div>
        </div>
      )}

      {/* Achievement Badges */}
      {gameMode && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Achievements</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className={`rounded-lg px-3 py-2 text-center border ${
                  badge.earned
                    ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50"
                }`}
              >
                <div className={`text-lg ${badge.earned ? "" : "grayscale"}`}>
                  {badge.id === "complete" ? "\u2b50" : badge.id === "perfect" ? "\u{1f3af}" : badge.id === "streak5" ? "\u{1f525}" : "\u{1f451}"}
                </div>
                <div className={`text-xs font-bold mt-1 ${badge.earned ? "text-amber-700 dark:text-amber-300" : "text-gray-400 dark:text-gray-500"}`}>
                  {badge.label}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{badge.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Nuclear Decay Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {"\u03B1: "}
            {superscript(0)}X {"\u2192 "}
            {superscript(0)}Y + {superscript(4)}{subscript(2)}He
            <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">A-4, Z-2</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {"\u03B2\u207B: "}
            {superscript(0)}X {"\u2192 "}
            {superscript(0)}Y + e{"\u207B"} + {"\u03BD\u0305"}
            <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">A same, Z+1</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            {"\u03B2\u207A: "}
            {superscript(0)}X {"\u2192 "}
            {superscript(0)}Y + e{"\u207A"} + {"\u03BD"}
            <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">A same, Z-1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
