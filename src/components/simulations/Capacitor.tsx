"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function Capacitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [separation, setSeparation] = useState(0.02); // meters
  const [plateArea, setPlateArea] = useState(0.01); // m^2
  const [voltage, setVoltage] = useState(100); // Volts
  const [dielectric, setDielectric] = useState(1); // relative permittivity

  const timeRef = useRef(0);

  const epsilon0 = 8.854e-12;
  const capacitance = dielectric * epsilon0 * plateArea / separation; // Farads
  const charge = capacitance * voltage; // Coulombs
  const eField = voltage / separation; // V/m
  const energy = 0.5 * capacitance * voltage * voltage; // Joules
  const sigmaDensity = charge / plateArea; // C/m^2

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const time = timeRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // --- Capacitor visualization ---
    const capCX = W * 0.35;
    const capCY = H * 0.5;
    const plateH = H * 0.55;
    const plateW = 8;
    const gapW = 40 + separation * 4000; // visual gap scales with separation

    const leftPlateX = capCX - gapW / 2;
    const rightPlateX = capCX + gapW / 2;

    // Dielectric fill between plates
    if (dielectric > 1) {
      ctx.fillStyle = `rgba(167,139,250,${0.08 + (dielectric - 1) * 0.02})`;
      ctx.fillRect(leftPlateX + plateW, capCY - plateH / 2, gapW - plateW * 2, plateH);
      ctx.strokeStyle = "rgba(167,139,250,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(leftPlateX + plateW, capCY - plateH / 2, gapW - plateW * 2, plateH);
      ctx.setLineDash([]);

      ctx.fillStyle = "#a78bfa";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`k = ${dielectric.toFixed(1)}`, capCX, capCY + plateH / 2 + 18);
    }

    // Left plate (positive) - red
    const leftGrad = ctx.createLinearGradient(leftPlateX, 0, leftPlateX + plateW, 0);
    leftGrad.addColorStop(0, "#dc2626");
    leftGrad.addColorStop(1, "#ef4444");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(leftPlateX, capCY - plateH / 2, plateW, plateH);
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 1;
    ctx.strokeRect(leftPlateX, capCY - plateH / 2, plateW, plateH);

    // + signs on left plate
    ctx.fillStyle = "#fca5a5";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    const chargeCount = Math.min(Math.floor(Math.abs(charge) * 1e10) + 3, 10);
    for (let i = 0; i < chargeCount; i++) {
      const cy = capCY - plateH / 2 + (plateH / (chargeCount + 1)) * (i + 1);
      ctx.fillText("+", leftPlateX - 10, cy + 4);
    }

    // Right plate (negative) - blue
    const rightGrad = ctx.createLinearGradient(rightPlateX, 0, rightPlateX + plateW, 0);
    rightGrad.addColorStop(0, "#2563eb");
    rightGrad.addColorStop(1, "#3b82f6");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(rightPlateX, capCY - plateH / 2, plateW, plateH);
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 1;
    ctx.strokeRect(rightPlateX, capCY - plateH / 2, plateW, plateH);

    // - signs on right plate
    ctx.fillStyle = "#93c5fd";
    for (let i = 0; i < chargeCount; i++) {
      const cy = capCY - plateH / 2 + (plateH / (chargeCount + 1)) * (i + 1);
      ctx.fillText("-", rightPlateX + plateW + 10, cy + 4);
    }

    // E-field arrows between plates
    const arrowRows = Math.min(Math.floor(plateH / 25), 12);
    for (let i = 0; i < arrowRows; i++) {
      const ay = capCY - plateH / 2 + (plateH / (arrowRows + 1)) * (i + 1);
      const ax1 = leftPlateX + plateW + 8;
      const ax2 = rightPlateX - 8;

      // Animated arrow flow
      const offset = (time * 60) % 20;
      for (let ax = ax1 + offset; ax < ax2 - 5; ax += 20) {
        const alpha = 0.3 + 0.3 * Math.sin(time * 2 + i * 0.3);
        ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 10, ay);
        ctx.stroke();
        ctx.fillStyle = `rgba(251,191,36,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(ax + 13, ay);
        ctx.lineTo(ax + 9, ay - 3);
        ctx.lineTo(ax + 9, ay + 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    // E label
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("E", capCX, capCY - plateH / 2 - 12);

    // Wires
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftPlateX, capCY - plateH / 2);
    ctx.lineTo(leftPlateX - 40, capCY - plateH / 2);
    ctx.lineTo(leftPlateX - 40, capCY - plateH / 2 - 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightPlateX + plateW, capCY - plateH / 2);
    ctx.lineTo(rightPlateX + plateW + 40, capCY - plateH / 2);
    ctx.lineTo(rightPlateX + plateW + 40, capCY - plateH / 2 - 30);
    ctx.stroke();

    // Battery symbol
    const batX = capCX;
    const batY = capCY - plateH / 2 - 40;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftPlateX - 40, batY);
    ctx.lineTo(batX - 8, batY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightPlateX + plateW + 40, batY);
    ctx.lineTo(batX + 8, batY);
    ctx.stroke();
    // Battery lines
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(batX - 8, batY - 10);
    ctx.lineTo(batX - 8, batY + 10);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(batX + 8, batY - 15);
    ctx.lineTo(batX + 8, batY + 15);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${voltage}V`, batX, batY - 18);

    // --- Right: Info panel ---
    const panelX = W * 0.6;
    const panelW2 = W * 0.37;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(panelX, 15, panelW2, H - 30, 10);
    ctx.fill();

    let y = 40;
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CAPACITOR DATA", panelX + 15, y);
    y += 30;

    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(`C = ${(capacitance * 1e12).toFixed(2)} pF`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#ef4444";
    ctx.fillText(`Q = ${(charge * 1e9).toFixed(3)} nC`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`E = ${eField.toFixed(0)} V/m`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#22c55e";
    ctx.fillText(`U = ${(energy * 1e9).toFixed(3)} nJ`, panelX + 15, y);
    y += 22;

    ctx.fillStyle = "#a78bfa";
    ctx.fillText(`sigma = ${(sigmaDensity * 1e9).toFixed(3)} nC/m^2`, panelX + 15, y);
    y += 30;

    // Parameters
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`d = ${(separation * 1000).toFixed(1)} mm`, panelX + 15, y);
    y += 18;
    ctx.fillText(`A = ${(plateArea * 10000).toFixed(1)} cm^2`, panelX + 15, y);
    y += 18;
    ctx.fillText(`V = ${voltage} V`, panelX + 15, y);
    y += 18;
    ctx.fillText(`kappa = ${dielectric.toFixed(1)}`, panelX + 15, y);
    y += 30;

    // Bar: Capacitance
    const barW2 = panelW2 - 40;
    const maxC = dielectric * epsilon0 * 0.05 / 0.005;
    ctx.fillStyle = "#172554";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2 * Math.min(capacitance / maxC, 1), 12, 3);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText("C", panelX + 15 + barW2 + 5, y + 10);
    y += 20;

    // Bar: Energy
    const maxU = 0.5 * maxC * 500 * 500;
    ctx.fillStyle = "#052e16";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.roundRect(panelX + 15, y, barW2 * Math.min(energy / maxU, 1), 12, 3);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("U", panelX + 15 + barW2 + 5, y + 10);
  }, [separation, plateArea, voltage, dielectric, capacitance, charge, eField, energy, sigmaDensity]);

  const animate = useCallback(() => {
    timeRef.current += 0.016;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.5, 440);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Separation (mm)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={5} max={50} value={separation * 1000}
              onChange={(e) => setSeparation(Number(e.target.value) / 1000)}
              className="flex-1 accent-blue-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{(separation * 1000).toFixed(0)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Area (cm^2)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={10} max={500} value={plateArea * 10000}
              onChange={(e) => setPlateArea(Number(e.target.value) / 10000)}
              className="flex-1 accent-green-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{(plateArea * 10000).toFixed(0)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Voltage (V)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={10} max={500} step={10} value={voltage}
              onChange={(e) => setVoltage(Number(e.target.value))}
              className="flex-1 accent-yellow-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{voltage}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dielectric (kappa)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="range" min={1} max={10} step={0.1} value={dielectric}
              onChange={(e) => setDielectric(Number(e.target.value))}
              className="flex-1 accent-purple-500" />
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{dielectric.toFixed(1)}</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">C = kappa eps0 A/d</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">Q = CV</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E = V/d</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">U = 1/2 CV^2</div>
        </div>
      </div>
    </div>
  );
}
