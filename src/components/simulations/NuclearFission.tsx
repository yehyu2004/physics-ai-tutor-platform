"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface Neutron { x: number; y: number; vx: number; vy: number; age: number; }
interface Fragment { x: number; y: number; vx: number; vy: number; r: number; color: string; age: number; }
interface Nucleus { x: number; y: number; split: boolean; }

export default function NuclearFission() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [enrichment, setEnrichment] = useState(0.5);

  const neutronsRef = useRef<Neutron[]>([]);
  const fragmentsRef = useRef<Fragment[]>([]);
  const nucleiRef = useRef<Nucleus[]>([]);
  const statsRef = useRef({ fissions: 0, generation: 0 });

  const initNuclei = useCallback(() => {
    const nuclei: Nucleus[] = [];
    for (let i = 0; i < 60; i++) {
      nuclei.push({
        x: 0.1 + Math.random() * 0.8,
        y: 0.1 + Math.random() * 0.8,
        split: false,
      });
    }
    nucleiRef.current = nuclei;
    neutronsRef.current = [];
    fragmentsRef.current = [];
    statsRef.current = { fissions: 0, generation: 0 };
  }, []);

  useEffect(() => { initNuclei(); }, [initNuclei]);

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

    const nuclei = nucleiRef.current;
    const neutrons = neutronsRef.current;
    const fragments = fragmentsRef.current;

    // Draw nuclei
    for (const nuc of nuclei) {
      if (nuc.split) continue;
      const nx = nuc.x * W;
      const ny = nuc.y * H;

      // Nucleus glow
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 18);
      glow.addColorStop(0, "rgba(34,197,94,0.3)");
      glow.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, 18, 0, Math.PI * 2);
      ctx.fill();

      // Nucleus
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 7px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("U", nx, ny);
    }

    // Draw fragments
    for (const frag of fragments) {
      const fx = frag.x * W;
      const fy = frag.y * H;
      const alpha = Math.max(0, 1 - frag.age / 3);

      ctx.fillStyle = frag.color.replace("1)", `${alpha})`);
      ctx.beginPath();
      ctx.arc(fx, fy, frag.r * (1 - frag.age * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw neutrons
    for (const n of neutrons) {
      const nx = n.x * W;
      const ny = n.y * H;

      // Neutron glow
      ctx.fillStyle = "rgba(251,191,36,0.3)";
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI * 2);
      ctx.fill();

      // Neutron
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stats
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 180, 70, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText("CHAIN REACTION", 22, 28);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Fissions: ${statsRef.current.fissions}`, 22, 46);
    ctx.fillText(`Neutrons: ${neutrons.length}`, 22, 62);
    ctx.fillText(`Remaining: ${nuclei.filter((n) => !n.split).length}`, 22, 78);

    // Instructions
    if (neutrons.length === 0 && !isRunning) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Click \"Fire Neutron\" to start the chain reaction", W / 2, H - 30);
    }
  }, [isRunning]);

  const animate = useCallback(() => {
    const dt = 0.016;
    const neutrons = neutronsRef.current;
    const nuclei = nucleiRef.current;
    const fragments = fragmentsRef.current;

    // Update neutrons
    for (const n of neutrons) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.age += dt;
    }

    // Update fragments
    for (const f of fragments) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.age += dt;
    }

    // Check neutron-nucleus collisions
    const newNeutrons: Neutron[] = [];
    for (const neutron of neutrons) {
      for (const nuc of nuclei) {
        if (nuc.split) continue;
        const dx = neutron.x - nuc.x;
        const dy = neutron.y - nuc.y;
        if (dx * dx + dy * dy < 0.0008) {
          // Fission!
          if (Math.random() < enrichment) {
            nuc.split = true;
            statsRef.current.fissions++;

            // Release 2-3 neutrons
            const numNew = 2 + (Math.random() > 0.5 ? 1 : 0);
            for (let i = 0; i < numNew; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 0.3 + Math.random() * 0.4;
              newNeutrons.push({
                x: nuc.x,
                y: nuc.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                age: 0,
              });
            }

            // Create fragments
            const fragAngle = Math.random() * Math.PI * 2;
            fragments.push(
              { x: nuc.x, y: nuc.y, vx: Math.cos(fragAngle) * 0.15, vy: Math.sin(fragAngle) * 0.15, r: 5, color: "rgba(239,68,68,1)", age: 0 },
              { x: nuc.x, y: nuc.y, vx: -Math.cos(fragAngle) * 0.15, vy: -Math.sin(fragAngle) * 0.15, r: 4, color: "rgba(168,85,247,1)", age: 0 }
            );
          }
        }
      }
    }

    neutronsRef.current = [
      ...neutrons.filter((n) => n.x > -0.1 && n.x < 1.1 && n.y > -0.1 && n.y < 1.1 && n.age < 5),
      ...newNeutrons,
    ];
    fragmentsRef.current = fragments.filter((f) => f.age < 3);

    draw();

    if (neutronsRef.current.length > 0 || fragmentsRef.current.length > 0) {
      animRef.current = requestAnimationFrame(animate);
    } else {
      setIsRunning(false);
    }
  }, [enrichment, draw]);

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

  useEffect(() => {
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  const fireNeutron = () => {
    neutronsRef.current.push({
      x: 0.02,
      y: 0.5,
      vx: 0.5,
      vy: (Math.random() - 0.5) * 0.2,
      age: 0,
    });
    setIsRunning(true);
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    initNuclei();
    setIsRunning(false);
    setTimeout(() => draw(), 50);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fission Probability</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.1} max={1} step={0.05} value={enrichment}
              onChange={(e) => { setEnrichment(Number(e.target.value)); reset(); }}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{(enrichment * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={fireNeutron}
            className="w-full h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors">
            Fire Neutron
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button onClick={reset}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
            Reset
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Nuclear Fission</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">²³⁵U + n → fragments + 2-3n</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">E ≈ 200 MeV per fission</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">k &gt; 1: supercritical</div>
        </div>
      </div>
    </div>
  );
}
