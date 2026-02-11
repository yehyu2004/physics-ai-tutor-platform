"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

export default function LensOptics() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [focalLength, setFocalLength] = useState(120);
  const [objectDist, setObjectDist] = useState(250);
  const [objectHeight, setObjectHeight] = useState(80);
  const [lensType, setLensType] = useState<"converging" | "diverging">("converging");
  const [isDragging, setIsDragging] = useState(false);

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

    const lensX = W * 0.45;
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
      // Double convex lens shape
      ctx.beginPath();
      ctx.ellipse(lensX, axisY, 8, lensH / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(lensX, axisY, 8, lensH / 2, 0, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();
      // Arrows at tips
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
      // Diverging lens shape
      ctx.beginPath();
      ctx.ellipse(lensX - 5, axisY, 8, lensH / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(lensX + 5, axisY, 8, lensH / 2, 0, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();
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

    // Object arrow
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(objX, axisY);
    ctx.lineTo(objX, objTopY);
    ctx.stroke();
    // Arrow head
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

    if (Math.abs(imgDist) < W * 2) {
      // Image arrow
      const isVirtual = imgDist < 0;
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
      // Arrow head
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

    // Ray 1: Parallel to axis → through focal point
    const ray1color = "rgba(239,68,68,0.6)";
    drawRay(ray1color, [
      { x1: objX, y1: objTopY, x2: lensX, y2: objTopY },
      { x1: lensX, y1: objTopY, x2: lensX + Math.max(f * 3, W - lensX), y2: objTopY + (Math.max(f * 3, W - lensX)) * (objTopY - axisY) / (-f) + (objTopY - axisY), dashed: imgDist < 0 },
    ]);

    // Simplified: through F on the other side
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
      { x1: lensX, y1: axisY + slope * (lensX - objX), x2: ray2endX, y2: axisY + slope * (ray2endX - objX), dashed: imgDist < 0 },
    ]);

    // Ray 3: Through focal point on object side → parallel after lens
    const ray3color = "rgba(34,197,94,0.6)";
    // Slope from object top to F on object side
    const fObjX = lensX - f; // focal point on object side (for converging, this is left of lens)
    const slope3 = (objTopY - axisY) / (objX - fObjX);
    const yAtLens = axisY + slope3 * (lensX - fObjX);
    drawRay(ray3color, [
      { x1: objX, y1: objTopY, x2: lensX, y2: yAtLens },
      { x1: lensX, y1: yAtLens, x2: W, y2: yAtLens, dashed: imgDist < 0 },
    ]);

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
    ctx.fillText(`f = ${f > 0 ? "+" : ""}${f.toFixed(0)} px`, W - 218, 38);
    ctx.fillText(`d_o = ${objectDist.toFixed(0)} px`, W - 218, 54);
    ctx.fillText(`d_i = ${imgDist.toFixed(0)} px ${imgDist < 0 ? "(virtual)" : "(real)"}`, W - 218, 70);
    ctx.fillText(`M = ${magnification.toFixed(2)} ${Math.abs(magnification) > 1 ? "(magnified)" : "(reduced)"}`, W - 218, 86);
    ctx.fillText(`Image: ${magnification > 0 ? "upright" : "inverted"}`, W - 218, 102);

    // Ray legend
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(12, 12, 170, 65, 6);
    ctx.fill();
    ctx.font = "10px system-ui";
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.fillText("— parallel → through F", 22, 28);
    ctx.fillStyle = "rgba(59,130,246,0.8)";
    ctx.fillText("— through center", 22, 45);
    ctx.fillStyle = "rgba(34,197,94,0.8)";
    ctx.fillText("— through F → parallel", 22, 62);
  }, [focalLength, objectDist, objectHeight, lensType]);

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

  useEffect(() => { draw(); }, [draw]);

  // Drag object
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const lensX = canvas.width * 0.45;
    const objX = lensX - objectDist;
    if (Math.abs(mx - objX) < 30) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const lensX = canvas.width * 0.45;
    const newDist = Math.max(30, lensX - mx);
    setObjectDist(Math.min(newDist, lensX - 20));
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="space-y-4">
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
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{focalLength}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Distance</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={30} max={500} value={objectDist}
              onChange={(e) => setObjectDist(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{objectDist}</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Object Height</label>
          <div className="flex items-center gap-3 mt-2">
            <input type="range" min={20} max={150} value={objectHeight}
              onChange={(e) => setObjectHeight(Number(e.target.value))}
              className="flex-1 accent-green-500" />
            <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">{objectHeight}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Thin Lens Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">1/f = 1/dₒ + 1/dᵢ</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">M = −dᵢ/dₒ = hᵢ/hₒ</div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">f &gt; 0: converging, f &lt; 0: diverging</div>
        </div>
      </div>
    </div>
  );
}
