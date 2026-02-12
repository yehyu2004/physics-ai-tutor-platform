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
import { createDragHandler } from "@/lib/simulation/interaction";
import { SimMath } from "@/components/simulations/SimMath";

// Spectral line colors mapped to wavelength ranges
function wavelengthToColor(nm: number): string {
  if (nm < 380) return "#8b00ff";
  if (nm < 440) return `rgba(${Math.round(138 - (nm - 380) * 2.3)},0,255,1)`;
  if (nm < 490) return `rgba(0,${Math.round((nm - 440) * 5.1)},255,1)`;
  if (nm < 510) return `rgba(0,255,${Math.round(255 - (nm - 490) * 12.75)},1)`;
  if (nm < 580) return `rgba(${Math.round((nm - 510) * 3.64)},255,0,1)`;
  if (nm < 645) return `rgba(255,${Math.round(255 - (nm - 580) * 3.92)},0,1)`;
  if (nm < 780) return `rgba(255,0,0,1)`;
  return "#ff0000";
}

// Get wavelength from transition (in nm)
function transitionWavelength(ni: number, nf: number): number {
  const dE = 13.6 * (1 / (nf * nf) - 1 / (ni * ni));
  return 1240 / dE; // eV to nm
}

// Series names
function getSeriesName(nf: number): string {
  switch (nf) {
    case 1: return "Lyman";
    case 2: return "Balmer";
    case 3: return "Paschen";
    default: return `n=${nf}`;
  }
}

interface Photon {
  x: number;
  y: number;
  targetN: number;
  sourceN: number;
  angle: number;
  speed: number;
  emitting: boolean; // true = moving outward (emission), false = moving inward (absorption)
  wavelength: number;
  alive: boolean;
}

interface SpectralLine {
  wavelength: number;
  ni: number;
  nf: number;
  color: string;
}

interface TransitionQuiz {
  wavelength: number;
  correctNi: number;
  correctNf: number;
  options: { ni: number; nf: number }[];
  answered: boolean;
  correct: boolean;
}

