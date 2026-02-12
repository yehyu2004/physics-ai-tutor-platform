"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  calculateAccuracy,
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { ParticleSystem } from "@/lib/simulation/particles";
import { drawMeter } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

type Mode = "sandbox" | "date-sample" | "predict-halflife" | "compare";

interface Atom {
  x: number;
  y: number;
  decayed: boolean;
  decayTime: number;
  flashTime: number; // for click-to-observe flash
}

interface DateChallenge {
  actualAge: number;     // seconds
  halfLife: number;
  initialAtoms: number;
  remainingFraction: number;
  submitted: boolean;
}

interface HalfLifeChallenge {
  actualHalfLife: number;
  observeUntil: number; // how much time to observe
  submitted: boolean;
}

interface IsotopeConfig {
  name: string;
  halfLife: number;
  color: string;
  decayedColor: string;
}

const ISOTOPES: IsotopeConfig[] = [
  { name: "C-14", halfLife: 4, color: "#22c55e", decayedColor: "rgba(100,116,139,0.3)" },
  { name: "I-131", halfLife: 2, color: "#3b82f6", decayedColor: "rgba(59,130,246,0.2)" },
  { name: "Ra-226", halfLife: 6, color: "#f59e0b", decayedColor: "rgba(245,158,11,0.2)" },
  { name: "Po-210", halfLife: 1.5, color: "#ef4444", decayedColor: "rgba(239,68,68,0.2)" },
  { name: "Sr-90", halfLife: 3, color: "#a855f7", decayedColor: "rgba(168,85,247,0.2)" },
];

