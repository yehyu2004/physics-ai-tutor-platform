"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { ParticleSystem } from "@/lib/simulation/particles";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { SimMath } from "@/components/simulations/SimMath";

interface Trail {
  x: number;
  y: number;
}

type Difficulty = "easy" | "medium" | "hard";

interface ScorePopup {
  text: string;
  points: number;
  x: number;
  y: number;
  opacity: number;
  startTime: number;
}

// Smoke trail particle
interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// Wind visual particle
interface WindParticle {
  x: number;
  y: number;
  speed: number;
  alpha: number;
  size: number;
}

export default function ProjectileChallenge() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [angle, setAngle] = useState(45);
  const [speed, setSpeed] = useState(50);
  const [isRunning, setIsRunning] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [totalScore, setTotalScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [lastDistance, setLastDistance] = useState<number | null>(null);
  const [hasLanded, setHasLanded] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const timeRef = useRef(0);
  const trailsRef = useRef<Trail[]>([]);
  const lastTsRef = useRef<number | null>(null);
  const posRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const scorePopupRef = useRef<ScorePopup | null>(null);
  const popupAnimRef = useRef<number>(0);
  const particleSystemRef = useRef(new ParticleSystem());
  const smokeParticlesRef = useRef<SmokeParticle[]>([]);
  const windParticlesRef = useRef<WindParticle[]>([]);
  const lastSmokeTimeRef = useRef(0);

  const gravity = 9.8;
  const groundY = 0.85;
  const originX = 60;

  // Target position in meters from origin
  const [targetDistance, setTargetDistance] = useState(150);

  // Wind speed in m/s (positive = rightward headwind opposing motion)
  const [windSpeed, setWindSpeed] = useState(0);
  const windPhaseRef = useRef(0);

  // Generate random target distance based on reasonable range
  const randomizeTarget = useCallback(() => {
    const minDist = 50;
    const maxDist = 350;
    const dist = minDist + Math.random() * (maxDist - minDist);
    setTargetDistance(Math.round(dist));
    setLastScore(null);
    setLastDistance(null);
    setHasLanded(false);
  }, []);

  // Set wind based on difficulty
  useEffect(() => {
    if (difficulty === "easy") {
      setWindSpeed(0);
    } else if (difficulty === "medium") {
      setWindSpeed(3 + Math.random() * 5); // 3-8 m/s constant wind
    } else {
      setWindSpeed(4 + Math.random() * 6); // 4-10 m/s base for variable wind
    }
    windPhaseRef.current = Math.random() * Math.PI * 2;
  }, [difficulty]);

  // Initialize wind particles
  useEffect(() => {
    if (difficulty === "easy") {
      windParticlesRef.current = [];
      return;
    }
    const particles: WindParticle[] = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * 1200,
        y: Math.random() * 400,
        speed: 0.5 + Math.random() * 1.5,
        alpha: 0.05 + Math.random() * 0.12,
        size: 1 + Math.random() * 2,
      });
    }
    windParticlesRef.current = particles;
  }, [difficulty]);

  // Compute scale factor so the target and trajectory fit on canvas
  const getScale = useCallback(
    (W: number) => {
      // We want the target to be visible plus some margin
      const maxRange = Math.max(targetDistance * 1.3, 200);
      return (W - originX - 40) / maxRange;
    },
    [targetDistance]
  );

  // Get effective wind at a given time
  const getWind = useCallback(
    (t: number): number => {
      if (difficulty === "easy") return 0;
      if (difficulty === "medium") return windSpeed;
      // Hard: variable sine-wave wind
      return windSpeed * (0.5 + 0.5 * Math.sin(windPhaseRef.current + t * 1.5));
    },
    [difficulty, windSpeed]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const gY = H * groundY;
    const scale = getScale(W);

    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, gY);
    skyGrad.addColorStop(0, "#0f172a");
    skyGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, gY);

    // Stars
    const starSeed = 42;
    for (let i = 0; i < 60; i++) {
      const sx = (starSeed * (i + 1) * 7) % W;
      const sy = (starSeed * (i + 1) * 13) % (gY * 0.7);
      const sr = i % 3 === 0 ? 1.5 : 0.8;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.1})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wind particles (animated floating particles in the sky)
    if (difficulty !== "easy") {
      const currentWind = getWind(timeRef.current);
      const windDir = currentWind > 0 ? 1 : -1;
      for (const wp of windParticlesRef.current) {
        wp.x += windDir * wp.speed * Math.abs(currentWind) * 0.3;
        // Wrap around
        if (wp.x > W + 10) wp.x = -10;
        if (wp.x < -10) wp.x = W + 10;
        // Slight vertical drift
        wp.y += Math.sin(timeRef.current * 2 + wp.x * 0.01) * 0.3;
        if (wp.y > gY) wp.y = 10;
        if (wp.y < 0) wp.y = gY - 10;

        ctx.fillStyle = `rgba(147,197,253,${wp.alpha})`;
        // Draw as a small dash in wind direction
        ctx.beginPath();
        ctx.ellipse(wp.x, wp.y, wp.size * 3, wp.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ground gradient
    const groundGrad = ctx.createLinearGradient(0, gY, 0, H);
    groundGrad.addColorStop(0, "#166534");
    groundGrad.addColorStop(1, "#14532d");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gY, W, H - gY);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = gY; y > 0; y -= 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Distance markers on ground
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    const markerStep = targetDistance > 200 ? 100 : 50;
    for (let d = markerStep; d < targetDistance * 1.5; d += markerStep) {
      const mx = originX + d * scale;
      if (mx > W - 20) break;
      ctx.beginPath();
      ctx.moveTo(mx, gY);
      ctx.lineTo(mx, gY + 8);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.stroke();
      ctx.fillText(`${d}m`, mx - 10, gY + 18);
    }

    // Target
    const targetX = originX + targetDistance * scale;
    const targetY = gY;

    // Target glow
    const tGlow = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, 30);
    tGlow.addColorStop(0, "rgba(239,68,68,0.3)");
    tGlow.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = tGlow;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Target circle
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(targetX, targetY - 1, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(targetX, targetY - 1, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(targetX - 18, targetY - 1);
    ctx.lineTo(targetX + 18, targetY - 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(targetX, targetY - 19);
    ctx.lineTo(targetX, gY);
    ctx.stroke();

    // Bullseye center
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(targetX, targetY - 1, 3, 0, Math.PI * 2);
    ctx.fill();

    // Predicted trajectory (dashed, no wind - as a hint)
    const rad = (angle * Math.PI) / 180;
    const vx0 = speed * Math.cos(rad);
    const vy0 = speed * Math.sin(rad);
    const totalTimeNoWind = (2 * vy0) / gravity;

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let t = 0; t <= totalTimeNoWind; t += 0.02) {
      const px = originX + vx0 * t * scale;
      const py = gY - (vy0 * t - 0.5 * gravity * t * t) * scale;
      if (py > gY) break;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Wind indicator (for medium and hard)
    if (difficulty !== "easy") {
      const currentWind = getWind(timeRef.current);
      const windArrowX = W / 2;
      const windArrowY = 40;
      const arrowLen = Math.min(Math.abs(currentWind) * 6, 60);
      const arrowDir = currentWind > 0 ? 1 : -1;

      // Wind label background
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      const windLabelW = 140;
      ctx.fillRect(windArrowX - windLabelW / 2, windArrowY - 18, windLabelW, 40);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.strokeRect(windArrowX - windLabelW / 2, windArrowY - 18, windLabelW, 40);

      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText("WIND", windArrowX, windArrowY - 5);

      // Wind arrow
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(windArrowX - arrowLen / 2 * arrowDir, windArrowY + 10);
      ctx.lineTo(windArrowX + arrowLen / 2 * arrowDir, windArrowY + 10);
      ctx.stroke();

      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(windArrowX + arrowLen / 2 * arrowDir, windArrowY + 10);
      ctx.lineTo(windArrowX + (arrowLen / 2 - 8) * arrowDir, windArrowY + 5);
      ctx.moveTo(windArrowX + arrowLen / 2 * arrowDir, windArrowY + 10);
      ctx.lineTo(windArrowX + (arrowLen / 2 - 8) * arrowDir, windArrowY + 15);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`${currentWind.toFixed(1)} m/s`, windArrowX, windArrowY + 10);

      ctx.textAlign = "left";
    }

    // Smoke trail particles
    const smokeParticles = smokeParticlesRef.current;
    for (const sp of smokeParticles) {
      ctx.fillStyle = `rgba(180,180,200,${sp.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trail with glow
    const currentTrails = trailsRef.current;
    if (currentTrails.length > 1) {
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      currentTrails.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Trail dots
      currentTrails.forEach((p, i) => {
        if (i % 3 === 0) {
          const alpha = 0.3 + 0.7 * (i / currentTrails.length);
          ctx.fillStyle = `rgba(59,130,246,${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Current ball position
    if (isRunning && !hasLanded) {
      const bx = posRef.current.x;
      const by = posRef.current.y;

      // Ball glow
      const ballGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 20);
      ballGrad.addColorStop(0, "rgba(251,191,36,0.6)");
      ballGrad.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(bx, by, 20, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Landing marker (after landed)
    if (hasLanded && trailsRef.current.length > 0) {
      const landPoint = trailsRef.current[trailsRef.current.length - 1];

      // Impact glow
      const impactGrad = ctx.createRadialGradient(
        landPoint.x,
        landPoint.y,
        0,
        landPoint.x,
        landPoint.y,
        25
      );
      impactGrad.addColorStop(0, "rgba(251,191,36,0.4)");
      impactGrad.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = impactGrad;
      ctx.beginPath();
      ctx.arc(landPoint.x, landPoint.y, 25, 0, Math.PI * 2);
      ctx.fill();

      // Landing ball
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(landPoint.x, gY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Distance line from landing to target
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(landPoint.x, gY + 5);
      ctx.lineTo(targetX, gY + 5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw particle system (impact particles)
    particleSystemRef.current.draw(ctx);

    // Score popup animation
    const popup = scorePopupRef.current;
    if (popup && popup.opacity > 0) {
      const elapsed = (performance.now() - popup.startTime) / 1000;
      const yOff = elapsed * 40; // float upward
      popup.opacity = Math.max(0, 1 - elapsed / 2);

      ctx.font = "bold 24px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(251,191,36,${popup.opacity})`;
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 10;
      ctx.fillText(popup.text, popup.x, popup.y - yOff);

      ctx.font = "bold 16px ui-monospace, monospace";
      ctx.fillStyle = `rgba(255,255,255,${popup.opacity * 0.8})`;
      ctx.fillText(`+${popup.points} pts`, popup.x, popup.y - yOff + 28);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
    }

    // Cannon
    const rad2 = (angle * Math.PI) / 180;
    ctx.save();
    ctx.translate(originX, gY);
    ctx.rotate(-rad2);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(-5, -6, 40, 12);
    ctx.fillStyle = "#475569";
    ctx.fillRect(30, -8, 10, 16);
    ctx.restore();

    // Cannon base
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.arc(originX, gY, 14, Math.PI, 0);
    ctx.fill();

    // Info overlay - Score & Stats
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(W - 210, 12, 198, 130);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.strokeRect(W - 210, 12, 198, 130);
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("CHALLENGE STATS", W - 200, 30);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`Score:    ${totalScore} pts`, W - 200, 50);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Attempts: ${attempts}`, W - 200, 67);
    ctx.fillText(`Target:   ${targetDistance} m`, W - 200, 84);
    // Streak display
    ctx.fillStyle = streak > 0 ? "#f59e0b" : "#94a3b8";
    ctx.fillText(`Streak:   ${streak}${streak >= 3 ? " (x" + Math.min(streak, 5) + " bonus!)" : ""}`, W - 200, 101);
    if (lastDistance !== null) {
      const distColor = lastScore !== null && lastScore >= 3 ? "#22c55e" : lastScore !== null && lastScore >= 1 ? "#fbbf24" : "#ef4444";
      ctx.fillStyle = distColor;
      ctx.fillText(`Miss by:  ${lastDistance.toFixed(1)} m`, W - 200, 118);
    }
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(
      `Diff: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`,
      W - 200,
      lastDistance !== null ? 135 : 118
    );
  }, [
    angle,
    speed,
    isRunning,
    hasLanded,
    targetDistance,
    difficulty,
    totalScore,
    attempts,
    lastScore,
    lastDistance,
    streak,
    getScale,
    getWind,
  ]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gY = canvas.height * groundY;
    const scale = getScale(canvas.width);

    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;

    const pos = posRef.current;

    // Get wind effect
    const currentWind = getWind(timeRef.current);
    const windAccel = -currentWind * 0.1; // horizontal deceleration

    // Update velocity
    pos.vx += windAccel * dt;
    pos.vy -= gravity * dt;

    // Update real-world position (in meters)
    const realX = (pos.x - originX) / scale + pos.vx * dt;
    const realY = (gY - pos.y) / scale + pos.vy * dt;

    // Emit smoke trail particles
    if (timeRef.current - lastSmokeTimeRef.current > 0.03) {
      lastSmokeTimeRef.current = timeRef.current;
      smokeParticlesRef.current.push({
        x: pos.x,
        y: pos.y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15 - 10,
        size: 2 + Math.random() * 4,
        alpha: 0.4 + Math.random() * 0.3,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 0.8 + Math.random() * 0.5,
      });
    }

    // Update smoke particles
    smokeParticlesRef.current = smokeParticlesRef.current.filter((sp) => {
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.size += dt * 3; // expand
      sp.life -= dt;
      sp.alpha = (sp.life / sp.maxLife) * 0.4;
      return sp.life > 0;
    });

    // Update impact particle system
    particleSystemRef.current.update(dt);

    if (realY <= 0 && timeRef.current > 0.05) {
      // Landed
      const landX = realX;
      const dist = Math.abs(landX - targetDistance);

      let pts = 0;
      let label = "MISS!";
      if (dist < 5) {
        pts = 3;
        label = "BULLSEYE!";
      } else if (dist < 15) {
        pts = 2;
        label = "CLOSE!";
      } else if (dist < 30) {
        pts = 1;
        label = "HIT!";
      }

      // Streak bonus
      let newStreak = streak;
      let streakBonus = 0;
      if (pts > 0) {
        newStreak = streak + 1;
        if (newStreak >= 3) {
          streakBonus = Math.min(newStreak, 5); // bonus of 3-5 for streaks
          pts += streakBonus;
          label += ` STREAK x${Math.min(newStreak, 5)}!`;
        }
      } else {
        newStreak = 0;
      }
      setStreak(newStreak);
      setBestStreak((prev) => Math.max(prev, newStreak));

      const landCanvasX = originX + landX * scale;
      trailsRef.current = [...trailsRef.current, { x: landCanvasX, y: gY }];

      setTotalScore((s) => s + pts);
      setAttempts((a) => a + 1);
      setLastScore(pts);
      setLastDistance(dist);
      setHasLanded(true);
      setIsRunning(false);

      // Sound effects on impact
      if (pts >= 3) {
        playSFX("success");
        playScore(pts);
      } else if (pts > 0) {
        playSFX("correct");
        playScore(pts);
      } else {
        playSFX("drop");
      }

      // Impact particle effects (dirt/explosion)
      const ps = particleSystemRef.current;
      // Dirt particles
      ps.emit(landCanvasX, gY, 25, "#8b6914", {
        speed: 120,
        speedVariance: 60,
        lifetime: 0.6,
        lifetimeVariance: 0.3,
        gravity: 400,
        size: 3,
        sizeVariance: 2,
        shape: "circle",
        angle: -Math.PI / 2,
        spread: Math.PI * 0.7,
      });
      // Fire/explosion particles
      ps.emitSparks(landCanvasX, gY, 15, "#fbbf24");
      // Dust cloud
      ps.emitGlow(landCanvasX, gY, 8, "rgba(120,100,80,0.6)");

      // Trigger score popup
      scorePopupRef.current = {
        text: label,
        points: pts,
        x: landCanvasX,
        y: gY - 40,
        opacity: 1,
        startTime: performance.now(),
      };

      // Animate the popup + particles
      const animatePopup = () => {
        const popupDt = 0.016;
        particleSystemRef.current.update(popupDt);
        // Update smoke
        smokeParticlesRef.current = smokeParticlesRef.current.filter((sp) => {
          sp.x += sp.vx * popupDt;
          sp.y += sp.vy * popupDt;
          sp.size += popupDt * 3;
          sp.life -= popupDt;
          sp.alpha = (sp.life / sp.maxLife) * 0.4;
          return sp.life > 0;
        });
        if (
          (scorePopupRef.current && scorePopupRef.current.opacity > 0) ||
          particleSystemRef.current.count > 0
        ) {
          draw();
          popupAnimRef.current = requestAnimationFrame(animatePopup);
        }
      };
      popupAnimRef.current = requestAnimationFrame(animatePopup);

      draw();
      return;
    }

    // Compute canvas positions
    pos.x = originX + realX * scale;
    pos.y = gY - realY * scale;

    trailsRef.current = [...trailsRef.current, { x: pos.x, y: pos.y }];
    timeRef.current += dt;

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, getScale, getWind, streak]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = Math.min(container.clientWidth * 0.55, 500);
      draw();
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [draw]);

  useEffect(() => {
    if (isRunning && !hasLanded) {
      animRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, hasLanded, animate]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Cleanup popup animation on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(popupAnimRef.current);
  }, []);

  const launch = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rad = (angle * Math.PI) / 180;
    const vx = speed * Math.cos(rad);
    const vy = speed * Math.sin(rad);

    timeRef.current = 0;
    trailsRef.current = [];
    lastTsRef.current = null;
    lastSmokeTimeRef.current = 0;
    smokeParticlesRef.current = [];
    posRef.current = { x: originX, y: canvas.height * groundY, vx, vy };
    scorePopupRef.current = null;
    particleSystemRef.current.clear();
    cancelAnimationFrame(popupAnimRef.current);
    setHasLanded(false);
    setLastScore(null);
    setLastDistance(null);
    setIsRunning(true);

    // Launch sound effect
    playSFX("launch");
    playSFX("whoosh");
  };

  const reset = () => {
    cancelAnimationFrame(animRef.current);
    cancelAnimationFrame(popupAnimRef.current);
    timeRef.current = 0;
    trailsRef.current = [];
    lastTsRef.current = null;
    lastSmokeTimeRef.current = 0;
    smokeParticlesRef.current = [];
    posRef.current = { x: 0, y: 0, vx: 0, vy: 0 };
    scorePopupRef.current = null;
    particleSystemRef.current.clear();
    setIsRunning(false);
    setHasLanded(false);
    setLastScore(null);
    setLastDistance(null);
    draw();
  };

  const newTarget = () => {
    reset();
    randomizeTarget();
    // Re-randomize wind for medium/hard
    if (difficulty === "medium") {
      setWindSpeed(3 + Math.random() * 5);
    } else if (difficulty === "hard") {
      setWindSpeed(4 + Math.random() * 6);
      windPhaseRef.current = Math.random() * Math.PI * 2;
    }
  };

  const resetGame = () => {
    reset();
    setTotalScore(0);
    setAttempts(0);
    setStreak(0);
    setBestStreak(0);
    randomizeTarget();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Launch Angle
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={5}
              max={85}
              value={angle}
              onChange={(e) => {
                setAngle(Number(e.target.value));
                if (!isRunning) draw();
              }}
              disabled={isRunning}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">
              {angle}&deg;
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Initial Speed
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min={10}
              max={100}
              value={speed}
              onChange={(e) => {
                setSpeed(Number(e.target.value));
                if (!isRunning) draw();
              }}
              disabled={isRunning}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">
              {speed} m/s
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Difficulty
          </label>
          <div className="flex items-center gap-2 mt-2">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDifficulty(d);
                  reset();
                }}
                disabled={isRunning}
                className={`flex-1 h-9 rounded-lg text-xs font-semibold transition-colors ${
                  difficulty === d
                    ? d === "easy"
                      ? "bg-green-600 text-white"
                      : d === "medium"
                      ? "bg-amber-500 text-white"
                      : "bg-red-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-end gap-2">
          <button
            onClick={launch}
            disabled={isRunning}
            className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors"
          >
            {isRunning ? "Launching..." : "Launch"}
          </button>
          <button
            onClick={reset}
            className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Score & Game Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Total Score
          </div>
          <div className="text-3xl font-mono font-bold text-amber-500">
            {totalScore}
            <span className="text-sm text-gray-400 ml-1">pts</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {attempts} attempt{attempts !== 1 ? "s" : ""}
            {attempts > 0 && (
              <span>
                {" "}
                &middot; {((totalScore / (attempts * 3)) * 100).toFixed(0)}%
                accuracy
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Last Shot
          </div>
          {lastScore !== null && lastDistance !== null ? (
            <>
              <div
                className={`text-2xl font-mono font-bold ${
                  lastScore >= 3
                    ? "text-green-500"
                    : lastScore >= 2
                    ? "text-amber-500"
                    : lastScore >= 1
                    ? "text-yellow-500"
                    : "text-red-500"
                }`}
              >
                {lastScore >= 3
                  ? "BULLSEYE!"
                  : lastScore >= 2
                  ? "CLOSE!"
                  : lastScore >= 1
                  ? "HIT!"
                  : "MISS!"}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {lastDistance.toFixed(1)} m from target &middot; +{lastScore} pts
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400 mt-2">No shots yet</div>
          )}
        </div>

        {/* Streak display */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Hit Streak
          </div>
          <div className={`text-2xl font-mono font-bold ${streak >= 3 ? "text-orange-500" : streak > 0 ? "text-amber-500" : "text-gray-400"}`}>
            {streak}
            {streak >= 3 && <span className="text-sm ml-1">x{Math.min(streak, 5)} bonus</span>}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Best: {bestStreak}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col justify-between">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Game Controls
          </div>
          <div className="flex gap-2">
            <button
              onClick={newTarget}
              disabled={isRunning}
              className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors"
            >
              New Target
            </button>
            <button
              onClick={resetGame}
              disabled={isRunning}
              className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Reset Game
            </button>
          </div>
        </div>
      </div>

      {/* Scoring Guide */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Scoring
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
            <div className="font-mono font-bold text-green-500">3 pts</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Bullseye (&lt;5m)
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
            <div className="font-mono font-bold text-amber-500">2 pts</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Close (&lt;15m)
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
            <div className="font-mono font-bold text-yellow-500">1 pt</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Hit (&lt;30m)
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
            <div className="font-mono font-bold text-red-500">0 pts</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Miss (&gt;30m)
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
            <div className="font-mono font-bold text-orange-500">+3-5</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Streak (3+ hits)
            </div>
          </div>
        </div>
      </div>

      {/* Key Equations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Key Equations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="x(t) = v_0\cos\theta \cdot t + \frac{1}{2}a_x t^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="y(t) = v_0\sin\theta \cdot t - \frac{1}{2}gt^2" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <SimMath math="a_x = -v_{wind} \cdot 0.1" />
          </div>
        </div>
      </div>
    </div>
  );
}
