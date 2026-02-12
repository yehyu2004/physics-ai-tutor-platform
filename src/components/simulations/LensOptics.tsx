"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  calculateAccuracy,
  renderScorePopup,
  renderScoreboard,
  createChallengeState,
  updateChallengeState,
  type ScorePopup,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { playSFX, playScore } from "@/lib/simulation/sound";
import { ParticleSystem } from "@/lib/simulation/particles";
import { drawInfoPanel } from "@/lib/simulation/drawing";
import { SimMath } from "@/components/simulations/SimMath";

type Mode = "sandbox" | "focus-challenge" | "microscope" | "identify";

interface FocusChallenge {
  targetImageDist: number; // pixels
  targetFocal: number;
  tolerance: number;
}

interface IdentifyChallenge {
  lensType: "converging" | "diverging";
  objectDist: number;
  focalLength: number;
  answer: "real" | "virtual";
  options: string[];
}

export default function LensOptics() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [focalLength, setFocalLength] = useState(120);
  const [objectDist, setObjectDist] = useState(250);
  const [objectHeight, setObjectHeight] = useState(80);
  const [lensType, setLensType] = useState<"converging" | "diverging">("converging");
  const [mode, setMode] = useState<Mode>("sandbox");

  // Drag state for lens
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isDraggingLens, setIsDraggingLens] = useState(false);
  const [lensPosition, setLensPosition] = useState(0.45); // fraction of canvas width

  // Challenge state
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const [challengeState, setChallengeState] = useState<ChallengeState>(createChallengeState());
  const popupsRef = useRef<ScorePopup[]>([]);
  const particlesRef = useRef(new ParticleSystem());

  // Focus challenge
  const [focusChallenge, setFocusChallenge] = useState<FocusChallenge | null>(null);
  const [focusSubmitted, setFocusSubmitted] = useState(false);

  // Microscope mode
  const [showSecondLens, setShowSecondLens] = useState(false);
  const [lens2Focal, setLens2Focal] = useState(60);
  const [lens2Position, setLens2Position] = useState(0.7); // fraction of W

  // Identify challenge
  const [identifyChallenge, setIdentifyChallenge] = useState<IdentifyChallenge | null>(null);
  const [identifySelected, setIdentifySelected] = useState<string | null>(null);

  const PX_TO_CM = 0.1;
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Generate a focus challenge
  const generateFocusChallenge = useCallback(() => {
    const targetDist = 150 + Math.random() * 250; // 150-400 px
    const targetFocal = 60 + Math.random() * 150; // 60-210 px
    setFocusChallenge({
      targetImageDist: targetDist,
      targetFocal: targetFocal,
      tolerance: 20,
    });
    setFocusSubmitted(false);
    setFocalLength(120); // reset
    setObjectDist(250);
    setLensType("converging");
  }, []);

  // Generate identify challenge
  const generateIdentifyChallenge = useCallback(() => {
    const lt = Math.random() > 0.5 ? "converging" : "diverging" as const;
    const od = 100 + Math.random() * 300;
    const fl = 60 + Math.random() * 150;
    const f = lt === "converging" ? fl : -fl;
    const di = 1 / (1 / f - 1 / od);
    const answer: "real" | "virtual" = di > 0 ? "real" : "virtual";

    setIdentifyChallenge({
      lensType: lt,
      objectDist: od,
      focalLength: fl,
      answer,
      options: ["real", "virtual"],
    });
    setIdentifySelected(null);
    setLensType(lt);
    setObjectDist(od);
    setFocalLength(fl);
  }, []);

  const startMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    challengeRef.current = createChallengeState();
    challengeRef.current.active = newMode !== "sandbox";
    setChallengeState({ ...challengeRef.current });
    popupsRef.current = [];
    particlesRef.current.clear();

    if (newMode === "focus-challenge") {
      generateFocusChallenge();
    } else if (newMode === "microscope") {
      setShowSecondLens(true);
      setLensType("converging");
      setFocalLength(80);
      setObjectDist(120);
      setObjectHeight(60);
      setLens2Focal(60);
      setLens2Position(0.7);
    } else if (newMode === "identify") {
      generateIdentifyChallenge();
    } else {
      setShowSecondLens(false);
      setFocusChallenge(null);
      setIdentifyChallenge(null);
    }
  }, [generateFocusChallenge, generateIdentifyChallenge]);

  const submitFocusAnswer = useCallback(() => {
    if (!focusChallenge || focusSubmitted) return;
    const f = lensType === "converging" ? focalLength : -focalLength;
    const imgDist = 1 / (1 / f - 1 / objectDist);
    const error = Math.abs(imgDist - focusChallenge.targetImageDist);
    const result = calculateAccuracy(imgDist, focusChallenge.targetImageDist, focusChallenge.tolerance * 3);

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeState({ ...challengeRef.current });
    setFocusSubmitted(true);

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: `${result.label} (error: ${(error * PX_TO_CM).toFixed(1)}cm)`,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: Date.now(),
      });
      if (result.points >= 2) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2);
        playSFX("success");
      } else if (result.points > 0) {
        playSFX("correct");
      } else {
        playSFX("incorrect");
      }
      playScore(result.points);
    }
  }, [focusChallenge, focusSubmitted, focalLength, objectDist, lensType]);

  const submitIdentifyAnswer = useCallback((answer: string) => {
    if (!identifyChallenge || identifySelected) return;
    setIdentifySelected(answer);
    const isCorrect = answer === identifyChallenge.answer;
    const result = isCorrect
      ? { points: 3, tier: "perfect" as const, label: "Correct!" }
      : { points: 0, tier: "miss" as const, label: "Incorrect" };

    challengeRef.current = updateChallengeState(challengeRef.current, result);
    setChallengeState({ ...challengeRef.current });

    const canvas = canvasRef.current;
    if (canvas) {
      popupsRef.current.push({
        text: result.label,
        points: result.points,
        x: canvas.width / 2,
        y: canvas.height / 2,
        startTime: Date.now(),
      });
      if (isCorrect) {
        particlesRef.current.emitConfetti(canvas.width / 2, canvas.height / 2);
        playSFX("success");
        playScore(3);
      } else {
        playSFX("incorrect");
      }
    }
  }, [identifyChallenge, identifySelected]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const now = Date.now();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const lensX = W * lensPosition;
    const axisY = H * 0.5;
    const f = lensType === "converging" ? focalLength : -focalLength;

    // Optical axis
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(W, axisY);
    ctx.stroke();

    // Lens
    ctx.strokeStyle = "rgba(100,200,255,0.6)";
    ctx.lineWidth = 3;
    const lensH = H * 0.7;

    if (lensType === "converging") {
      ctx.beginPath();
      ctx.ellipse(lensX, axisY, 8, lensH / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(lensX, axisY, 8, lensH / 2, 0, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(100,200,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(lensX, axisY - lensH / 2);
      ctx.lineTo(lensX - 6, axisY - lensH / 2 + 10);
      ctx.lineTo(lensX + 6, axisY - lensH / 2 + 10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(lensX, axisY + lensH / 2);
      ctx.lineTo(lensX - 6, axisY + lensH / 2 - 10);
      ctx.lineTo(lensX + 6, axisY + lensH / 2 - 10);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(lensX - 5, axisY, 8, lensH / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(lensX + 5, axisY, 8, lensH / 2, 0, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();
    }

    // "Drag me" indicator on lens
    if (mode === "sandbox") {
      ctx.save();
      ctx.fillStyle = "rgba(100,200,255,0.3)";
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("drag lens", lensX, axisY + lensH / 2 + 14);
      ctx.restore();
    }

    // Focal points
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(lensX + f, axisY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lensX - f, axisY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "bold 11px system-ui";
    ctx.fillStyle = "#f59e0b";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("F", lensX + f, axisY + 10);
    ctx.fillText("F'", lensX - f, axisY + 10);

    // 2F points
    ctx.fillStyle = "rgba(245,158,11,0.4)";
    ctx.beginPath();
    ctx.arc(lensX + 2 * f, axisY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lensX - 2 * f, axisY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "10px system-ui";
    ctx.fillStyle = "rgba(245,158,11,0.5)";
    ctx.fillText("2F", lensX + 2 * f, axisY + 10);
    ctx.fillText("2F'", lensX - 2 * f, axisY + 10);

    // Object
    const objX = lensX - objectDist;
    const objTopY = axisY - objectHeight;

    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(objX, axisY);
    ctx.lineTo(objX, objTopY);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(objX, objTopY);
    ctx.lineTo(objX - 6, objTopY + 10);
    ctx.lineTo(objX + 6, objTopY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.font = "11px system-ui";
    ctx.fillStyle = "#22c55e";
    ctx.textAlign = "center";
    ctx.fillText("Object", objX, axisY + 15);

    // Thin lens equation: 1/f = 1/do + 1/di
    const imgDist = 1 / (1 / f - 1 / objectDist);
    const magnification = -imgDist / objectDist;
    const imgHeight = magnification * objectHeight;

    // Image
    const imgX = lensX + imgDist;
    const imgTopY = axisY - imgHeight;
    const isVirtual = imgDist < 0;

    if (Math.abs(imgDist) < W * 2) {
      ctx.strokeStyle = isVirtual ? "rgba(168,85,247,0.6)" : "#a855f7";
      ctx.lineWidth = 3;
      if (isVirtual) {
        ctx.setLineDash([6, 4]);
      }
      ctx.beginPath();
      ctx.moveTo(imgX, axisY);
      ctx.lineTo(imgX, imgTopY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isVirtual ? "rgba(168,85,247,0.6)" : "#a855f7";
      ctx.beginPath();
      const arrDir = imgHeight > 0 ? 1 : -1;
      ctx.moveTo(imgX, imgTopY);
      ctx.lineTo(imgX - 6, imgTopY + arrDir * 10);
      ctx.lineTo(imgX + 6, imgTopY + arrDir * 10);
      ctx.closePath();
      ctx.fill();

      ctx.font = "11px system-ui";
      ctx.fillStyle = "#a855f7";
      ctx.textAlign = "center";
      ctx.fillText(isVirtual ? "Virtual Image" : "Real Image", imgX, axisY + 15);
    }

    // --- Magnification visual comparison ---
    if (Math.abs(magnification) < 20 && Math.abs(imgDist) < W * 2) {
      const compX = 15;
      const compY = H - 100;
      const compH = 60;
      const objBar = compH;
      const imgBar = Math.min(compH * 3, Math.abs(magnification) * compH);

      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(compX - 5, compY - 25, 120, compH + 35, 6);
      ctx.fill();

      ctx.font = "bold 9px ui-monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText("MAGNIFICATION", compX + 2, compY - 12);

      // Object bar
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(compX + 10, compY + compH - objBar, 14, objBar);
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = "#22c55e";
      ctx.textAlign = "center";
      ctx.fillText("obj", compX + 17, compY + compH + 10);

      // Image bar
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(compX + 40, compY + compH - imgBar, 14, imgBar);
      ctx.fillStyle = "#a855f7";
      ctx.fillText("img", compX + 47, compY + compH + 10);

      // Magnification factor
      ctx.font = "bold 14px ui-monospace";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.abs(magnification).toFixed(1)}x`, compX + 65, compY + compH / 2 + 5);
      ctx.font = "9px ui-monospace";
      ctx.fillStyle = magnification > 0 ? "#22c55e" : "#ef4444";
      ctx.fillText(magnification > 0 ? "upright" : "inverted", compX + 65, compY + compH / 2 + 18);
    }

    // Ray tracing (3 principal rays)
    const drawRay = (color: string, segments: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }[]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      segments.forEach((seg) => {
        if (seg.dashed) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    };

    // Ray 1: Parallel to axis -> through focal point
    const ray1color = "rgba(239,68,68,0.6)";
    drawRay(ray1color, [
      { x1: objX, y1: objTopY, x2: lensX, y2: objTopY },
      { x1: lensX, y1: objTopY, x2: lensX + Math.max(f * 3, W - lensX), y2: objTopY + (Math.max(f * 3, W - lensX)) * (objTopY - axisY) / (-f) + (objTopY - axisY), dashed: isVirtual },
    ]);

    if (f > 0) {
      drawRay(ray1color, [
        { x1: lensX, y1: objTopY, x2: Math.min(lensX + f * 3, W), y2: axisY + (objTopY - axisY) * (1 - f * 3 / f) },
      ]);
    }

    // Ray 2: Through center of lens (undeviated)
    const ray2color = "rgba(59,130,246,0.6)";
    const slope = (objTopY - axisY) / (objX - lensX);
    const ray2endX = lensX + 400;
    drawRay(ray2color, [
      { x1: objX, y1: objTopY, x2: lensX, y2: axisY + slope * (lensX - objX) },
      { x1: lensX, y1: axisY + slope * (lensX - objX), x2: ray2endX, y2: axisY + slope * (ray2endX - objX), dashed: isVirtual },
    ]);

    // Ray 3: Through focal point on object side -> parallel after lens
    const ray3color = "rgba(34,197,94,0.6)";
    const fObjX = lensX - f;
    const slope3 = (objTopY - axisY) / (objX - fObjX);
    const yAtLens = axisY + slope3 * (lensX - fObjX);
    drawRay(ray3color, [
      { x1: objX, y1: objTopY, x2: lensX, y2: yAtLens },
      { x1: lensX, y1: yAtLens, x2: W, y2: yAtLens, dashed: isVirtual },
    ]);

    // === COMPOUND MICROSCOPE MODE: Second Lens ===
    if (showSecondLens && mode === "microscope") {
      const lens2X = W * lens2Position;
      const f2 = lens2Focal;

      // Draw second lens
      ctx.strokeStyle = "rgba(255,200,100,0.6)";
      ctx.lineWidth = 3;
      const lens2H = H * 0.5;
      ctx.beginPath();
      ctx.ellipse(lens2X, axisY, 6, lens2H / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(lens2X, axisY, 6, lens2H / 2, 0, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();

      // Lens 2 label
      ctx.font = "bold 10px system-ui";
      ctx.fillStyle = "rgba(255,200,100,0.8)";
      ctx.textAlign = "center";
      ctx.fillText("Eyepiece", lens2X, axisY + lens2H / 2 + 14);

      // Lens 1 label
      ctx.fillStyle = "rgba(100,200,255,0.8)";
      ctx.fillText("Objective", lensX, axisY + lensH / 2 + 14);

      // Focal points of second lens
      ctx.fillStyle = "rgba(255,200,100,0.5)";
      ctx.beginPath();
      ctx.arc(lens2X + f2, axisY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lens2X - f2, axisY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "9px system-ui";
      ctx.fillText("F₂", lens2X + f2, axisY + 10);
      ctx.fillText("F₂'", lens2X - f2, axisY + 10);

      // Second lens image from first image
      if (Math.abs(imgDist) < W * 2 && imgDist > 0) {
        const obj2Dist = lens2X - imgX;
        if (obj2Dist > 0) {
          const imgDist2 = 1 / (1 / f2 - 1 / obj2Dist);
          const mag2 = -imgDist2 / obj2Dist;
          const totalMag = magnification * mag2;

          // Draw the final image
          if (Math.abs(imgDist2) < W * 2) {
            const finalImgX = lens2X + imgDist2;
            const finalImgHeight = imgHeight * mag2;
            const finalImgTopY = axisY - finalImgHeight;
            const isVirtual2 = imgDist2 < 0;

            ctx.strokeStyle = isVirtual2 ? "rgba(236,72,153,0.5)" : "#ec4899";
            ctx.lineWidth = 3;
            if (isVirtual2) ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(finalImgX, axisY);
            ctx.lineTo(finalImgX, finalImgTopY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = isVirtual2 ? "rgba(236,72,153,0.5)" : "#ec4899";
            ctx.beginPath();
            const fd = finalImgHeight > 0 ? 1 : -1;
            ctx.moveTo(finalImgX, finalImgTopY);
            ctx.lineTo(finalImgX - 6, finalImgTopY + fd * 10);
            ctx.lineTo(finalImgX + 6, finalImgTopY + fd * 10);
            ctx.closePath();
            ctx.fill();

            ctx.font = "11px system-ui";
            ctx.fillStyle = "#ec4899";
            ctx.textAlign = "center";
            ctx.fillText("Final Image", finalImgX, axisY + 28);

            // Microscope info panel
            drawInfoPanel(ctx, W - 230, H - 105, 218, 95, "MICROSCOPE", [
              { label: "Objective M₁", value: magnification.toFixed(2), color: "#a855f7" },
              { label: "Eyepiece M₂", value: mag2.toFixed(2), color: "#ec4899" },
              { label: "Total M", value: totalMag.toFixed(1) + "x", color: "#ffffff" },
              { label: "Tube length", value: ((lens2X - lensX) * PX_TO_CM).toFixed(1) + " cm" },
            ]);
          }
        }
      }
    }

    // === FOCUS CHALLENGE target indicator ===
    if (mode === "focus-challenge" && focusChallenge) {
      const targetX = lensX + focusChallenge.targetImageDist;
      const pulse = (timeRef.current % 2) / 2;

      // Target zone
      ctx.save();
      ctx.strokeStyle = `rgba(239,68,68,${0.4 + Math.sin(pulse * Math.PI * 2) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(targetX, axisY - 100);
      ctx.lineTo(targetX, axisY + 100);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target label
      ctx.font = "bold 11px ui-monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText("TARGET", targetX, axisY - 110);
      ctx.font = "10px ui-monospace";
      ctx.fillText(`d_i = ${(focusChallenge.targetImageDist * PX_TO_CM).toFixed(1)} cm`, targetX, axisY - 95);

      // Tolerance zone
      ctx.fillStyle = "rgba(239,68,68,0.05)";
      ctx.fillRect(targetX - focusChallenge.tolerance, 0, focusChallenge.tolerance * 2, H);
      ctx.restore();

      // Show current image distance error
      if (!focusSubmitted && imgDist > 0) {
        const errorDist = Math.abs(imgDist - focusChallenge.targetImageDist);
        ctx.font = "11px ui-monospace";
        ctx.fillStyle = errorDist < focusChallenge.tolerance ? "#22c55e" : "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText(`Error: ${(errorDist * PX_TO_CM).toFixed(1)} cm`, W / 2, 20);
      }
    }

    // === IDENTIFY challenge indicator ===
    if (mode === "identify" && identifyChallenge) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 140, 8, 280, 30, 8);
      ctx.fill();
      ctx.font = "bold 12px ui-monospace";
      ctx.fillStyle = "#f59e0b";
      ctx.textAlign = "center";
      ctx.fillText("Is the image REAL or VIRTUAL?", W / 2, 28);
      ctx.restore();

      if (identifySelected) {
        const correct = identifySelected === identifyChallenge.answer;
        ctx.save();
        ctx.fillStyle = correct ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)";
        ctx.fillRect(0, 0, W, H);
        ctx.font = "bold 16px ui-monospace";
        ctx.fillStyle = correct ? "#22c55e" : "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText(
          correct ? "Correct!" : `Wrong! It's ${identifyChallenge.answer}`,
          W / 2, H - 30,
        );
        ctx.restore();
      }
    }

    // Info panel
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(W - 230, 12, 218, 110, 8);
    ctx.fill();
    ctx.font = "bold 10px ui-monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("LENS DATA", W - 218, 20);
    ctx.font = "11px ui-monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`f = ${f > 0 ? "+" : ""}${(f * PX_TO_CM).toFixed(1)} cm`, W - 218, 38);
    ctx.fillText(`d_o = ${(objectDist * PX_TO_CM).toFixed(1)} cm`, W - 218, 54);
    ctx.fillText(`d_i = ${(imgDist * PX_TO_CM).toFixed(1)} cm ${imgDist < 0 ? "(virtual)" : "(real)"}`, W - 218, 70);
    ctx.fillText(`M = ${magnification.toFixed(2)} ${Math.abs(magnification) > 1 ? "(magnified)" : "(reduced)"}`, W - 218, 86);
    ctx.fillText(`Image: ${magnification > 0 ? "upright" : "inverted"}`, W - 218, 102);

    // Ray legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 170, 65, 6);
    ctx.fill();
    ctx.font = "10px system-ui";
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.textAlign = "left";
    ctx.fillText("-- parallel -> through F", 22, 28);
    ctx.fillStyle = "rgba(59,130,246,0.8)";
    ctx.fillText("-- through center", 22, 45);
    ctx.fillStyle = "rgba(34,197,94,0.8)";
    ctx.fillText("-- through F -> parallel", 22, 62);

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => renderScorePopup(ctx, p, now));

    // Particles
    particlesRef.current.update(1 / 60);
    particlesRef.current.draw(ctx);

    // Scoreboard
    if (challengeRef.current.active && challengeRef.current.attempts > 0) {
      renderScoreboard(ctx, 12, H - 160, 140, 110, challengeRef.current);
    }
  }, [focalLength, objectDist, objectHeight, lensType, lensPosition, mode, focusChallenge, focusSubmitted, showSecondLens, lens2Focal, lens2Position, identifyChallenge, identifySelected]);

  // Animation loop
  const animate = useCallback(() => {
    timeRef.current += 1 / 60;
    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = canvas.parentElement;
      if (!container) return;
      canvas.width = container.clientWidth;
      const _isMobile = container.clientWidth < 640;
      canvas.height = Math.min(container.clientWidth * (_isMobile ? 1.0 : 0.5), _isMobile ? 500 : 440);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  // Drag handlers for both object and lens
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const lensX = canvas.width * lensPosition;
    const objX = lensX - objectDist;
    const axisY = canvas.height * 0.5;

    // Check lens first (vertical hit area)
    if (Math.abs(mx - lensX) < 20 && Math.abs(my - axisY) < canvas.height * 0.35) {
      setIsDraggingLens(true);
      return;
    }

    // Check object
    if (Math.abs(mx - objX) < 30) {
      setIsDraggingObject(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;

    if (isDraggingLens) {
      const newPos = Math.max(0.2, Math.min(0.8, mx / canvas.width));
      setLensPosition(newPos);
    } else if (isDraggingObject) {
      const lensX = canvas.width * lensPosition;
      const newDist = Math.max(30, lensX - mx);
      setObjectDist(Math.min(newDist, lensX - 20));
    }
  };

  const handleMouseUp = () => {
    setIsDraggingObject(false);
    setIsDraggingLens(false);
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {([
          ["sandbox", "Sandbox"],
          ["focus-challenge", "Focus Challenge"],
          ["microscope", "Compound Microscope"],
          ["identify", "Real vs Virtual"],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => startMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? "bg-cyan-600 text-white"
                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
        {mode !== "sandbox" && (
          <span className="flex items-center text-sm font-mono text-amber-500 ml-2">
            Score: {challengeState.score} | Streak: {challengeState.streak}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
        <canvas
          ref={canvasRef}
          className="w-full cursor-ew-resize"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Focus challenge controls */}
      {mode === "focus-challenge" && focusChallenge && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-900/10 p-4">
          <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">
            Focus the Image Challenge
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Adjust the focal length and object distance so the real image forms at exactly{" "}
            <strong className="text-amber-500">{(focusChallenge.targetImageDist * PX_TO_CM).toFixed(1)} cm</strong> from the lens.
          </p>
          <div className="flex gap-3">
            <button
              onClick={submitFocusAnswer}
              disabled={focusSubmitted}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              {focusSubmitted ? "Submitted!" : "Check Focus"}
            </button>
            <button
              onClick={generateFocusChallenge}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next Challenge
            </button>
          </div>
        </div>
      )}

      {/* Identify challenge controls */}
      {mode === "identify" && identifyChallenge && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 dark:bg-purple-900/10 p-4">
          <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
            Identify the Image Type
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Look at the ray diagram. Is the image <strong>real</strong> or <strong>virtual</strong>?
          </p>
          <div className="flex gap-3">
            {identifyChallenge.options.map((opt) => (
              <button
                key={opt}
                onClick={() => submitIdentifyAnswer(opt)}
                disabled={identifySelected !== null}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                  identifySelected === opt
                    ? opt === identifyChallenge.answer
                      ? "bg-green-600 text-white"
                      : "bg-red-600 text-white"
                    : identifySelected !== null && opt === identifyChallenge.answer
                      ? "bg-green-600 text-white"
                      : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
            {identifySelected && (
              <button
                onClick={generateIdentifyChallenge}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ml-2"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lens Type</label>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setLensType("converging")}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                lensType === "converging" ? "bg-cyan-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}>Converging</button>
            <button onClick={() => setLensType("diverging")}
              className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                lensType === "diverging" ? "bg-cyan-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}>Diverging</button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Focal Length</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={40} max={250} value={focalLength}
              onChange={(e) => setFocalLength(Number(e.target.value))}
              className="flex-1 accent-amber-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{(focalLength * PX_TO_CM).toFixed(1)} cm</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Distance</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={30} max={500} value={objectDist}
              onChange={(e) => setObjectDist(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{(objectDist * PX_TO_CM).toFixed(1)} cm</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Height</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={20} max={150} value={objectHeight}
              onChange={(e) => setObjectHeight(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{(objectHeight * PX_TO_CM).toFixed(1)} cm</span>
          </div>
        </div>
      </div>

      {/* Microscope controls */}
      {mode === "microscope" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-amber-500/30 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-amber-500 uppercase tracking-wider">Eyepiece Focal Length</label>
            <div className="flex items-center gap-3 mt-2">
              <input type="range" min={20} max={150} value={lens2Focal}
                onChange={(e) => setLens2Focal(Number(e.target.value))}
                className="flex-1 accent-amber-500" />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{(lens2Focal * PX_TO_CM).toFixed(1)} cm</span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-white dark:bg-gray-900 p-4">
            <label className="text-xs font-medium text-amber-500 uppercase tracking-wider">Eyepiece Position</label>
            <div className="flex items-center gap-3 mt-2">
              <input type="range" min={50} max={90} value={lens2Position * 100}
                onChange={(e) => setLens2Position(Number(e.target.value) / 100)}
                className="flex-1 accent-amber-500" />
              <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[4rem] text-right">{(lens2Position * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="\frac{1}{f} = \frac{1}{d_o} + \frac{1}{d_i}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="m = -\frac{d_i}{d_o}" /></div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"><SimMath math="P = \frac{1}{f}" /></div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 text-center">Drag the object to change distance. Switch between converging and diverging lenses to see how images form!</p>
    </div>
  );
}
