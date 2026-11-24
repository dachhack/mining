// The hazards' drawings (docs/plans/hazards.md): water standing on a flooded
// square and the pump on it. Drawn over a square's block, inside its box.
// This is the screen's own drawing: nothing here changes the game.

import type { SquareBox } from './labDraw';

/** The hazards' colours. */
export const HAZARD_PAINT = {
  water: 'rgba(48, 120, 214, 0.78)',
  waterRipple: 'rgba(190, 225, 255, 0.7)',
  pumpBody: '#d8a23a',
  pumpDark: '#5b4316',
};

/**
 * Water standing on a flooded square: a blue wash over the block with two
 * ripples, placed by the square so neighbours do not ripple in step.
 */
export function drawWater(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.fillStyle = HAZARD_PAINT.water;
  ctx.fillRect(box.left, box.top, box.inner, box.inner);
  ctx.strokeStyle = HAZARD_PAINT.waterRipple;
  ctx.lineWidth = Math.max(1, box.inner * 0.05);
  const shift = ((x * 7 + y * 13) % 5) / 10;
  for (const row of [0.3, 0.68]) {
    const yy = box.top + box.inner * row;
    const x0 = box.left + box.inner * (0.15 + shift * 0.3);
    const w = box.inner * 0.45;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.quadraticCurveTo(x0 + w / 4, yy - box.inner * 0.06, x0 + w / 2, yy);
    ctx.quadraticCurveTo(x0 + (3 * w) / 4, yy + box.inner * 0.06, x0 + w, yy);
    ctx.stroke();
  }
  ctx.restore();
}

/** A pump set on a flooded square: a squat body with a handle and a spout. */
export function drawPump(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  const s = box.inner;
  const cx = box.left + s / 2;
  const cy = box.top + s / 2;
  ctx.save();
  ctx.fillStyle = HAZARD_PAINT.pumpBody;
  ctx.strokeStyle = HAZARD_PAINT.pumpDark;
  ctx.lineWidth = Math.max(1, s * 0.05);
  // The body.
  ctx.beginPath();
  ctx.rect(cx - s * 0.16, cy - s * 0.14, s * 0.32, s * 0.36);
  ctx.fill();
  ctx.stroke();
  // The spout, to the right.
  ctx.beginPath();
  ctx.rect(cx + s * 0.16, cy - s * 0.06, s * 0.16, s * 0.08);
  ctx.fill();
  ctx.stroke();
  // The handle, up and to the left.
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.05, cy - s * 0.14);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.32);
  ctx.stroke();
  ctx.restore();
}
