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

interface Particle {
  name: string;
  symbol: string;
  mass: string;
  charge: string;
  spin: string;
  type: "quark" | "lepton" | "boson";
  generation?: number;
  color: string;
  row: number;
  col: number;
}

type InteractionForce = "strong" | "weak" | "electromagnetic" | "gravity" | "higgs";

interface DecayMode {
  parent: string;
  products: string[];
  description: string;
}

interface FeynmanVertex {
  x: number;
  y: number;
  particle: string | null;
}

interface FeynmanLine {
  from: number;
  to: number;
  particleType: "fermion" | "boson" | "scalar";
  label: string;
}

const particles: Particle[] = [
  // Quarks - Generation 1
  { name: "Up", symbol: "u", mass: "2.2 MeV", charge: "+2/3", spin: "1/2", type: "quark", generation: 1, color: "#ef4444", row: 0, col: 0 },
  { name: "Down", symbol: "d", mass: "4.7 MeV", charge: "-1/3", spin: "1/2", type: "quark", generation: 1, color: "#ef4444", row: 1, col: 0 },
  // Quarks - Generation 2
  { name: "Charm", symbol: "c", mass: "1.28 GeV", charge: "+2/3", spin: "1/2", type: "quark", generation: 2, color: "#f97316", row: 0, col: 1 },
  { name: "Strange", symbol: "s", mass: "96 MeV", charge: "-1/3", spin: "1/2", type: "quark", generation: 2, color: "#f97316", row: 1, col: 1 },
  // Quarks - Generation 3
  { name: "Top", symbol: "t", mass: "173 GeV", charge: "+2/3", spin: "1/2", type: "quark", generation: 3, color: "#f59e0b", row: 0, col: 2 },
  { name: "Bottom", symbol: "b", mass: "4.18 GeV", charge: "-1/3", spin: "1/2", type: "quark", generation: 3, color: "#f59e0b", row: 1, col: 2 },
  // Leptons - Generation 1
  { name: "Electron", symbol: "e", mass: "0.511 MeV", charge: "-1", spin: "1/2", type: "lepton", generation: 1, color: "#22c55e", row: 2, col: 0 },
  { name: "Electron Neutrino", symbol: "\u03BDe", mass: "< 2 eV", charge: "0", spin: "1/2", type: "lepton", generation: 1, color: "#22c55e", row: 3, col: 0 },
  // Leptons - Generation 2
  { name: "Muon", symbol: "\u03BC", mass: "106 MeV", charge: "-1", spin: "1/2", type: "lepton", generation: 2, color: "#10b981", row: 2, col: 1 },
  { name: "Muon Neutrino", symbol: "\u03BD\u03BC", mass: "< 0.19 MeV", charge: "0", spin: "1/2", type: "lepton", generation: 2, color: "#10b981", row: 3, col: 1 },
  // Leptons - Generation 3
  { name: "Tau", symbol: "\u03C4", mass: "1.78 GeV", charge: "-1", spin: "1/2", type: "lepton", generation: 3, color: "#059669", row: 2, col: 2 },
  { name: "Tau Neutrino", symbol: "\u03BD\u03C4", mass: "< 18.2 MeV", charge: "0", spin: "1/2", type: "lepton", generation: 3, color: "#059669", row: 3, col: 2 },
  // Gauge Bosons
  { name: "Gluon", symbol: "g", mass: "0", charge: "0", spin: "1", type: "boson", color: "#a855f7", row: 0, col: 3 },
  { name: "Photon", symbol: "\u03B3", mass: "0", charge: "0", spin: "1", type: "boson", color: "#8b5cf6", row: 1, col: 3 },
  { name: "Z Boson", symbol: "Z", mass: "91.2 GeV", charge: "0", spin: "1", type: "boson", color: "#7c3aed", row: 2, col: 3 },
  { name: "W Boson", symbol: "W", mass: "80.4 GeV", charge: "\u00B11", spin: "1", type: "boson", color: "#6d28d9", row: 3, col: 3 },
  // Higgs
  { name: "Higgs", symbol: "H", mass: "125 GeV", charge: "0", spin: "0", type: "boson", color: "#3b82f6", row: 0, col: 4 },
];

