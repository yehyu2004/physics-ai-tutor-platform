"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX } from "@/lib/simulation/sound";
import { drawMeter } from "@/lib/simulation/drawing";
import { renderScoreboard, renderScorePopup, createChallengeState, updateChallengeState, type ScorePopup, type ChallengeState } from "@/lib/simulation/scoring";
import { SimMath } from "@/components/simulations/SimMath";

// --- Types ---
type ComponentType = "battery" | "resistor" | "wire" | "lightbulb" | "switch";
type ToolType = ComponentType | "delete" | "wire-drag";

interface GridPos {
  row: number;
  col: number;
}

interface CircuitComponent {
  id: number;
  type: ComponentType;
  row: number;
  col: number;
  orientation: "h" | "v";
  voltage?: number;
  resistance?: number;
  closed?: boolean;
}

interface WireSegment {
  id: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

interface AnalysisResult {
  totalResistance: number;
  totalCurrent: number;
  totalPower: number;
  componentData: Map<number, { voltage: number; current: number; power: number }>;
  valid: boolean;
  shortCircuit: boolean;
}

interface CircuitChallenge {
  name: string;
  description: string;
  targetCurrent: number;
  targetComponent: string; // "lightbulb" or "resistor"
  tolerance: number;
  maxComponents: number;
}

// --- Constants ---
const GRID_COLS = 20;
const GRID_ROWS = 15;
const COLORS = {
  bg: "#0f172a",
  gridLine: "rgba(255,255,255,0.04)",
  gridDot: "rgba(255,255,255,0.12)",
  battery: "#22c55e",
  resistor: "#f97316",
  wire: "#94a3b8",
  lightbulb: "#eab308",
  switchOpen: "#ef4444",
  switchClosed: "#22c55e",
  electron: "#22d3ee",
  selected: "#a78bfa",
  deleteHover: "#ef4444",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  shortCircuit: "#ef4444",
};

const CIRCUIT_CHALLENGES: CircuitChallenge[] = [
  {
    name: "Light It Up",
    description: "Build a circuit with 2A through the lightbulb",
    targetCurrent: 2.0,
    targetComponent: "lightbulb",
    tolerance: 0.3,
    maxComponents: 10,
  },
  {
    name: "Dim the Bulb",
    description: "Get exactly 0.5A through the lightbulb",
    targetCurrent: 0.5,
    targetComponent: "lightbulb",
    tolerance: 0.1,
    maxComponents: 10,
  },
  {
    name: "Power Budget",
    description: "Build a circuit drawing exactly 1A with minimum components",
    targetCurrent: 1.0,
    targetComponent: "resistor",
    tolerance: 0.15,
    maxComponents: 6,
  },
];

export default function CircuitBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const [tool, setTool] = useState<ToolType>("wire");
  const [components, setComponents] = useState<CircuitComponent[]>([]);
  const [wires, setWires] = useState<WireSegment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [batteryVoltage, setBatteryVoltage] = useState(9);
  const [resistorValue, setResistorValue] = useState(100);
  const [challengeMode, setChallengeMode] = useState(false);
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [budgetMode, setBudgetMode] = useState(false);
  const [maxBudget, setMaxBudget] = useState(8);

  // Wire-dragging state
  const wireDragStart = useRef<GridPos | null>(null);
  const wireDragEnd = useRef<GridPos | null>(null);
  const [, setWireDragTick] = useState(0);

  const nextIdRef = useRef(1);
  const analysisRef = useRef<AnalysisResult>({
    totalResistance: 0,
    totalCurrent: 0,
    totalPower: 0,
    componentData: new Map(),
    valid: false,
    shortCircuit: false,
  });
  const electronPosRef = useRef<{ seg: number; t: number }[]>([]);

  // Enhanced features
  const particleSystemRef = useRef(new ParticleSystem());
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const shortCircuitFlashRef = useRef(0);

  // --- Grid helpers ---
  const getCellSize = useCallback((W: number, H: number) => {
    const cellW = W / GRID_COLS;
    const cellH = H / GRID_ROWS;
    return Math.min(cellW, cellH);
  }, []);

  const getGridOrigin = useCallback((W: number, H: number) => {
    const cell = getCellSize(W, H);
    const totalW = cell * GRID_COLS;
    const totalH = cell * GRID_ROWS;
    return { ox: (W - totalW) / 2, oy: (H - totalH) / 2 };
  }, [getCellSize]);

  const gridToPixel = useCallback(
    (row: number, col: number, W: number, H: number) => {
      const cell = getCellSize(W, H);
      const { ox, oy } = getGridOrigin(W, H);
      return { x: ox + col * cell, y: oy + row * cell };
    },
    [getCellSize, getGridOrigin]
  );

  const pixelToGrid = useCallback(
    (px: number, py: number, W: number, H: number): GridPos | null => {
      const cell = getCellSize(W, H);
      const { ox, oy } = getGridOrigin(W, H);
      const col = Math.round((px - ox) / cell);
      const row = Math.round((py - oy) / cell);
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
      return { row, col };
    },
    [getCellSize, getGridOrigin]
  );

