/**
 * Shared canvas drawing helpers for physics simulations.
 * Extracts common rendering patterns.
 */

/** Draw an arrow from (x,y) in direction (dx,dy) */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string,
  opts?: { lineWidth?: number; headSize?: number; dashed?: boolean; label?: string },
) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const lw = opts?.lineWidth ?? 2;
  const headSize = opts?.headSize ?? Math.min(12, len * 0.3);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;

  if (opts?.dashed) {
    ctx.setLineDash([4, 4]);
  }

  // Line
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();

  ctx.setLineDash([]);

  // Arrowhead
  const nx = dx / len;
  const ny = dy / len;
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(
    x + dx - nx * headSize - ny * headSize * 0.4,
    y + dy - ny * headSize + nx * headSize * 0.4,
  );
  ctx.lineTo(
    x + dx - nx * headSize + ny * headSize * 0.4,
    y + dy - ny * headSize - nx * headSize * 0.4,
  );
  ctx.closePath();
  ctx.fill();

  // Label
  if (opts?.label) {
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(opts.label, x + dx / 2, y + dy / 2 - 8);
  }

  ctx.restore();
}

/** Draw a rounded info panel */
export function drawInfoPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  rows: Array<{ label: string; value: string; color?: string }>,
) {
  // Background
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  let ty = y + 18;

  // Title
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText(title, x + 10, ty);
  ty += 16;

  // Rows
  ctx.font = "11px ui-monospace, monospace";
  for (const row of rows) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(row.label, x + 10, ty);
    ctx.fillStyle = row.color ?? "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(row.value, x + w - 10, ty);
    ctx.textAlign = "left";
    ty += 15;
  }
}

/** Draw a horizontal bar meter */
export function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  max: number,
  color: string,
  label?: string,
) {
  // Background
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, h / 2);
  ctx.fill();

  // Fill
  const fillW = Math.max(0, Math.min(1, value / max)) * w;
  if (fillW > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(x, y, fillW, h, h / 2);
    ctx.fill();
  }

  // Label
  if (label) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + h / 2 + 3);
  }
}

/** Draw a target marker (crosshair) */
export function drawTarget(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color = "#ef4444",
  pulse?: number, // 0-1 animation phase
) {
  const pulseFactor = pulse !== undefined ? 1 + Math.sin(pulse * Math.PI * 2) * 0.15 : 1;
  const pr = r * pulseFactor;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, pr, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(x, y, pr * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair lines
  const ext = pr * 1.3;
  ctx.beginPath();
  ctx.moveTo(x - ext, y);
  ctx.lineTo(x - pr, y);
  ctx.moveTo(x + pr, y);
  ctx.lineTo(x + ext, y);
  ctx.moveTo(x, y - ext);
  ctx.lineTo(x, y - pr);
  ctx.moveTo(x, y + pr);
  ctx.lineTo(x, y + ext);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
}