export default function HydrogenAtom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setSelectedN] = useState(1);
  const [showProbability, setShowProbability] = useState(true);
  const animRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);

  // New interactive features
  const [challengeMode, setChallengeMode] = useState(false);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeScore, setChallengeScore] = useState(0);
  const [, setChallengeAttempts] = useState(0);

  const photonsRef = useRef<Photon[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const spectralLinesRef = useRef<SpectralLine[]>([]);
  const [spectralCount, setSpectralCount] = useState(0);
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Transition quiz state
  const [quiz, setQuiz] = useState<TransitionQuiz | null>(null);

  // Track current electron level separately for transitions
  const electronNRef = useRef(1);
  const transitionAnimRef = useRef<{
    from: number;
    to: number;
    progress: number;
    active: boolean;
  }>({ from: 1, to: 1, progress: 0, active: false });

  // Energy level Y positions cache for click detection
  const levelPositionsRef = useRef<{ n: number; y: number; x: number; w: number }[]>([]);

  // Generate a quiz question
  const generateQuiz = useCallback(() => {
    const possibleTransitions: { ni: number; nf: number }[] = [];
    for (let ni = 2; ni <= 6; ni++) {
      for (let nf = 1; nf < ni; nf++) {
        possibleTransitions.push({ ni, nf });
      }
    }
    const correct = possibleTransitions[Math.floor(Math.random() * possibleTransitions.length)];
    const wl = transitionWavelength(correct.ni, correct.nf);

    // Create 3 wrong options + correct
    const options: { ni: number; nf: number }[] = [correct];
    const shuffled = possibleTransitions
      .filter((t) => t.ni !== correct.ni || t.nf !== correct.nf)
      .sort(() => Math.random() - 0.5);
    options.push(...shuffled.slice(0, 3));
    // Shuffle options
    options.sort(() => Math.random() - 0.5);

    setQuiz({
      wavelength: wl,
      correctNi: correct.ni,
      correctNf: correct.nf,
      options,
      answered: false,
      correct: false,
    });
  }, []);

  // Fire a photon at the atom for absorption
  const firePhoton = useCallback((targetN: number) => {
    const currentN = electronNRef.current;
    if (targetN <= currentN || targetN > 6) return;

    const wl = transitionWavelength(targetN, currentN);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;

    photonsRef.current.push({
      x: W * 0.6,
      y: canvas.height * 0.5,
      targetN,
      sourceN: currentN,
      angle: Math.PI,
      speed: 400,
      emitting: false,
      wavelength: wl,
      alive: true,
    });
    playSFX("whoosh");
  }, []);

  // Emit a photon (electron drops to lower level)
  const emitPhoton = useCallback((targetN: number) => {
    const currentN = electronNRef.current;
    if (targetN >= currentN || targetN < 1) return;

    const wl = transitionWavelength(currentN, targetN);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const atomX = canvas.width * 0.32;
    const atomY = canvas.height * 0.5;
    const maxR = Math.min(canvas.width * 0.28, canvas.height * 0.42);
    const bohrR = (currentN * currentN) * maxR / 25;
    const t = timeRef.current;
    const eAngle = t * (3 / currentN);
    const ex = atomX + bohrR * Math.cos(eAngle);
    const ey = atomY + bohrR * Math.sin(eAngle);

    // Start transition animation
    transitionAnimRef.current = {
      from: currentN,
      to: targetN,
      progress: 0,
      active: true,
    };

    // Create the emitted photon
    const emitAngle = Math.random() * Math.PI * 2;
    photonsRef.current.push({
      x: ex,
      y: ey,
      targetN: 0,
      sourceN: currentN,
      angle: emitAngle,
      speed: 300,
      emitting: true,
      wavelength: wl,
      alive: true,
    });

    // Add to spectral lines
    const color = wavelengthToColor(wl);
    const existing = spectralLinesRef.current.find(
      (l) => l.ni === currentN && l.nf === targetN
    );
    if (!existing) {
      spectralLinesRef.current.push({
        wavelength: wl,
        ni: currentN,
        nf: targetN,
        color,
      });
      setSpectralCount(spectralLinesRef.current.length);
    }

    // Particle glow effect
    particlesRef.current.emitGlow(ex, ey, 12, color);
    particlesRef.current.emitSparks(ex, ey, 6, color);

    electronNRef.current = targetN;
    setSelectedN(targetN);
    playSFX("powerup");
  }, []);

  // Handle clicking on energy level diagram
  const handleEnergyLevelClick = useCallback((clickY: number) => {
    const levels = levelPositionsRef.current;
    for (const level of levels) {
      if (Math.abs(clickY - level.y) < 12) {
        const currentN = electronNRef.current;
        if (level.n > currentN) {
          // Absorb photon - jump up
          firePhoton(level.n);
        } else if (level.n < currentN) {
          // Emit photon - drop down
          emitPhoton(level.n);
        }
        break;
      }
    }
  }, [firePhoton, emitPhoton]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = timeRef.current;
    const currentElectronN = electronNRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // --- Left: Atom visualization ---
    const atomX = W * 0.32;
    const atomY = H * 0.5;
    const maxR = Math.min(W * 0.28, H * 0.42);

    // Orbital probability clouds for all levels
    for (let n = 5; n >= 1; n--) {
      const bohrR = (n * n) * maxR / 25;
      const isSelected = n === currentElectronN;

      if (showProbability && bohrR < maxR) {
        for (let r = 0; r < bohrR * 1.8; r += 2) {
          const rNorm = r / bohrR;
          let prob: number;
          if (n === 1) prob = 4 * rNorm * rNorm * Math.exp(-2 * rNorm);
          else if (n === 2) prob = rNorm * rNorm * (2 - rNorm) ** 2 * Math.exp(-rNorm) / 8;
          else prob = rNorm * rNorm * Math.exp(-2 * rNorm / n) * (1 + 0.5 * Math.sin(rNorm * n)) ** 2;

          const alpha = prob * (isSelected ? 0.15 : 0.04);
          if (alpha < 0.002) continue;

          const color = isSelected ? "59,130,246" : "148,163,184";
          ctx.strokeStyle = `rgba(${color},${Math.min(alpha, 0.3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(atomX, atomY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Bohr orbit (dashed circle)
      if (bohrR < maxR) {
        ctx.strokeStyle = isSelected ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash(isSelected ? [] : [3, 5]);
        ctx.beginPath();
        ctx.arc(atomX, atomY, bohrR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = isSelected ? "#3b82f6" : "rgba(255,255,255,0.15)";
        ctx.font = isSelected ? "bold 11px ui-monospace" : "9px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(`n=${n}`, atomX + bohrR + 5, atomY - 3);
      }
    }

    // Nucleus
    const nucGlow = ctx.createRadialGradient(atomX, atomY, 0, atomX, atomY, 15);
    nucGlow.addColorStop(0, "rgba(239,68,68,0.5)");
    nucGlow.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = nucGlow;
    ctx.beginPath();
    ctx.arc(atomX, atomY, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(atomX, atomY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("p\u207A", atomX, atomY);

    // Electron position (with transition animation)
    let electronR: number;
    const trans = transitionAnimRef.current;
    if (trans.active) {
      const fromR = (trans.from * trans.from) * maxR / 25;
      const toR = (trans.to * trans.to) * maxR / 25;
      electronR = fromR + (toR - fromR) * trans.progress;
    } else {
      electronR = (currentElectronN * currentElectronN) * maxR / 25;
    }

    if (electronR < maxR) {
      const speedFactor = trans.active ? 8 : 3 / currentElectronN;
      const eAngle = t * speedFactor;
      const ex = atomX + electronR * Math.cos(eAngle);
      const ey = atomY + electronR * Math.sin(eAngle);

      const eGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 12);
      eGlow.addColorStop(0, "rgba(59,130,246,0.5)");
      eGlow.addColorStop(1, "rgba(59,130,246,0)");
      ctx.fillStyle = eGlow;
      ctx.beginPath();
      ctx.arc(ex, ey, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Right: Energy level diagram ---
    const elvX = W * 0.68;
    const elvW = W * 0.28;
    const elvY = 30;
    const elvH = H - 60;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(elvX - 15, elvY - 15, elvW + 30, elvH + 30, 8);
    ctx.fill();

    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("ENERGY LEVELS (click to transition)", elvX + elvW / 2, elvY);

    const E1 = -13.6;
    const maxE = 0;
    const minE = E1;
    const eRange = maxE - minE;

    // Ionization level (E = 0)
    const zeroY = elvY + 20;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(elvX, zeroY);
    ctx.lineTo(elvX + elvW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#64748b";
    ctx.font = "9px ui-monospace";
    ctx.textAlign = "right";
    ctx.fillText("0 eV (free)", elvX - 5, zeroY + 3);

    // Store level positions for click detection
    const newLevelPositions: { n: number; y: number; x: number; w: number }[] = [];

    for (let n = 1; n <= 6; n++) {
      const En = -13.6 / (n * n);
      const ly = zeroY + ((0 - En) / eRange) * (elvH - 40);
      const isActive = n === currentElectronN;

      // Highlight clickable area
      if (n !== currentElectronN) {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.beginPath();
        ctx.roundRect(elvX - 2, ly - 8, elvW + 4, 16, 3);
        ctx.fill();
      }

      ctx.strokeStyle = isActive ? "#fbbf24" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isActive ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(elvX, ly);
      ctx.lineTo(elvX + elvW, ly);
      ctx.stroke();

      ctx.fillStyle = isActive ? "#fbbf24" : "#64748b";
      ctx.font = isActive ? "bold 11px ui-monospace" : "10px ui-monospace";
      ctx.textAlign = "left";
      ctx.fillText(`n=${n}`, elvX + elvW + 5, ly + 4);
      ctx.textAlign = "right";
      ctx.fillText(`${En.toFixed(2)} eV`, elvX - 5, ly + 4);

      // Arrow hints for clickable levels
      if (n !== currentElectronN) {
        const isAbove = n > currentElectronN;
        ctx.fillStyle = isAbove ? "rgba(34,197,94,0.3)" : "rgba(168,85,247,0.3)";
        ctx.font = "8px ui-monospace";
        ctx.textAlign = "center";
        ctx.fillText(isAbove ? "\u25B2 absorb" : "\u25BC emit", elvX + elvW / 2, ly + (isAbove ? -10 : 12));
      }

      newLevelPositions.push({ n, y: ly, x: elvX, w: elvW });
    }
    levelPositionsRef.current = newLevelPositions;

    // Transition arrows (if n > 1, show possible photon emissions)
    if (currentElectronN > 1) {
      for (let nf = 1; nf < currentElectronN; nf++) {
        const Ei = -13.6 / (currentElectronN * currentElectronN);
        const Ef = -13.6 / (nf * nf);
        const yi = zeroY + ((0 - Ei) / eRange) * (elvH - 40);
        const yf = zeroY + ((0 - Ef) / eRange) * (elvH - 40);
        const wl = transitionWavelength(currentElectronN, nf);
        const color = wavelengthToColor(wl);

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ax = elvX + elvW * 0.3 + nf * 15;
        for (let py = yi; py <= yf; py += 2) {
          const px = ax + Math.sin((py - yi) * 0.3) * 5;
          if (py === yi) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = color;
        ctx.font = "8px ui-monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${Math.round(wl)}nm`, ax + 8, (yi + yf) / 2);
      }
    }

    // --- Draw photons ---
    for (const photon of photonsRef.current) {
      if (!photon.alive) continue;
      const color = wavelengthToColor(photon.wavelength);

      // Photon glow
      const pGlow = ctx.createRadialGradient(photon.x, photon.y, 0, photon.x, photon.y, 15);
      pGlow.addColorStop(0, color);
      pGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pGlow;
      ctx.beginPath();
      ctx.arc(photon.x, photon.y, 15, 0, Math.PI * 2);
      ctx.fill();

      // Photon body (wavy line)
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = -15; i <= 15; i++) {
        const dx = Math.cos(photon.angle) * i;
        const dy = Math.sin(photon.angle) * i;
        const perp = Math.sin(i * 0.8 + t * 20) * 4;
        const px = photon.x + dx + Math.sin(photon.angle + Math.PI / 2) * perp;
        const py = photon.y + dy + Math.cos(photon.angle + Math.PI / 2) * perp;
        if (i === -15) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // --- Draw particles ---
    particlesRef.current.draw(ctx);

    // --- Emission spectrum bar at bottom ---
    const specLines = spectralLinesRef.current;
    if (specLines.length > 0) {
      const specY = H - 38;
      const specH = 30;
      const specX = 10;
      const specW = W * 0.55;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(specX - 5, specY - 18, specW + 10, specH + 23, 6);
      ctx.fill();

      ctx.font = "bold 9px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText(`EMISSION SPECTRUM (${specLines.length} lines)`, specX, specY - 5);

      // Draw spectrum background (dark)
      ctx.fillStyle = "#000";
      ctx.fillRect(specX, specY, specW, specH);

      // Map wavelength range (90nm to 1900nm) to pixel range
      const minWL = 90;
      const maxWL = 1900;
      for (const line of specLines) {
        const frac = (line.wavelength - minWL) / (maxWL - minWL);
        const lx = specX + frac * specW;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(lx, specY);
        ctx.lineTo(lx, specY + specH);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Label
        ctx.font = "7px ui-monospace";
        ctx.fillStyle = line.color;
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(line.wavelength)}`, lx, specY + specH + 10);
      }

      // Visible range indicator
      const visStart = specX + ((380 - minWL) / (maxWL - minWL)) * specW;
      const visEnd = specX + ((780 - minWL) / (maxWL - minWL)) * specW;
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(visStart, specY - 1);
      ctx.lineTo(visStart, specY + specH + 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(visEnd, specY - 1);
      ctx.lineTo(visEnd, specY + specH + 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "7px ui-monospace";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "center";
      ctx.fillText("visible", (visStart + visEnd) / 2, specY - 1);
    }

    // --- Score popups ---
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((popup) =>
      renderScorePopup(ctx, popup, now)
    );

    // --- Challenge scoreboard ---
    if (challengeMode) {
      renderScoreboard(ctx, 10, 10, 140, 110, challengeRef.current);
    }
  }, [showProbability, challengeMode]);

  const animate = useCallback(() => {
    const now = performance.now();
    const dt = Math.min((now - (lastFrameRef.current || now)) / 1000, 0.05);
    lastFrameRef.current = now;
    timeRef.current += 0.03;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const atomX = canvas.width * 0.32;
    const atomY = canvas.height * 0.5;

    // Update transition animation
    const trans = transitionAnimRef.current;
    if (trans.active) {
      trans.progress += dt * 3;
      if (trans.progress >= 1) {
        trans.active = false;
        trans.progress = 1;
      }
    }

    // Update photons
    for (const photon of photonsRef.current) {
      if (!photon.alive) continue;

      if (photon.emitting) {
        // Moving outward
        photon.x += Math.cos(photon.angle) * photon.speed * dt;
        photon.y += Math.sin(photon.angle) * photon.speed * dt;
        // Remove when offscreen
        if (photon.x < -20 || photon.x > canvas.width + 20 || photon.y < -20 || photon.y > canvas.height + 20) {
          photon.alive = false;
        }
      } else {
        // Moving toward atom
        const dx = atomX - photon.x;
        const dy = atomY - photon.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 15) {
          // Absorbed! Transition electron up
          photon.alive = false;
          const currentN = electronNRef.current;
          if (photon.targetN > currentN) {
            transitionAnimRef.current = {
              from: currentN,
              to: photon.targetN,
              progress: 0,
              active: true,
            };
            electronNRef.current = photon.targetN;
            setSelectedN(photon.targetN);
            particlesRef.current.emitGlow(atomX, atomY, 15, wavelengthToColor(photon.wavelength));
            playSFX("correct");
          }
        } else {
          photon.x += (dx / dist) * photon.speed * dt;
          photon.y += (dy / dist) * photon.speed * dt;
        }
      }

      // Emit trail particles for photons
      if (photon.alive) {
        particlesRef.current.emitTrail(photon.x, photon.y, photon.angle, wavelengthToColor(photon.wavelength));
      }
    }
    photonsRef.current = photonsRef.current.filter((p) => p.alive);

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Canvas click handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = createDragHandler(canvas, {
      onClick: (x, y) => {
        const W = canvas.width;
        const elvX = W * 0.68;
        const elvW = W * 0.28;

        // Check if click is in energy level diagram area
        if (x >= elvX - 15 && x <= elvX + elvW + 15) {
          handleEnergyLevelClick(y);
        }
      },
    });

    return cleanup;
  }, [handleEnergyLevelClick]);

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
    if (isRunning) {
      lastFrameRef.current = performance.now();
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, animate]);

  // Answer quiz
  const answerQuiz = (ni: number, nf: number) => {
    if (!quiz || quiz.answered) return;
    const correct = ni === quiz.correctNi && nf === quiz.correctNf;

    const result = correct
      ? { points: 3, tier: "perfect" as const, label: "Correct!" }
      : { points: 0, tier: "miss" as const, label: "Wrong!" };

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeScore(challengeRef.current.score);
    setChallengeAttempts(challengeRef.current.attempts);

    if (correct) {
      playSFX("correct");
      playScore(3);
    } else {
      playSFX("incorrect");
    }

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: performance.now(),
      });
    }

    setQuiz({ ...quiz, answered: true, correct });

    // Generate next quiz after delay
    setTimeout(() => {
      generateQuiz();
    }, 2000);
  };

  // Quick transition buttons
  const handleAbsorb = () => {
    const current = electronNRef.current;
    if (current < 6) {
      firePhoton(current + 1);
    }
  };

  const handleEmit = () => {
    const current = electronNRef.current;
    if (current > 1) {
      emitPhoton(current - 1);
    }
  };

  const handleDropToGround = () => {
    const current = electronNRef.current;
    if (current > 1) {
      emitPhoton(1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-pointer" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Energy Level (n)
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={1}
              max={6}
              value={electronNRef.current}
              onChange={(e) => {
                const newN = Number(e.target.value);
                const current = electronNRef.current;
                if (newN > current) {
                  firePhoton(newN);
                } else if (newN < current) {
                  emitPhoton(newN);
                }
              }}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
              n = {electronNRef.current}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <div>
              E ={" "}
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                {(-13.6 / (electronNRef.current * electronNRef.current)).toFixed(2)} eV
              </span>
            </div>
            <div>
              r ={" "}
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                {(electronNRef.current * electronNRef.current * 0.0529).toFixed(3)} nm
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setShowProbability(!showProbability)}
            className={`w-full h-10 rounded-lg text-sm font-medium ${
              showProbability
                ? "bg-purple-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            |psi|^2 Cloud {showProbability ? "ON" : "OFF"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Pause" : "Play"}
          </button>
        </div>
      </div>

      {/* Transition controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Photon Transitions
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleAbsorb}
              disabled={electronNRef.current >= 6}
              className="flex-1 h-9 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-xs font-medium transition-colors"
            >
              Absorb (n+1)
            </button>
            <button
              onClick={handleEmit}
              disabled={electronNRef.current <= 1}
              className="flex-1 h-9 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-xs font-medium transition-colors"
            >
              Emit (n-1)
            </button>
            <button
              onClick={handleDropToGround}
              disabled={electronNRef.current <= 1}
              className="flex-1 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-xs font-medium transition-colors"
            >
              Ground
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Spectrum
          </label>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{spectralCount}</span> spectral lines collected
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Total possible: 15 (all n_i to n_f combos)
          </div>
          <button
            onClick={() => {
              spectralLinesRef.current = [];
              setSpectralCount(0);
            }}
            className="mt-1 text-xs text-red-500 hover:text-red-400"
          >
            Clear spectrum
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
            Challenge Mode
          </label>
          <button
            onClick={() => {
              const newMode = !challengeMode;
              setChallengeMode(newMode);
              challengeRef.current = { ...challengeRef.current, active: newMode };
              if (newMode) {
                generateQuiz();
              } else {
                setQuiz(null);
              }
            }}
            className={`w-full h-9 rounded-lg text-sm font-medium transition-colors ${
              challengeMode
                ? "bg-amber-500 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            {challengeMode ? `Score: ${challengeScore}` : "Start Quiz"}
          </button>
        </div>
      </div>

      {/* Quiz section */}
      {challengeMode && quiz && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
            Identify the Transition
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Which transition produces a photon with wavelength{" "}
            <span
              className="font-mono font-bold"
              style={{ color: wavelengthToColor(quiz.wavelength) }}
            >
              {Math.round(quiz.wavelength)} nm
            </span>
            ?{" "}
            <span className="text-xs text-gray-500">
              ({getSeriesName(quiz.correctNf)} series)
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {quiz.options.map((opt, i) => {
              const isCorrectAnswer = opt.ni === quiz.correctNi && opt.nf === quiz.correctNf;
              let btnClass = "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
              if (quiz.answered) {
                if (isCorrectAnswer) {
                  btnClass = "bg-green-600 text-white";
                } else {
                  btnClass = "border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600";
                }
              }
              return (
                <button
                  key={i}
                  onClick={() => answerQuiz(opt.ni, opt.nf)}
                  disabled={quiz.answered}
                  className={`h-10 rounded-lg text-sm font-mono font-medium transition-colors ${btnClass}`}
                >
                  n={opt.ni} &rarr; n={opt.nf} ({Math.round(transitionWavelength(opt.ni, opt.nf))} nm)
                </button>
              );
            })}
          </div>
          {quiz.answered && (
            <p className={`text-sm mt-2 font-medium ${quiz.correct ? "text-green-600" : "text-red-500"}`}>
              {quiz.correct
                ? "Correct! The photon energy matches this transition."
                : `The correct answer is n=${quiz.correctNi} -> n=${quiz.correctNf} (${Math.round(quiz.wavelength)} nm)`}
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="E_n = -\frac{13.6}{n^2} \text{ eV}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="r_n = n^2 a_0" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="a_0 = 0.053 \text{ nm}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Click energy levels to see electron transitions. Toggle the probability cloud to visualize the wavefunction!</p>
    </div>
  );
}