export default function RadioactiveDecay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [halfLife, setHalfLife] = useState(3);
  const [numAtoms, setNumAtoms] = useState(200);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState<Mode>("sandbox");

  const atomsRef = useRef<Atom[]>([]);
  const timeRef = useRef(0);
  const historyRef = useRef<{ t: number; remaining: number }[]>([]);

  // Challenge state
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());

  // Date challenge
  const [dateChallenge, setDateChallenge] = useState<DateChallenge | null>(null);
  const [userAge, setUserAge] = useState("");

  // Half-life prediction challenge
  const [halfLifeChallenge, setHalfLifeChallenge] = useState<HalfLifeChallenge | null>(null);
  const [userHalfLife, setUserHalfLife] = useState("");

  // Geiger counter
  const [geigerEnabled, setGeigerEnabled] = useState(false);
  const geigerCountRef = useRef(0);
  const geigerHistoryRef = useRef<number[]>([]);
  const lastGeigerTickRef = useRef(0);
  const geigerClickTimeRef = useRef<number[]>([]);

  // Multi-isotope compare
  const [selectedIsotopes, setSelectedIsotopes] = useState<number[]>([0, 1]);
  const compareAtomsRef = useRef<Map<number, Atom[]>>(new Map());
  const compareHistoryRef = useRef<Map<number, { t: number; remaining: number }[]>>(new Map());

  // Click to observe
  const [clickToObserve, setClickToObserve] = useState(false);

  const initAtoms = useCallback((count?: number) => {
    const n = count ?? numAtoms;
    const atoms: Atom[] = [];
    const cols = Math.ceil(Math.sqrt(n * 1.5));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      atoms.push({
        x: (col + 0.5) / cols,
        y: (row + 0.5) / rows,
        decayed: false,
        decayTime: -1,
        flashTime: -1,
      });
    }
    atomsRef.current = atoms;
    timeRef.current = 0;
    historyRef.current = [{ t: 0, remaining: n }];
    geigerCountRef.current = 0;
    geigerHistoryRef.current = [];
    geigerClickTimeRef.current = [];
  }, [numAtoms]);

  const initCompareAtoms = useCallback(() => {
    compareAtomsRef.current = new Map();
    compareHistoryRef.current = new Map();
    const n = 150;
    for (const idx of selectedIsotopes) {
      const atoms: Atom[] = [];
      const cols = Math.ceil(Math.sqrt(n * 1.5));
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        atoms.push({
          x: (col + 0.5) / cols,
          y: (row + 0.5) / rows,
          decayed: false,
          decayTime: -1,
          flashTime: -1,
        });
      }
      compareAtomsRef.current.set(idx, atoms);
      compareHistoryRef.current.set(idx, [{ t: 0, remaining: n }]);
    }
    timeRef.current = 0;
  }, [selectedIsotopes]);

  useEffect(() => { initAtoms(); }, [initAtoms]);

  const generateDateChallenge = useCallback(() => {
    const hl = 2 + Math.floor(Math.random() * 6);
    const numHL = 1 + Math.random() * 3; // 1-4 half-lives elapsed
    const age = hl * numHL;
    const remaining = Math.pow(0.5, numHL);

    setHalfLife(hl);
    setNumAtoms(200);
    setDateChallenge({
      actualAge: age,
      halfLife: hl,
      initialAtoms: 200,
      remainingFraction: remaining,
      submitted: false,
    });
    setUserAge("");
    initAtoms(200);

    // Pre-decay atoms to match the age
    const atoms = atomsRef.current;
    atoms.forEach((atom) => {
      if (Math.random() > remaining) {
        atom.decayed = true;
        atom.decayTime = Math.random() * age;
      }
    });
    const actualRemaining = atoms.filter((a) => !a.decayed).length;
    historyRef.current = [{ t: 0, remaining: 200 }, { t: age, remaining: actualRemaining }];
    timeRef.current = age;
    setIsRunning(false);
  }, [initAtoms]);

  const generateHalfLifeChallenge = useCallback(() => {
    const hl = 1.5 + Math.floor(Math.random() * 7) * 0.5;
    setHalfLife(hl);
    setNumAtoms(200);
    setHalfLifeChallenge({
      actualHalfLife: hl,
      observeUntil: hl * 3,
      submitted: false,
    });
    setUserHalfLife("");
    initAtoms(200);
    setIsRunning(true);
  }, [initAtoms]);

  const startMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = newMode !== "sandbox";
    setChallengeState({ ...challengeRef.current });
    popupsRef.current = [];
    particlesRef.current.clear();
    setDateChallenge(null);
    setHalfLifeChallenge(null);
    setClickToObserve(false);

    if (newMode === "date-sample") {
      generateDateChallenge();
    } else if (newMode === "predict-halflife") {
      generateHalfLifeChallenge();
    } else if (newMode === "compare") {
      setSelectedIsotopes([0, 1]);
      initCompareAtoms();
      setIsRunning(true);
    } else {
      initAtoms();
      setIsRunning(true);
    }
  }, [generateDateChallenge, generateHalfLifeChallenge, initAtoms, initCompareAtoms]);

  const submitDateAnswer = useCallback(() => {
    if (!dateChallenge || dateChallenge.submitted) return;
    const guess = parseFloat(userAge);
    if (isNaN(guess)) return;
    const result = calculateAccuracy(guess, dateChallenge.actualAge, dateChallenge.halfLife);

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeState({ ...challengeRef.current });
    setDateChallenge({ ...dateChallenge, submitted: true });

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${result.label} (age=${dateChallenge.actualAge.toFixed(1)}s)`,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: Date.now(),
      });
      if (result.points >= 2) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2);
        playSFX("success");
      } else if (result.points > 0) {
        playSFX("correct");
      } else {
        playSFX("incorrect");
      }
      playScore(result.points);
    }
  }, [dateChallenge, userAge]);

  const submitHalfLifeAnswer = useCallback(() => {
    if (!halfLifeChallenge || halfLifeChallenge.submitted) return;
    const guess = parseFloat(userHalfLife);
    if (isNaN(guess)) return;
    const result = calculateAccuracy(guess, halfLifeChallenge.actualHalfLife, halfLifeChallenge.actualHalfLife * 0.5);

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeState({ ...challengeRef.current });
    setHalfLifeChallenge({ ...halfLifeChallenge, submitted: true });

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${result.label} (t\u00bd=${halfLifeChallenge.actualHalfLife.toFixed(1)}s)`,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: Date.now(),
      });
      if (result.points >= 2) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2);
        playSFX("success");
      } else if (result.points > 0) {
        playSFX("correct");
      } else {
        playSFX("incorrect");
      }
      playScore(result.points);
    }
  }, [halfLifeChallenge, userHalfLife]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;
    const now = Date.now();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    if (mode === "compare") {
      // === MULTI-ISOTOPE COMPARE VIEW ===
      const numIso = selectedIsotopes.length;
      const colW = (W * 0.45) / numIso;
      const gridMargin = 10;

      selectedIsotopes.forEach((isoIdx, col) => {
        const iso = ISOTOPES[isoIdx];
        const atoms = compareAtomsRef.current.get(isoIdx) || [];
        const gx = gridMargin + col * colW;
        const gw = colW - gridMargin;
        const gh = H * 0.55;

        // Background
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.roundRect(gx, 30, gw, gh, 6);
        ctx.fill();

        // Isotope label
        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = iso.color;
        ctx.textAlign = "center";
        ctx.fillText(iso.name, gx + gw / 2, 25);
        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "#64748b";
        ctx.fillText(`t\u00bd = ${iso.halfLife}s`, gx + gw / 2, gh + 48);

        // Atoms
        const atomR = Math.max(1.5, Math.min(4, gw / Math.sqrt(150) / 2.5));
        const remaining = atoms.filter((a) => !a.decayed).length;

        atoms.forEach((atom) => {
          const ax = gx + 4 + atom.x * (gw - 8);
          const ay = 34 + atom.y * (gh - 8);

          if (atom.decayed) {
            ctx.fillStyle = iso.decayedColor;
            ctx.beginPath();
            ctx.arc(ax, ay, atomR * 0.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = iso.color;
            ctx.beginPath();
            ctx.arc(ax, ay, atomR, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Count
        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = iso.color;
        ctx.textAlign = "center";
        ctx.fillText(`${remaining}/150`, gx + gw / 2, gh + 60);
      });

      // Comparison decay curves
      const graphX = W * 0.5;
      const graphW2 = W * 0.45;
      const graphY = 30;
      const graphH2 = H - 70;

      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(graphX, graphY - 15, graphW2 + 20, graphH2 + 40, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("DECAY COMPARISON", graphX + 10, graphY);

      // Axes
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX + 10, graphY + 15);
      ctx.lineTo(graphX + 10, graphY + graphH2);
      ctx.lineTo(graphX + graphW2, graphY + graphH2);
      ctx.stroke();

      const maxT2 = Math.max(...selectedIsotopes.map((i) => ISOTOPES[i].halfLife * 5), t + 1);

      selectedIsotopes.forEach((isoIdx) => {
        const iso = ISOTOPES[isoIdx];
        const history = compareHistoryRef.current.get(isoIdx) || [];

        if (history.length > 1) {
          ctx.strokeStyle = iso.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < history.length; i++) {
            const px = graphX + 10 + (history[i].t / maxT2) * (graphW2 - 20);
            const py = graphY + 15 + (1 - history[i].remaining / 150) * (graphH2 - 15);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      });

      // Legend
      selectedIsotopes.forEach((isoIdx, i) => {
        const iso = ISOTOPES[isoIdx];
        ctx.fillStyle = iso.color;
        ctx.font = "10px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(`-- ${iso.name} (t\u00bd=${iso.halfLife}s)`, graphX + 15, graphY + graphH2 + 18 + i * 14);
      });

      // Time
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(graphX + graphW2 / 3, graphY + graphH2 + 15, graphW2 / 3, 20, 4);
      ctx.fill();
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.fillText(`t = ${t.toFixed(1)} s`, graphX + graphW2 / 2, graphY + graphH2 + 29);

    } else {
      // === STANDARD VIEW ===
      const splitX = W * 0.45;
      const gridMargin = 20;
      const gridW = splitX - gridMargin * 2;
      const gridH = H - gridMargin * 2;
      const atoms = atomsRef.current;
      const remaining = atoms.filter((a) => !a.decayed).length;

      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(gridMargin - 5, gridMargin - 5, gridW + 10, gridH + 10, 8);
      ctx.fill();

      const atomR = Math.max(2, Math.min(6, gridW / Math.sqrt(numAtoms) / 2.5));

      atoms.forEach((atom) => {
        const ax = gridMargin + atom.x * gridW;
        const ay = gridMargin + atom.y * gridH;

        // Flash effect when clicked or just decayed
        const flashElapsed = atom.flashTime > 0 ? (now - atom.flashTime) / 1000 : -1;
        if (flashElapsed >= 0 && flashElapsed < 0.5) {
          const flashAlpha = 1 - flashElapsed / 0.5;
          const flashR = atomR + flashElapsed * 20;
          ctx.fillStyle = `rgba(239,68,68,${flashAlpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(ax, ay, flashR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (atom.decayed) {
          ctx.fillStyle = "rgba(100,116,139,0.3)";
          ctx.beginPath();
          ctx.arc(ax, ay, atomR * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Glowing undecayed atom
          ctx.fillStyle = "#22c55e";
          ctx.shadowColor = "rgba(34,197,94,0.3)";
          ctx.shadowBlur = clickToObserve ? 6 : 0;
          ctx.beginPath();
          ctx.arc(ax, ay, atomR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Click to observe hint
      if (clickToObserve) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath();
        ctx.roundRect(gridMargin, gridMargin - 3, gridW, 18, 4);
        ctx.fill();
        ctx.font = "9px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText("Click atoms to observe them decay!", gridMargin + gridW / 2, gridMargin + 10);
      }

      // Count display
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(gridMargin, H - 50, gridW, 35, 6);
      ctx.fill();
      ctx.font = "bold 13px ui-monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#22c55e";
      ctx.fillText(`${remaining}`, gridMargin + gridW * 0.25, H - 28);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px ui-monospace";
      ctx.fillText("remaining", gridMargin + gridW * 0.25, H - 18);
      ctx.font = "bold 13px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.fillText(`${numAtoms - remaining}`, gridMargin + gridW * 0.75, H - 28);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px ui-monospace";
      ctx.fillText("decayed", gridMargin + gridW * 0.75, H - 18);

      // === GEIGER COUNTER ===
      if (geigerEnabled) {
        const geigerX = gridMargin;
        const geigerY = H - 90;
        const geigerW = gridW;
        const geigerH2 = 35;

        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(geigerX, geigerY, geigerW, geigerH2, 6);
        ctx.fill();

        // Activity meter
        const activity = remaining > 0 ? Math.log(2) / halfLife * remaining : 0;
        const maxActivity = Math.log(2) / halfLife * numAtoms;
        drawMeter(ctx, geigerX + 8, geigerY + 6, geigerW - 16, 10, activity, maxActivity, "#ef4444", "ACTIVITY");

        // Click visualization (recent clicks)
        const recentClicks = geigerClickTimeRef.current.filter((ct) => now - ct < 300);
        if (recentClicks.length > 0) {
          ctx.fillStyle = "#ef4444";
          ctx.font = "bold 10px ui-monospace";
          ctx.textAlign = "center";
          ctx.fillText("CLICK!", geigerX + geigerW / 2, geigerY + 30);
        }

        // CPS (counts per second)
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "right";
        ctx.fillText(`${geigerCountRef.current} cps`, geigerX + geigerW - 10, geigerY + 30);
      }

      // --- Right: Decay curve ---
      const graphX = splitX + 20;
      const graphW2 = W - graphX - 25;
      const graphY = 30;
      const graphH2 = H - 70;

      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(graphX - 10, graphY - 15, graphW2 + 20, graphH2 + 40, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("N(t) DECAY CURVE", graphX, graphY);

      // Axes
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(graphX, graphY + 15);
      ctx.lineTo(graphX, graphY + graphH2);
      ctx.lineTo(graphX + graphW2, graphY + graphH2);
      ctx.stroke();

      // Half-life markers
      const maxT2 = Math.max(halfLife * 5, t + 1);
      for (let hl = 1; hl <= 4; hl++) {
        const hlT = halfLife * hl;
        if (hlT > maxT2) break;
        const hlX = graphX + (hlT / maxT2) * graphW2;
        ctx.strokeStyle = "rgba(251,191,36,0.2)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hlX, graphY + 15);
        ctx.lineTo(hlX, graphY + graphH2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "9px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${hl}t\u00bd`, hlX, graphY + graphH2 + 12);
      }

      // N/2 line
      const halfY = graphY + 15 + (graphH2 - 15) / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(graphX, halfY);
      ctx.lineTo(graphX + graphW2, halfY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#64748b";
      ctx.font = "9px ui-monospace";
      ctx.textAlign = "right";
      ctx.fillText("N\u2080/2", graphX - 5, halfY + 3);
      ctx.fillText("N\u2080", graphX - 5, graphY + 18);

      // Theoretical curve (hidden in predict mode until submitted)
      const showTheory = mode !== "predict-halflife" || (halfLifeChallenge && halfLifeChallenge.submitted);
      if (showTheory) {
        ctx.strokeStyle = "rgba(239,68,68,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let px = 0; px <= graphW2; px++) {
          const tVal = (px / graphW2) * maxT2;
          const N = numAtoms * Math.exp(-Math.log(2) * tVal / halfLife);
          const py = graphY + 15 + (1 - N / numAtoms) * (graphH2 - 15);
          if (px === 0) ctx.moveTo(graphX + px, py);
          else ctx.lineTo(graphX + px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Plot actual data
      const history = historyRef.current;
      if (history.length > 1) {
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(34,197,94,0.3)";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
          const px = graphX + (history[i].t / maxT2) * graphW2;
          const py = graphY + 15 + (1 - history[i].remaining / numAtoms) * (graphH2 - 15);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Legend
      ctx.font = "9px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "left";
      ctx.fillText("-- actual (stochastic)", graphX + 5, graphY + graphH2 + 25);
      if (showTheory) {
        ctx.fillStyle = "#ef4444";
        ctx.fillText("--- theoretical N\u2080e^(-\u03bbt)", graphX + graphW2 / 2, graphY + graphH2 + 25);
      }

      // Time display
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(graphX, graphY + graphH2 + 30, graphW2, 20, 4);
      ctx.fill();
      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      const tHalfDisplay = mode === "predict-halflife" && halfLifeChallenge && !halfLifeChallenge.submitted ? "?" : halfLife.toString();
      ctx.fillText(`t = ${t.toFixed(1)} s  |  t\u00bd = ${tHalfDisplay} s  |  \u03bb = ${mode === "predict-halflife" && halfLifeChallenge && !halfLifeChallenge.submitted ? "?" : (Math.log(2) / halfLife).toFixed(3)} s\u207b\u00b9`, graphX + graphW2 / 2, graphY + graphH2 + 44);

      // Date challenge indicator
      if (mode === "date-sample" && dateChallenge) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(graphX, graphY + graphH2 + 55, graphW2, 25, 4);
        ctx.fill();
        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "center";
        const pct = (atoms.filter((a) => !a.decayed).length / numAtoms * 100).toFixed(1);
        ctx.fillText(`${pct}% remaining | How old is this sample?`, graphX + graphW2 / 2, graphY + graphH2 + 72);
      }
    }

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Particles
    particlesRef.current.update(1 / 60);
    particlesRef.current.draw(ctx);

    // Scoreboard
    if (challengeRef.current.active && challengeRef.current.attempts > 0) {
      renderScoreboard(ctx, 12, 80, 140, 110, challengeRef.current);
    }
  }, [halfLife, numAtoms, mode, dateChallenge, halfLifeChallenge, geigerEnabled, clickToObserve, selectedIsotopes]);

  const animate = useCallback(() => {
    const dt = 0.05;
    const now = Date.now();

    if (mode === "compare") {
      timeRef.current += dt;
      for (const isoIdx of selectedIsotopes) {
        const iso = ISOTOPES[isoIdx];
        const atoms = compareAtomsRef.current.get(isoIdx);
        if (!atoms) continue;
        const decayConstant = Math.log(2) / iso.halfLife;
        const pDecay = 1 - Math.exp(-decayConstant * dt);
        atoms.forEach((atom) => {
          if (!atom.decayed && Math.random() < pDecay) {
            atom.decayed = true;
            atom.decayTime = timeRef.current;
          }
        });
        const remaining = atoms.filter((a) => !a.decayed).length;
        const history = compareHistoryRef.current.get(isoIdx) || [];
        history.push({ t: timeRef.current, remaining });
        if (history.length > 500) history.shift();
        compareHistoryRef.current.set(isoIdx, history);
      }
    } else if (mode !== "date-sample" || isRunning) {
      timeRef.current += dt;
      const atoms = atomsRef.current;
      const decayConstant = Math.log(2) / halfLife;
      const pDecay = 1 - Math.exp(-decayConstant * dt);

      let decaysThisFrame = 0;
      atoms.forEach((atom) => {
        if (!atom.decayed && Math.random() < pDecay) {
          atom.decayed = true;
          atom.decayTime = timeRef.current;
          atom.flashTime = now;
          decaysThisFrame++;
        }
      });

      // Geiger counter
      if (geigerEnabled && decaysThisFrame > 0) {
        geigerCountRef.current = decaysThisFrame;
        for (let i = 0; i < decaysThisFrame; i++) {
          geigerClickTimeRef.current.push(now);
          // Play tick sound for each decay (throttled)
          if (now - lastGeigerTickRef.current > 50) {
            playSFX("tick");
            lastGeigerTickRef.current = now;
          }
        }
        // Clean old clicks
        geigerClickTimeRef.current = geigerClickTimeRef.current.filter((ct) => now - ct < 1000);
      } else if (geigerEnabled) {
        geigerCountRef.current = 0;
      }

      const remaining = atoms.filter((a) => !a.decayed).length;
      historyRef.current.push({ t: timeRef.current, remaining });
      if (historyRef.current.length > 1000) historyRef.current.shift();
    }

    draw();

    // Check if all atoms decayed
    if (mode === "compare") {
      const anyRemaining = selectedIsotopes.some((idx) => {
        const atoms = compareAtomsRef.current.get(idx);
        return atoms && atoms.some((a) => !a.decayed);
      });
      if (anyRemaining) {
        animRef.current = requestAnimationFrame(animate);
      }
    } else {
      const remaining = atomsRef.current.filter((a) => !a.decayed).length;
      if (remaining > 0 && isRunning) {
        animRef.current = requestAnimationFrame(animate);
      }
    }
  }, [halfLife, draw, isRunning, mode, geigerEnabled, selectedIsotopes]);

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

  useEffect(() => {
    if (isRunning || mode === "compare") animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate, mode]);

  const reset = () => {
    if (mode === "compare") {
      initCompareAtoms();
    } else {
      initAtoms();
    }
    draw();
  };

  // Click to observe atom
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!clickToObserve) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const splitX = canvas.width * 0.45;
    const gridMargin = 20;
    const gridW = splitX - gridMargin * 2;
    const gridH = canvas.height - gridMargin * 2;
    const atomR = Math.max(2, Math.min(6, gridW / Math.sqrt(numAtoms) / 2.5));

    // Find clicked atom
    const atoms = atomsRef.current;
    for (const atom of atoms) {
      if (atom.decayed) continue;
      const ax = gridMargin + atom.x * gridW;
      const ay = gridMargin + atom.y * gridH;
      const dx = mx - ax;
      const dy = my - ay;
      if (dx * dx + dy * dy < (atomR + 8) * (atomR + 8)) {
        // Force this atom to "be observed" - it may or may not decay
        // Quantum-inspired: observation triggers potential decay
        const pDecay = 0.3 + Math.random() * 0.4; // 30-70% chance
        if (Math.random() < pDecay) {
          atom.decayed = true;
          atom.decayTime = timeRef.current;
          atom.flashTime = Date.now();
          particlesRef.current.emitSparks(ax, ay, 8, "#ef4444");
          playSFX("pop");
        } else {
          atom.flashTime = Date.now();
          particlesRef.current.emitGlow(ax, ay, 3, "#22c55e");
          playSFX("tick");
        }
        draw();
        break;
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {([
          ["sandbox", "Sandbox"],
          ["date-sample", "Date Sample"],
          ["predict-halflife", "Predict t\u00bd"],
          ["compare", "Compare Isotopes"],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => startMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-green-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
        {mode !== "sandbox" && mode !== "compare" && (
          <span className="flex items-center text-sm font-mono text-amber-500 ml-2">
            Score: {challengeState.score} | Streak: {challengeState.streak}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className={`w-full ${clickToObserve ? "cursor-pointer" : "cursor-default"}`}
          onClick={handleCanvasClick}
        />
      </div>

      {/* Date sample challenge */}
      {mode === "date-sample" && dateChallenge && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-900/10 p-4">
          <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">
            Date This Sample
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            The half-life is <strong className="text-green-400">{dateChallenge.halfLife} s</strong>.
            Look at how many atoms remain and calculate the sample&apos;s age using N = N&#x2080;e^(-&#x03bb;t).
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              step="0.1"
              value={userAge}
              onChange={(e) => setUserAge(e.target.value)}
              placeholder="Age in seconds..."
              disabled={dateChallenge.submitted}
              className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono"
            />
            <button
              onClick={submitDateAnswer}
              disabled={dateChallenge.submitted || !userAge}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              {dateChallenge.submitted ? "Submitted!" : "Submit"}
            </button>
            <button
              onClick={generateDateChallenge}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next
            </button>
            {dateChallenge.submitted && (
              <span className="text-sm font-mono text-green-400">
                Actual age = {dateChallenge.actualAge.toFixed(1)} s
              </span>
            )}
          </div>
        </div>
      )}

      {/* Half-life prediction challenge */}
      {mode === "predict-halflife" && halfLifeChallenge && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 dark:bg-green-900/10 p-4">
          <h3 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
            Predict the Half-Life
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Watch the decay curve and estimate when half the atoms have decayed. Enter your prediction for t&#x00BD;.
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              step="0.1"
              value={userHalfLife}
              onChange={(e) => setUserHalfLife(e.target.value)}
              placeholder="t\u00bd in seconds..."
              disabled={halfLifeChallenge.submitted}
              className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono"
            />
            <button
              onClick={submitHalfLifeAnswer}
              disabled={halfLifeChallenge.submitted || !userHalfLife}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              {halfLifeChallenge.submitted ? "Submitted!" : "Submit"}
            </button>
            <button
              onClick={generateHalfLifeChallenge}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next
            </button>
            {halfLifeChallenge.submitted && (
              <span className="text-sm font-mono text-green-400">
                Actual t&#x00BD; = {halfLifeChallenge.actualHalfLife.toFixed(1)} s
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mode !== "compare" && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Half-Life (s)</label>
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min={1} max={10} step={0.5} value={halfLife}
                  onChange={(e) => { setHalfLife(Number(e.target.value)); reset(); }}
                  className="flex-1 accent-green-500"
                  disabled={mode === "date-sample" || mode === "predict-halflife"}
                />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                  {mode === "predict-halflife" && halfLifeChallenge && !halfLifeChallenge.submitted ? "?" : `${halfLife} s`}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Number of Atoms</label>
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min={50} max={500} step={10} value={numAtoms}
                  onChange={(e) => { setNumAtoms(Number(e.target.value)); reset(); }}
                  className="flex-1 accent-blue-500"
                  disabled={mode === "date-sample" || mode === "predict-halflife"}
                />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{numAtoms}</span>
              </div>
            </div>
          </>
        )}

        {/* Compare mode isotope selector */}
        {mode === "compare" && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 col-span-1 sm:col-span-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Select Isotopes (2-4)</label>
            <div className="flex flex-wrap gap-2">
              {ISOTOPES.map((iso, idx) => (
                <button
                  key={iso.name}
                  onClick={() => {
                    const newSel = selectedIsotopes.includes(idx)
                      ? selectedIsotopes.filter((i) => i !== idx)
                      : [...selectedIsotopes, idx];
                    if (newSel.length >= 2 && newSel.length <= 4) {
                      setSelectedIsotopes(newSel);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    selectedIsotopes.includes(idx)
                      ? "text-white"
                      : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                  style={selectedIsotopes.includes(idx) ? { backgroundColor: iso.color } : {}}
                >
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: iso.color }} />
                  {iso.name} (t&#x00BD;={iso.halfLife}s)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2 col-span-1 sm:col-span-2">
          {mode !== "date-sample" && (
            <button onClick={() => setIsRunning(!isRunning)}
              className="flex-1 h-10 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors">
              {isRunning ? "Pause" : "Play"}
            </button>
          )}
          <button onClick={reset}
            className="h-10 px-6 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
            Reset
          </button>
          {mode === "sandbox" && (
            <>
              <button
                onClick={() => setClickToObserve(!clickToObserve)}
                className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                  clickToObserve
                    ? "bg-amber-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                Observe
              </button>
              <button
                onClick={() => setGeigerEnabled(!geigerEnabled)}
                className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                  geigerEnabled
                    ? "bg-red-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                Geiger
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="N(t) = N_0 e^{-\lambda t}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="t_{1/2} = \frac{\ln 2}{\lambda}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="A = \lambda N" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Watch atoms decay randomly. The decay curve follows an exponential — try predicting the half-life!</p>
    </div>
  );
}
