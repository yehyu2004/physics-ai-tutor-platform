"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

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
  { name: "Electron Neutrino", symbol: "νe", mass: "< 2 eV", charge: "0", spin: "1/2", type: "lepton", generation: 1, color: "#22c55e", row: 3, col: 0 },
  // Leptons - Generation 2
  { name: "Muon", symbol: "μ", mass: "106 MeV", charge: "-1", spin: "1/2", type: "lepton", generation: 2, color: "#10b981", row: 2, col: 1 },
  { name: "Muon Neutrino", symbol: "νμ", mass: "< 0.19 MeV", charge: "0", spin: "1/2", type: "lepton", generation: 2, color: "#10b981", row: 3, col: 1 },
  // Leptons - Generation 3
  { name: "Tau", symbol: "τ", mass: "1.78 GeV", charge: "-1", spin: "1/2", type: "lepton", generation: 3, color: "#059669", row: 2, col: 2 },
  { name: "Tau Neutrino", symbol: "ντ", mass: "< 18.2 MeV", charge: "0", spin: "1/2", type: "lepton", generation: 3, color: "#059669", row: 3, col: 2 },
  // Gauge Bosons
  { name: "Gluon", symbol: "g", mass: "0", charge: "0", spin: "1", type: "boson", color: "#a855f7", row: 0, col: 3 },
  { name: "Photon", symbol: "γ", mass: "0", charge: "0", spin: "1", type: "boson", color: "#8b5cf6", row: 1, col: 3 },
  { name: "Z Boson", symbol: "Z", mass: "91.2 GeV", charge: "0", spin: "1", type: "boson", color: "#7c3aed", row: 2, col: 3 },
  { name: "W Boson", symbol: "W", mass: "80.4 GeV", charge: "±1", spin: "1", type: "boson", color: "#6d28d9", row: 3, col: 3 },
  // Higgs
  { name: "Higgs", symbol: "H", mass: "125 GeV", charge: "0", spin: "0", type: "boson", color: "#3b82f6", row: 0, col: 4 },
];

export default function StandardModel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<Particle | null>(null);
  const [filter, setFilter] = useState<"all" | "quark" | "lepton" | "boson">("all");

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
    for (let g = 1; g <= 3; g++) {
      ctx.fillText(`Gen ${g}`, startX + (g - 1) * cellW + cellW / 2, startY - 8);
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

    // Draw particles
    for (const p of particles) {
      const px = startX + p.col * cellW;
      const py = startY + p.row * cellH;
      const isFiltered = filter !== "all" && filter !== p.type;
      const isSelected = selected?.symbol === p.symbol;

      // Card background
      ctx.fillStyle = isFiltered ? "rgba(30,41,59,0.3)" : isSelected ? "rgba(255,255,255,0.1)" : "rgba(30,41,59,0.6)";
      ctx.beginPath();
      ctx.roundRect(px + 3, py + 3, cellW - 6, cellH - 6, 6);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (isFiltered) continue;

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
    }

    // Selected particle info
    if (selected) {
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
      ctx.fillText(`${selected.symbol} — ${selected.name}`, W - 208, H - 80);

      ctx.font = "11px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Mass: ${selected.mass}`, W - 208, H - 60);
      ctx.fillText(`Charge: ${selected.charge}e`, W - 208, H - 44);
      ctx.fillText(`Spin: ${selected.spin}`, W - 208, H - 28);
    }
  }, [selected, filter]);

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

  useEffect(() => { draw(); }, [draw]);

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

    for (const p of particles) {
      const px = startX + p.col * cellW;
      const py = startY + p.row * cellH;
      if (mx >= px && mx <= px + cellW && my >= py && my <= py + cellH) {
        setSelected(selected?.symbol === p.symbol ? null : p);
        return;
      }
    }
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" onClick={handleClick} />
      </div>
      <div className="flex flex-wrap gap-3">
        {(["all", "quark", "lepton", "boson"] as const).map((f) => (
          <button key={f} onClick={() => { setFilter(f); setSelected(null); }}
            className={`px-4 h-10 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f
                ? f === "quark" ? "bg-red-500 text-white"
                  : f === "lepton" ? "bg-green-500 text-white"
                  : f === "boson" ? "bg-purple-500 text-white"
                  : "bg-blue-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}>
            {f === "all" ? "All Particles" : f + "s"}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Standard Model</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">6 quarks + 6 leptons</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">4 gauge bosons + Higgs</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">3 generations of matter</div>
        </div>
      </div>
    </div>
  );
}
