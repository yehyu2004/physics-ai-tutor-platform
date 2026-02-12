/**
 * Shared scoring and challenge system for physics simulations.
 */

export type ScoreTier = "perfect" | "great" | "good" | "close" | "miss";

export interface Score {
  points: number;
  tier: ScoreTier;
  label: string;
}

export interface ScorePopup {
  text: string;
  points: number;
  x: number;
  y: number;
  startTime: number;
}

export interface ChallengeState {
  active: boolean;
  description: string;
  score: number;
  attempts: number;
  streak: number;
  bestStreak: number;
  lastResult: Score | null;
}

/** Calculate score based on how close a prediction is to the actual value */
export function calculateAccuracy(
  predicted: number,
  actual: number,
  tolerance: number,
): Score {
  if (actual === 0 && predicted === 0) {
    return { points: 3, tier: "perfect", label: "Perfect!" };
  }
  const error = Math.abs(predicted - actual);
  const relError = actual !== 0 ? error / Math.abs(actual) : error / tolerance;

  if (error < tolerance * 0.05 || relError < 0.02) {
    return { points: 3, tier: "perfect", label: "Perfect!" };
  }
  if (error < tolerance * 0.15 || relError < 0.05) {
    return { points: 2, tier: "great", label: "Great!" };
  }
  if (error < tolerance * 0.3 || relError < 0.1) {
    return { points: 2, tier: "good", label: "Good!" };
  }
  if (error < tolerance * 0.6 || relError < 0.25) {
    return { points: 1, tier: "close", label: "Close!" };
  }
  return { points: 0, tier: "miss", label: "Try Again" };
}

/** Get color for score tier */
export function tierColor(tier: ScoreTier): string {
  switch (tier) {
    case "perfect": return "#22c55e";
    case "great": return "#3b82f6";
    case "good": return "#60a5fa";
    case "close": return "#f59e0b";
    case "miss": return "#ef4444";
  }
}

/** Render animated score popup on canvas */
export function renderScorePopup(
  ctx: CanvasRenderingContext2D,
  popup: ScorePopup,
  now: number,
) {
  const elapsed = (now - popup.startTime) / 1000;
  if (elapsed > 1.5) return false; // done

  const alpha = Math.max(0, 1 - elapsed / 1.5);
  const yOffset = elapsed * 60;
  const scale = 1 + Math.sin(elapsed * Math.PI) * 0.3;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.round(20 * scale)}px ui-monospace, monospace`;
  ctx.textAlign = "center";

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(popup.text, popup.x + 1, popup.y - yOffset + 1);

  // Main text
  ctx.fillStyle = popup.points >= 3 ? "#22c55e" : popup.points >= 2 ? "#3b82f6" : popup.points >= 1 ? "#f59e0b" : "#ef4444";
  ctx.fillText(popup.text, popup.x, popup.y - yOffset);

  // Points
  if (popup.points > 0) {
    ctx.font = `bold ${Math.round(14 * scale)}px ui-monospace, monospace`;
    ctx.fillText(`+${popup.points}`, popup.x, popup.y - yOffset + 20);
  }

  ctx.restore();
  return true; // still alive
}

/** Render scoreboard panel on canvas */
export function renderScoreboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  state: ChallengeState,
) {
  // Background
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, 8);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const cx = x + w / 2;
  let ty = y + 20;

  // Title
  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("CHALLENGE", cx, ty);
  ty += 18;

  // Score
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px ui-monospace, monospace";
  ctx.fillText(`${state.score}`, cx, ty);
  ty += 16;

  // Stats
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(`${state.attempts} attempts`, cx, ty);
  ty += 14;

  if (state.streak > 0) {
    ctx.fillStyle = "#f59e0b";
    ctx.fillText(`Streak: ${state.streak}`, cx, ty);
  }

  if (state.attempts > 0) {
    ty += 14;
    const accuracy = Math.round((state.score / (state.attempts * 3)) * 100);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`${accuracy}% accuracy`, cx, ty);
  }
}

/** Create initial challenge state */
export function createChallengeState(): ChallengeState {
  return {
    active: false,
    description: "",
    score: 0,
    attempts: 0,
    streak: 0,
    bestStreak: 0,
    lastResult: null,
  };
}

/** Update challenge state with a new result */
export function updateChallengeState(
  state: ChallengeState,
  result: Score,
): ChallengeState {
  const newStreak = result.points > 0 ? state.streak + 1 : 0;
  return {
    ...state,
    score: state.score + result.points,
    attempts: state.attempts + 1,
    streak: newStreak,
    bestStreak: Math.max(state.bestStreak, newStreak),
    lastResult: result,
  };
}
