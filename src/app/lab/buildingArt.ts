// The one-square buildings' drawings (owner, after the 0.17.0 build): the
// saw house, a small wooden hut with a round saw blade on its front; the
// sugar shack, a hut with a chimney and steam. Drawn over the square's
// block, inside its box. This is the screen's own drawing: nothing here
// changes the game.

import type { SquareBox } from './labDraw';

/** The saw house's colours. */
export const SAW_HOUSE_PAINT = {
  wall: '#a8733f',
  wallDark: '#5e3a1a',
  roof: '#7b3b22',
  blade: '#d7dde2',
  bladeDark: '#7d868e',
  shackWall: '#c99a5b',
  shackRoof: '#3f5a7a',
  steam: 'rgba(240, 240, 240, 0.8)',
};

/** A saw house on a square. */
export function drawSawHouse(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  const s = box.inner;
  const left = box.left;
  const top = box.top;
  const p = SAW_HOUSE_PAINT;
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeStyle = p.wallDark;
  // The walls.
  ctx.fillStyle = p.wall;
  ctx.beginPath();
  ctx.rect(left + s * 0.16, top + s * 0.44, s * 0.68, s * 0.44);
  ctx.fill();
  ctx.stroke();
  // The roof.
  ctx.fillStyle = p.roof;
  ctx.beginPath();
  ctx.moveTo(left + s * 0.08, top + s * 0.46);
  ctx.lineTo(left + s * 0.5, top + s * 0.12);
  ctx.lineTo(left + s * 0.92, top + s * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The saw blade on the front, with its teeth as a dashed rim.
  const cx = left + s * 0.5;
  const cy = top + s * 0.66;
  ctx.fillStyle = p.blade;
  ctx.strokeStyle = p.bladeDark;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([Math.max(1, s * 0.04), Math.max(1, s * 0.03)]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = p.bladeDark;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A sugar shack on a square: a hut with a blue roof, a chimney and steam. */
export function drawSugarShack(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  const s = box.inner;
  const left = box.left;
  const top = box.top;
  const p = SAW_HOUSE_PAINT;
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeStyle = p.wallDark;
  // The chimney, behind the roof, and its steam.
  ctx.fillStyle = p.wallDark;
  ctx.fillRect(left + s * 0.62, top + s * 0.14, s * 0.1, s * 0.22);
  ctx.strokeStyle = p.steam;
  ctx.beginPath();
  ctx.moveTo(left + s * 0.67, top + s * 0.12);
  ctx.quadraticCurveTo(left + s * 0.58, top + s * 0.06, left + s * 0.7, top + s * 0.01);
  ctx.stroke();
  ctx.strokeStyle = p.wallDark;
  // The walls, with a door.
  ctx.fillStyle = p.shackWall;
  ctx.beginPath();
  ctx.rect(left + s * 0.16, top + s * 0.46, s * 0.68, s * 0.42);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.wallDark;
  ctx.fillRect(left + s * 0.42, top + s * 0.62, s * 0.16, s * 0.26);
  // The roof.
  ctx.fillStyle = p.shackRoof;
  ctx.beginPath();
  ctx.moveTo(left + s * 0.08, top + s * 0.48);
  ctx.lineTo(left + s * 0.5, top + s * 0.2);
  ctx.lineTo(left + s * 0.92, top + s * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * A mushroom (owner, after the 0.17.0 build): a red cap with white spots on
 * a pale stalk, small, at the bottom-left of its square, so the tree over it
 * still shows.
 */
export function drawMushroom(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  const s = box.inner;
  const cx = box.left + s * 0.3;
  const base = box.top + s * 0.94;
  const r = s * 0.24;
  ctx.save();
  // The stalk.
  ctx.fillStyle = '#efe6d2';
  ctx.strokeStyle = '#5b4a36';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.rect(cx - r * 0.35, base - r * 1.1, r * 0.7, r * 1.1);
  ctx.fill();
  ctx.stroke();
  // The cap.
  ctx.fillStyle = '#d23a2c';
  ctx.beginPath();
  ctx.arc(cx, base - r * 1.05, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Its spots.
  ctx.fillStyle = '#ffffff';
  for (const [dx, dy] of [
    [-0.45, -0.35],
    [0.3, -0.55],
    [0.05, -0.2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, base - r * 1.05 + dy * r, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
