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

/** How many looks a mushroom has (owner, after the 0.22.0 build: "Let's have like 7 versions"). */
export const MUSHROOM_LOOKS = 7;

/** Where a mushroom stands in its square, and which look it has: see `mushroomLook`. */
export interface MushroomLook {
  /** Which of the MUSHROOM_LOOKS looks: 0 is the red one with white spots. */
  variant: number;
  /** The foot of its stalk, as fractions of the square (0 = left or top, 1 = right or bottom). */
  fx: number;
  fy: number;
}

/**
 * The look and spot of the mushroom on square `i` (owner, after the 0.22.0
 * build: "place it at random positions in the square"). Drawn from the
 * square's number, so a mushroom keeps its look and spot from frame to frame
 * and run to run; nothing here touches the game's state or its generator.
 */
export function mushroomLook(i: number): MushroomLook {
  // A small integer hash (multiply, xor-shift), kept to 32 bits with `>>> 0`.
  let h = Math.imul(i + 1, 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  const variant = h % MUSHROOM_LOOKS;
  const fx = 0.22 + (((h >>> 8) & 0xff) / 255) * 0.56;
  const fy = 0.5 + (((h >>> 16) & 0xff) / 255) * 0.42;
  return { variant, fx, fy };
}

/** The colours of each look: cap, cap edge, spots (or `null` for none), stalk. */
const MUSHROOM_COLOURS: { cap: string; edge: string; spots: string | null; stalk: string }[] = [
  { cap: '#d23a2c', edge: '#5b2a22', spots: '#ffffff', stalk: '#efe6d2' }, // red, white spots
  { cap: '#8a5a32', edge: '#4a321c', spots: null, stalk: '#e8d9b8' }, // brown bolete
  { cap: '#e8a93a', edge: '#7a5418', spots: null, stalk: '#f2d58a' }, // golden funnel
  { cap: '#f1ece2', edge: '#7d7466', spots: null, stalk: '#f7f3ea' }, // white button
  { cap: '#7c4fa8', edge: '#3e2756', spots: '#d9c8ee', stalk: '#e6def0' }, // violet
  { cap: '#e0662a', edge: '#6e2e12', spots: null, stalk: '#f0dcc4' }, // orange cone
  { cap: '#c9b24a', edge: '#5e5220', spots: null, stalk: '#efe6c2' }, // a little yellow pair
];

/**
 * A mushroom (owner, after the 0.17.0 build), small, with a short stalk
 * (owner, after the 0.22.0 build: "Make the stem of the mushroom shorter").
 * `look` says which of the MUSHROOM_LOOKS it is and where in its square its
 * stalk stands; the default is the red one, at the bottom-left.
 */
export function drawMushroom(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  look: MushroomLook = { variant: 0, fx: 0.3, fy: 0.9 },
): void {
  const s = box.inner;
  const colours = MUSHROOM_COLOURS[look.variant % MUSHROOM_LOOKS] ?? MUSHROOM_COLOURS[0];
  if (colours === undefined) return;
  ctx.save();
  ctx.strokeStyle = colours.edge;
  ctx.lineWidth = Math.max(1, s * 0.03);
  if (look.variant === 6) {
    // Two small ones side by side.
    one(ctx, box.left + s * (look.fx - 0.08), box.top + s * look.fy, s * 0.14, 0, colours);
    one(ctx, box.left + s * (look.fx + 0.1), box.top + s * (look.fy - 0.02), s * 0.11, 0, colours);
  } else {
    one(ctx, box.left + s * look.fx, box.top + s * look.fy, s * 0.2, look.variant, colours);
  }
  ctx.restore();
}

/** One mushroom whose stalk stands on (cx, base), with cap radius r, in the shape of `variant`. */
function one(
  ctx: CanvasRenderingContext2D,
  cx: number,
  base: number,
  r: number,
  variant: number,
  colours: { cap: string; spots: string | null; stalk: string },
): void {
  // A short stalk: about half the cap's radius tall.
  const stalkH = r * 0.55;
  const stalkW = variant === 1 ? r * 0.9 : r * 0.6; // the bolete is stout
  ctx.fillStyle = colours.stalk;
  ctx.beginPath();
  ctx.rect(cx - stalkW / 2, base - stalkH, stalkW, stalkH);
  ctx.fill();
  ctx.stroke();
  const capY = base - stalkH;
  ctx.fillStyle = colours.cap;
  ctx.beginPath();
  if (variant === 5) {
    // A cone.
    ctx.moveTo(cx - r * 0.85, capY);
    ctx.lineTo(cx, capY - r * 1.5);
    ctx.lineTo(cx + r * 0.85, capY);
    ctx.closePath();
  } else if (variant === 2) {
    // A funnel: wide at the top, narrow where it meets the stalk.
    ctx.moveTo(cx - r * 0.3, capY);
    ctx.lineTo(cx - r, capY - r * 0.7);
    ctx.quadraticCurveTo(cx, capY - r * 0.95, cx + r, capY - r * 0.7);
    ctx.lineTo(cx + r * 0.3, capY);
    ctx.closePath();
  } else if (variant === 1 || variant === 3) {
    // A flat-bottomed dome, fatter than half a circle.
    ctx.ellipse(cx, capY, r, r * (variant === 1 ? 0.8 : 0.65), 0, Math.PI, 0);
    ctx.closePath();
  } else {
    // Half a circle.
    ctx.arc(cx, capY, r, Math.PI, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (colours.spots !== null) {
    ctx.fillStyle = colours.spots;
    for (const [dx, dy] of [
      [-0.45, -0.35],
      [0.3, -0.55],
      [0.05, -0.2],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx + dx * r, capY + dy * r, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * A 2 x 2 work camp (owner, after the 0.20.0 build), drawn into `box`, which
 * spans its whole 2 x 2: a lumberjack camp is a log cabin with an axe; a farm
 * camp a red barn; a hermit camp a mossy hut. `workers` small heads stand by
 * the door (up to 6). The caller clips to the square being drawn, so one
 * square of it can be drawn again on its own.
 */
export function drawWorkCamp(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  kind: 'lumberCamp' | 'farmCamp' | 'hermitCamp',
  workers: number,
): void {
  const s = box.inner;
  const left = box.left;
  const top = box.top;
  const walls = kind === 'lumberCamp' ? '#8a5a32' : kind === 'farmCamp' ? '#b0362a' : '#6f7d4a';
  const roof = kind === 'lumberCamp' ? '#5b3a1e' : kind === 'farmCamp' ? '#efe6d2' : '#3f5a2e';
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.strokeStyle = '#2a1b0e';
  // A yard of trodden earth.
  ctx.fillStyle = 'rgba(90, 64, 36, 0.55)';
  ctx.fillRect(left + s * 0.04, top + s * 0.04, s * 0.92, s * 0.92);
  // The walls and the roof.
  ctx.fillStyle = walls;
  ctx.fillRect(left + s * 0.18, top + s * 0.42, s * 0.64, s * 0.4);
  ctx.strokeRect(left + s * 0.18, top + s * 0.42, s * 0.64, s * 0.4);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(left + s * 0.1, top + s * 0.44);
  ctx.lineTo(left + s * 0.5, top + s * 0.14);
  ctx.lineTo(left + s * 0.9, top + s * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The door.
  ctx.fillStyle = '#2a1b0e';
  ctx.fillRect(left + s * 0.44, top + s * 0.6, s * 0.12, s * 0.22);
  if (kind === 'lumberCamp') {
    // Logs along the wall, and an axe.
    ctx.fillStyle = '#b07a46';
    for (const k of [0, 1, 2]) {
      ctx.beginPath();
      ctx.arc(left + s * (0.24 + k * 0.06), top + s * 0.78, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#8a5a32';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(left + s * 0.7, top + s * 0.86);
    ctx.lineTo(left + s * 0.82, top + s * 0.62);
    ctx.stroke();
    ctx.fillStyle = '#aeb5bd';
    ctx.fillRect(left + s * 0.78, top + s * 0.6, s * 0.08, s * 0.06);
  } else if (kind === 'farmCamp') {
    // White cross-bracing on the barn door.
    ctx.strokeStyle = '#efe6d2';
    ctx.lineWidth = s * 0.015;
    ctx.beginPath();
    ctx.moveTo(left + s * 0.44, top + s * 0.6);
    ctx.lineTo(left + s * 0.56, top + s * 0.82);
    ctx.moveTo(left + s * 0.56, top + s * 0.6);
    ctx.lineTo(left + s * 0.44, top + s * 0.82);
    ctx.stroke();
  } else {
    // Moss tufts on the roof.
    ctx.fillStyle = '#7fae4a';
    for (const k of [0, 1, 2]) {
      ctx.beginPath();
      ctx.arc(left + s * (0.32 + k * 0.18), top + s * 0.38, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The workers: small heads in a row by the door.
  ctx.fillStyle = '#f0c9a0';
  for (let k = 0; k < Math.min(6, workers); k += 1) {
    ctx.beginPath();
    ctx.arc(left + s * (0.12 + k * 0.08), top + s * 0.92, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