// Which force each particle participates in
const particleInteractions: Record<string, InteractionForce[]> = {
  u: ["strong", "weak", "electromagnetic", "gravity", "higgs"],
  d: ["strong", "weak", "electromagnetic", "gravity", "higgs"],
  c: ["strong", "weak", "electromagnetic", "gravity", "higgs"],
  s: ["strong", "weak", "electromagnetic", "gravity", "higgs"],
  t: ["strong", "weak", "electromagnetic", "gravity", "higgs"],
  b: ["strong", "weak", "electromagnetic", "gravity", "higgs"],
  e: ["weak", "electromagnetic", "gravity", "higgs"],
  "\u03BDe": ["weak", "gravity"],
  "\u03BC": ["weak", "electromagnetic", "gravity", "higgs"],
  "\u03BD\u03BC": ["weak", "gravity"],
  "\u03C4": ["weak", "electromagnetic", "gravity", "higgs"],
  "\u03BD\u03C4": ["weak", "gravity"],
  g: ["strong"],
  "\u03B3": ["electromagnetic"],
  Z: ["weak"],
  W: ["weak", "electromagnetic"],
  H: ["higgs"],
};

const forceColors: Record<InteractionForce, string> = {
  strong: "#ef4444",
  weak: "#a855f7",
  electromagnetic: "#3b82f6",
  gravity: "#f59e0b",
  higgs: "#06b6d4",
};

const decayModes: DecayMode[] = [
  { parent: "W", products: ["e", "\u03BDe"], description: "W\u207B \u2192 e\u207B + \u03BD\u0304e" },
  { parent: "W", products: ["\u03BC", "\u03BD\u03BC"], description: "W\u207B \u2192 \u03BC\u207B + \u03BD\u0304\u03BC" },
  { parent: "Z", products: ["e", "e"], description: "Z \u2192 e\u207A + e\u207B" },
  { parent: "Z", products: ["\u03BC", "\u03BC"], description: "Z \u2192 \u03BC\u207A + \u03BC\u207B" },
  { parent: "H", products: ["b", "b"], description: "H \u2192 b + b\u0304" },
  { parent: "H", products: ["\u03B3", "\u03B3"], description: "H \u2192 \u03B3 + \u03B3" },
  { parent: "H", products: ["W", "W"], description: "H \u2192 W\u207A + W\u207B" },
  { parent: "H", products: ["Z", "Z"], description: "H \u2192 Z + Z" },
  { parent: "t", products: ["W", "b"], description: "t \u2192 W\u207A + b" },
  { parent: "\u03C4", products: ["\u03BC", "\u03BD\u03BC", "\u03BD\u03C4"], description: "\u03C4\u207B \u2192 \u03BC\u207B + \u03BD\u0304\u03BC + \u03BD\u03C4" },
];

type ChallengeMode = "explore" | "identify" | "decay" | "feynman";

