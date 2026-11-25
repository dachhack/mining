// The saw house's drawing (owner, after the 0.17.0 build): a small wooden
// hut with a pitched roof and a round saw blade on its front, drawn over its
// square's block, inside its box. This is the screen's own drawing: nothing
// here changes the game.

import type { SquareBox } from './labDraw';

/** The saw house's colours. */
export const SAW_HOUSE_PAINT = {
  wall: '#a8733f',
  wallDark: '#5e3a1a',
  roof: '#7b3b22',
  blade: '#d7dde2',
  bladeDark: '#7d868e',
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
