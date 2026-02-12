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
import { getCanvasMousePos } from "@/lib/simulation/interaction";
import { drawTarget } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

type ChallengeType = "none" | "destructive" | "target-amplitude";
type ViewMode = "normal" | "standing" | "beats";

interface Probe {
  x: number; // normalized 0-1 position along the wave
  id: number;
}

export default function WaveInterference() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [freq1, setFreq1] = useState(2);
  const [freq2, setFreq2] = useState(2);
  const [amp1, setAmp1] = useState(40);
  const [amp2, setAmp2] = useState(40);
  const [phase, setPhase] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("normal");

  // Track active preset ("constructive" | "destructive" | null)
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Highlight flash for Wave Physics section on mode/preset change
  const [physicsHighlight, setPhysicsHighlight] = useState(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measurement probes
  const [probes, setProbes] = useState<Probe[]>([]);
  const probeIdRef = useRef(0);

  // Audio representation
  const [audioOn, setAudioOn] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const osc1Ref = useRef<OscillatorNode | null>(null);
  const osc2Ref = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Challenge mode
  const [challengeType, setChallengeType] = useState<ChallengeType>("none");
  const [targetAmplitude, setTargetAmplitude] = useState(0);
  const [targetX, setTargetX] = useState(0.5);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const scorePopupsRef = useRef<ScorePopup[]>([]);

  // Particles
  const particlesRef = useRef(new ParticleSystem());

  // Trigger highlight flash on the Wave Physics section
  const triggerPhysicsHighlight = useCallback(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    setPhysicsHighlight(true);
    highlightTimeoutRef.current = setTimeout(() => {
      setPhysicsHighlight(false);
    }, 1000);
  }, []);

  // Clean up highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Start/stop audio
  useEffect(() => {
    if (audioOn) {
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.value = 0.08;
        gain.connect(ctx.destination);

        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.value = freq1 * 110; // Scale to audible range
        osc1.connect(gain);
        osc1.start();

        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq2 * 110;
        osc2.connect(gain);
        osc2.start();

        audioCtxRef.current = ctx;
        osc1Ref.current = osc1;
        osc2Ref.current = osc2;
        gainRef.current = gain;
      } catch {
        // Audio not available
      }
    } else {
      if (osc1Ref.current) {
        osc1Ref.current.stop();
        osc1Ref.current = null;
      }
      if (osc2Ref.current) {
        osc2Ref.current.stop();
        osc2Ref.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    }
    return () => {
      if (osc1Ref.current) {
        try { osc1Ref.current.stop(); } catch { /* ignore */ }
      }
      if (osc2Ref.current) {
        try { osc2Ref.current.stop(); } catch { /* ignore */ }
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* ignore */ }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOn]);

  // Update audio frequencies when sliders change
  useEffect(() => {
    if (osc1Ref.current) osc1Ref.current.frequency.value = freq1 * 110;
    if (osc2Ref.current) osc2Ref.current.frequency.value = freq2 * 110;
  }, [freq1, freq2]);

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

    const t = timeRef.current;
    const margin = 50;
    const graphW = W - margin * 2;

    const isBeats = viewMode === "beats";
    const isStanding = viewMode === "standing";

    const sections = [
      { y: H * 0.17, label: "Wave 1", color: "#ef4444", colorGlow: "rgba(239,68,68,0.3)", freq: freq1, amp: amp1, phaseOff: 0 },
      { y: H * 0.45, label: "Wave 2", color: "#3b82f6", colorGlow: "rgba(59,130,246,0.3)", freq: freq2, amp: amp2, phaseOff: phase },
      { y: H * 0.78, label: isStanding ? "Standing Wave" : "Superposition", color: "#a855f7", colorGlow: "rgba(168,85,247,0.3)", freq: 0, amp: 0, phaseOff: 0 },
    ];

    sections.forEach((sec, idx) => {
      // Center line
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, sec.y);
      ctx.lineTo(W - margin, sec.y);
      ctx.stroke();

      // Label
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = sec.color;
      ctx.textAlign = "left";
      ctx.fillText(sec.label, margin, sec.y - sec.amp - 15 > 10 ? sec.y - (idx < 2 ? sec.amp : Math.max(amp1, amp2)) - 12 : 15);

      // Beat frequency info
      if (idx === 2 && isBeats) {
        const beatFreq = Math.abs(freq1 - freq2);
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`Beat freq: ${beatFreq.toFixed(2)} Hz`, margin + 150, sec.y - Math.max(amp1, amp2) - 12);
      }

      // Wave
      ctx.strokeStyle = sec.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = sec.colorGlow;
      ctx.shadowBlur = 10;
      ctx.beginPath();

      const perfectCancel = idx === 2 && freq1 === freq2 && amp1 === amp2 && Math.abs(phase - Math.PI) < 0.02;

      for (let px = 0; px <= graphW; px++) {
        const x = (px / graphW) * Math.PI * 8;
        let y: number;
        if (idx < 2) {
          y = sec.amp * Math.sin(sec.freq * x - sec.freq * t * 3 + sec.phaseOff);
        } else if (perfectCancel) {
          y = 0;
        } else {
          const y1 = amp1 * Math.sin(freq1 * x - freq1 * t * 3);
          const y2 = amp2 * Math.sin(freq2 * x - freq2 * t * 3 + phase);
          y = y1 + y2;
        }
        const screenX = margin + px;
        const screenY = sec.y - y;
        if (px === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Fill under wave with subtle gradient
      if (idx === 2) {
        ctx.beginPath();
        for (let px = 0; px <= graphW; px++) {
          const x = (px / graphW) * Math.PI * 8;
          let y: number;
          if (perfectCancel) {
            y = 0;
          } else {
            const y1 = amp1 * Math.sin(freq1 * x - freq1 * t * 3);
            const y2 = amp2 * Math.sin(freq2 * x - freq2 * t * 3 + phase);
            y = y1 + y2;
          }
          const screenX = margin + px;
          const screenY = sec.y - y;
          if (px === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.lineTo(W - margin, sec.y);
        ctx.lineTo(margin, sec.y);
        ctx.closePath();
        ctx.fillStyle = "rgba(168,85,247,0.08)";
        ctx.fill();

        // Standing wave: show envelope and nodes/antinodes
        if (isStanding && freq1 === freq2) {
          // Envelope (maximum amplitude at each point)
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(168,85,247,0.4)";
          ctx.lineWidth = 1.5;

          // Upper envelope
          ctx.beginPath();
          for (let px = 0; px <= graphW; px++) {
            const x = (px / graphW) * Math.PI * 8;
            const ampEnv = Math.sqrt(
              amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos((freq2 - freq1) * x + phase)
            );
            const screenX = margin + px;
            if (px === 0) ctx.moveTo(screenX, sec.y - ampEnv);
            else ctx.lineTo(screenX, sec.y - ampEnv);
          }
          ctx.stroke();

          // Lower envelope
          ctx.beginPath();
          for (let px = 0; px <= graphW; px++) {
            const x = (px / graphW) * Math.PI * 8;
            const ampEnv = Math.sqrt(
              amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos((freq2 - freq1) * x + phase)
            );
            const screenX = margin + px;
            if (px === 0) ctx.moveTo(screenX, sec.y + ampEnv);
            else ctx.lineTo(screenX, sec.y + ampEnv);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Find and mark nodes (points where envelope ~ 0)
          if (freq1 === freq2 && Math.abs(phase - Math.PI) < 0.1) {
            // Destructive at half-wavelength intervals
            for (let px = 0; px <= graphW; px += 5) {
              const ampEnv = Math.sqrt(
                amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phase)
              );
              if (ampEnv < 2) {
                // Node marker
                ctx.fillStyle = "#22c55e";
                ctx.beginPath();
                ctx.arc(margin + px, sec.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = "8px ui-monospace";
                ctx.fillStyle = "#22c55e";
                ctx.textAlign = "center";
                ctx.fillText("N", margin + px, sec.y + 14);
              }
            }
          }

          // Mark antinodes (points where envelope is maximum)
          if (freq1 === freq2 && Math.abs(phase) < 0.1) {
            for (let px = 0; px <= graphW; px += Math.round(graphW / (freq1 * 4))) {
              const ampEnv = Math.sqrt(
                amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phase)
              );
              if (ampEnv > amp1 * 1.5) {
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(margin + px, sec.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = "8px ui-monospace";
                ctx.fillStyle = "#ef4444";
                ctx.textAlign = "center";
                ctx.fillText("A", margin + px, sec.y + 14);
              }
            }
          }
        }

        // Beat frequency: show envelope
        if (isBeats && freq1 !== freq2) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = "rgba(245,158,11,0.5)";
          ctx.lineWidth = 1.5;

          // Upper beat envelope
          ctx.beginPath();
          for (let px = 0; px <= graphW; px++) {
            const x = (px / graphW) * Math.PI * 8;
            const beatEnv = Math.sqrt(
              amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos((freq2 - freq1) * (x - t * 3) + phase)
            );
            const screenX = margin + px;
            if (px === 0) ctx.moveTo(screenX, sec.y - beatEnv);
            else ctx.lineTo(screenX, sec.y - beatEnv);
          }
          ctx.stroke();

          // Lower beat envelope
          ctx.beginPath();
          for (let px = 0; px <= graphW; px++) {
            const x = (px / graphW) * Math.PI * 8;
            const beatEnv = Math.sqrt(
              amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos((freq2 - freq1) * (x - t * 3) + phase)
            );
            const screenX = margin + px;
            if (px === 0) ctx.moveTo(screenX, sec.y + beatEnv);
            else ctx.lineTo(screenX, sec.y + beatEnv);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    });

    // Separator lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, H * 0.31);
    ctx.lineTo(W - 20, H * 0.31);
    ctx.moveTo(20, H * 0.61);
    ctx.lineTo(W - 20, H * 0.61);
    ctx.stroke();
    ctx.setLineDash([]);

    // "+" symbol between waves
    ctx.font = "bold 20px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "center";
    ctx.fillText("+", W / 2, H * 0.31 + 7);
    ctx.fillText("=", W / 2, H * 0.61 + 7);

    // Draw measurement probes
    probes.forEach((probe) => {
      const probeScreenX = margin + probe.x * graphW;
      const superY = H * 0.78;

      // Vertical line through all three sections
      ctx.strokeStyle = "rgba(34,197,94,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(probeScreenX, 10);
      ctx.lineTo(probeScreenX, H - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Compute amplitude at this point
      const x = probe.x * Math.PI * 8;
      const y1 = amp1 * Math.sin(freq1 * x - freq1 * t * 3);
      const y2 = amp2 * Math.sin(freq2 * x - freq2 * t * 3 + phase);
      const yTotal = y1 + y2;

      // Probe marker on superposition wave
      const probeY = superY - yTotal;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(probeScreenX, probeY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Glow around probe
      const probeGlow = ctx.createRadialGradient(probeScreenX, probeY, 0, probeScreenX, probeY, 15);
      probeGlow.addColorStop(0, "rgba(34,197,94,0.4)");
      probeGlow.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = probeGlow;
      ctx.beginPath();
      ctx.arc(probeScreenX, probeY, 15, 0, Math.PI * 2);
      ctx.fill();

      // Value label
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(probeScreenX - 35, probeY - 28, 70, 18, 4);
      ctx.fill();
      ctx.font = "bold 10px ui-monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText(`A=${yTotal.toFixed(1)}`, probeScreenX, probeY - 15);

      // Individual wave values
      ctx.font = "8px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.fillText(`${y1.toFixed(0)}`, probeScreenX - 20, probeY - 32);
      ctx.fillStyle = "#3b82f6";
      ctx.fillText(`${y2.toFixed(0)}`, probeScreenX + 20, probeY - 32);
    });

    // Challenge display
    if (challengeType !== "none") {
      renderScoreboard(ctx, 10, 10, 140, 110, challengeRef.current);

      if (challengeType === "destructive") {
        // Show target
        ctx.fillStyle = "rgba(239,68,68,0.15)";
        ctx.beginPath();
        ctx.roundRect(10, 130, 140, 50, 6);
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = "bold 10px ui-monospace";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText("CANCEL THE WAVES", 80, 147);
        ctx.font = "11px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText("Set phase to cancel", 80, 162);

        // Show how close to cancellation
        const maxPossibleAmp = amp1 + amp2;
        const currentMaxAmp = Math.sqrt(amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phase));
        const cancellation = 1 - currentMaxAmp / maxPossibleAmp;
        ctx.fillText(`${(cancellation * 100).toFixed(0)}% cancelled`, 80, 175);
      }

      if (challengeType === "target-amplitude") {
        const targetScreenX = margin + targetX * graphW;
        drawTarget(ctx, targetScreenX, H * 0.78, 12, "#ef4444", (t * 0.5) % 1);

        ctx.fillStyle = "rgba(245,158,11,0.15)";
        ctx.beginPath();
        ctx.roundRect(10, 130, 140, 50, 6);
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = "bold 10px ui-monospace";
        ctx.fillStyle = "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText("TARGET AMPLITUDE", 80, 147);
        ctx.font = "bold 14px ui-monospace";
        ctx.fillText(`A = ${targetAmplitude.toFixed(0)}`, 80, 165);
        ctx.font = "10px ui-monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`at x = ${targetX.toFixed(2)}`, 80, 178);
      }
    }

    // "Click to add probe" hint
    if (probes.length === 0) {
      ctx.font = "10px ui-monospace";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.textAlign = "center";
      ctx.fillText("Click on superposition wave to place measurement probes", W / 2, H * 0.95);
    }

    // Particles
    particlesRef.current.draw(ctx);

    // Score popups
    const now = performance.now();
    scorePopupsRef.current = scorePopupsRef.current.filter((p) =>
      renderScorePopup(ctx, p, now)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq1, freq2, amp1, amp2, phase, probes, viewMode, challengeType, targetAmplitude, targetX]);

  const animate = useCallback(() => {
    const now = performance.now();
    if (lastTsRef.current == null) {
      lastTsRef.current = now;
    }
    const dt = Math.min((now - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = now;
    timeRef.current += dt;

    // Update particles
    particlesRef.current.update(dt);

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // Click handler for probes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const pos = getCanvasMousePos(canvas, e);
      const W = canvas.width;
      const H = canvas.height;
      const margin = 50;
      const graphW = W - margin * 2;

      // Check if click is in the superposition wave area
      if (pos.y > H * 0.61 && pos.y < H * 0.95 && pos.x > margin && pos.x < W - margin) {
        const normalizedX = (pos.x - margin) / graphW;

        // Check if clicking near existing probe to remove it
        const existingIdx = probes.findIndex(
          (p) => Math.abs(p.x - normalizedX) < 0.02
        );

        if (existingIdx >= 0) {
          setProbes((prev) => prev.filter((_, i) => i !== existingIdx));
          playSFX("pop");
        } else if (probes.length < 5) {
          probeIdRef.current += 1;
          setProbes((prev) => [...prev, { x: normalizedX, id: probeIdRef.current }]);
          playSFX("click");
          particlesRef.current.emitGlow(pos.x, pos.y, 5, "#22c55e");
        }
      }
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [probes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.6), _isMobile ? 500 : 520);
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

  // Challenge: Destructive interference
  const startDestructiveChallenge = () => {
    setChallengeType("destructive");
    // Reset to same freq/amp so only phase matters
    setFreq1(2);
    setFreq2(2);
    setAmp1(40);
    setAmp2(40);
    setPhase(Math.random() * Math.PI * 0.5); // Start with some random phase
    challengeRef.current = createChallengeState();
    challengeRef.current.active = true;
    setChallengeState(challengeRef.current);
  };

  // Challenge: Target amplitude at a point
  const startTargetAmplitudeChallenge = () => {
    setChallengeType("target-amplitude");
    const tX = 0.2 + Math.random() * 0.6;
    const tA = Math.round(10 + Math.random() * 60);
    setTargetX(parseFloat(tX.toFixed(2)));
    setTargetAmplitude(tA);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = true;
    setChallengeState(challengeRef.current);
  };

  const handleCheckDestructive = () => {
    // Score based on how much the waves cancel
    const maxPossibleAmp = amp1 + amp2;
    const currentMaxAmp = Math.sqrt(amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phase));
    const cancellation = 1 - currentMaxAmp / maxPossibleAmp;

    // Need near-perfect cancellation (same freq, same amp, phase = pi)
    const result = calculateAccuracy(cancellation, 1.0, 1.0);
    const newState = updateChallengeState(challengeRef.current, result);
    challengeRef.current = newState;
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      scorePopupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height * 0.4,
        startTime: performance.now(),
      });
    }

    if (result.points >= 2) {
      playSFX("success");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(canvas.width / 2, canvas.height * 0.4, 20);
    } else if (result.points > 0) {
      playSFX("correct");
    } else {
      playSFX("incorrect");
    }
  };

  const handleCheckTargetAmplitude = () => {
    // Compute max amplitude at target position
    const x = targetX * Math.PI * 8;
    // For the max amplitude, we compute the envelope
    const maxAmp = Math.sqrt(
      amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos((freq2 - freq1) * x + phase)
    );

    const result = calculateAccuracy(maxAmp, targetAmplitude, targetAmplitude);
    const newState = updateChallengeState(challengeRef.current, result);
    challengeRef.current = newState;
    setChallengeState(newState);

    const canvas = canvasRef.current;
    if (canvas) {
      const probeScreenX = 50 + targetX * (canvas.width - 100);
      scorePopupsRef.current.push({
        text: `${result.label} (A=${maxAmp.toFixed(0)})`,
        points: result.points,
        x: probeScreenX,
        y: canvas.height * 0.7,
        startTime: performance.now(),
      });
    }

    if (result.points >= 2) {
      playSFX("success");
      playScore(result.points);
      if (canvas) particlesRef.current.emitConfetti(canvas.width / 2, canvas.height * 0.4, 20);
    } else if (result.points > 0) {
      playSFX("correct");
    } else {
      playSFX("incorrect");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="w-full cursor-crosshair" />
      </div>

      {/* Challenge panels */}
      {challengeType === "destructive" && (
        <div className="rounded-xl border-2 border-red-500/50 bg-red-50 dark:bg-red-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-red-600 dark:text-red-400 text-sm font-bold uppercase tracking-wider">
                Destructive Interference Challenge
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Adjust phase difference to completely cancel the waves. Hint: equal freq + equal amp + phase = {"\u03C0"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">Cancellation</div>
              <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                {(() => {
                  const maxAmp = amp1 + amp2;
                  const currentAmp = Math.sqrt(amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phase));
                  return ((1 - currentAmp / maxAmp) * 100).toFixed(0);
                })()}%
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCheckDestructive}
              className="px-4 h-9 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors"
            >
              Check
            </button>
            <button
              onClick={startDestructiveChallenge}
              className="px-4 h-9 rounded-lg border border-red-500 text-red-500 hover:bg-red-500/10 font-medium text-sm transition-colors"
            >
              New Challenge
            </button>
            <div className="flex items-center gap-2 ml-auto text-sm text-gray-500 dark:text-gray-400">
              <span>Score: <strong className="text-gray-900 dark:text-white">{challengeState.score}</strong></span>
              <span>|</span>
              <span>Streak: <strong className="text-amber-400">{challengeState.streak}</strong></span>
            </div>
          </div>
        </div>
      )}

      {challengeType === "target-amplitude" && (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-amber-600 dark:text-amber-400 text-sm font-bold uppercase tracking-wider">
                Target Amplitude Challenge
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Adjust wave parameters to achieve amplitude {targetAmplitude} at x = {targetX.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCheckTargetAmplitude}
              className="px-4 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
            >
              Check
            </button>
            <button
              onClick={startTargetAmplitudeChallenge}
              className="px-4 h-9 rounded-lg border border-amber-500 text-amber-500 hover:bg-amber-500/10 font-medium text-sm transition-colors"
            >
              New Target
            </button>
            <div className="flex items-center gap-2 ml-auto text-sm text-gray-500 dark:text-gray-400">
              <span>Score: <strong className="text-gray-900 dark:text-white">{challengeState.score}</strong></span>
              <span>|</span>
              <span>Streak: <strong className="text-amber-400">{challengeState.streak}</strong></span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Wave 1 Freq</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={5} step={0.1} value={freq1}
              onChange={(e) => { setFreq1(Number(e.target.value)); setActivePreset(null); }}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{freq1.toFixed(1)} Hz</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-red-500 uppercase tracking-wider">Wave 1 Amp</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={80} value={amp1}
              onChange={(e) => { setAmp1(Number(e.target.value)); setActivePreset(null); }}
              className="flex-1 accent-red-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{amp1}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Wave 2 Freq</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0.5} max={5} step={0.1} value={freq2}
              onChange={(e) => { setFreq2(Number(e.target.value)); setActivePreset(null); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3.5rem] text-right">{freq2.toFixed(1)} Hz</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-blue-500 uppercase tracking-wider">Wave 2 Amp</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={10} max={80} value={amp2}
              onChange={(e) => { setAmp2(Number(e.target.value)); setActivePreset(null); }}
              className="flex-1 accent-blue-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[2.5rem] text-right">{amp2}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-purple-500 uppercase tracking-wider">Phase Diff</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={0} max={6.28} step={0.01} value={phase}
              onChange={(e) => { setPhase(Number(e.target.value)); setActivePreset(null); }}
              className="flex-1 accent-purple-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{(phase / Math.PI).toFixed(1)}{"\u03C0"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => {
            if (!isRunning) {
              lastTsRef.current = null;
            }
            setIsRunning(!isRunning);
          }}
          className="px-6 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
        >
          {isRunning ? "Pause" : "Play"}
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        {/* View mode buttons */}
        <button
          onClick={() => { setViewMode("normal"); setActivePreset(null); triggerPhysicsHighlight(); }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors border ${
            viewMode === "normal" && activePreset === null
              ? "bg-purple-600 text-white border-purple-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          Normal
        </button>
        <button
          onClick={() => { setViewMode("standing"); setActivePreset(null); setFreq1(2); setFreq2(2); setAmp1(40); setAmp2(40); setPhase(0); triggerPhysicsHighlight(); }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors border ${
            viewMode === "standing"
              ? "bg-purple-600 text-white border-purple-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          Standing Wave
        </button>
        <button
          onClick={() => { setViewMode("beats"); setActivePreset(null); setFreq1(2); setFreq2(2.2); setAmp1(40); setAmp2(40); setPhase(0); triggerPhysicsHighlight(); }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors border ${
            viewMode === "beats"
              ? "bg-purple-600 text-white border-purple-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          Beats
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Preset buttons */}
        <button onClick={() => { setViewMode("normal"); setActivePreset("constructive"); setFreq1(2); setFreq2(2); setAmp1(40); setAmp2(40); setPhase(0); triggerPhysicsHighlight(); }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors border ${
            activePreset === "constructive"
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/20"
          }`}>
          Constructive
        </button>
        <button onClick={() => { setViewMode("normal"); setActivePreset("destructive"); setFreq1(2); setFreq2(2); setAmp1(40); setAmp2(40); setPhase(Math.PI); triggerPhysicsHighlight(); }}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors border ${
            activePreset === "destructive"
              ? "bg-red-600 text-white border-red-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20"
          }`}>
          Destructive
        </button>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Audio toggle */}
        <button
          onClick={() => setAudioOn(!audioOn)}
          className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors border ${
            audioOn
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          }`}
        >
          {audioOn ? "\u{1F50A} Audio ON" : "\u{1F508} Audio"}
        </button>

        {/* Clear probes */}
        {probes.length > 0 && (
          <button
            onClick={() => { setProbes([]); playSFX("pop"); }}
            className="px-4 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            Clear Probes ({probes.length})
          </button>
        )}

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Challenge buttons */}
        {challengeType === "none" ? (
          <>
            <button
              onClick={startDestructiveChallenge}
              className="px-4 h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors"
            >
              Cancel Challenge
            </button>
            <button
              onClick={startTargetAmplitudeChallenge}
              className="px-4 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
            >
              Target Amp
            </button>
          </>
        ) : (
          <button
            onClick={() => setChallengeType("none")}
            className="px-4 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
          >
            Exit Challenge
          </button>
        )}
      </div>

      <div className={`rounded-xl border-2 bg-white dark:bg-gray-900 p-4 transition-all duration-500 ${
        physicsHighlight
          ? "border-purple-400 dark:border-purple-500 shadow-lg shadow-purple-500/10 bg-purple-50/50 dark:bg-purple-950/20"
          : "border-gray-200 dark:border-gray-800"
      }`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Wave Physics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="y = A\sin(kx - \omega t + \varphi)" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="f_{beat} = |f_1 - f_2|" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\Delta\varphi = \pi \text{: destructive}" /></div>
        </div>
      </div>
    </div>
  );
}
