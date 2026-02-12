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
import { createDragHandler, getCanvasMousePos } from "@/lib/simulation/interaction";
import { setupHiDPICanvas } from "@/lib/simulation/canvas";
import { SimMath } from "@/components/simulations/SimMath";

// ---- Types ----

type PrecisionLevel = "ruler" | "fine" | "caliper";
type GameMode = "practice" | "challenge";

interface MeasurableObject {
  id: number;
  shape: "rect" | "circle";
  // position on canvas (px)
  x: number;
  y: number;
  // true dimension in cm
  trueLengthCm: number;
  // visual dimensions on canvas (px)
  widthPx: number;
  heightPx: number;
  color: string;
  label: string;
}

interface MeasurementResult {
  objectId: number;
  trueValue: number;
  userValue: number;
  error: number;
  relativeError: number;
  sigFigsCorrect: boolean;
  userSigFigs: number;
  expectedSigFigs: number;
  points: number;
}

// ---- Constants ----

const OBJECT_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#06b6d4",
  "#f43f5e",
  "#84cc16",
];

const OBJECT_LABELS = [
  "Block A",
  "Cylinder B",
  "Disk C",
  "Bar D",
  "Rod E",
  "Plate F",
  "Tube G",
  "Ring H",
];

const PRECISION_INFO: Record<
  PrecisionLevel,
  { label: string; resolution: number; unit: string; sigFigs: number; decimalPlaces: number }
> = {
  ruler: { label: "Basic Ruler (1 cm)", resolution: 1, unit: "cm", sigFigs: 2, decimalPlaces: 1 },
  fine: { label: "Fine Ruler (1 mm)", resolution: 0.1, unit: "cm", sigFigs: 3, decimalPlaces: 2 },
  caliper: { label: "Caliper (0.1 mm)", resolution: 0.01, unit: "cm", sigFigs: 4, decimalPlaces: 3 },
};

const CHALLENGE_ROUNDS = 5;

// ---- Helpers ----

/** Count significant figures in a string representation of a number */
function countSigFigs(str: string): number {
  const s = str.trim();
  if (s === "" || s === "." || s === "0") return 1;

  // Remove leading sign
  let cleaned = s.replace(/^[+-]/, "");

  // Remove leading zeros (but not those after decimal)
  if (cleaned.includes(".")) {
    // Has decimal point
    const parts = cleaned.split(".");
    const intPart = parts[0];
    const decPart = parts[1] || "";

    if (intPart === "0" || intPart === "") {
      // e.g. 0.00340 -> find first nonzero in decPart, count from there
      let firstNonZero = -1;
      for (let i = 0; i < decPart.length; i++) {
        if (decPart[i] !== "0") {
          firstNonZero = i;
          break;
        }
      }
      if (firstNonZero === -1) return 1; // "0.000"
      return decPart.length - firstNonZero;
    } else {
      // e.g. 12.30 -> all digits are significant
      return intPart.replace(/^0+/, "").length + decPart.length;
    }
  } else {
    // No decimal point: trailing zeros are ambiguous, treat them as not significant
    cleaned = cleaned.replace(/^0+/, "");
    if (cleaned === "") return 1;
    // Remove trailing zeros
    const withoutTrailing = cleaned.replace(/0+$/, "");
    return withoutTrailing.length || 1;
  }
}

/** Count decimal places in a string number */
function countDecimalPlaces(str: string): number {
  const s = str.trim();
  const dotIdx = s.indexOf(".");
  if (dotIdx === -1) return 0;
  return s.length - dotIdx - 1;
}

