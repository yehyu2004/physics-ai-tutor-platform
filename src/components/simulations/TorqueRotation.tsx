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
import { drawArrow } from "@/lib/simulation/drawing";
import { createDragHandler, getCanvasMousePos } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

type GameMode = "sandbox" | "balance_beam" | "target_alpha";

interface BeamWeight {
  id: number;
  position: number; // -1 to 1, 0 is center
  mass: number;
}

interface AppliedForce {
  id: number;
  radiusFraction: number; // 0 to 1 (fraction of disc radius)
  angleDeg: number; // 0-360, where the force is applied on the rim
  magnitude: number;
  direction: number; // 1 = CW, -1 = CCW
  color: string;
}

export default function TorqueRotation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [appliedForce, setAppliedForce] = useState(20);
  const [radius, setRadius] = useState(100);
  const [momentOfInertia, setMomentOfInertia] = useState(50);
  const [friction, setFriction] = useState(0.5);
  const [isRunning, setIsRunning] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>("sandbox");

  const angleRef = useRef(0);
  const angVelRef = useRef(0);
  const timeRef = useRef(0);
  const particlesRef = useRef(new ParticleSystem());
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);

  // Drag force application
  const isDraggingForceRef = useRef(false);
  const dragForcePointRef = useRef({ radiusFraction: 1.0, angle: -Math.PI / 2 });

  // Multiple forces mode
  const [forces, setForces] = useState<AppliedForce[]>([]);
  const nextForceIdRef = useRef(1);

  // Balance beam mode
  const [beamWeights, setBeamWeights] = useState<BeamWeight[]>([]);
  const nextWeightIdRef = useRef(1);
  const beamAngleRef = useRef(0);
  const beamAngVelRef = useRef(0);
  const beamLengthM = 4; // 4 meters long beam
  const beamBalancedRef = useRef(false);
  const beamTimerRef = useRef(0);

  // Target alpha challenge
  const targetAlphaRef = useRef(0.5);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.4;
    const cy = H * 0.5;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    if (gameMode === "balance_beam") {
      // --- BALANCE BEAM MODE ---
      const beamCx = W * 0.5;
      const beamCy = H * 0.45;
      const beamPixelLen = Math.min(W * 0.7, 500);
      const beamAngle = beamAngleRef.current;

      // Fulcrum triangle
      ctx.fillStyle = "#475569";
      ctx.beginPath();
      ctx.moveTo(beamCx, beamCy + 10);
      ctx.lineTo(beamCx - 20, beamCy + 50);
      ctx.lineTo(beamCx + 20, beamCy + 50);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Ground line
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(beamCx - beamPixelLen * 0.6, beamCy + 50);
      ctx.lineTo(beamCx + beamPixelLen * 0.6, beamCy + 50);
      ctx.stroke();

      // Beam
      ctx.save();
      ctx.translate(beamCx, beamCy);
      ctx.rotate(beamAngle);

      // Beam body
      const beamH = 12;
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.roundRect(-beamPixelLen / 2, -beamH / 2, beamPixelLen, beamH, 3);
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Tick marks
      for (let p = -1; p <= 1; p += 0.25) {
        const px = p * (beamPixelLen / 2);
        const tickH = p === 0 ? 12 : 6;
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, -beamH / 2 - tickH);
        ctx.lineTo(px, -beamH / 2);
        ctx.stroke();

        // Label
        if (Math.abs(p) > 0.01) {
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.font = "8px ui-monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${(p * beamLengthM / 2).toFixed(1)}m`, px, -beamH / 2 - tickH - 4);
        }
      }

      // Draw weights on beam
      for (const w of beamWeights) {
        const wx = w.position * (beamPixelLen / 2);
        const wSize = 10 + w.mass * 2;

        // Weight shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.roundRect(wx - wSize / 2 + 2, -beamH / 2 - wSize - 4 + 2, wSize, wSize, 3);
        ctx.fill();

        // Weight body
        const wColor = w.position < 0 ? "#ef4444" : "#3b82f6";
        ctx.fillStyle = wColor;
        ctx.beginPath();
        ctx.roundRect(wx - wSize / 2, -beamH / 2 - wSize - 4, wSize, wSize, 3);
        ctx.fill();
        ctx.strokeStyle = w.position < 0 ? "#fca5a5" : "#93c5fd";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Mass label
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9px ui-monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${w.mass}`, wx, -beamH / 2 - wSize / 2 - 4);
        ctx.textBaseline = "alphabetic";

        // Gravity arrow
        ctx.strokeStyle = "rgba(239,68,68,0.5)";
        ctx.lineWidth = 1.5;
        const arrowLen = w.mass * 4;
        ctx.beginPath();
        ctx.moveTo(wx, beamH / 2 + 4);
        ctx.lineTo(wx, beamH / 2 + 4 + arrowLen);
        ctx.stroke();
        ctx.fillStyle = "rgba(239,68,68,0.5)";
        ctx.beginPath();
        ctx.moveTo(wx, beamH / 2 + 4 + arrowLen + 4);
        ctx.lineTo(wx - 3, beamH / 2 + 4 + arrowLen);
        ctx.lineTo(wx + 3, beamH / 2 + 4 + arrowLen);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      // Balance indicator
      const totalTorque = beamWeights.reduce((sum, w) => {
        return sum + w.mass * w.position * (beamLengthM / 2) * 9.81;
      }, 0);

      const isBalanced = Math.abs(totalTorque) < 0.5 && Math.abs(beamAngle) < 0.02;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(12, 12, 220, 100, 8);
      ctx.fill();

      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("BALANCE THE BEAM", 22, 28);

      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Net torque: ${totalTorque.toFixed(2)} N·m`, 22, 48);
      ctx.fillText(`Beam angle: ${(beamAngle * 180 / Math.PI).toFixed(1)}°`, 22, 64);
      ctx.fillText(`Weights: ${beamWeights.length}`, 22, 80);

      ctx.fillStyle = isBalanced ? "#22c55e" : "#f59e0b";
      ctx.font = "bold 12px ui-monospace";
      ctx.fillText(isBalanced ? "BALANCED!" : "Unbalanced", 22, 100);

      // Instructions
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Click on the beam to place weights, right-click to remove", W / 2, H - 20);
    } else {
      // --- DISC MODE (sandbox or target_alpha) ---
      const R = Math.min(radius, Math.min(W * 0.3, H * 0.38));
      const theta = angleRef.current;

      // Disc
      const discGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      discGrad.addColorStop(0, "#334155");
      discGrad.addColorStop(0.8, "#1e293b");
      discGrad.addColorStop(1, "#475569");
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Spokes
      for (let i = 0; i < 6; i++) {
        const angle = theta + (i / 6) * Math.PI * 2;
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
        ctx.stroke();
      }

      // Concentric rings for radius guide (when dragging)
      if (isDraggingForceRef.current) {
        for (let r = 0.25; r <= 1; r += 0.25) {
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.arc(cx, cy, r * R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.font = "8px ui-monospace";
          ctx.textAlign = "left";
          ctx.fillText(`${(r * radius / 100).toFixed(1)}m`, cx + r * R + 4, cy);
        }
      }

      // Reference mark on rim
      const markAngle = theta;
      const markX = cx + Math.cos(markAngle) * R;
      const markY = cy + Math.sin(markAngle) * R;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(markX, markY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Center axle
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();

      if (forces.length > 0) {
        // --- Multiple forces mode ---
        for (const f of forces) {
          const fAngle = theta + (f.angleDeg * Math.PI / 180);
          const fR = f.radiusFraction * R;
          const fpx = cx + Math.cos(fAngle) * fR;
          const fpy = cy + Math.sin(fAngle) * fR;

          // Force direction (tangent)
          const ftx = -Math.sin(fAngle) * f.direction;
          const fty = Math.cos(fAngle) * f.direction;
          const fScale = f.magnitude * 1.5;

          // Force application point
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(fpx, fpy, 5, 0, Math.PI * 2);
          ctx.fill();

          // Force arrow
          drawArrow(ctx, fpx, fpy, ftx * fScale, fty * fScale, f.color, {
            lineWidth: 2.5,
            label: `${f.magnitude.toFixed(0)}N`,
          });

          // Radius line
          ctx.strokeStyle = `${f.color}44`;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(fpx, fpy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // --- Single force with drag ---
        const forceAngle = theta + dragForcePointRef.current.angle;
        const forceR = dragForcePointRef.current.radiusFraction * R;
        const fpx = cx + Math.cos(forceAngle) * forceR;
        const fpy = cy + Math.sin(forceAngle) * forceR;
        const fScale = appliedForce * 1.5;

        // Force direction (tangent = perpendicular to radius)
        const ftx = -Math.sin(forceAngle);
        const fty = Math.cos(forceAngle);

        // Force application point highlight
        ctx.fillStyle = isDraggingForceRef.current ? "#fbbf24" : "#22c55e";
        ctx.beginPath();
        ctx.arc(fpx, fpy, isDraggingForceRef.current ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();

        // Force arrow
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fpx, fpy);
        ctx.lineTo(fpx + ftx * fScale, fpy + fty * fScale);
        ctx.stroke();
        // Arrow head
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(fpx + ftx * fScale, fpy + fty * fScale);
        ctx.lineTo(fpx + ftx * (fScale - 10) - fty * 5, fpy + fty * (fScale - 10) + ftx * 5);
        ctx.lineTo(fpx + ftx * (fScale - 10) + fty * 5, fpy + fty * (fScale - 10) - ftx * 5);
        ctx.closePath();
        ctx.fill();
        ctx.font = "12px system-ui";
        ctx.fillStyle = "#22c55e";
        ctx.textAlign = "left";
        ctx.fillText("F", fpx + ftx * fScale + 8, fpy + fty * fScale);

        // Radius arrow
        ctx.strokeStyle = "rgba(251,191,36,0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(fpx, fpy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "11px system-ui";
        ctx.textAlign = "center";
        const rmx = (cx + fpx) / 2;
        const rmy = (cy + fpy) / 2;
        ctx.fillText(`r=${(dragForcePointRef.current.radiusFraction * radius / 100).toFixed(2)}m`, rmx + Math.sin(forceAngle) * 15, rmy - Math.cos(forceAngle) * 15);
      }

      // Angular velocity arc arrow
      if (Math.abs(angVelRef.current) > 0.01) {
        const arcR = R + 20;
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 2;
        const arcLen = Math.min(Math.abs(angVelRef.current) * 0.5, 1.5);
        const startA = theta - arcLen;
        const endA = theta;
        if (angVelRef.current > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, arcR, startA, endA);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, arcR, endA, startA, true);
          ctx.stroke();
        }
        ctx.fillStyle = "#a855f7";
        ctx.font = "11px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(
          `omega = ${angVelRef.current.toFixed(2)} rad/s`,
          cx + arcR + 5,
          cy - arcR + 30
        );
      }

      // Drag hint
      if (!isDraggingForceRef.current && forces.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "10px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Drag the green dot to change force application point", cx, cy + R + 40);
      }

      // Info panel
      const effectiveR = forces.length > 0
        ? 1.0
        : dragForcePointRef.current.radiusFraction * (radius / 100);
      const effectiveForce = forces.length > 0 ? 0 : appliedForce;
      const torque = forces.length > 0
        ? forces.reduce((sum, f) => {
            return sum + f.magnitude * f.radiusFraction * (radius / 100) * f.direction;
          }, 0)
        : effectiveForce * effectiveR;
      const alpha = torque / momentOfInertia;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(W - 220, 12, 208, 125, 8);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("ROTATION DATA", W - 208, 28);
      ctx.font = "12px ui-monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`tau = ${torque.toFixed(2)} N*m`, W - 208, 48);
      ctx.fillText(`I = ${momentOfInertia} kg*m^2`, W - 208, 64);
      ctx.fillText(`alpha = tau/I = ${alpha.toFixed(3)} rad/s^2`, W - 208, 80);
      ctx.fillText(`omega = ${angVelRef.current.toFixed(2)} rad/s`, W - 208, 96);
      ctx.fillText(`theta = ${((angleRef.current * 180) / Math.PI % 360).toFixed(0)} deg`, W - 208, 112);
      if (forces.length > 0) {
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`Forces: ${forces.length}`, W - 208, 128);
      }

      // Target alpha display
      if (gameMode === "target_alpha" && challengeRef.current.active) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.roundRect(W - 220, 145, 208, 40, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(245,158,11,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = "bold 11px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`TARGET: alpha = ${targetAlphaRef.current.toFixed(3)} rad/s^2`, W - 208, 165);
        const diff = Math.abs(alpha - targetAlphaRef.current);
        ctx.fillStyle = diff < 0.01 ? "#22c55e" : diff < 0.05 ? "#f59e0b" : "#ef4444";
        ctx.font = "10px ui-monospace";
        ctx.fillText(`diff = ${diff.toFixed(4)}`, W - 208, 180);
      }
    }

    // Draw particles
    particlesRef.current.draw(ctx);

    // Challenge scoreboard
    if (challengeRef.current.active) {
      renderScoreboard(ctx, 12, H - 140, 160, 120, challengeRef.current);
    }

    // Score popups
    const now = performance.now();
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));
  }, [appliedForce, radius, momentOfInertia, gameMode, forces, beamWeights]);

  const animate = useCallback(() => {
    const dt = 0.02;
    timeRef.current += dt;

    if (gameMode === "balance_beam") {
      // Beam physics: torques from weights cause rotation around fulcrum
      const g = 9.81;
      const beamI = 10; // moment of inertia of beam
      let netTorque = 0;
      for (const w of beamWeights) {
        // Torque = m * g * d * cos(angle)
        const d = w.position * (beamLengthM / 2);
        netTorque += w.mass * g * d * Math.cos(beamAngleRef.current);
      }
      // Add friction
      const frictionTorque = 2.0 * beamAngVelRef.current;
      const alpha = (netTorque - frictionTorque) / beamI;
      beamAngVelRef.current += alpha * dt;
      beamAngleRef.current += beamAngVelRef.current * dt;

      // Clamp angle
      beamAngleRef.current = Math.max(-0.5, Math.min(0.5, beamAngleRef.current));
      if (Math.abs(beamAngleRef.current) >= 0.49) {
        beamAngVelRef.current *= -0.3; // bounce
      }

      // Check balance
      const isBalanced = Math.abs(netTorque) < 0.5 && Math.abs(beamAngleRef.current) < 0.02 && beamWeights.length >= 2;
      if (isBalanced && !beamBalancedRef.current) {
        beamTimerRef.current += dt;
        if (beamTimerRef.current > 1.0) {
          beamBalancedRef.current = true;
          const result = calculateAccuracy(netTorque, 0, 0.5);
          result.label = "Balanced!";
          result.points = Math.max(result.points, 2);
          challengeRef.current = updateChallengeState(challengeRef.current, result);
          const canvas = canvasRef.current;
          if (canvas) {
            popupsRef.current.push({
              text: result.label,
              points: result.points,
              x: canvas.width / 2,
              y: canvas.height / 2,
              startTime: performance.now(),
            });
            particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 3, 25);
          }
          playScore(result.points);
        }
      } else {
        beamTimerRef.current = 0;
      }
    } else {
      // Disc mode
      const R_m = forces.length > 0 ? 1.0 : dragForcePointRef.current.radiusFraction * (radius / 100);
      const F = forces.length > 0 ? 0 : appliedForce;
      const netTorque = forces.length > 0
        ? forces.reduce((sum, f) => {
            return sum + f.magnitude * f.radiusFraction * (radius / 100) * f.direction;
          }, 0)
        : F * R_m;
      const frictionTorque = friction * angVelRef.current;
      const alpha = (netTorque - frictionTorque) / momentOfInertia;

      angVelRef.current += alpha * dt;
      angleRef.current += angVelRef.current * dt;
    }

    particlesRef.current.update(dt);
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [appliedForce, radius, momentOfInertia, friction, draw, gameMode, forces, beamWeights]);

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
    if (isRunning) animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onDragStart: (x, y) => {
        if (gameMode === "balance_beam") return false;

        const W = canvas.width;
        const H = canvas.height;
        const cx = W * 0.4;
        const cy = H * 0.5;
        const R = Math.min(radius, Math.min(W * 0.3, H * 0.38));
        const theta = angleRef.current;

        if (forces.length > 0) return false;

        // Check if near force application point
        const forceAngle = theta + dragForcePointRef.current.angle;
        const forceR = dragForcePointRef.current.radiusFraction * R;
        const fpx = cx + Math.cos(forceAngle) * forceR;
        const fpy = cy + Math.sin(forceAngle) * forceR;

        const dist = Math.sqrt((x - fpx) ** 2 + (y - fpy) ** 2);
        if (dist < 20) {
          isDraggingForceRef.current = true;
          return true;
        }

        // Check if clicking inside disc (to set force point)
        const dxC = x - cx;
        const dyC = y - cy;
        const distCenter = Math.sqrt(dxC * dxC + dyC * dyC);
        if (distCenter < R && distCenter > 12) {
          isDraggingForceRef.current = true;
          const clickAngle = Math.atan2(dyC, dxC) - theta;
          dragForcePointRef.current = {
            radiusFraction: distCenter / R,
            angle: clickAngle,
          };
          return true;
        }

        return false;
      },
      onDrag: (x, y) => {
        if (!isDraggingForceRef.current) return;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W * 0.4;
        const cy = H * 0.5;
        const R = Math.min(radius, Math.min(W * 0.3, H * 0.38));
        const theta = angleRef.current;

        const dxC = x - cx;
        const dyC = y - cy;
        const distCenter = Math.sqrt(dxC * dxC + dyC * dyC);
        const clickAngle = Math.atan2(dyC, dxC) - theta;

        dragForcePointRef.current = {
          radiusFraction: Math.max(0.1, Math.min(1.0, distCenter / R)),
          angle: clickAngle,
        };
      },
      onDragEnd: () => {
        isDraggingForceRef.current = false;
      },
      onClick: (x, y) => {
        if (gameMode !== "balance_beam") return;

        const W = canvas.width;
        const H = canvas.height;
        const beamCx = W * 0.5;
        const beamCy = H * 0.45;
        const beamPixelLen = Math.min(W * 0.7, 500);

        // Check if click is near the beam
        const beamAngle = beamAngleRef.current;
        const dxB = x - beamCx;
        const dyB = y - beamCy;

        // Rotate click into beam-local coords
        const localX = dxB * Math.cos(-beamAngle) - dyB * Math.sin(-beamAngle);
        const localY = dxB * Math.sin(-beamAngle) + dyB * Math.cos(-beamAngle);

        if (Math.abs(localY) < 40 && Math.abs(localX) < beamPixelLen / 2) {
          const position = localX / (beamPixelLen / 2);
          const newWeight: BeamWeight = {
            id: nextWeightIdRef.current++,
            position: Math.max(-1, Math.min(1, position)),
            mass: 2 + Math.floor(Math.random() * 4),
          };
          setBeamWeights((prev) => [...prev, newWeight]);
          beamBalancedRef.current = false;
          beamTimerRef.current = 0;
          playSFX("drop");
        }
      },
    });

    // Right-click to remove weights
    const handleContextMenu = (e: MouseEvent) => {
      if (gameMode !== "balance_beam") return;
      e.preventDefault();
      const pos = getCanvasMousePos(canvas, e);
      const W = canvas.width;
      const H = canvas.height;
      const beamCx = W * 0.5;
      const beamCy = H * 0.45;
      const beamPixelLen = Math.min(W * 0.7, 500);
      const beamAngle = beamAngleRef.current;

      // Find nearest weight
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < beamWeights.length; i++) {
        const w = beamWeights[i];
        const wx = beamCx + Math.cos(beamAngle) * w.position * (beamPixelLen / 2);
        const wy = beamCy + Math.sin(beamAngle) * w.position * (beamPixelLen / 2);
        const d = Math.sqrt((pos.x - wx) ** 2 + (pos.y - wy) ** 2);
        if (d < 25 && d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      if (nearestIdx >= 0) {
        setBeamWeights((prev) => prev.filter((_, i) => i !== nearestIdx));
        beamBalancedRef.current = false;
        beamTimerRef.current = 0;
        playSFX("pop");
      }
    };

    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      cleanup();
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [gameMode, radius, forces, beamWeights]);

  const reset = () => {
    angleRef.current = 0;
    angVelRef.current = 0;
    beamAngleRef.current = 0;
    beamAngVelRef.current = 0;
    beamBalancedRef.current = false;
    beamTimerRef.current = 0;
    dragForcePointRef.current = { radiusFraction: 1.0, angle: -Math.PI / 2 };
    draw();
  };

  const addForce = (direction: number) => {
    const colors = ["#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#f59e0b", "#ec4899"];
    const newForce: AppliedForce = {
      id: nextForceIdRef.current++,
      radiusFraction: 0.5 + Math.random() * 0.5,
      angleDeg: Math.random() * 360,
      magnitude: 10 + Math.random() * 20,
      direction,
      color: colors[forces.length % colors.length],
    };
    setForces((prev) => [...prev, newForce]);
    reset();
    playSFX("click");
  };

  const clearForces = () => {
    setForces([]);
    reset();
  };

  const checkTargetAlpha = () => {
    if (gameMode !== "target_alpha" || !challengeRef.current.active) return;
    const effectiveR = forces.length > 0
      ? 1.0
      : dragForcePointRef.current.radiusFraction * (radius / 100);
    const F = forces.length > 0 ? 0 : appliedForce;
    const torque = forces.length > 0
      ? forces.reduce((sum, f) => sum + f.magnitude * f.radiusFraction * (radius / 100) * f.direction, 0)
      : F * effectiveR;
    const alpha = torque / momentOfInertia;
    const result = calculateAccuracy(alpha, targetAlphaRef.current, 0.5);
    challengeRef.current = updateChallengeState(challengeRef.current, result);
    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
    }
    if (result.points > 0) {
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2, 15);
    } else {
      playSFX("incorrect");
    }
    // New target
    targetAlphaRef.current = 0.05 + Math.random() * 0.8;
  };

  const startBalanceBeam = () => {
    setGameMode("balance_beam");
    setBeamWeights([]);
    beamAngleRef.current = 0;
    beamAngVelRef.current = 0;
    beamBalancedRef.current = false;
    beamTimerRef.current = 0;
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Balance the beam",
    };
    playSFX("powerup");
  };

  const startTargetAlpha = () => {
    setGameMode("target_alpha");
    setForces([]);
    reset();
    targetAlphaRef.current = 0.1 + Math.random() * 0.6;
    challengeRef.current = {
      ...createChallengeState(),
      active: true,
      description: "Achieve target angular acceleration",
    };
    playSFX("powerup");
  };

  const backToSandbox = () => {
    setGameMode("sandbox");
    setForces([]);
    setBeamWeights([]);
    challengeRef.current = createChallengeState();
    reset();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {gameMode !== "balance_beam" && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Force (N)
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={appliedForce}
                  onChange={(e) => {
                    setAppliedForce(Number(e.target.value));
                    reset();
                  }}
                  className="flex-1 accent-green-500"
                  disabled={forces.length > 0}
                />
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
                  {appliedForce}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Inertia (I)
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={momentOfInertia}
                  onChange={(e) => {
                    setMomentOfInertia(Number(e.target.value));
                    reset();
                  }}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
                  {momentOfInertia}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Friction
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  value={friction}
                  onChange={(e) => setFriction(Number(e.target.value))}
                  className="flex-1 accent-red-500"
                />
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
                  {friction.toFixed(1)}
                </span>
              </div>
            </div>
          </>
        )}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={reset}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium"
          >
            Reset
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Mode
          </label>
          <div className="flex gap-1">
            <button
              onClick={backToSandbox}
              className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${
                gameMode === "sandbox"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Sandbox
            </button>
            <button
              onClick={startBalanceBeam}
              className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${
                gameMode === "balance_beam"
                  ? "bg-amber-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Balance
            </button>
            <button
              onClick={startTargetAlpha}
              className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${
                gameMode === "target_alpha"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              Target
            </button>
          </div>
        </div>
      </div>
      {gameMode === "sandbox" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end gap-2">
            <button
              onClick={() => addForce(1)}
              className="flex-1 h-9 rounded-lg bg-green-600 text-white text-xs font-medium"
            >
              + CW Force
            </button>
            <button
              onClick={() => addForce(-1)}
              className="flex-1 h-9 rounded-lg bg-red-600 text-white text-xs font-medium"
            >
              + CCW Force
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-end">
            <button
              onClick={clearForces}
              className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium"
            >
              Clear All Forces ({forces.length})
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Radius
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="range"
                min={40}
                max={180}
                value={radius}
                onChange={(e) => {
                  setRadius(Number(e.target.value));
                  reset();
                }}
                className="flex-1 accent-amber-500"
              />
              <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
                {(radius / 100).toFixed(1)}m
              </span>
            </div>
          </div>
        </div>
      )}
      {gameMode === "target_alpha" && challengeRef.current.active && (
        <div className="rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1">
                Target Alpha Challenge
              </h3>
              <p className="text-xs text-green-700 dark:text-green-400">
                Adjust force, inertia, and drag the force application point to achieve the target angular acceleration.
              </p>
              <div className="mt-2 flex gap-4 text-xs font-mono text-green-700 dark:text-green-400">
                <span>Score: {challengeRef.current.score}</span>
                <span>Attempts: {challengeRef.current.attempts}</span>
              </div>
            </div>
            <button
              onClick={checkTargetAlpha}
              className="h-10 px-6 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors whitespace-nowrap"
            >
              Check alpha
            </button>
          </div>
        </div>
      )}
      {gameMode === "balance_beam" && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Balance the Beam
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Click on the beam to place weights on either side. Right-click to remove.
            Balance the torques so the beam stays level. Net torque must be near zero!
          </p>
          <div className="mt-2 flex gap-4 text-xs font-mono text-amber-700 dark:text-amber-400">
            <span>Score: {challengeRef.current.score}</span>
            <span>Weights: {beamWeights.length}</span>
            <span>Streak: {challengeRef.current.streak}</span>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Rotational Dynamics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            tau = r x F = I*alpha
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            I = 1/2 mr^2 (disc)
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            omega = omega_0 + alpha*t
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\tau = rF\sin\theta" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\alpha = \tau / I" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="I = \sum m_i r_i^2" /></div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Apply force at different points on the wheel to see how torque depends on position and angle.
      </p>
    </div>
  );
}
