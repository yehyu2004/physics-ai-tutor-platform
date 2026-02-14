/**
 * Mouse/touch interaction helpers for canvas-based simulations.
 */

/** Get mouse position relative to canvas in logical (CSS) coordinates.
 *  Works correctly with HiDPI canvases where canvas.width includes the
 *  devicePixelRatio multiplier but the drawing context is scaled to match. */
export function getCanvasMousePos(
  canvas: HTMLCanvasElement,
  e: MouseEvent | Touch,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

/** Check if point is inside a rectangle */
export function isPointInRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/** Check if point is inside a circle */
export function isPointInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Create a drag handler for canvas interactions */
export function createDragHandler(
  canvas: HTMLCanvasElement,
  callbacks: {
    onDragStart?: (x: number, y: number) => boolean; // return true to accept drag
    onDrag?: (x: number, y: number, dx: number, dy: number) => void;
    onDragEnd?: (x: number, y: number) => void;
    onClick?: (x: number, y: number) => void;
  },
): () => void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let hasMoved = false;

  const handleMouseDown = (e: MouseEvent) => {
    const pos = getCanvasMousePos(canvas, e);
    startX = pos.x;
    startY = pos.y;
    hasMoved = false;

    if (callbacks.onDragStart) {
      isDragging = callbacks.onDragStart(pos.x, pos.y);
    } else {
      isDragging = true;
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const pos = getCanvasMousePos(canvas, e);
    if (isDragging) {
      hasMoved = true;
      callbacks.onDrag?.(pos.x, pos.y, pos.x - startX, pos.y - startY);
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    const pos = getCanvasMousePos(canvas, e);
    if (isDragging) {
      isDragging = false;
      callbacks.onDragEnd?.(pos.x, pos.y);
    }
    if (!hasMoved && callbacks.onClick) {
      callbacks.onClick(pos.x, pos.y);
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      isDragging = false;
    }
  };

  // Touch support
  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const pos = getCanvasMousePos(canvas, e.touches[0]);
    startX = pos.x;
    startY = pos.y;
    hasMoved = false;
    if (callbacks.onDragStart) {
      isDragging = callbacks.onDragStart(pos.x, pos.y);
    } else {
      isDragging = true;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const pos = getCanvasMousePos(canvas, e.touches[0]);
    if (isDragging) {
      hasMoved = true;
      callbacks.onDrag?.(pos.x, pos.y, pos.x - startX, pos.y - startY);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (isDragging) {
      isDragging = false;
      const pos = e.changedTouches[0]
        ? getCanvasMousePos(canvas, e.changedTouches[0])
        : { x: startX, y: startY };
      callbacks.onDragEnd?.(pos.x, pos.y);
      if (!hasMoved && callbacks.onClick) {
        callbacks.onClick(pos.x, pos.y);
      }
    }
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseLeave);
  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd);

  // Return cleanup function
  return () => {
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mouseleave", handleMouseLeave);
    canvas.removeEventListener("touchstart", handleTouchStart);
    canvas.removeEventListener("touchmove", handleTouchMove);
    canvas.removeEventListener("touchend", handleTouchEnd);
  };
}