/** Generate a random measurable object */
function generateObject(
  id: number,
  precision: PrecisionLevel,
  canvasW: number,
  canvasH: number,
  difficulty: number, // 0-4
): MeasurableObject {
  const shape = Math.random() > 0.5 ? "rect" : "circle";
  const info = PRECISION_INFO[precision];

  // True length: scale with precision and difficulty
  let minCm: number, maxCm: number;
  switch (precision) {
    case "ruler":
      minCm = 2 + difficulty * 0.3;
      maxCm = 6 - difficulty * 0.2;
      break;
    case "fine":
      minCm = 1.5 + difficulty * 0.2;
      maxCm = 5 - difficulty * 0.1;
      break;
    case "caliper":
      minCm = 0.5 + difficulty * 0.1;
      maxCm = 3 - difficulty * 0.05;
      break;
  }
  // Generate to the resolution of the instrument (simulating "true" values)
  const rawCm = minCm + Math.random() * (maxCm - minCm);
  const trueLengthCm = Math.round(rawCm / (info.resolution * 0.1)) * (info.resolution * 0.1);

  // Convert cm to px: use a scale factor (about 40px per cm for basic ruler)
  const pxPerCm = precision === "caliper" ? 80 : precision === "fine" ? 50 : 40;
  const widthPx = trueLengthCm * pxPerCm;
  const heightPx = shape === "circle" ? widthPx : 30 + Math.random() * 40;

  // Place object in the measurement area
  const areaLeft = 80;
  const areaTop = 80;
  const areaW = canvasW - 160;
  const areaH = canvasH * 0.4;
  const x = areaLeft + Math.random() * Math.max(0, areaW - widthPx);
  const y = areaTop + Math.random() * Math.max(0, areaH - heightPx);

  const color = OBJECT_COLORS[id % OBJECT_COLORS.length];
  const label = OBJECT_LABELS[id % OBJECT_LABELS.length];

  return { id, shape, x, y, trueLengthCm, widthPx, heightPx, color, label };
}