  // --- Circuit analysis (simplified series/parallel) ---
  const analyzeCircuit = useCallback(
    (comps: CircuitComponent[], wireSegs: WireSegment[]): AnalysisResult => {
      const result: AnalysisResult = {
        totalResistance: 0,
        totalCurrent: 0,
        totalPower: 0,
        componentData: new Map(),
        valid: false,
        shortCircuit: false,
      };

      const batteries = comps.filter((c) => c.type === "battery");
      if (batteries.length === 0) return result;

      const resistors = comps.filter(
        (c) => c.type === "resistor" || c.type === "lightbulb"
      );

      const switches = comps.filter((c) => c.type === "switch");
      const hasOpenSwitch = switches.some((s) => !s.closed);
      if (hasOpenSwitch) {
        result.valid = true;
        for (const c of comps) {
          result.componentData.set(c.id, { voltage: 0, current: 0, power: 0 });
        }
        for (const b of batteries) {
          result.componentData.set(b.id, {
            voltage: b.voltage || 0,
            current: 0,
            power: 0,
          });
        }
        return result;
      }

      const nodeKey = (r: number, c: number) => `${r},${c}`;
      const adj = new Map<string, Set<string>>();

      const addEdge = (n1: string, n2: string) => {
        if (!adj.has(n1)) adj.set(n1, new Set());
        if (!adj.has(n2)) adj.set(n2, new Set());
        adj.get(n1)!.add(n2);
        adj.get(n2)!.add(n1);
      };

      for (const w of wireSegs) {
        addEdge(nodeKey(w.r1, w.c1), nodeKey(w.r2, w.c2));
      }

      for (const c of comps) {
        const t = getTerminals(c);
        addEdge(nodeKey(t[0].row, t[0].col), nodeKey(t[1].row, t[1].col));
      }

      const parent = new Map<string, string>();
      const find = (x: string): string => {
        if (!parent.has(x)) parent.set(x, x);
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
        return parent.get(x)!;
      };
      const union = (a: string, b: string) => {
        parent.set(find(a), find(b));
      };

      adj.forEach((neighbors, node) => {
        neighbors.forEach((n) => {
          union(node, n);
        });
      });

      if (comps.length > 0) {
        const t0 = getTerminals(comps[0]);
        const root = find(nodeKey(t0[0].row, t0[0].col));
        let allConnected = true;
        for (const c of comps) {
          const t = getTerminals(c);
          if (find(nodeKey(t[0].row, t[0].col)) !== root) {
            allConnected = false;
            break;
          }
        }
        if (!allConnected) return result;
      }

      const totalVoltage = batteries.reduce((s, b) => s + (b.voltage || 0), 0);

      if (resistors.length === 0) {
        // Short circuit detected!
        result.valid = true;
        result.shortCircuit = totalVoltage > 0;
        result.totalCurrent = totalVoltage > 0 ? 999 : 0;
        result.totalPower = totalVoltage > 0 ? 999 : 0;
        for (const b of batteries) {
          result.componentData.set(b.id, {
            voltage: b.voltage || 0,
            current: result.totalCurrent,
            power: (b.voltage || 0) * result.totalCurrent,
          });
        }
        return result;
      }

      const resistorTerminals = resistors.map((r) => {
        const t = getTerminals(r);
        return {
          comp: r,
          n1: find(nodeKey(t[0].row, t[0].col)),
          n2: find(nodeKey(t[1].row, t[1].col)),
        };
      });

      const parallelGroups = new Map<string, typeof resistorTerminals>();
      for (const rt of resistorTerminals) {
        const key = [rt.n1, rt.n2].sort().join("|");
        if (!parallelGroups.has(key)) parallelGroups.set(key, []);
        parallelGroups.get(key)!.push(rt);
      }

      let totalR = 0;
      const groupResistances: { groupR: number; members: typeof resistorTerminals }[] = [];

      parallelGroups.forEach((group) => {
        if (group.length === 1) {
          const r = group[0].comp.resistance || 100;
          groupResistances.push({ groupR: r, members: group });
          totalR += r;
        } else {
          let invSum = 0;
          for (const g of group) {
            invSum += 1 / (g.comp.resistance || 100);
          }
          const parallelR = 1 / invSum;
          groupResistances.push({ groupR: parallelR, members: group });
          totalR += parallelR;
        }
      });

      if (totalR < 0.001) totalR = 0.001;

      result.totalResistance = totalR;
      result.totalCurrent = totalVoltage / totalR;
      result.totalPower = totalVoltage * result.totalCurrent;
      result.valid = true;

      for (const gr of groupResistances) {
        const vGroup = result.totalCurrent * gr.groupR;
        for (const m of gr.members) {
          const r = m.comp.resistance || 100;
          let iComp: number;
          if (gr.members.length > 1) {
            iComp = vGroup / r;
          } else {
            iComp = result.totalCurrent;
          }
          const pComp = iComp * iComp * r;
          result.componentData.set(m.comp.id, {
            voltage: iComp * r,
            current: iComp,
            power: pComp,
          });
        }
      }

      for (const b of batteries) {
        result.componentData.set(b.id, {
          voltage: b.voltage || 0,
          current: result.totalCurrent,
          power: (b.voltage || 0) * result.totalCurrent,
        });
      }

      for (const s of switches) {
        result.componentData.set(s.id, {
          voltage: 0,
          current: result.totalCurrent,
          power: 0,
        });
      }

      return result;
    },
    []
  );

  function getTerminals(c: CircuitComponent): [GridPos, GridPos] {
    if (c.orientation === "h") {
      return [
        { row: c.row, col: c.col },
        { row: c.row, col: c.col + 2 },
      ];
    } else {
      return [
        { row: c.row, col: c.col },
        { row: c.row + 2, col: c.col },
      ];
    }
  }