export default function StandardModel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<Particle | null>(null);
  const [filter, setFilter] = useState<"all" | "quark" | "lepton" | "boson">("all");
  const [highlightForce, setHighlightForce] = useState<InteractionForce | null>(null);

  // Challenge state
  const [mode, setMode] = useState<ChallengeMode>("explore");
  const [challenge, setChallenge] = useState<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const particleSystemRef = useRef(new ParticleSystem());

  // Quiz state
  const [quizParticle, setQuizParticle] = useState<Particle | null>(null);
  const [quizOptions, setQuizOptions] = useState<Particle[]>([]);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizChoice, setQuizChoice] = useState<string | null>(null);

  // Decay prediction
  const [decayQuestion, setDecayQuestion] = useState<DecayMode | null>(null);
  const [decayOptions, setDecayOptions] = useState<string[][]>([]);
  const [decayRevealed, setDecayRevealed] = useState(false);
  const [decayChoice, setDecayChoice] = useState<number | null>(null);

  // Feynman diagram builder
  const [feynmanVertices, setFeynmanVertices] = useState<FeynmanVertex[]>([]);
  const [feynmanLines, setFeynmanLines] = useState<FeynmanLine[]>([]);
  const [feynmanConnecting, setFeynmanConnecting] = useState<number | null>(null);

  // Info popup position on canvas
  const [infoPopup, setInfoPopup] = useState<{ particle: Particle; x: number; y: number } | null>(null);

  const shuffleArray = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const generateQuiz = useCallback(() => {
    const p = particles[Math.floor(Math.random() * particles.length)];
    const others = shuffleArray(particles.filter((x) => x.symbol !== p.symbol)).slice(0, 3);
    const options = shuffleArray([p, ...others]);
    setQuizParticle(p);
    setQuizOptions(options);
    setQuizRevealed(false);
    setQuizChoice(null);
  }, []);

  const generateDecayQuestion = useCallback(() => {
    const decay = decayModes[Math.floor(Math.random() * decayModes.length)];
    // Generate wrong options
    const wrongOptions: string[][] = [];
    while (wrongOptions.length < 3) {
      const randomProducts = shuffleArray(particles)
        .slice(0, decay.products.length)
        .map((p) => p.symbol);
      const key = randomProducts.sort().join(",");
      const correctKey = [...decay.products].sort().join(",");
      if (key !== correctKey && !wrongOptions.some((w) => w.sort().join(",") === key)) {
        wrongOptions.push(randomProducts);
      }
    }
    const allOptions = shuffleArray([decay.products, ...wrongOptions]);
    setDecayQuestion(decay);
    setDecayOptions(allOptions);
    setDecayRevealed(false);
    setDecayChoice(null);
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

    const margin = 30;
    const cellW = (W - margin * 2 - 40) / 5;
    const cellH = (H - margin * 2 - 60) / 4;
    const startX = margin + 20;
    const startY = margin + 40;

    // Title
    ctx.font = "bold 16px system-ui";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.fillText("The Standard Model of Particle Physics", W / 2, 25);

    // Generation labels
    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    for (let gen = 1; gen <= 3; gen++) {
      ctx.fillText(`Gen ${gen}`, startX + (gen - 1) * cellW + cellW / 2, startY - 8);
    }
    ctx.fillText("Bosons", startX + 3 * cellW + cellW / 2, startY - 8);
    ctx.fillText("Scalar", startX + 4 * cellW + cellW / 2, startY - 8);

    // Category labels
    ctx.save();
    ctx.translate(startX - 15, startY + cellH);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 10px ui-monospace";
    ctx.textAlign = "center";
    ctx.fillText("QUARKS", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(startX - 15, startY + 3 * cellH);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("LEPTONS", 0, 0);
    ctx.restore();

    // Draw force interaction highlights
    if (highlightForce) {
      for (const p of particles) {
        const interactions = particleInteractions[p.symbol] || [];
        if (interactions.includes(highlightForce)) {
          const px = startX + p.col * cellW;
          const py = startY + p.row * cellH;
          const glowColor = forceColors[highlightForce];

          // Glow behind the card
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 15;
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(px + 1, py + 1, cellW - 2, cellH - 2, 6);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }

    // Draw particles
    for (const p of particles) {
      const px = startX + p.col * cellW;
      const py = startY + p.row * cellH;
      const isFiltered = filter !== "all" && filter !== p.type;
      const isSelected = selected?.symbol === p.symbol;
      const isHighlighted = highlightForce
        ? (particleInteractions[p.symbol] || []).includes(highlightForce)
        : false;

      // Card background
      ctx.fillStyle = isFiltered
        ? "rgba(30,41,59,0.3)"
        : isSelected
          ? "rgba(255,255,255,0.1)"
          : isHighlighted
            ? "rgba(255,255,255,0.08)"
            : "rgba(30,41,59,0.6)";
      ctx.beginPath();
      ctx.roundRect(px + 3, py + 3, cellW - 6, cellH - 6, 6);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (isFiltered && !isHighlighted) continue;

      // Dim non-highlighted when a force is selected
      if (highlightForce && !isHighlighted) {
        ctx.globalAlpha = 0.2;
      }

      // Symbol
      ctx.fillStyle = p.color;
      ctx.font = "bold 22px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.symbol, px + cellW / 2, py + cellH / 2 - 5);

      // Name
      ctx.fillStyle = "#94a3b8";
      ctx.font = "8px system-ui";
      ctx.fillText(p.name, px + cellW / 2, py + cellH - 14);

      // Mass (top-right corner)
      ctx.fillStyle = "#475569";
      ctx.font = "7px ui-monospace";
      ctx.textAlign = "right";
      ctx.fillText(p.mass, px + cellW - 8, py + 14);

      // Charge (top-left corner)
      ctx.textAlign = "left";
      ctx.fillText(p.charge, px + 8, py + 14);

      ctx.globalAlpha = 1;
    }

    // Draw interaction lines between highlighted particles
    if (highlightForce) {
      const highlighted = particles.filter(
        (p) => (particleInteractions[p.symbol] || []).includes(highlightForce)
      );
      if (highlighted.length >= 2) {
        ctx.strokeStyle = forceColors[highlightForce];
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 1;
        for (let i = 0; i < highlighted.length; i++) {
          for (let j = i + 1; j < highlighted.length; j++) {
            const p1 = highlighted[i];
            const p2 = highlighted[j];
            const x1 = startX + p1.col * cellW + cellW / 2;
            const y1 = startY + p1.row * cellH + cellH / 2;
            const x2 = startX + p2.col * cellW + cellW / 2;
            const y2 = startY + p2.row * cellH + cellH / 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // Canvas info popup (detailed info when clicking a particle)
    if (infoPopup) {
      const ip = infoPopup;
      const popW = 220;
      const popH = 140;
      let popX = ip.x + 10;
      let popY = ip.y - popH / 2;
      // Keep in bounds
      if (popX + popW > W) popX = ip.x - popW - 10;
      if (popY < 5) popY = 5;
      if (popY + popH > H) popY = H - popH - 5;

      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.beginPath();
      ctx.roundRect(popX, popY, popW, popH, 8);
      ctx.fill();
      ctx.strokeStyle = ip.particle.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      let ty = popY + 20;
      ctx.font = "bold 16px system-ui";
      ctx.fillStyle = ip.particle.color;
      ctx.textAlign = "left";
      ctx.fillText(`${ip.particle.symbol} - ${ip.particle.name}`, popX + 12, ty);
      ty += 20;

      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Mass: ${ip.particle.mass}`, popX + 12, ty);
      ty += 16;
      ctx.fillText(`Charge: ${ip.particle.charge}e`, popX + 12, ty);
      ty += 16;
      ctx.fillText(`Spin: ${ip.particle.spin}`, popX + 12, ty);
      ty += 16;
      ctx.fillText(`Type: ${ip.particle.type}`, popX + 12, ty);
      ty += 16;

      // Interactions
      const interactions = particleInteractions[ip.particle.symbol] || [];
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px ui-monospace";
      ctx.fillText(`Forces: ${interactions.join(", ")}`, popX + 12, ty);
    }

    // Feynman diagram area
    if (mode === "feynman") {
      const diagX = W - 250;
      const diagY = 50;
      const diagW = 230;
      const diagH = H - 70;

      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(diagX, diagY, diagW, diagH, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("FEYNMAN DIAGRAM", diagX + diagW / 2, diagY + 18);

      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("Click to add vertices", diagX + diagW / 2, diagY + 32);
      ctx.fillText("Click 2 vertices to connect", diagX + diagW / 2, diagY + 44);

      // Draw lines
      for (const line of feynmanLines) {
        const v1 = feynmanVertices[line.from];
        const v2 = feynmanVertices[line.to];
        if (!v1 || !v2) continue;

        if (line.particleType === "boson") {
          // Wavy line for bosons
          ctx.strokeStyle = "#a855f7";
          ctx.lineWidth = 2;
          ctx.beginPath();
          const dx = v2.x - v1.x;
          const dy = v2.y - v1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const steps = Math.max(8, Math.floor(dist / 8));
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = v1.x + dx * t;
            const py = v1.y + dy * t + Math.sin(t * Math.PI * 6) * 6;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (line.particleType === "scalar") {
          // Dashed line for Higgs
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(v1.x, v1.y);
          ctx.lineTo(v2.x, v2.y);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Straight line with arrow for fermions
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(v1.x, v1.y);
          ctx.lineTo(v2.x, v2.y);
          ctx.stroke();

          // Arrow at midpoint
          const mx = (v1.x + v2.x) / 2;
          const my = (v1.y + v2.y) / 2;
          const dxx = v2.x - v1.x;
          const dyy = v2.y - v1.y;
          const mag = Math.sqrt(dxx * dxx + dyy * dyy);
          if (mag > 5) {
            const nx = dxx / mag;
            const ny = dyy / mag;
            ctx.fillStyle = "#22c55e";
            ctx.beginPath();
            ctx.moveTo(mx + nx * 6, my + ny * 6);
            ctx.lineTo(mx - nx * 4 - ny * 4, my - ny * 4 + nx * 4);
            ctx.lineTo(mx - nx * 4 + ny * 4, my - ny * 4 - nx * 4);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Label
        const midX = (v1.x + v2.x) / 2;
        const midY = (v1.y + v2.y) / 2;
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(line.label, midX, midY - 10);
      }

      // Draw vertices
      for (let i = 0; i < feynmanVertices.length; i++) {
        const v = feynmanVertices[i];
        const isConnecting = feynmanConnecting === i;

        ctx.fillStyle = isConnecting ? "#f59e0b" : "#ffffff";
        ctx.beginPath();
        ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
        ctx.fill();

        if (isConnecting) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(v.x, v.y, 10, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (v.particle) {
          ctx.font = "9px ui-monospace";
          ctx.fillStyle = "#94a3b8";
          ctx.textAlign = "center";
          ctx.fillText(v.particle, v.x, v.y - 10);
        }
      }
    }

    // Selected particle info (bottom right) in explore mode
    if (mode === "explore" && selected && !infoPopup) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W - 220, H - 100, 210, 90, 8);
      ctx.fill();
      ctx.strokeStyle = selected.color;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "bold 14px system-ui";
      ctx.fillStyle = selected.color;
      ctx.textAlign = "left";
      ctx.fillText(`${selected.symbol} \u2014 ${selected.name}`, W - 208, H - 80);

      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Mass: ${selected.mass}`, W - 208, H - 60);
      ctx.fillText(`Charge: ${selected.charge}e`, W - 208, H - 44);
      ctx.fillText(`Spin: ${selected.spin}`, W - 208, H - 28);
    }

    // Scoreboard for quiz modes
    if (mode === "identify" || mode === "decay") {
      renderScoreboard(ctx, W - 160, 40, 145, 110, challenge);
    }

    // Render particles (visual effects)
    particleSystemRef.current.draw(ctx);

    // Render popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [selected, filter, mode, challenge, highlightForce, infoPopup, feynmanVertices, feynmanLines, feynmanConnecting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 460);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Animation loop for particle effects
  const animRef = useRef<number>(0);
  const lastTsRef = useRef<number | null>(null);

  const animateEffects = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) lastTsRef.current = now;
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    if (particleSystemRef.current.count > 0 || popupsRef.current.length > 0) {
      particleSystemRef.current.update(dt);
      draw();
    }
    animRef.current = requestAnimationFrame(animateEffects);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animateEffects);
    return () => cancelAnimationFrame(animRef.current);
  }, [animateEffects]);

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const W = canvas.width;
    const H = canvas.height;
    const margin = 30;
    const cellW = (W - margin * 2 - 40) / 5;
    const cellH = (H - margin * 2 - 60) / 4;
    const startX = margin + 20;
    const startY = margin + 40;

    // Feynman mode: handle vertex placement and connection
    if (mode === "feynman") {
      const diagX = W - 250;
      const diagY = 50;
      const diagW = 230;
      const diagH = H - 70;

      if (mx >= diagX && mx <= diagX + diagW && my >= diagY + 50 && my <= diagY + diagH) {
        // Check if clicking near existing vertex
        for (let i = 0; i < feynmanVertices.length; i++) {
          const v = feynmanVertices[i];
          if (Math.sqrt((mx - v.x) ** 2 + (my - v.y) ** 2) < 15) {
            if (feynmanConnecting === null) {
              setFeynmanConnecting(i);
            } else if (feynmanConnecting !== i) {
              // Create line between vertices
              setFeynmanLines((prev) => [
                ...prev,
                {
                  from: feynmanConnecting,
                  to: i,
                  particleType: "fermion",
                  label: "",
                },
              ]);
              setFeynmanConnecting(null);
              playSFX("click");
            } else {
              setFeynmanConnecting(null);
            }
            return;
          }
        }
        // Add new vertex
        setFeynmanVertices((prev) => [...prev, { x: mx, y: my, particle: null }]);
        setFeynmanConnecting(null);
        playSFX("pop");
        return;
      }
    }

    // Standard particle click
    for (const p of particles) {
      const px = startX + p.col * cellW;
      const py = startY + p.row * cellH;
      if (mx >= px && mx <= px + cellW && my >= py && my <= py + cellH) {
        if (mode === "explore") {
          // Toggle info popup on canvas
          if (infoPopup?.particle.symbol === p.symbol) {
            setInfoPopup(null);
          } else {
            setInfoPopup({ particle: p, x: px + cellW, y: py + cellH / 2 });
          }
          setSelected(selected?.symbol === p.symbol ? null : p);
        }
        return;
      }
    }
    setSelected(null);
    setInfoPopup(null);
    if (mode === "feynman") {
      setFeynmanConnecting(null);
    }
  };

  const submitQuizAnswer = (answer: string) => {
    if (!quizParticle || quizRevealed) return;
    setQuizChoice(answer);
    setQuizRevealed(true);

    const correct = answer === quizParticle.symbol;
    const result = {
      points: correct ? 3 : 0,
      tier: correct ? "perfect" as const : "miss" as const,
      label: correct ? "Correct!" : `Wrong! It was ${quizParticle.name}`,
    };
    setChallenge((prev) => updateChallengeState(prev, result));

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: correct ? "Correct!" : "Wrong!",
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
      if (correct) {
        particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 20);
      }
    }

    if (correct) {
      playSFX("correct");
      playScore(3);
    } else {
      playSFX("incorrect");
    }
  };

  const submitDecayAnswer = (idx: number) => {
    if (!decayQuestion || decayRevealed) return;
    setDecayChoice(idx);
    setDecayRevealed(true);

    const chosen = decayOptions[idx];
    const correctProducts = [...decayQuestion.products].sort().join(",");
    const chosenProducts = [...chosen].sort().join(",");
    const correct = chosenProducts === correctProducts;

    const result = {
      points: correct ? 3 : 0,
      tier: correct ? "perfect" as const : "miss" as const,
      label: correct ? "Correct!" : "Wrong!",
    };
    setChallenge((prev) => updateChallengeState(prev, result));

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: correct ? "Correct!" : "Wrong!",
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
      if (correct) {
        particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 20);
      }
    }

    if (correct) {
      playSFX("correct");
      playScore(3);
    } else {
      playSFX("incorrect");
    }
  };

  const switchMode = (newMode: ChallengeMode) => {
    setMode(newMode);
    setChallenge(createChallengeState());
    setSelected(null);
    setInfoPopup(null);
    setHighlightForce(null);
    setFeynmanVertices([]);
    setFeynmanLines([]);
    setFeynmanConnecting(null);
    popupsRef.current = [];
    if (newMode === "identify") generateQuiz();
    if (newMode === "decay") generateDecayQuestion();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          onClick={handleClick}
        />
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => switchMode("explore")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "explore"
              ? "bg-blue-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Explore
        </button>
        <button
          onClick={() => switchMode("identify")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "identify"
              ? "bg-green-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Particle Quiz
        </button>
        <button
          onClick={() => switchMode("decay")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "decay"
              ? "bg-purple-600 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Decay Prediction
        </button>
        <button
          onClick={() => switchMode("feynman")}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${
            mode === "feynman"
              ? "bg-amber-500 text-white"
              : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          Feynman Diagrams
        </button>
      </div>

      {/* Filter & Force interaction buttons (explore mode) */}
      {mode === "explore" && (
        <>
          <div className="flex flex-wrap gap-3">
            {(["all", "quark", "lepton", "boson"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setSelected(null);
                  setInfoPopup(null);
                }}
                className={`px-4 h-10 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filter === f
                    ? f === "quark"
                      ? "bg-red-500 text-white"
                      : f === "lepton"
                        ? "bg-green-500 text-white"
                        : f === "boson"
                          ? "bg-purple-500 text-white"
                          : "bg-blue-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {f === "all" ? "All Particles" : f + "s"}
              </button>
            ))}
          </div>

          {/* Force interaction highlight buttons */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Highlight by Force
            </h3>
            <div className="flex flex-wrap gap-2">
              {(["strong", "weak", "electromagnetic", "gravity", "higgs"] as InteractionForce[]).map(
                (force) => (
                  <button
                    key={force}
                    onClick={() =>
                      setHighlightForce(highlightForce === force ? null : force)
                    }
                    className={`px-3 h-8 rounded-lg text-xs font-medium capitalize transition-colors ${
                      highlightForce === force
                        ? "text-white"
                        : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    }`}
                    style={
                      highlightForce === force
                        ? { backgroundColor: forceColors[force] }
                        : undefined
                    }
                  >
                    {force}
                  </button>
                )
              )}
              {highlightForce && (
                <button
                  onClick={() => setHighlightForce(null)}
                  className="px-3 h-8 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Particle identification quiz */}
      {mode === "identify" && quizParticle && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Which particle has these properties?
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">
              Mass: {quizParticle.mass}
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">
              Charge: {quizParticle.charge}e
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">
              Spin: {quizParticle.spin}
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">
              Type: {quizParticle.type}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quizOptions.map((opt) => {
              const isCorrect = opt.symbol === quizParticle.symbol;
              const isChosen = quizChoice === opt.symbol;
              let btnClass =
                "h-12 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ";
              if (quizRevealed) {
                if (isCorrect) {
                  btnClass += "bg-green-600 text-white";
                } else if (isChosen && !isCorrect) {
                  btnClass += "bg-red-600 text-white";
                } else {
                  btnClass +=
                    "border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600";
                }
              } else {
                btnClass +=
                  "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800";
              }
              return (
                <button
                  key={opt.symbol}
                  onClick={() => submitQuizAnswer(opt.symbol)}
                  disabled={quizRevealed}
                  className={btnClass}
                >
                  <span className="text-lg" style={{ color: opt.color }}>
                    {opt.symbol}
                  </span>
                  <span>{opt.name}</span>
                </button>
              );
            })}
          </div>
          {quizRevealed && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={generateQuiz}
                className="px-6 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Next Question
              </button>
            </div>
          )}
        </div>
      )}

      {/* Decay prediction quiz */}
      {mode === "decay" && decayQuestion && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            What are the decay products of{" "}
            <span
              className="text-lg font-bold"
              style={{
                color: particles.find((p) => p.symbol === decayQuestion.parent)?.color || "#fff",
              }}
            >
              {decayQuestion.parent}
            </span>{" "}
            ({particles.find((p) => p.symbol === decayQuestion.parent)?.name})?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {decayOptions.map((option, idx) => {
              const correctProducts = [...decayQuestion.products].sort().join(",");
              const thisProducts = [...option].sort().join(",");
              const isCorrect = thisProducts === correctProducts;
              const isChosen = decayChoice === idx;
              let btnClass =
                "h-12 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 px-4 ";
              if (decayRevealed) {
                if (isCorrect) {
                  btnClass += "bg-green-600 text-white";
                } else if (isChosen && !isCorrect) {
                  btnClass += "bg-red-600 text-white";
                } else {
                  btnClass +=
                    "border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600";
                }
              } else {
                btnClass +=
                  "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800";
              }
              return (
                <button
                  key={idx}
                  onClick={() => submitDecayAnswer(idx)}
                  disabled={decayRevealed}
                  className={btnClass}
                >
                  {option.map((sym, si) => {
                    const p = particles.find((pp) => pp.symbol === sym);
                    return (
                      <span key={si} style={{ color: p?.color || "#fff" }}>
                        {sym}
                        {si < option.length - 1 ? " + " : ""}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
          {decayRevealed && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono text-center">
                {decayQuestion.description}
              </p>
              <div className="flex justify-center">
                <button
                  onClick={generateDecayQuestion}
                  className="px-6 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
                >
                  Next Question
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feynman diagram controls */}
      {mode === "feynman" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Feynman Diagram Builder
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Click in the diagram area (right side of canvas) to place vertices. Click two vertices
            to connect them. Use buttons below to set the line type.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                // Change last line to fermion type
                setFeynmanLines((prev) => {
                  if (prev.length === 0) return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    particleType: "fermion",
                  };
                  return updated;
                });
              }}
              className="px-3 h-8 rounded-lg text-xs font-medium border border-green-500 text-green-500 hover:bg-green-500/10"
            >
              Last Line: Fermion
            </button>
            <button
              onClick={() => {
                setFeynmanLines((prev) => {
                  if (prev.length === 0) return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    particleType: "boson",
                  };
                  return updated;
                });
              }}
              className="px-3 h-8 rounded-lg text-xs font-medium border border-purple-500 text-purple-500 hover:bg-purple-500/10"
            >
              Last Line: Boson
            </button>
            <button
              onClick={() => {
                setFeynmanLines((prev) => {
                  if (prev.length === 0) return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    particleType: "scalar",
                  };
                  return updated;
                });
              }}
              className="px-3 h-8 rounded-lg text-xs font-medium border border-blue-500 text-blue-500 hover:bg-blue-500/10"
            >
              Last Line: Scalar
            </button>
            <button
              onClick={() => {
                setFeynmanVertices([]);
                setFeynmanLines([]);
                setFeynmanConnecting(null);
              }}
              className="px-3 h-8 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Clear Diagram
            </button>
            <button
              onClick={() => {
                // Undo last line
                setFeynmanLines((prev) => prev.slice(0, -1));
              }}
              disabled={feynmanLines.length === 0}
              className="px-3 h-8 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              Undo Line
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Standard Model
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            6 quarks + 6 leptons
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            4 gauge bosons + Higgs
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            3 generations of matter
          </div>
        </div>
      </div>
    </div>
  );
}
