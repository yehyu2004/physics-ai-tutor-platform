/**
 * High-DPI canvas setup utility.
 *
 * On Retina / HiDPI screens the browser upscales a 1x canvas, producing
 * blurry text and graphics.  This helper sets the canvas backing store to
 * the physical pixel size while keeping the CSS layout size at the logical
 * size, then applies ctx.setTransform so all draw calls remain in logical
 * (CSS) pixel coordinates.
 */
export function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