  // --- Drawing ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cell = getCellSize(W, H);
    const t = timeRef.current;
    const analysis = analysisRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // Short circuit flash effect
    if (analysis.shortCircuit && shortCircuitFlashRef.current > 0) {
      ctx.fillStyle = `rgba(239,68,68,${shortCircuitFlashRef.current * 0.15})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Draw grid dots
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const { x, y } = gridToPixel(r, c, W, H);
        ctx.fillStyle = COLORS.gridDot;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw subtle grid lines
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;
    for (let r = 0; r < GRID_ROWS; r++) {
      const p1 = gridToPixel(r, 0, W, H);
      const p2 = gridToPixel(r, GRID_COLS - 1, W, H);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let c = 0; c < GRID_COLS; c++) {
      const p1 = gridToPixel(0, c, W, H);
      const p2 = gridToPixel(GRID_ROWS - 1, c, W, H);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Draw wires
    for (const w of wires) {
      const p1 = gridToPixel(w.r1, w.c1, W, H);
      const p2 = gridToPixel(w.r2, w.c2, W, H);
      ctx.strokeStyle = analysis.shortCircuit ? COLORS.shortCircuit : COLORS.wire;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      for (const p of [p1, p2]) {
        ctx.fillStyle = COLORS.wire;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Wire drag preview
    if (wireDragStart.current && wireDragEnd.current) {
      const p1 = gridToPixel(wireDragStart.current.row, wireDragStart.current.col, W, H);
      const p2 = gridToPixel(wireDragEnd.current.row, wireDragEnd.current.col, W, H);
      ctx.strokeStyle = "rgba(148,163,184,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw particles (short circuit sparks)
    particleSystemRef.current.draw(ctx);

    // Draw components
    for (const comp of components) {
      const isSelected = comp.id === selectedId;
      const terminals = getTerminals(comp);
      const p1 = gridToPixel(terminals[0].row, terminals[0].col, W, H);
      const p2 = gridToPixel(terminals[1].row, terminals[1].col, W, H);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;

      ctx.strokeStyle = COLORS.wire;
      ctx.lineWidth = 2.5;
      if (comp.orientation === "h") {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + cell * 0.4, p1.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - cell * 0.4, p2.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x, p1.y + cell * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x, p2.y - cell * 0.4);
        ctx.stroke();
      }

      if (isSelected) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.roundRect(mx - cell * 1.1, my - cell * 0.7, cell * 2.2, cell * 1.4, 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      switch (comp.type) {
        case "battery":
          drawBattery(ctx, mx, my, cell, comp);
          break;
        case "resistor":
          drawResistor(ctx, mx, my, cell, comp);
          break;
        case "lightbulb":
          drawLightbulb(ctx, mx, my, cell, comp, analysis);
          break;
        case "switch":
          drawSwitch(ctx, mx, my, cell, comp);
          break;
        case "wire":
          break;
      }

      for (const p of [p1, p2]) {
        ctx.fillStyle = isSelected ? COLORS.selected : COLORS.wire;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Animated electron flow
    if (analysis.valid && analysis.totalCurrent > 0.001 && analysis.totalCurrent < 500) {
      drawElectrons(ctx, t, W, H, cell, analysis);
    }

    // Short circuit sparks
    if (analysis.shortCircuit) {
      // Find battery locations for spark emission
      const batteries = components.filter(c => c.type === "battery");
      for (const bat of batteries) {
        const terms = getTerminals(bat);
        const bp = gridToPixel(terms[0].row, terms[0].col, W, H);
        if (Math.random() < 0.15) {
          particleSystemRef.current.emitSparks(bp.x, bp.y, 5, "#ef4444");
        }
      }
    }

    // Info panel: selected component data
    if (selectedId !== null) {
      const comp = components.find((c) => c.id === selectedId);
      if (comp) {
        const data = analysis.componentData.get(comp.id);
        drawComponentInfoPanel(ctx, W, H, comp, data || null);
      }
    }

    // Analysis summary panel (bottom-right)
    if (analysis.valid && components.length > 0) {
      drawAnalysisPanel(ctx, W, H, analysis);
    }

    // Short circuit warning
    if (analysis.shortCircuit) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 100, 12, 200, 35, 8);
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "bold 14px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText("SHORT CIRCUIT!", W / 2, 35);
    }

    // --- Power budget display ---
    if (analysis.valid && analysis.totalPower > 0 && analysis.totalPower < 500) {
      const powerX = 12;
      const powerY = H - 55;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(powerX, powerY, 200, 45, 6);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("POWER BUDGET", powerX + 10, powerY + 14);

      const pStr = analysis.totalPower >= 100
        ? `${analysis.totalPower.toFixed(0)} W`
        : `${analysis.totalPower.toFixed(2)} W`;
      ctx.font = "12px ui-monospace";
      ctx.fillStyle = analysis.totalPower > 50 ? "#ef4444" : analysis.totalPower > 10 ? "#f59e0b" : "#22c55e";
      ctx.fillText(`Total: ${pStr}`, powerX + 10, powerY + 30);

      // Power meter bar
      drawMeter(ctx, powerX + 10, powerY + 35, 180, 6, analysis.totalPower, 100,
        analysis.totalPower > 50 ? "#ef4444" : analysis.totalPower > 10 ? "#f59e0b" : "#22c55e");
    }

    // --- Budget mode display ---
    if (budgetMode) {
      const budgetX = W - 155;
      const budgetY = 12;
      const totalComps = components.length;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(budgetX, budgetY, 143, 30, 6);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = totalComps > maxBudget ? "#ef4444" : "#22c55e";
      ctx.textAlign = "left";
      ctx.fillText(`Components: ${totalComps}/${maxBudget}`, budgetX + 10, budgetY + 19);
    }

    // --- Challenge scoreboard ---
    if (challengeMode) {
      renderScoreboard(ctx, 12, 12, 148, 95, challengeRef.current);

      // Challenge description
      const challenge = CIRCUIT_CHALLENGES[currentChallenge];
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, 112, 148, 35, 6);
      ctx.fill();
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(challenge.name, 86, 126);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "8px system-ui";
      ctx.fillText(challenge.description, 86, 140);
    }

    // Score popups
    for (let i = scorePopupsRef.current.length - 1; i >= 0; i--) {
      const alive = renderScorePopup(ctx, scorePopupsRef.current[i], performance.now());
      if (!alive) scorePopupsRef.current.splice(i, 1);
    }

    // Instructions (bottom-left)
    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Click grid to place components. Click component to select. Drag between grid points to wire.", 12, H - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    components,
    wires,
    selectedId,
    getCellSize,
    gridToPixel,
    challengeMode,
    currentChallenge,
    budgetMode,
    maxBudget,
  ]);

  // --- Component Drawing Helpers ---
  function drawBattery(
    ctx: CanvasRenderingContext2D,
    mx: number,
    my: number,
    cell: number,
    comp: CircuitComponent
  ) {
    const v = comp.voltage || 9;
    const halfW = cell * 0.2;

    ctx.strokeStyle = COLORS.battery;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (comp.orientation === "h") {
      ctx.moveTo(mx - 3, my - halfW * 1.4);
      ctx.lineTo(mx - 3, my + halfW * 1.4);
    } else {
      ctx.moveTo(mx - halfW * 1.4, my - 3);
      ctx.lineTo(mx + halfW * 1.4, my - 3);
    }
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.beginPath();
    if (comp.orientation === "h") {
      ctx.moveTo(mx + 3, my - halfW * 0.9);
      ctx.lineTo(mx + 3, my + halfW * 0.9);
    } else {
      ctx.moveTo(mx - halfW * 0.9, my + 3);
      ctx.lineTo(mx + halfW * 0.9, my + 3);
    }
    ctx.stroke();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = COLORS.battery;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (comp.orientation === "h") {
      ctx.fillText("+", mx - 12, my);
      ctx.fillText("-", mx + 12, my);
    } else {
      ctx.fillText("+", mx, my - 12);
      ctx.fillText("-", mx, my + 12);
    }

    ctx.font = "9px ui-monospace";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${v}V`, mx, my + cell * 0.55);

    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, cell * 0.6);
    glow.addColorStop(0, "rgba(34,197,94,0.15)");
    glow.addColorStop(1, "rgba(34,197,94,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mx, my, cell * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawResistor(
    ctx: CanvasRenderingContext2D,
    mx: number,
    my: number,
    cell: number,
    comp: CircuitComponent
  ) {
    const r = comp.resistance || 100;
    ctx.strokeStyle = COLORS.resistor;
    ctx.lineWidth = 2;

    const len = cell * 0.8;
    const amp = cell * 0.2;
    const segments = 6;

    ctx.beginPath();
    if (comp.orientation === "h") {
      const startX = mx - len / 2;
      ctx.moveTo(startX, my);
      const segW = len / segments;
      for (let i = 0; i < segments; i++) {
        ctx.lineTo(startX + segW * (i + 0.25), my - amp);
        ctx.lineTo(startX + segW * (i + 0.75), my + amp);
      }
      ctx.lineTo(mx + len / 2, my);
    } else {
      const startY = my - len / 2;
      ctx.moveTo(mx, startY);
      const segH = len / segments;
      for (let i = 0; i < segments; i++) {
        ctx.lineTo(mx - amp, startY + segH * (i + 0.25));
        ctx.lineTo(mx + amp, startY + segH * (i + 0.75));
      }
      ctx.lineTo(mx, my + len / 2);
    }
    ctx.stroke();

    ctx.font = "9px ui-monospace";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = r >= 1000 ? `${(r / 1000).toFixed(1)}k\u03A9` : `${r}\u03A9`;
    ctx.fillText(label, mx, my + cell * 0.55);
  }

  function drawLightbulb(
    ctx: CanvasRenderingContext2D,
    mx: number,
    my: number,
    cell: number,
    comp: CircuitComponent,
    analysis: AnalysisResult
  ) {
    const data = analysis.componentData.get(comp.id);
    const power = data ? data.power : 0;
    const brightness = Math.min(power / 10, 1);

    if (brightness > 0.01) {
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, cell * 0.8);
      glow.addColorStop(0, `rgba(234,179,8,${brightness * 0.5})`);
      glow.addColorStop(0.5, `rgba(234,179,8,${brightness * 0.2})`);
      glow.addColorStop(1, "rgba(234,179,8,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(mx, my, cell * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const radius = cell * 0.3;
    ctx.strokeStyle = brightness > 0.1
      ? `rgba(234,179,8,${0.5 + brightness * 0.5})`
      : "rgba(234,179,8,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (brightness > 0.01) {
      ctx.fillStyle = `rgba(234,179,8,${brightness * 0.3})`;
      ctx.fill();
    }

    ctx.strokeStyle = brightness > 0.1
      ? `rgba(234,179,8,${0.4 + brightness * 0.6})`
      : "rgba(234,179,8,0.3)";
    ctx.lineWidth = 1.5;
    const cr = radius * 0.6;
    ctx.beginPath();
    ctx.moveTo(mx - cr, my - cr);
    ctx.lineTo(mx + cr, my + cr);
    ctx.moveTo(mx + cr, my - cr);
    ctx.lineTo(mx - cr, my + cr);
    ctx.stroke();

    ctx.font = "9px ui-monospace";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const r = comp.resistance || 100;
    const label = r >= 1000 ? `${(r / 1000).toFixed(1)}k\u03A9` : `${r}\u03A9`;
    ctx.fillText(label, mx, my + cell * 0.55);
  }

  function drawSwitch(
    ctx: CanvasRenderingContext2D,
    mx: number,
    my: number,
    cell: number,
    comp: CircuitComponent
  ) {
    const closed = comp.closed || false;
    const halfLen = cell * 0.4;

    ctx.lineWidth = 2;

    if (comp.orientation === "h") {
      ctx.fillStyle = closed ? COLORS.switchClosed : COLORS.switchOpen;
      ctx.beginPath();
      ctx.arc(mx - halfLen, my, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx + halfLen, my, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = closed ? COLORS.switchClosed : COLORS.switchOpen;
      ctx.beginPath();
      ctx.moveTo(mx - halfLen, my);
      if (closed) {
        ctx.lineTo(mx + halfLen, my);
      } else {
        ctx.lineTo(mx + halfLen * 0.6, my - halfLen * 0.8);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = closed ? COLORS.switchClosed : COLORS.switchOpen;
      ctx.beginPath();
      ctx.arc(mx, my - halfLen, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx, my + halfLen, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = closed ? COLORS.switchClosed : COLORS.switchOpen;
      ctx.beginPath();
      ctx.moveTo(mx, my - halfLen);
      if (closed) {
        ctx.lineTo(mx, my + halfLen);
      } else {
        ctx.lineTo(mx - halfLen * 0.8, my + halfLen * 0.6);
      }
      ctx.stroke();
    }

    ctx.font = "9px ui-monospace";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(closed ? "ON" : "OFF", mx, my + cell * 0.55);
  }

  function drawElectrons(
    ctx: CanvasRenderingContext2D,
    t: number,
    W: number,
    H: number,
    cell: number,
    analysis: AnalysisResult
  ) {
    const speed = Math.min(analysis.totalCurrent * 30, 150);
    const electrons = electronPosRef.current;

    const allSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const w of wires) {
      const p1 = gridToPixel(w.r1, w.c1, W, H);
      const p2 = gridToPixel(w.r2, w.c2, W, H);
      allSegments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }

    for (const comp of components) {
      const terms = getTerminals(comp);
      const p1 = gridToPixel(terms[0].row, terms[0].col, W, H);
      const p2 = gridToPixel(terms[1].row, terms[1].col, W, H);
      allSegments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }

    if (electrons.length === 0 || electrons.length !== allSegments.length * 3) {
      electronPosRef.current = [];
      for (let i = 0; i < allSegments.length; i++) {
        for (let j = 0; j < 3; j++) {
          electronPosRef.current.push({ seg: i, t: j / 3 });
        }
      }
    }

    ctx.fillStyle = COLORS.electron;
    ctx.shadowColor = "rgba(34,211,238,0.6)";
    ctx.shadowBlur = 4;

    for (const e of electronPosRef.current) {
      if (e.seg >= allSegments.length) continue;
      e.t = (e.t + speed * 0.0003) % 1;
      const seg = allSegments[e.seg];
      const ex = seg.x1 + (seg.x2 - seg.x1) * e.t;
      const ey = seg.y1 + (seg.y2 - seg.y1) * e.t;

      ctx.beginPath();
      ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  function drawComponentInfoPanel(
    ctx: CanvasRenderingContext2D,
    W: number,
    _H: number,
    comp: CircuitComponent,
    data: { voltage: number; current: number; power: number } | null
  ) {
    const panelW = 180;
    const panelH = 85;
    const px = W - panelW - 12;
    const py = 12;

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "bold 11px ui-monospace";
    ctx.fillStyle = COLORS.selected;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const typeName = comp.type.charAt(0).toUpperCase() + comp.type.slice(1);
    ctx.fillText(typeName, px + 10, py + 8);

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = COLORS.text;
    let yOff = py + 26;

    if (comp.type === "battery") {
      ctx.fillText(`EMF: ${(comp.voltage || 0).toFixed(1)} V`, px + 10, yOff);
    } else if (comp.type === "resistor" || comp.type === "lightbulb") {
      ctx.fillText(`R: ${comp.resistance || 100} \u03A9`, px + 10, yOff);
    } else if (comp.type === "switch") {
      ctx.fillText(`State: ${comp.closed ? "Closed" : "Open"}`, px + 10, yOff);
    }

    if (data) {
      yOff += 16;
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`V: ${data.voltage.toFixed(2)} V`, px + 10, yOff);
      yOff += 16;
      ctx.fillStyle = "#22c55e";
      const iStr =
        data.current >= 1
          ? `${data.current.toFixed(2)} A`
          : `${(data.current * 1000).toFixed(1)} mA`;
      ctx.fillText(`I: ${iStr}    P: ${data.power.toFixed(2)} W`, px + 10, yOff);
    }
  }

  function drawAnalysisPanel(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    analysis: AnalysisResult
  ) {
    const panelW = 200;
    const panelH = 55;
    const px = W - panelW - 12;
    const py = H - panelH - 65;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 6);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CIRCUIT ANALYSIS", px + 10, py + 8);

    ctx.font = "10px ui-monospace";
    ctx.fillStyle = "#fbbf24";
    const rStr =
      analysis.totalResistance >= 1000
        ? `${(analysis.totalResistance / 1000).toFixed(2)} k\u03A9`
        : `${analysis.totalResistance.toFixed(1)} \u03A9`;
    ctx.fillText(`R_total: ${rStr}`, px + 10, py + 24);

    ctx.fillStyle = "#22c55e";
    const iStr =
      analysis.totalCurrent >= 1
        ? `${analysis.totalCurrent.toFixed(3)} A`
        : `${(analysis.totalCurrent * 1000).toFixed(1)} mA`;
    ctx.fillText(`I: ${iStr}`, px + 10, py + 38);
  }

  // --- Interaction handlers ---
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      const gp = pixelToGrid(mx, my, canvas.width, canvas.height);
      if (!gp) return;

      if (tool === "delete") {
        setComponents((prev) =>
          prev.filter((c) => {
            const terms = getTerminals(c);
            const near =
              (Math.abs(terms[0].row - gp.row) <= 1 && Math.abs(terms[0].col - gp.col) <= 1) ||
              (Math.abs(terms[1].row - gp.row) <= 1 && Math.abs(terms[1].col - gp.col) <= 1);
            return !near;
          })
        );
        setWires((prev) =>
          prev.filter(
            (w) =>
              !(
                (w.r1 === gp.row && w.c1 === gp.col) ||
                (w.r2 === gp.row && w.c2 === gp.col)
              )
          )
        );
        setSelectedId(null);
        return;
      }

      if (tool === "wire") {
        wireDragStart.current = gp;
        wireDragEnd.current = gp;
        return;
      }

      for (const comp of components) {
        const terms = getTerminals(comp);
        const midR = (terms[0].row + terms[1].row) / 2;
        const midC = (terms[0].col + terms[1].col) / 2;
        if (Math.abs(midR - gp.row) <= 1 && Math.abs(midC - gp.col) <= 1) {
          if (comp.type === "switch") {
            setComponents((prev) =>
              prev.map((c) =>
                c.id === comp.id ? { ...c, closed: !c.closed } : c
              )
            );
          }
          setSelectedId(comp.id);
          return;
        }
      }

      if (tool === "battery" || tool === "resistor" || tool === "lightbulb" || tool === "switch") {
        // Budget check
        if (budgetMode && components.length >= maxBudget) {
          playSFX("incorrect");
          return;
        }

        if (gp.col + 2 >= GRID_COLS) return;

        const overlaps = components.some((c) => {
          const terms = getTerminals(c);
          const occupiedCols = new Set<string>();
          const minR = Math.min(terms[0].row, terms[1].row);
          const maxR = Math.max(terms[0].row, terms[1].row);
          const minC = Math.min(terms[0].col, terms[1].col);
          const maxC = Math.max(terms[0].col, terms[1].col);
          for (let r = minR; r <= maxR; r++) {
            for (let cc = minC; cc <= maxC; cc++) {
              occupiedCols.add(`${r},${cc}`);
            }
          }
          for (let cc = gp.col; cc <= gp.col + 2; cc++) {
            if (occupiedCols.has(`${gp.row},${cc}`)) return true;
          }
          return false;
        });

        if (overlaps) return;

        const newComp: CircuitComponent = {
          id: nextIdRef.current++,
          type: tool,
          row: gp.row,
          col: gp.col,
          orientation: "h",
          ...(tool === "battery" ? { voltage: batteryVoltage } : {}),
          ...(tool === "resistor" ? { resistance: resistorValue } : {}),
          ...(tool === "lightbulb" ? { resistance: resistorValue } : {}),
          ...(tool === "switch" ? { closed: false } : {}),
        };
        setComponents((prev) => [...prev, newComp]);
        setSelectedId(newComp.id);
      }
    },
    [tool, components, pixelToGrid, batteryVoltage, resistorValue, budgetMode, maxBudget]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!wireDragStart.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      const gp = pixelToGrid(mx, my, canvas.width, canvas.height);
      if (gp) {
        const dr = Math.abs(gp.row - wireDragStart.current.row);
        const dc = Math.abs(gp.col - wireDragStart.current.col);
        if (dc >= dr) {
          wireDragEnd.current = { row: wireDragStart.current.row, col: gp.col };
        } else {
          wireDragEnd.current = { row: gp.row, col: wireDragStart.current.col };
        }
        setWireDragTick((t) => t + 1);
      }
    },
    [pixelToGrid]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (wireDragStart.current && wireDragEnd.current) {
      const s = wireDragStart.current;
      const e = wireDragEnd.current;
      if (s.row !== e.row || s.col !== e.col) {
        if (s.row === e.row) {
          const minC = Math.min(s.col, e.col);
          const maxC = Math.max(s.col, e.col);
          const newWires: WireSegment[] = [];
          for (let c = minC; c < maxC; c++) {
            const exists = wires.some(
              (w) =>
                w.r1 === s.row && w.c1 === c && w.r2 === s.row && w.c2 === c + 1
            );
            if (!exists) {
              newWires.push({
                id: nextIdRef.current++,
                r1: s.row,
                c1: c,
                r2: s.row,
                c2: c + 1,
              });
            }
          }
          if (newWires.length > 0) {
            setWires((prev) => [...prev, ...newWires]);
          }
        } else {
          const minR = Math.min(s.row, e.row);
          const maxR = Math.max(s.row, e.row);
          const newWires: WireSegment[] = [];
          for (let r = minR; r < maxR; r++) {
            const exists = wires.some(
              (w) =>
                w.r1 === r && w.c1 === s.col && w.r2 === r + 1 && w.c2 === s.col
            );
            if (!exists) {
              newWires.push({
                id: nextIdRef.current++,
                r1: r,
                c1: s.col,
                r2: r + 1,
                c2: s.col,
              });
            }
          }
          if (newWires.length > 0) {
            setWires((prev) => [...prev, ...newWires]);
          }
        }
      }
    }
    wireDragStart.current = null;
    wireDragEnd.current = null;
    setWireDragTick((t) => t + 1);
  }, [wires]);

  // --- Preset circuits ---
  const loadPreset = useCallback(
    (preset: "series" | "parallel" | "wheatstone") => {
      nextIdRef.current = 1;
      setSelectedId(null);
      electronPosRef.current = [];
      particleSystemRef.current.clear();

      if (preset === "series") {
        const comps: CircuitComponent[] = [
          { id: nextIdRef.current++, type: "battery", row: 7, col: 1, orientation: "h", voltage: 9 },
          { id: nextIdRef.current++, type: "resistor", row: 4, col: 5, orientation: "h", resistance: 100 },
          { id: nextIdRef.current++, type: "lightbulb", row: 4, col: 9, orientation: "h", resistance: 200 },
          { id: nextIdRef.current++, type: "switch", row: 4, col: 13, orientation: "h", closed: true },
        ];
        const w: WireSegment[] = [];
        for (let c = 3; c < 5; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let c = 7; c < 9; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let c = 11; c < 13; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let r = 4; r < 7; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 15, r2: r + 1, c2: 15 });
        for (let c = 3; c < 15; c++) w.push({ id: nextIdRef.current++, r1: 7, c1: c, r2: 7, c2: c + 1 });
        for (let r = 4; r < 7; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 3, r2: r + 1, c2: 3 });
        w.push({ id: nextIdRef.current++, r1: 4, c1: 1, r2: 4, c2: 2 });
        w.push({ id: nextIdRef.current++, r1: 4, c1: 2, r2: 4, c2: 3 });
        for (let r = 7; r <= 7; r++) w.push({ id: nextIdRef.current++, r1: 7, c1: 1, r2: 7, c2: 2 });
        w.push({ id: nextIdRef.current++, r1: 7, c1: 2, r2: 7, c2: 3 });

        setComponents(comps);
        setWires(w);
      } else if (preset === "parallel") {
        const comps: CircuitComponent[] = [
          { id: nextIdRef.current++, type: "battery", row: 6, col: 1, orientation: "h", voltage: 12 },
          { id: nextIdRef.current++, type: "resistor", row: 4, col: 7, orientation: "h", resistance: 200 },
          { id: nextIdRef.current++, type: "resistor", row: 8, col: 7, orientation: "h", resistance: 300 },
          { id: nextIdRef.current++, type: "switch", row: 6, col: 13, orientation: "h", closed: true },
        ];
        const w: WireSegment[] = [];
        for (let r = 4; r < 6; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 5, r2: r + 1, c2: 5 });
        for (let r = 6; r < 8; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 5, r2: r + 1, c2: 5 });
        for (let c = 5; c < 7; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let c = 5; c < 7; c++) w.push({ id: nextIdRef.current++, r1: 8, c1: c, r2: 8, c2: c + 1 });
        for (let r = 4; r < 6; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 11, r2: r + 1, c2: 11 });
        for (let r = 6; r < 8; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 11, r2: r + 1, c2: 11 });
        for (let c = 9; c < 11; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let c = 9; c < 11; c++) w.push({ id: nextIdRef.current++, r1: 8, c1: c, r2: 8, c2: c + 1 });
        for (let c = 11; c < 13; c++) w.push({ id: nextIdRef.current++, r1: 6, c1: c, r2: 6, c2: c + 1 });
        for (let c = 15; c < 17; c++) w.push({ id: nextIdRef.current++, r1: 6, c1: c, r2: 6, c2: c + 1 });
        for (let r = 6; r < 10; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 17, r2: r + 1, c2: 17 });
        for (let c = 3; c < 17; c++) w.push({ id: nextIdRef.current++, r1: 10, c1: c, r2: 10, c2: c + 1 });
        for (let r = 6; r < 10; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 3, r2: r + 1, c2: 3 });
        w.push({ id: nextIdRef.current++, r1: 6, c1: 3, r2: 6, c2: 4 });
        for (let c = 3; c < 5; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        w.push({ id: nextIdRef.current++, r1: 4, c1: 1, r2: 4, c2: 2 });
        w.push({ id: nextIdRef.current++, r1: 4, c1: 2, r2: 4, c2: 3 });
        for (let r = 4; r < 6; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 3, r2: r + 1, c2: 3 });

        setComponents(comps);
        setWires(w);
      } else if (preset === "wheatstone") {
        const comps: CircuitComponent[] = [
          { id: nextIdRef.current++, type: "battery", row: 7, col: 1, orientation: "h", voltage: 10 },
          { id: nextIdRef.current++, type: "resistor", row: 4, col: 5, orientation: "h", resistance: 100 },
          { id: nextIdRef.current++, type: "resistor", row: 4, col: 11, orientation: "h", resistance: 200 },
          { id: nextIdRef.current++, type: "resistor", row: 10, col: 5, orientation: "h", resistance: 150 },
          { id: nextIdRef.current++, type: "resistor", row: 10, col: 11, orientation: "h", resistance: 300 },
        ];
        const w: WireSegment[] = [];
        for (let c = 3; c < 5; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let r = 4; r < 10; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 5, r2: r + 1, c2: 5 });
        for (let c = 7; c < 11; c++) w.push({ id: nextIdRef.current++, r1: 4, c1: c, r2: 4, c2: c + 1 });
        for (let c = 7; c < 11; c++) w.push({ id: nextIdRef.current++, r1: 10, c1: c, r2: 10, c2: c + 1 });
        for (let r = 4; r < 10; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 13, r2: r + 1, c2: 13 });
        for (let r = 7; r <= 7; r++) w.push({ id: nextIdRef.current++, r1: 7, c1: 13, r2: 7, c2: 14 });
        for (let c = 14; c < 16; c++) w.push({ id: nextIdRef.current++, r1: 7, c1: c, r2: 7, c2: c + 1 });
        for (let r = 7; r < 12; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 16, r2: r + 1, c2: 16 });
        for (let c = 3; c < 16; c++) w.push({ id: nextIdRef.current++, r1: 12, c1: c, r2: 12, c2: c + 1 });
        for (let r = 7; r < 12; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 3, r2: r + 1, c2: 3 });
        for (let r = 4; r < 7; r++) w.push({ id: nextIdRef.current++, r1: r, c1: 3, r2: r + 1, c2: 3 });
        w.push({ id: nextIdRef.current++, r1: 4, c1: 1, r2: 4, c2: 2 });
        w.push({ id: nextIdRef.current++, r1: 4, c1: 2, r2: 4, c2: 3 });
        w.push({ id: nextIdRef.current++, r1: 7, c1: 1, r2: 7, c2: 2 });
        w.push({ id: nextIdRef.current++, r1: 7, c1: 2, r2: 7, c2: 3 });

        setComponents(comps);
        setWires(w);
      }
    },
    []
  );

  // --- Check challenge ---
  const checkChallenge = useCallback(() => {
    if (!challengeMode) return;
    const challenge = CIRCUIT_CHALLENGES[currentChallenge];
    const analysis = analysisRef.current;

    if (!analysis.valid) {
      const result = { points: 0, tier: "miss" as const, label: "No circuit!" };
      challengeRef.current = updateChallengeState(challengeRef.current, result);
      const canvas = canvasRef.current;
      if (canvas) {
        scorePopupsRef.current.push({ text: result.label, points: 0, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
      }
      playSFX("incorrect");
      return;
    }

    if (analysis.shortCircuit) {
      const result = { points: 0, tier: "miss" as const, label: "Short circuit!" };
      challengeRef.current = updateChallengeState(challengeRef.current, result);
      const canvas = canvasRef.current;
      if (canvas) {
        scorePopupsRef.current.push({ text: result.label, points: 0, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
      }
      playSFX("fail");
      return;
    }

    // Find the target component's current
    const targetComps = components.filter(c => c.type === challenge.targetComponent);
    if (targetComps.length === 0) {
      const result = { points: 0, tier: "miss" as const, label: `Need a ${challenge.targetComponent}!` };
      challengeRef.current = updateChallengeState(challengeRef.current, result);
      const canvas = canvasRef.current;
      if (canvas) {
        scorePopupsRef.current.push({ text: result.label, points: 0, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
      }
      playSFX("incorrect");
      return;
    }

    // Check budget
    if (budgetMode && components.length > challenge.maxComponents) {
      const result = { points: 0, tier: "miss" as const, label: "Too many components!" };
      challengeRef.current = updateChallengeState(challengeRef.current, result);
      const canvas = canvasRef.current;
      if (canvas) {
        scorePopupsRef.current.push({ text: result.label, points: 0, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
      }
      playSFX("incorrect");
      return;
    }

    // Check current through the first matching component
    const data = analysis.componentData.get(targetComps[0].id);
    if (!data) {
      playSFX("incorrect");
      return;
    }

    const error = Math.abs(data.current - challenge.targetCurrent);
    let points = 0;
    let label = "Try Again";
    let tier: "perfect" | "great" | "good" | "close" | "miss" = "miss";

    if (error < challenge.tolerance * 0.2) { points = 3; label = "Perfect!"; tier = "perfect"; }
    else if (error < challenge.tolerance * 0.5) { points = 2; label = "Great!"; tier = "great"; }
    else if (error < challenge.tolerance) { points = 2; label = "Good!"; tier = "good"; }
    else if (error < challenge.tolerance * 2) { points = 1; label = "Close!"; tier = "close"; }

    const result = { points, label, tier };
    challengeRef.current = updateChallengeState(challengeRef.current, result);
    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({ text: `${label} (${data.current.toFixed(2)}A)`, points, x: canvas.width / 2, y: canvas.height / 2, startTime: performance.now() });
      if (points >= 2) {
        particleSystemRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 25);
      }
    }
    playSFX(points > 0 ? "correct" : "incorrect");

    // Advance challenge
    if (points >= 2) {
      setTimeout(() => setCurrentChallenge((c) => (c + 1) % CIRCUIT_CHALLENGES.length), 1500);
    }
  }, [challengeMode, currentChallenge, components, budgetMode]);

  // --- Update analysis when circuit changes ---
  useEffect(() => {
    const prevShort = analysisRef.current.shortCircuit;
    analysisRef.current = analyzeCircuit(components, wires);
    electronPosRef.current = [];

    // Short circuit detection: trigger warning
    if (analysisRef.current.shortCircuit && !prevShort) {
      shortCircuitFlashRef.current = 1;
      playSFX("fail");
      // Emit sparks at all batteries
      const canvas = canvasRef.current;
      if (canvas) {
        for (const comp of components) {
          if (comp.type === "battery") {
            const terms = getTerminals(comp);
            const p = gridToPixel(terms[0].row, terms[0].col, canvas.width, canvas.height);
            particleSystemRef.current.emitSparks(p.x, p.y, 30, "#ef4444");
          }
        }
      }
    }
  }, [components, wires, analyzeCircuit, gridToPixel]);

  // --- Animation loop ---
  const animate = useCallback(() => {
    timeRef.current += 0.016;

    // Decay short circuit flash
    if (shortCircuitFlashRef.current > 0) {
      shortCircuitFlashRef.current = Math.max(0, shortCircuitFlashRef.current - 0.02);
    }

    // Update particles
    particleSystemRef.current.update(0.016);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // --- Canvas resize ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 520);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // --- Start animation ---
  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  // --- Update selected component values ---
  const updateSelectedVoltage = (v: number) => {
    setBatteryVoltage(v);
    if (selectedId !== null) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === selectedId && c.type === "battery" ? { ...c, voltage: v } : c
        )
      );
    }
  };

  const updateSelectedResistance = (r: number) => {
    setResistorValue(r);
    if (selectedId !== null) {
      setComponents((prev) =>
        prev.map((c) =>
          c.id === selectedId && (c.type === "resistor" || c.type === "lightbulb")
            ? { ...c, resistance: r }
            : c
        )
      );
    }
  };

  const clearAll = () => {
    setComponents([]);
    setWires([]);
    setSelectedId(null);
    nextIdRef.current = 1;
    electronPosRef.current = [];
    particleSystemRef.current.clear();
    scorePopupsRef.current = [];
  };

  const selectedComp = components.find((c) => c.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />
      </div>

      {/* Tool palette */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Component Palette
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            { key: "wire" as ToolType, label: "Wire", color: "gray" },
            { key: "battery" as ToolType, label: "Battery", color: "green" },
            { key: "resistor" as ToolType, label: "Resistor", color: "orange" },
            { key: "lightbulb" as ToolType, label: "Lightbulb", color: "yellow" },
            { key: "switch" as ToolType, label: "Switch", color: "blue" },
            { key: "delete" as ToolType, label: "Delete", color: "red" },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => {
                setTool(key);
                setSelectedId(null);
              }}
              className={`px-3 h-9 rounded-lg text-xs font-medium transition-colors ${
                tool === key
                  ? color === "green"
                    ? "bg-green-600 text-white"
                    : color === "orange"
                    ? "bg-orange-500 text-white"
                    : color === "yellow"
                    ? "bg-yellow-500 text-white"
                    : color === "blue"
                    ? "bg-blue-600 text-white"
                    : color === "red"
                    ? "bg-red-600 text-white"
                    : "bg-gray-600 text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}

          <div className="h-9 w-px bg-gray-200 dark:bg-gray-700" />

          <button
            onClick={clearAll}
            className="px-3 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-medium transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Controls row: value adjusters + presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Battery Voltage (V)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range" min={1} max={12} step={0.5}
              value={selectedComp?.type === "battery" ? selectedComp.voltage || batteryVoltage : batteryVoltage}
              onChange={(e) => updateSelectedVoltage(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {selectedComp?.type === "battery"
                ? `${selectedComp.voltage || batteryVoltage}V`
                : `${batteryVoltage}V`}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Resistance (&Omega;)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range" min={1} max={1000} step={1}
              value={
                selectedComp && (selectedComp.type === "resistor" || selectedComp.type === "lightbulb")
                  ? selectedComp.resistance || resistorValue
                  : resistorValue
              }
              onChange={(e) => updateSelectedResistance(Number(e.target.value))}
              className="flex-1 accent-orange-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
              {selectedComp && (selectedComp.type === "resistor" || selectedComp.type === "lightbulb")
                ? `${selectedComp.resistance || resistorValue}`
                : `${resistorValue}`}
              &Omega;
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:col-span-2 lg:col-span-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Preset Circuits
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => loadPreset("series")}
              className="px-3 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">
              Simple Series
            </button>
            <button onClick={() => loadPreset("parallel")}
              className="px-3 h-9 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-colors">
              Parallel
            </button>
            <button onClick={() => loadPreset("wheatstone")}
              className="px-3 h-9 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors">
              Wheatstone Bridge
            </button>
          </div>
        </div>
      </div>

      {/* Challenge and Budget mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Circuit Challenge
          </label>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              onClick={() => {
                setChallengeMode(!challengeMode);
                if (!challengeMode) {
                  challengeRef.current = createChallengeState();
                  challengeRef.current.active = true;
                  setCurrentChallenge(0);
                }
              }}
              className={`px-4 h-9 rounded-lg text-xs font-medium transition-colors ${
                challengeMode ? "bg-amber-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Challenge: {challengeMode ? "ON" : "OFF"}
            </button>
            {challengeMode && (
              <button onClick={checkChallenge}
                className="px-4 h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors">
                Check Circuit
              </button>
            )}
          </div>
          {challengeMode && (
            <p className="text-[10px] text-gray-400 mt-2">
              {CIRCUIT_CHALLENGES[currentChallenge].description}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Component Budget
          </label>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setBudgetMode(!budgetMode)}
              className={`px-4 h-9 rounded-lg text-xs font-medium transition-colors ${
                budgetMode ? "bg-purple-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Budget: {budgetMode ? "ON" : "OFF"}
            </button>
            {budgetMode && (
              <div className="flex items-center gap-2">
                <input type="range" min={3} max={15} step={1} value={maxBudget}
                  onChange={(e) => setMaxBudget(Number(e.target.value))}
                  className="w-20 accent-purple-500" />
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{maxBudget}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            {budgetMode ? `Using ${components.length}/${maxBudget} components` : "Limit component count for efficiency"}
          </p>
        </div>
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="V = IR" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="P = IV = I^2R" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            Series: <SimMath math="R_s = \Sigma R_i" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            Parallel: <SimMath math="\frac{1}{R_p} = \Sigma\frac{1}{R_i}" />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Build circuits and watch current flow! Short circuits are detected automatically with sparks and a warning.
          Use Challenge mode to solve circuit puzzles. Enable Budget mode to limit components and optimize your design.
          The power budget meter shows total power consumption.
        </p>
      </div>
    </div>
  );
}
