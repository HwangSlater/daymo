// The final travel is deliberately timed, rather than waiting for a spring's
// invisible settling tail. Finger velocity never sets animation duration.
export const PEEL_FINISH_MS = 520;
export const PEEL_CANCEL_MS = 220;
export const PEEL_DRAG_LIMIT = 0.62;

export function peelDistance(dx: number, dy: number) {
  return Math.abs(dx) + Math.max(0, -dy) * 0.35;
}

export function peelDragProgress(distance: number, width: number, previous: number, elapsedMs: number, canMove: boolean) {
  const target = Math.min(distance / Math.max(1, width * 1.2), canMove ? PEEL_DRAG_LIMIT : 0.055);
  // Cap sparse/fast pointer events as well as normal frame-to-frame movement.
  const maxStep = Math.min(48, Math.max(8, elapsedMs)) * 0.0016;
  return previous + Math.max(-maxStep, Math.min(maxStep, target - previous));
}

export function shouldCompletePeel(dx: number, dy: number, forwardVelocity: number, width: number) {
  const distance = peelDistance(dx, dy);
  return distance >= width * 0.3 || (distance >= width * 0.16 && forwardVelocity >= 0.9);
}
