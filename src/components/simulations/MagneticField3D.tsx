"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { getCanvasMousePos } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

type BFieldDir = "into" | "outof" | "right" | "up";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function mag3(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function scale3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

// Isometric projection: 3D -> 2D
function project(p: Vec3, cx: number, cy: number, scale: number): { sx: number; sy: number } {
  const sx = cx + (p.x - p.y * 0.5) * scale;
  const sy = cy + (-p.z + p.y * 0.35) * scale;
  return { sx, sy };
}

function getBFieldVec(dir: BFieldDir, strength: number): Vec3 {
  switch (dir) {
    case "into":
      return vec3(0, 0, -strength);
    case "outof":
      return vec3(0, 0, strength);
    case "right":
      return vec3(strength, 0, 0);
    case "up":
      return vec3(0, strength, 0);
  }
}

export default function MagneticField3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [bStrength, setBStrength] = useState(1.5);
  const [bDir, setBDir] = useState<BFieldDir>("into");
  const [chargeSign, setChargeSign] = useState<1 | -1>(1);
  const [mass, setMass] = useState(1.0);
  const [vx0, setVx0] = useState(3.0);
  const [vy0, setVy0] = useState(0.0);
  const [vz0, setVz0] = useState(0.0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasLaunched, setHasLaunched] = useState(false);

  // Cyclotron quiz state
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizResult, setQuizResult] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);

  // Field probes
  const [probes, setProbes] = useState<Array<{ pos: Vec3; bMag: number }>>([]);
  const [probeMode, setProbeMode] = useState(false);

  // Right-hand rule helper
  const [showRHR, setShowRHR] = useState(true);

  const posRef = useRef<Vec3>(vec3(0, 0, 0));
  const velRef = useRef<Vec3>(vec3(0, 0, 0));
  const trailRef = useRef<Vec3[]>([]);
  const timeRef = useRef(0);

  const init = useCallback(() => {
    posRef.current = vec3(-3, 0, 0);
    velRef.current = vec3(vx0, vy0, vz0);
    trailRef.current = [{ ...posRef.current }];
    timeRef.current = 0;
  }, [vx0, vy0, vz0]);

  useEffect(() => {
    init();
  }, [init]);

  const drawArrow3D = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      from: Vec3,
      to: Vec3,
      color: string,
      cx: number,
      cy: number,
      scale: number,
      lineWidth: number
    ) => {
      const p1 = project(from, cx, cy, scale);
      const p2 = project(to, cx, cy, scale);
      const dx = p2.sx - p1.sx;
      const dy = p2.sy - p1.sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      // Arrowhead
      const nx = dx / len;
      const ny = dy / len;
      const headLen = Math.min(10, len * 0.3);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p2.sx, p2.sy);
      ctx.lineTo(p2.sx - nx * headLen - ny * headLen * 0.4, p2.sy - ny * headLen + nx * headLen * 0.4);
      ctx.lineTo(p2.sx - nx * headLen + ny * headLen * 0.4, p2.sy - ny * headLen - nx * headLen * 0.4);
      ctx.closePath();
      ctx.fill();
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.5;
    const cy = H * 0.48;
    const scale = Math.min(W, H) * 0.08;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid on the xz-plane (y=0)
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let gx = -5; gx <= 5; gx++) {
      const p1 = project(vec3(gx, -5, 0), cx, cy, scale);
      const p2 = project(vec3(gx, 5, 0), cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }
    for (let gy = -5; gy <= 5; gy++) {
      const p1 = project(vec3(-5, gy, 0), cx, cy, scale);
      const p2 = project(vec3(5, gy, 0), cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }

    // Draw 3D axes
    const axisLen = 4.5;
    // X axis (red)
    drawArrow3D(ctx, vec3(-axisLen, 0, 0), vec3(axisLen, 0, 0), "rgba(239,68,68,0.5)", cx, cy, scale, 1.5);
    const xLbl = project(vec3(axisLen + 0.4, 0, 0), cx, cy, scale);
    ctx.fillStyle = "rgba(239,68,68,0.6)";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("x", xLbl.sx, xLbl.sy);

    // Y axis (green) - into screen
    drawArrow3D(ctx, vec3(0, -axisLen, 0), vec3(0, axisLen, 0), "rgba(34,197,94,0.5)", cx, cy, scale, 1.5);
    const yLbl = project(vec3(0, axisLen + 0.4, 0), cx, cy, scale);
    ctx.fillStyle = "rgba(34,197,94,0.6)";
    ctx.fillText("y", yLbl.sx, yLbl.sy);

    // Z axis (blue) - vertical
    drawArrow3D(ctx, vec3(0, 0, -axisLen), vec3(0, 0, axisLen), "rgba(59,130,246,0.5)", cx, cy, scale, 1.5);
    const zLbl = project(vec3(0, 0, axisLen + 0.4), cx, cy, scale);
    ctx.fillStyle = "rgba(59,130,246,0.6)";
    ctx.fillText("z", zLbl.sx, zLbl.sy);

    // B-field region (semi-transparent box outline)
    const bMin = vec3(-4, -3, -3);
    const bMax = vec3(4, 3, 3);
    const corners = [
      vec3(bMin.x, bMin.y, bMin.z),
      vec3(bMax.x, bMin.y, bMin.z),
      vec3(bMax.x, bMax.y, bMin.z),
      vec3(bMin.x, bMax.y, bMin.z),
      vec3(bMin.x, bMin.y, bMax.z),
      vec3(bMax.x, bMin.y, bMax.z),
      vec3(bMax.x, bMax.y, bMax.z),
      vec3(bMin.x, bMax.y, bMax.z),
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    ctx.strokeStyle = "rgba(59,130,246,0.15)";
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const pa = project(corners[a], cx, cy, scale);
      const pb = project(corners[b], cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    // B-field direction indicators inside the region
    const B = getBFieldVec(bDir, bStrength);
    const bMag = mag3(B);

    if (bMag > 0) {
      const bNorm = scale3(B, 1 / bMag);
      // Draw field arrows at grid points
      const step = 2;
      for (let gx = -2; gx <= 2; gx += step) {
        for (let gy = -2; gy <= 2; gy += step) {
          for (let gz = -2; gz <= 2; gz += step) {
            const origin = vec3(gx, gy, gz);

            if (bDir === "into" || bDir === "outof") {
              // For z-direction fields, draw symbols on xy-planes
              const proj = project(origin, cx, cy, scale);
              if (bDir === "into") {
                // X marks for into page (negative z)
                ctx.strokeStyle = "rgba(59,130,246,0.25)";
                ctx.lineWidth = 1.5;
                const s = 5;
                ctx.beginPath();
                ctx.moveTo(proj.sx - s, proj.sy - s);
                ctx.lineTo(proj.sx + s, proj.sy + s);
                ctx.moveTo(proj.sx + s, proj.sy - s);
                ctx.lineTo(proj.sx - s, proj.sy + s);
                ctx.stroke();
              } else {
                // Dots for out of page (positive z)
                ctx.fillStyle = "rgba(59,130,246,0.35)";
                ctx.beginPath();
                ctx.arc(proj.sx, proj.sy, 3, 0, Math.PI * 2);
                ctx.fill();
              }
            } else {
              // For x or y direction fields, draw small arrows
              const arrowLen = 0.6;
              const tip = add3(origin, scale3(bNorm, arrowLen));
              drawArrow3D(ctx, origin, tip, "rgba(59,130,246,0.3)", cx, cy, scale, 1.5);
            }
          }
        }
      }
    }

    // Trail
    const trail = trailRef.current;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.7;
        const hue = chargeSign > 0 ? "239,68,68" : "96,165,250";
        ctx.strokeStyle = `rgba(${hue},${alpha})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = chargeSign > 0 ? "rgba(239,68,68,0.3)" : "rgba(96,165,250,0.3)";
        ctx.shadowBlur = 6;
        const p1 = project(trail[i - 1], cx, cy, scale);
        const p2 = project(trail[i], cx, cy, scale);
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Particle
    const pos = posRef.current;
    const vel = velRef.current;
    const pp = project(pos, cx, cy, scale);

    // Particle glow
    const glowBase = chargeSign > 0 ? "239,68,68" : "96,165,250";
    const glow = ctx.createRadialGradient(pp.sx, pp.sy, 0, pp.sx, pp.sy, 35);
    glow.addColorStop(0, `rgba(${glowBase},0.45)`);
    glow.addColorStop(0.5, `rgba(${glowBase},0.12)`);
    glow.addColorStop(1, `rgba(${glowBase},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pp.sx, pp.sy, 35, 0, Math.PI * 2);
    ctx.fill();

    // Particle body
    const pColor = chargeSign > 0 ? "#ef4444" : "#60a5fa";
    const pHighlight = chargeSign > 0 ? "#fca5a5" : "#93c5fd";
    ctx.fillStyle = pColor;
    ctx.beginPath();
    ctx.arc(pp.sx, pp.sy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pHighlight;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Charge label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(chargeSign > 0 ? "+" : "\u2212", pp.sx, pp.sy + 1);

    // Velocity vector (green)
    const vMag = mag3(vel);
    if (vMag > 0.01) {
      const vTip = add3(pos, scale3(vel, 0.6));
      drawArrow3D(ctx, pos, vTip, "#22c55e", cx, cy, scale, 2.5);
      const vLblP = project(vTip, cx, cy, scale);
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "left";
      ctx.fillText("v", vLblP.sx + 6, vLblP.sy);
    }

    // Lorentz force vector (yellow)
    const BVec = getBFieldVec(bDir, bStrength);
    const qvB = cross(vel, BVec);
    const F = scale3(qvB, chargeSign);
    const fMag = mag3(F);
    if (fMag > 0.01 && hasLaunched) {
      const fScale = 0.3 / Math.max(fMag, 0.5);
      const fTip = add3(pos, scale3(F, fScale * 2));
      drawArrow3D(ctx, pos, fTip, "#fbbf24", cx, cy, scale, 2.5);
      const fLblP = project(fTip, cx, cy, scale);
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "left";
      ctx.fillText("F", fLblP.sx + 6, fLblP.sy);
    }

    // B-field vector from particle (blue)
    if (bMag > 0) {
      const bArrowScale = 0.4;
      const bTip = add3(pos, scale3(BVec, bArrowScale / Math.max(bMag, 0.5)));
      drawArrow3D(ctx, pos, bTip, "#3b82f6", cx, cy, scale, 2);
      const bLblP = project(bTip, cx, cy, scale);
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "#3b82f6";
      ctx.textAlign = "left";
      ctx.fillText("B", bLblP.sx + 6, bLblP.sy);
    }

    // Draw field probes
    for (const probe of probes) {
      const pp2 = project(probe.pos, cx, cy, scale);
      // Probe marker
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pp2.sx, pp2.sy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pp2.sx - 4, pp2.sy);
      ctx.lineTo(pp2.sx + 4, pp2.sy);
      ctx.moveTo(pp2.sx, pp2.sy - 4);
      ctx.lineTo(pp2.sx, pp2.sy + 4);
      ctx.stroke();

      // B measurement label
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText(`|B|=${probe.bMag.toFixed(2)}T`, pp2.sx, pp2.sy - 12);
    }

    // Right-hand rule diagram (top-left corner)
    if (!showRHR) {
      // Skip RHR if toggled off - still need to declare vars
    }
    const rhrX = 20;
    const rhrY = 18;
    const rhrW = 145;
    const rhrH = showRHR ? 115 : 95;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(rhrX, rhrY, rhrW, rhrH, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("VECTOR DIAGRAM", rhrX + 10, rhrY + 8);

    // Right-hand rule text helper
    if (showRHR) {
      ctx.font = "8px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("Right-hand rule:", rhrX + 10, rhrH + rhrY - 24);
      ctx.fillStyle = "#22c55e";
      ctx.fillText("fingers \u2192 v", rhrX + 10, rhrH + rhrY - 14);
      ctx.fillStyle = "#3b82f6";
      ctx.fillText("curl \u2192 B", rhrX + 65, rhrH + rhrY - 14);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("thumb \u2192 F(+q)", rhrX + 10, rhrH + rhrY - 4);
    }

    // Small vector diagram inside the box
    const dCx = rhrX + rhrW * 0.45;
    const dCy = rhrY + rhrH * 0.58;
    const dScale = 22;

    // v direction (green)
    if (vMag > 0.01) {
      const vn = scale3(vel, 1 / vMag);
      const dvEnd = project(scale3(vn, 1), dCx, dCy, dScale);
      const dvStart = project(vec3(0, 0, 0), dCx, dCy, dScale);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dvStart.sx, dvStart.sy);
      ctx.lineTo(dvEnd.sx, dvEnd.sy);
      ctx.stroke();
      ctx.font = "9px system-ui";
      ctx.fillStyle = "#22c55e";
      ctx.fillText("v", dvEnd.sx + 3, dvEnd.sy - 2);
    }

    // B direction (blue)
    if (bMag > 0) {
      const bn = scale3(BVec, 1 / bMag);
      const dbEnd = project(scale3(bn, 1), dCx, dCy, dScale);
      const dbStart = project(vec3(0, 0, 0), dCx, dCy, dScale);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dbStart.sx, dbStart.sy);
      ctx.lineTo(dbEnd.sx, dbEnd.sy);
      ctx.stroke();
      ctx.font = "9px system-ui";
      ctx.fillStyle = "#3b82f6";
      ctx.fillText("B", dbEnd.sx + 3, dbEnd.sy - 2);
    }

    // F direction (yellow)
    if (fMag > 0.01 && hasLaunched) {
      const fn = scale3(F, 1 / fMag);
      const dfEnd = project(scale3(fn, 1), dCx, dCy, dScale);
      const dfStart = project(vec3(0, 0, 0), dCx, dCy, dScale);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dfStart.sx, dfStart.sy);
      ctx.lineTo(dfEnd.sx, dfEnd.sy);
      ctx.stroke();
      ctx.font = "9px system-ui";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("F", dfEnd.sx + 3, dfEnd.sy - 2);
    }

    // Info panel (bottom-left)
    const speed = vMag;
    const vPerp = (() => {
      if (bMag < 0.001) return speed;
      const bNorm2 = scale3(BVec, 1 / bMag);
      const vDotB = vel.x * bNorm2.x + vel.y * bNorm2.y + vel.z * bNorm2.z;
      const vParallel = scale3(bNorm2, vDotB);
      const vPerpVec = { x: vel.x - vParallel.x, y: vel.y - vParallel.y, z: vel.z - vParallel.z };
      return mag3(vPerpVec);
    })();

    const q = Math.abs(chargeSign);
    const radius = bMag > 0.001 ? (mass * vPerp) / (q * bMag) : Infinity;
    const period = bMag > 0.001 ? (2 * Math.PI * mass) / (q * bMag) : Infinity;
    const omega = bMag > 0.001 ? (q * bMag) / mass : 0;

    const infoX = 12;
    const infoY = H - 130;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(infoX, infoY, 240, 118, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CYCLOTRON DATA", infoX + 10, infoY + 8);

    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`r = mv\u22A5/(|q|B) = ${radius < 1000 ? radius.toFixed(2) : "\u221E"}`, infoX + 10, infoY + 26);
    ctx.fillText(`T = 2\u03C0m/(|q|B) = ${period < 1000 ? period.toFixed(2) : "\u221E"}`, infoX + 10, infoY + 42);
    ctx.fillText(`\u03C9 = |q|B/m = ${omega.toFixed(2)} rad/s`, infoX + 10, infoY + 58);
    ctx.fillText(`|v| = ${speed.toFixed(2)} m/s`, infoX + 10, infoY + 74);
    ctx.fillText(`|F| = ${fMag.toFixed(3)} N`, infoX + 10, infoY + 90);
    ctx.fillText(`t = ${timeRef.current.toFixed(2)} s`, infoX + 10, infoY + 106);

    // Position info (bottom-right)
    const posInfoX = W - 200;
    const posInfoY = H - 82;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(posInfoX, posInfoY, 188, 70, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("POSITION & VELOCITY", posInfoX + 10, posInfoY + 8);
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(
      `pos (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`,
      posInfoX + 10,
      posInfoY + 26
    );
    ctx.fillText(
      `vel (${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)})`,
      posInfoX + 10,
      posInfoY + 44
    );

    // Legend (top-right)
    const legendX = W - 165;
    const legendY = 18;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(legendX, legendY, 150, 65, 8);
    ctx.fill();
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#22c55e";
    ctx.fillText("\u2014 velocity (v)", legendX + 12, legendY + 16);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("\u2014 magnetic field (B)", legendX + 12, legendY + 33);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("\u2014 Lorentz force (F)", legendX + 12, legendY + 50);
  }, [bStrength, bDir, chargeSign, mass, hasLaunched, drawArrow3D]);

  const animate = useCallback(() => {
    const dt = 0.004;
    const substeps = 4;
    const subDt = dt / substeps;
    const B = getBFieldVec(bDir, bStrength);
    const q = chargeSign;
    const m = mass;

    const pos = posRef.current;
    const vel = velRef.current;

    for (let s = 0; s < substeps; s++) {
      // Boris integrator for magnetic fields (excellent energy conservation)
      // Half-step: no electric field, so skip E half-acceleration
      // t = (q * B / m) * dt/2
      const tFactor = (q / m) * subDt * 0.5;
      const tx = B.x * tFactor;
      const ty = B.y * tFactor;
      const tz = B.z * tFactor;

      // v- = v(n) (no electric field contribution)
      const vmx = vel.x;
      const vmy = vel.y;
      const vmz = vel.z;

      // v' = v- + v- x t
      const vpx = vmx + (vmy * tz - vmz * ty);
      const vpy = vmy + (vmz * tx - vmx * tz);
      const vpz = vmz + (vmx * ty - vmy * tx);

      // s = 2t / (1 + |t|^2)
      const tMag2 = tx * tx + ty * ty + tz * tz;
      const sFactor = 2.0 / (1.0 + tMag2);
      const sx = vpx * sFactor;
      const sy = vpy * sFactor;
      const sz = vpz * sFactor;

      // v+ = v- + v' x s
      vel.x = vmx + (sy * tz - sz * ty);
      vel.y = vmy + (sz * tx - sx * tz);
      vel.z = vmz + (sx * ty - sy * tx);

      // Update position
      pos.x += vel.x * subDt;
      pos.y += vel.y * subDt;
      pos.z += vel.z * subDt;
    }

    timeRef.current += dt;

    trailRef.current.push({ x: pos.x, y: pos.y, z: pos.z });
    if (trailRef.current.length > 1200) trailRef.current.shift();

    draw();

    // Stop if particle goes too far
    if (Math.abs(pos.x) > 15 || Math.abs(pos.y) > 15 || Math.abs(pos.z) > 15) {
      setIsRunning(false);
      return;
    }

    animRef.current = requestAnimationFrame(animate);
  }, [bStrength, bDir, chargeSign, mass, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.6), _isMobile ? 500 : 540);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => {
    if (isRunning) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Handle canvas click for probes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !probeMode) return;
    const handleClick = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      // Convert 2D click to approximate 3D position (on z=0 plane)
      const W = canvas.width;
      const H = canvas.height;
      const cx2 = W * 0.5;
      const cy2 = H * 0.48;
      const s = Math.min(W, H) * 0.08;
      // Simplified inverse projection (approximate)
      const dx = pos.x - cx2;
      const dy = pos.y - cy2;
      const approxX = dx / s;
      const approxY = -dy / s;
      const probePos = vec3(approxX, 0, approxY);
      const B = getBFieldVec(bDir, bStrength);
      setProbes(prev => [...prev, { pos: probePos, bMag: mag3(B) }]);
      playSFX("click");
    };
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [probeMode, bDir, bStrength]);

  const launch = () => {
    init();
    setHasLaunched(true);
    setIsRunning(true);
    playSFX("launch");
  };

  const reset = () => {
    setIsRunning(false);
    setHasLaunched(false);
    init();
    draw();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* B-field controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            B-Field Strength
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={bStrength}
              onChange={(e) => setBStrength(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">
              {bStrength.toFixed(1)} T
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            B-Field Direction
          </label>
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {(["into", "outof", "right", "up"] as BFieldDir[]).map((d) => {
              const labels: Record<BFieldDir, string> = {
                into: "\u2297 Into",
                outof: "\u2299 Out",
                right: "\u2192 Right",
                up: "\u2191 Up",
              };
              return (
                <button
                  key={d}
                  onClick={() => setBDir(d)}
                  className={`h-7 rounded text-xs font-medium transition-colors ${
                    bDir === d
                      ? "bg-blue-600 text-white"
                      : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {labels[d]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Charge Sign
          </label>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setChargeSign(1)}
              className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors ${
                chargeSign > 0
                  ? "bg-red-500 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              + Positive
            </button>
            <button
              onClick={() => setChargeSign(-1)}
              className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors ${
                chargeSign < 0
                  ? "bg-blue-500 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              &minus; Negative
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mass
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.2}
              value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {mass.toFixed(1)} kg
            </span>
          </div>
        </div>
      </div>

      {/* Velocity controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            v<sub>x</sub> (horizontal)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={-5}
              max={5}
              step={0.5}
              value={vx0}
              onChange={(e) => setVx0(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {vx0.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            v<sub>y</sub> (into screen)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={-5}
              max={5}
              step={0.5}
              value={vy0}
              onChange={(e) => setVy0(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {vy0.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            v<sub>z</sub> (vertical)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={-5}
              max={5}
              step={0.5}
              value={vz0}
              onChange={(e) => setVz0(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {vz0.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={launch}
            className="flex-1 h-10 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors"
          >
            Launch
          </button>
          <button
            onClick={() => {
              if (hasLaunched) setIsRunning(!isRunning);
            }}
            disabled={!hasLaunched}
            className={`h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
              hasLaunched
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Tools row: probe mode, RHR toggle, quiz */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Tools
          </label>
          <div className="flex flex-col gap-1.5 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={probeMode}
                onChange={(e) => setProbeMode(e.target.checked)}
                className="accent-amber-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Field Probe (click canvas)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showRHR}
                onChange={(e) => setShowRHR(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">Right-Hand Rule Helper</span>
            </label>
            {probes.length > 0 && (
              <button
                onClick={() => setProbes([])}
                className="text-xs text-red-500 hover:text-red-400 text-left"
              >
                Clear probes ({probes.length})
              </button>
            )}
          </div>
        </div>

        {/* Cyclotron Radius Quiz */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-amber-500 uppercase tracking-wider">
            Predict Cyclotron Radius
          </label>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
            r = mv/(|q|B) with m={mass.toFixed(1)}, v={Math.sqrt(vx0*vx0+vy0*vy0+vz0*vz0).toFixed(1)}, B={bStrength.toFixed(1)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              step={0.1}
              value={quizAnswer}
              onChange={(e) => setQuizAnswer(e.target.value)}
              placeholder="r = ?"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={() => {
                const vPerp2 = Math.sqrt(vx0*vx0 + vy0*vy0 + vz0*vz0);
                const actual = mass * vPerp2 / (1 * bStrength);
                const predicted = Number(quizAnswer);
                const error = Math.abs(predicted - actual);
                const relErr = actual > 0 ? error / actual : error;
                let pts = 0;
                if (relErr < 0.05) { pts = 3; playSFX("success"); }
                else if (relErr < 0.15) { pts = 2; playSFX("correct"); }
                else if (relErr < 0.3) { pts = 1; playSFX("correct"); }
                else { playSFX("incorrect"); }
                playScore(pts);
                setQuizScore(prev => prev + pts);
                setQuizResult(`Actual: ${actual.toFixed(2)} | Error: ${(relErr*100).toFixed(1)}% | +${pts}pts`);
              }}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
            >
              Check
            </button>
          </div>
          {quizResult && (
            <p className="text-xs mt-1 font-mono text-gray-600 dark:text-gray-400">{quizResult}</p>
          )}
        </div>

        {/* Quiz Score */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Quiz Score
          </label>
          <div className="text-2xl font-mono font-bold text-amber-500 mt-2">
            {quizScore}
            <span className="text-sm text-gray-400 ml-1">pts</span>
          </div>
        </div>
      </div>

      {/* Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\vec{F} = q\vec{v} \times \vec{B}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="r = \frac{mv_\perp}{|q|B}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Launch charged particles through the magnetic field. Use the right-hand rule to predict the force direction!</p>
    </div>
  );
}