export default function MeasurementLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [precision, setPrecision] = useState<PrecisionLevel>("ruler");
  const [mode, setMode] = useState<GameMode>("practice");
  const [userInput, setUserInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState<MeasurementResult | null>(null);
  const [challengeRound, setChallengeRound] = useState(0);
  const [results, setResults] = useState<MeasurementResult[]>([]);
  const [showTrueLength, setShowTrueLength] = useState(false);

  const objectRef = useRef<MeasurableObject | null>(null);
  const rulerPosRef = useRef({ x: 60, y: 200 });
  const isDraggingRulerRef = useRef(false);
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const hoverInfoRef = useRef<string | null>(null);

  // Ruler dimensions
  const getRulerLength = useCallback(() => {
    switch (precision) {
      case "ruler": return 520;
      case "fine": return 520;
      case "caliper": return 440;
    }
  }, [precision]);

  const getRulerHeight = useCallback(() => {
    return precision === "caliper" ? 60 : 40;
  }, [precision]);

  const getPxPerCm = useCallback(() => {
    switch (precision) {
      case "ruler": return 40;
      case "fine": return 50;
      case "caliper": return 80;
    }
  }, [precision]);

  const getMaxCmOnRuler = useCallback(() => {
    return Math.floor(getRulerLength() / getPxPerCm());
  }, [getRulerLength, getPxPerCm]);

  // Generate a new object
  const generateNewObject = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const difficulty = mode === "challenge" ? challengeRound : 0;
    const obj = generateObject(
      Date.now() % 1000,
      precision,
      canvas.clientWidth,
      canvas.clientHeight,
      difficulty,
    );
    objectRef.current = obj;
    // Auto-position ruler near the object's left edge
    rulerPosRef.current = {
      x: Math.max(10, obj.x - 20),
      y: obj.shape === "circle" ? obj.y + obj.heightPx * 0.4 : obj.y + obj.heightPx + 10,
    };
    setSubmitted(false);
    setLastResult(null);
    setUserInput("");
    setShowTrueLength(false);
  }, [precision, mode, challengeRound]);

  // Draw the scene
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    // Work surface
    const surfaceY = 60;
    const surfaceH = H * 0.55;
    const surfGrad = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + surfaceH);
    surfGrad.addColorStop(0, "rgba(30,41,59,0.8)");
    surfGrad.addColorStop(1, "rgba(15,23,42,0.8)");
    ctx.fillStyle = surfGrad;
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(20, surfaceY, W - 40, surfaceH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title on surface
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("MEASUREMENT SURFACE", 35, surfaceY + 18);

    // Draw the object
    const obj = objectRef.current;
    if (obj) {
      ctx.save();
      if (obj.shape === "rect") {
        // Rectangle with shadow
        ctx.shadowColor = obj.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D).roundRect(obj.x, obj.y, obj.widthPx, obj.heightPx, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Highlight edge
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Interior pattern
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        for (let i = 0; i < obj.widthPx; i += 8) {
          ctx.fillRect(obj.x + i, obj.y, 1, obj.heightPx);
        }

        // Label
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(obj.label, obj.x + obj.widthPx / 2, obj.y - 8);

        // Dimension arrow (if showing true length)
        if (showTrueLength) {
          const arrY = obj.y + obj.heightPx + 20;
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          // left vertical guide
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y + obj.heightPx + 2);
          ctx.lineTo(obj.x, arrY + 5);
          ctx.stroke();
          // right vertical guide
          ctx.beginPath();
          ctx.moveTo(obj.x + obj.widthPx, obj.y + obj.heightPx + 2);
          ctx.lineTo(obj.x + obj.widthPx, arrY + 5);
          ctx.stroke();
          ctx.setLineDash([]);
          // horizontal line
          ctx.beginPath();
          ctx.moveTo(obj.x, arrY);
          ctx.lineTo(obj.x + obj.widthPx, arrY);
          ctx.stroke();
          // arrowheads
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.moveTo(obj.x, arrY);
          ctx.lineTo(obj.x + 6, arrY - 3);
          ctx.lineTo(obj.x + 6, arrY + 3);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(obj.x + obj.widthPx, arrY);
          ctx.lineTo(obj.x + obj.widthPx - 6, arrY - 3);
          ctx.lineTo(obj.x + obj.widthPx - 6, arrY + 3);
          ctx.closePath();
          ctx.fill();
          // value
          ctx.fillStyle = "#f59e0b";
          ctx.font = "bold 12px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${obj.trueLengthCm.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm`,
            obj.x + obj.widthPx / 2,
            arrY + 16,
          );
        }
      } else {
        // Circle
        const r = obj.widthPx / 2;
        ctx.shadowColor = obj.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(obj.x + r, obj.y + r, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Cross pattern inside
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.moveTo(obj.x + r, obj.y);
        ctx.lineTo(obj.x + r, obj.y + obj.widthPx);
        ctx.moveTo(obj.x, obj.y + r);
        ctx.lineTo(obj.x + obj.widthPx, obj.y + r);
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(obj.label, obj.x + r, obj.y - 8);

        // Diameter line (if showing)
        if (showTrueLength) {
          const arrY = obj.y + obj.widthPx + 20;
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y + obj.widthPx + 2);
          ctx.lineTo(obj.x, arrY + 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(obj.x + obj.widthPx, obj.y + obj.widthPx + 2);
          ctx.lineTo(obj.x + obj.widthPx, arrY + 5);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(obj.x, arrY);
          ctx.lineTo(obj.x + obj.widthPx, arrY);
          ctx.stroke();
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.moveTo(obj.x, arrY);
          ctx.lineTo(obj.x + 6, arrY - 3);
          ctx.lineTo(obj.x + 6, arrY + 3);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(obj.x + obj.widthPx, arrY);
          ctx.lineTo(obj.x + obj.widthPx - 6, arrY - 3);
          ctx.lineTo(obj.x + obj.widthPx - 6, arrY + 3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#f59e0b";
          ctx.font = "bold 12px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${obj.trueLengthCm.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm (diameter)`,
            obj.x + obj.widthPx / 2,
            arrY + 16,
          );
        }
      }
      ctx.restore();
    }

    // ---- Draw the ruler / caliper ----
    const rx = rulerPosRef.current.x;
    const ry = rulerPosRef.current.y;
    const rulerLen = getRulerLength();
    const rulerH = getRulerHeight();
    const pxPerCm = getPxPerCm();
    const maxCm = getMaxCmOnRuler();

    ctx.save();
    if (precision === "caliper") {
      // Caliper body
      ctx.fillStyle = "rgba(180,180,200,0.9)";
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(rx - 10, ry, rulerLen + 20, rulerH, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(100,100,120,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Main scale
      ctx.fillStyle = "rgba(240,240,255,0.95)";
      ctx.fillRect(rx, ry + 10, rulerLen, 20);

      // cm marks
      ctx.strokeStyle = "#1e293b";
      ctx.fillStyle = "#1e293b";
      ctx.font = "8px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (let cm = 0; cm <= maxCm; cm++) {
        const mx = rx + cm * pxPerCm;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, ry + 10);
        ctx.lineTo(mx, ry + 30);
        ctx.stroke();
        ctx.fillText(`${cm}`, mx, ry + 8);

        // mm marks
        if (cm < maxCm) {
          for (let mm = 1; mm < 10; mm++) {
            const mmx = mx + mm * (pxPerCm / 10);
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(mmx, ry + (mm === 5 ? 14 : 18));
            ctx.lineTo(mmx, ry + 30);
            ctx.stroke();
          }
        }
      }

      // Vernier scale indicator (bottom jaw)
      ctx.fillStyle = "rgba(120,120,140,0.8)";
      ctx.fillRect(rx - 10, ry + rulerH - 12, 60, 12);
      ctx.strokeStyle = "rgba(80,80,100,0.6)";
      ctx.stroke();

      // Jaws
      ctx.fillStyle = "rgba(160,160,180,0.9)";
      // Lower jaw (fixed)
      ctx.beginPath();
      ctx.moveTo(rx, ry + rulerH);
      ctx.lineTo(rx, ry + rulerH + 25);
      ctx.lineTo(rx + 8, ry + rulerH + 25);
      ctx.lineTo(rx + 8, ry + rulerH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("VERNIER CALIPER", rx + rulerLen - 100, ry + rulerH - 3);
    } else {
      // Standard ruler
      const rulerGrad = ctx.createLinearGradient(rx, ry, rx, ry + rulerH);
      rulerGrad.addColorStop(0, "rgba(241,196,110,0.92)");
      rulerGrad.addColorStop(0.5, "rgba(230,180,90,0.92)");
      rulerGrad.addColorStop(1, "rgba(210,160,70,0.92)");
      ctx.fillStyle = rulerGrad;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(rx, ry, rulerLen, rulerH, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,140,60,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ruler markings
      ctx.strokeStyle = "#1e293b";
      ctx.fillStyle = "#1e293b";
      ctx.font = precision === "fine" ? "8px ui-monospace, monospace" : "9px ui-monospace, monospace";
      ctx.textAlign = "center";

      for (let cm = 0; cm <= maxCm; cm++) {
        const mx = rx + cm * pxPerCm;

        // cm mark (tall)
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, ry);
        ctx.lineTo(mx, ry + rulerH * 0.6);
        ctx.stroke();

        // cm label
        ctx.fillText(`${cm}`, mx, ry + rulerH - 4);

        if (precision === "fine" && cm < maxCm) {
          // mm marks
          for (let mm = 1; mm < 10; mm++) {
            const mmx = mx + mm * (pxPerCm / 10);
            const markH = mm === 5 ? rulerH * 0.45 : rulerH * 0.3;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(mmx, ry);
            ctx.lineTo(mmx, ry + markH);
            ctx.stroke();
          }
        }
      }

      // "cm" label
      ctx.fillStyle = "rgba(30,30,30,0.4)";
      ctx.font = "bold 8px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText("cm", rx + rulerLen - 5, ry + rulerH - 4);
    }
    ctx.restore();

    // Drag handle indicator (larger, more visible)
    ctx.fillStyle = isDraggingRulerRef.current
      ? "rgba(59,130,246,0.5)"
      : "rgba(255,255,255,0.15)";
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(rx + rulerLen / 2 - 20, ry - 18, 40, 14, 7);
    ctx.fill();
    ctx.strokeStyle = isDraggingRulerRef.current ? "#3b82f6" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Move icon (grip dots - 3x2 grid)
    ctx.fillStyle = isDraggingRulerRef.current ? "#3b82f6" : "rgba(255,255,255,0.6)";
    for (const dx of [-6, 0, 6]) {
      for (const dy of [-3, 3]) {
        ctx.beginPath();
        ctx.arc(rx + rulerLen / 2 + dx, ry - 11 + dy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // "Drag me" hint text (only when not dragging and not submitted)
    if (!isDraggingRulerRef.current && !submitted) {
      ctx.fillStyle = "rgba(59,130,246,0.6)";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("↕ DRAG RULER", rx + rulerLen / 2, ry - 24);
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now),
    );

    // Info panel (top-right)
    const info = PRECISION_INFO[precision];
    const infoPanelRows = [
      { label: "Tool:", value: info.label, color: "#60a5fa" },
      { label: "Resolution:", value: `${info.resolution} ${info.unit}` },
      { label: "Decimal Places:", value: `${info.decimalPlaces}`, color: "#fbbf24" },
    ];
    if (obj) {
      infoPanelRows.push({
        label: "Object:",
        value: `${obj.label} (${obj.shape === "circle" ? "diameter" : "width"})`,
        color: obj.color,
      });
    }
    drawInfoPanel(ctx, W - 230, 12, 218, 18 + infoPanelRows.length * 15 + 8, "MEASUREMENT DATA", infoPanelRows);

    // Challenge scoreboard
    if (mode === "challenge") {
      renderScoreboard(ctx, 12, 12, 160, 120, challengeRef.current);

      // Round indicator
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(12, 140, 160, 30, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `Round ${Math.min(challengeRound + 1, CHALLENGE_ROUNDS)} / ${CHALLENGE_ROUNDS}`,
        92,
        160,
      );
    }

    // Mode badge
    if (mode === "challenge") {
      const badgeText = "CHALLENGE MODE";
      const badgeColor = "#f59e0b";
      ctx.fillStyle = `${badgeColor}33`;
      ctx.beginPath();
      const tw = ctx.measureText(badgeText).width + 20;
      (ctx as CanvasRenderingContext2D).roundRect(W / 2 - tw / 2, H - 30, tw, 22, 6);
      ctx.fill();
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = badgeColor;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, W / 2, H - 15);
    }

    // Instruction text (bottom-left)
    if (!submitted) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("Drag the ruler to measure the object. Enter your reading below.", 30, H - 10);
    }

    // Hover info
    if (hoverInfoRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      const hoverW = ctx.measureText(hoverInfoRef.current).width + 16;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect(W / 2 - hoverW / 2, surfaceY + surfaceH + 8, hoverW, 22, 6);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(hoverInfoRef.current, W / 2, surfaceY + surfaceH + 23);
    }
  }, [
    precision,
    mode,
    challengeRound,
    submitted,
    showTrueLength,
    getRulerLength,
    getRulerHeight,
    getPxPerCm,
    getMaxCmOnRuler,
  ]);

  // Animation loop
  const animate = useCallback(() => {
    // Update particles
    particlesRef.current.update(1 / 60);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const _isMobile = container.clientWidth < 640;
      setupHiDPICanvas(canvas, container.clientWidth, Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.55), _isMobile ? 500 : 500));
      draw();
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [draw]);

  // Start animation loop
  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // Generate initial object
  useEffect(() => {
    generateNewObject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision]);

  // Drag interaction for ruler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Store initial ruler position at drag start for absolute positioning
    const dragStartPos = { x: 0, y: 0 };

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        const rx = rulerPosRef.current.x;
        const ry = rulerPosRef.current.y;
        const rulerLen = getRulerLength();
        const rulerH = getRulerHeight();
        // Check if click is anywhere on ruler area (generous hit zone)
        if (
          x >= rx - 20 &&
          x <= rx + rulerLen + 20 &&
          y >= ry - 30 &&
          y <= ry + rulerH + 30
        ) {
          isDraggingRulerRef.current = true;
          dragStartPos.x = rx;
          dragStartPos.y = ry;
          playSFX("click");
          return true;
        }
        return false;
      },
      onDrag: (_x, _y, dx, dy) => {
        if (isDraggingRulerRef.current) {
          // Use absolute positioning from drag start (not incremental)
          let newX = dragStartPos.x + dx;
          let newY = dragStartPos.y + dy;
          // Clamp within canvas
          const cvs = canvasRef.current;
          if (cvs) {
            newX = Math.max(-20, Math.min(cvs.width - getRulerLength() + 20, newX));
            newY = Math.max(10, Math.min(cvs.height - getRulerHeight() - 10, newY));
          }
          rulerPosRef.current.x = newX;
          rulerPosRef.current.y = newY;
        }
      },
      onDragEnd: () => {
        isDraggingRulerRef.current = false;
      },
    });

    // Hover detection for ruler reading
    const handleHover = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      const rx = rulerPosRef.current.x;
      const ry = rulerPosRef.current.y;
      const rulerLen = getRulerLength();
      const rulerH = getRulerHeight();
      const pxPerCm = getPxPerCm();

      if (
        pos.x >= rx &&
        pos.x <= rx + rulerLen &&
        pos.y >= ry &&
        pos.y <= ry + rulerH
      ) {
        const cmReading = (pos.x - rx) / pxPerCm;
        const res = PRECISION_INFO[precision].resolution;
        const snapped = Math.round(cmReading / res) * res;
        hoverInfoRef.current = `Reading: ${snapped.toFixed(
          precision === "caliper" ? 2 : precision === "fine" ? 1 : 0,
        )} cm`;
      } else {
        hoverInfoRef.current = null;
      }
    };

    canvas.addEventListener("mousemove", handleHover);

    return () => {
      cleanup();
      canvas.removeEventListener("mousemove", handleHover);
    };
  }, [precision, getRulerLength, getRulerHeight, getPxPerCm]);

  // Submit measurement
  const handleSubmit = useCallback(() => {
    const obj = objectRef.current;
    if (!obj || !userInput.trim()) return;

    const userValue = parseFloat(userInput);
    if (isNaN(userValue)) {
      playSFX("incorrect");
      return;
    }

    const trueValue = obj.trueLengthCm;
    const info = PRECISION_INFO[precision];
    // Round both values to instrument precision for fair comparison
    const dp = info.decimalPlaces;
    const roundedTrue = parseFloat(trueValue.toFixed(dp));
    const roundedUser = parseFloat(userValue.toFixed(dp));
    const error = Math.abs(roundedUser - roundedTrue);
    const relativeError = roundedTrue !== 0 ? error / roundedTrue : 0;
    // Check decimal places (measurement science: instrument determines decimal places)
    const userDP = countDecimalPlaces(userInput);
    const userSigFigs = countSigFigs(userInput);
    const expectedSigFigs = countSigFigs(roundedTrue.toFixed(dp));
    const sigFigsCorrect = userDP === dp;

    // Scoring: up to 3 points
    let points = 0;
    let label = "Try Again";

    // Accuracy scoring (max 2 points)
    if (relativeError < 0.01) {
      points += 2;
      label = "Excellent!";
    } else if (relativeError < 0.03) {
      points += 2;
      label = "Great!";
    } else if (relativeError < 0.08) {
      points += 1;
      label = "Good";
    } else if (relativeError < 0.15) {
      points += 1;
      label = "Close";
    }

    // Sig figs bonus (1 point)
    if (sigFigsCorrect) {
      points += 1;
      if (points >= 3) label = "Perfect!";
    }

    const result: MeasurementResult = {
      objectId: obj.id,
      trueValue,
      userValue,
      error,
      relativeError,
      sigFigsCorrect,
      userSigFigs,
      expectedSigFigs,
      points,
    };

    setLastResult(result);
    setSubmitted(true);
    setShowTrueLength(true);
    setResults((prev) => [...prev, result]);

    // Effects
    const canvas = canvasRef.current;
    if (canvas) {
      const cx = canvas.clientWidth / 2;
      const cy = canvas.clientHeight * 0.3;

      if (points >= 3) {
        particlesRef.current.emitConfetti(cx, cy, 40);
        playSFX("success");
      } else if (points >= 2) {
        particlesRef.current.emitGlow(cx, cy, 15, "#3b82f6");
        playSFX("correct");
      } else if (points >= 1) {
        playSFX("pop");
      } else {
        playSFX("fail");
      }

      scorePopupsRef.current.push({
        text: label,
        points,
        x: cx,
        y: cy,
        startTime: performance.now(),
      });
    }

    if (points > 0) playScore(points);

    // Update challenge state
    if (mode === "challenge") {
      const scoreResult = {
        points,
        tier: (points >= 3 ? "perfect" : points >= 2 ? "great" : points >= 1 ? "close" : "miss") as
          | "perfect"
          | "great"
          | "close"
          | "miss",
        label,
      };
      challengeRef.current = updateChallengeState(challengeRef.current, scoreResult);
    }
  }, [userInput, precision, mode]);

  // Next object (challenge mode)
  const handleNext = useCallback(() => {
    if (mode === "challenge") {
      if (challengeRound + 1 >= CHALLENGE_ROUNDS) {
        // Challenge complete
        playSFX("success");
        return;
      }
      setChallengeRound((r) => r + 1);
    }
    generateNewObject();
  }, [mode, challengeRound, generateNewObject]);

  // Switch precision
  const handlePrecisionChange = (p: PrecisionLevel) => {
    setPrecision(p);
    setSubmitted(false);
    setLastResult(null);
    setUserInput("");
    setShowTrueLength(false);
    rulerPosRef.current = { x: 60, y: 200 };
  };

  // Switch mode
  const switchMode = (newMode: GameMode) => {
    setMode(newMode);
    setChallengeRound(0);
    setResults([]);
    setSubmitted(false);
    setLastResult(null);
    setUserInput("");
    setShowTrueLength(false);
    challengeRef.current = createChallengeState();
    scorePopupsRef.current = [];
    rulerPosRef.current = { x: 60, y: 200 };
    // Will regenerate on next render via useEffect
  };

  const challengeComplete = mode === "challenge" && challengeRound + 1 >= CHALLENGE_ROUNDS && submitted;
  const totalChallengeScore = results.reduce((sum, r) => sum + r.points, 0);
  const maxPossible = CHALLENGE_ROUNDS * 3;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-grab active:cursor-grabbing" />
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Mode
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => switchMode("practice")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "practice"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Practice
          </button>
          <button
            onClick={() => switchMode("challenge")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "challenge"
                ? "bg-amber-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Challenge (5 Rounds)
          </button>
        </div>
      </div>

      {/* Precision selector */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
          Measurement Tool
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["ruler", "fine", "caliper"] as PrecisionLevel[]).map((p) => {
            const info = PRECISION_INFO[p];
            return (
              <button
                key={p}
                onClick={() => handlePrecisionChange(p)}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left ${
                  precision === p
                    ? "bg-indigo-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="font-semibold">{info.label}</div>
                <div
                  className={`text-xs mt-1 ${
                    precision === p
                      ? "text-indigo-200"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  Resolution: {info.resolution} {info.unit} | {info.decimalPlaces} d.p.
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Measurement input */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Your Measurement (cm)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitted) handleSubmit();
              }}
              disabled={submitted}
              placeholder={`e.g. ${precision === "caliper" ? "2.45" : precision === "fine" ? "3.4" : "5"}`}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={submitted || !userInput.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors"
            >
              Submit
            </button>
          </div>
          {!submitted && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Record your answer with {PRECISION_INFO[precision].decimalPlaces} decimal place{PRECISION_INFO[precision].decimalPlaces > 1 ? "s" : ""} (instrument precision of {PRECISION_INFO[precision].label.toLowerCase()}).
            </p>
          )}
        </div>

        {/* Result panel */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Result
          </label>
          {lastResult ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">True Length:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                  {lastResult.trueValue.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Your Answer:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                  {lastResult.userValue} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Abs Error:</span>
                <span
                  className={`font-mono font-bold ${
                    lastResult.relativeError < 0.03
                      ? "text-green-500"
                      : lastResult.relativeError < 0.1
                        ? "text-amber-500"
                        : "text-red-500"
                  }`}
                >
                  {lastResult.error.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm ({(lastResult.relativeError * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Precision:</span>
                <span
                  className={`font-mono font-bold ${
                    lastResult.sigFigsCorrect ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {lastResult.userSigFigs} sig figs
                  {lastResult.sigFigsCorrect ? " [correct d.p.]" : ` [need ${PRECISION_INFO[precision].decimalPlaces} d.p.]`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Score:</span>
                <span className="font-mono font-bold text-lg text-indigo-500">
                  {lastResult.points} / 3
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {mode === "practice" && (
                  <button
                    onClick={generateNewObject}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                  >
                    New Object
                  </button>
                )}
                {mode === "challenge" && !challengeComplete && (
                  <button
                    onClick={handleNext}
                    className="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
                  >
                    Next Round
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Position the ruler over the object, read the measurement, and submit your answer.
            </p>
          )}
        </div>
      </div>

      {/* Challenge complete summary */}
      {challengeComplete && (
        <div className="rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400 mb-2">
            Challenge Complete!
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Total Score</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                {totalChallengeScore} / {maxPossible}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Accuracy</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                {maxPossible > 0 ? Math.round((totalChallengeScore / maxPossible) * 100) : 0}%
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Sig Figs Correct</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                {results.filter((r) => r.sigFigsCorrect).length} / {results.length}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Avg Error</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                {results.length > 0
                  ? (
                      (results.reduce((s, r) => s + r.relativeError, 0) / results.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>
          <button
            onClick={() => switchMode("challenge")}
            className="mt-3 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Key Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Relative Error</div>
            <SimMath math="\delta = \frac{|x_{\text{meas}} - x_{\text{true}}|}{x_{\text{true}}} \times 100\%" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Absolute Error</div>
            <SimMath math="\Delta x = |x_{\text{meas}} - x_{\text{true}}|" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Instrument Uncertainty</div>
            <SimMath math="\sigma_{\text{inst}} = \frac{\text{smallest division}}{2}" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono mt-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Significant Figures Rules
            </div>
            <SimMath math="\text{Sig figs} = \text{certain digits} + 1\;\text{estimated digit}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Propagation of Error (addition)
            </div>
            <SimMath math="\sigma_f = \sqrt{\sigma_a^2 + \sigma_b^2}" />
          </div>
        </div>
      </div>
    </div>
  );
}
