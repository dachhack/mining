// UI lab 2 (issue #121): how the surface looks: clay's texture, grass,
// trees, apple trees, the roaming animals, and the counter's icons for the
// lab's own items (wood, grass, apples, animals, clay).
//
// Drawing only: nothing here reads or changes a world. Like textures.ts, the
// clay tiles come from a tiny seeded generator, so every phone draws the same
// ground.

import { LAB_LOOK } from './labLook';
import type { SquareBox } from './labDraw';

export const SURFACE_PAINT = {
  clay: { base: '#b8673f', dark: '#97502f', light: '#cf8458', streak: '#a95c38' },
  grass: { base: '#4f8a2c', blade: '#6fae3d', bladeDark: '#3c7022', tip: '#9fd162' },
  tree: { canopy: '#2f6b2c', canopyDark: '#1f4d1e', canopyLight: '#4b8f3c', trunk: '#5a3b22' },
  appleTree: {
    canopy: '#4f8f36',
    canopyDark: '#356b25',
    canopyLight: '#73b04e',
    apple: '#d9342b',
    appleLight: '#ff7a63',
  },
  animal: { wool: '#f2ede2', woolShade: '#cfc6b4', face: '#2d2620', leg: '#2d2620' },
  wood: { bark: '#6b4428', ring: '#c99a62', ringDark: '#9b7044' },
};

/** "mulberry32": numbers 0..1 from a seed, the same every time. Paint only, never the game. */
function painter(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----- Clay -----

let clayTiles: HTMLCanvasElement[] | null = null;

/** Paint the clay tiles once: smooth reddish clay with soft streaks and a few pale specks. */
function buildClayTiles(): HTMLCanvasElement[] {
  const tiles: HTMLCanvasElement[] = [];
  const s = LAB_LOOK.texturePx;
  for (let v = 0; v < LAB_LOOK.textureVariants; v += 1) {
    const tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const ctx = tile.getContext('2d');
    if (ctx !== null) {
      const random = painter(9001 + v * 97);
      const p = SURFACE_PAINT.clay;
      ctx.fillStyle = p.base;
      ctx.fillRect(0, 0, s, s);
      // Soft horizontal streaks: clay is laid down in layers.
      for (let i = 0; i < 6; i += 1) {
        ctx.globalAlpha = 0.35 + random() * 0.3;
        ctx.fillStyle = random() < 0.5 ? p.dark : p.streak;
        const y = random() * s;
        ctx.beginPath();
        ctx.ellipse(
          random() * s,
          y,
          14 + random() * 18,
          2 + random() * 2.5,
          (random() - 0.5) * 0.3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = p.light;
      for (let i = 0; i < 10; i += 1) {
        ctx.fillRect(Math.floor(random() * s), Math.floor(random() * s), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    tiles.push(tile);
  }
  return tiles;
}

/** The clay tile for square (x, y): one of a few variants, chosen by position. */
export function clayTexture(x: number, y: number): HTMLCanvasElement | null {
  clayTiles = clayTiles ?? buildClayTiles();
  const index = Math.abs(x * 7 + y * 13) % clayTiles.length;
  return clayTiles[index] ?? null;
}

// ----- Surface features -----

/**
 * Grass: a lawn over the whole square, so the block under it is hidden until
 * the grass is cut (owner, after the PR #126 playtest: "Tree and grass cover
 * entire square so you can't see what's below").
 */
export function drawGrass(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  x: number,
  y: number,
): void {
  const random = painter(x * 131 + y * 977 + 7);
  const p = SURFACE_PAINT.grass;
  const { left, top, inner } = box;
  ctx.save();
  ctx.fillStyle = p.base;
  ctx.fillRect(left, top, inner, inner);
  // Soft darker patches, so a meadow is not one flat colour.
  for (let i = 0; i < 3; i += 1) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = p.bladeDark;
    ctx.beginPath();
    ctx.ellipse(
      left + inner * random(),
      top + inner * random(),
      inner * (0.15 + random() * 0.15),
      inner * (0.08 + random() * 0.08),
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Blades all over the square.
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, inner * 0.04);
  for (let blade = 0; blade < 18; blade += 1) {
    const bx = left + inner * (0.06 + random() * 0.88);
    const by = top + inner * (0.2 + random() * 0.78);
    const lean = (random() - 0.5) * inner * 0.16;
    const h = inner * (0.12 + random() * 0.12);
    ctx.strokeStyle = blade % 3 === 0 ? p.tip : blade % 3 === 1 ? p.blade : p.bladeDark;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.6, bx + lean, by - h);
    ctx.stroke();
  }
  ctx.restore();
}

/** Which of a square's four neighbours belong to the same forest: the square joins them at that edge. */
export interface ForestJoins {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/** A square's whole cell, gap included: its top-left corner and its size in pixels. */
export interface CellRect {
  px: number;
  py: number;
  c: number;
}

/**
 * Forest: the whole square covered by tree tops, joined to the neighbouring
 * forest squares at their shared edges, so a group of trees reads as one
 * forest, not separate trees (owner: "trees edges connect to make forest").
 *
 * The tree tops are round blobs laid out on one grid over the whole map
 * (two to a square each way), not per square, so a blob near an edge is
 * drawn, cut at the edge, by both squares it overlaps, and the forest has
 * no seams. Toward a joined neighbour the square covers the grid line
 * between them; toward any other side it stops at its own inner box, with
 * a darker rim.
 */
export function drawForest(
  ctx: CanvasRenderingContext2D,
  cell: CellRect,
  box: SquareBox,
  x: number,
  y: number,
  joins: ForestJoins,
): void {
  const p = SURFACE_PAINT.tree;
  const { px, py, c } = cell;
  const left = joins.w ? px : box.left;
  const right = joins.e ? px + c : box.left + box.inner;
  const top = joins.n ? py : box.top;
  const bottom = joins.s ? py + c : box.top + box.inner;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  ctx.fillStyle = p.canopyDark;
  ctx.fillRect(left, top, right - left, bottom - top);
  // The blobs whose middles are near this square, in the same order for every square.
  for (let j = 2 * y - 2; j <= 2 * y + 3; j += 1) {
    for (let i = 2 * x - 2; i <= 2 * x + 3; i += 1) {
      const random = painter(i * 7919 + j * 104729 + 13);
      // The blob's middle and radius, in squares, then in pixels.
      const bx = (i + 0.5) / 2 + (random() - 0.5) * 0.22;
      const by = (j + 0.5) / 2 + (random() - 0.5) * 0.22;
      const r = (0.34 + random() * 0.08) * c;
      const cx = px + (bx - x) * c;
      const cy = py + (by - y) * c;
      const gradient = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      gradient.addColorStop(0, p.canopyLight);
      gradient.addColorStop(0.6, p.canopy);
      gradient.addColorStop(1, p.canopyDark);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A darker rim along the forest's edge.
  ctx.strokeStyle = 'rgba(10, 25, 10, 0.55)';
  ctx.lineWidth = Math.max(1, c * 0.06);
  const half = ctx.lineWidth / 2;
  ctx.beginPath();
  if (!joins.n) {
    ctx.moveTo(left, top + half);
    ctx.lineTo(right, top + half);
  }
  if (!joins.s) {
    ctx.moveTo(left, bottom - half);
    ctx.lineTo(right, bottom - half);
  }
  if (!joins.w) {
    ctx.moveTo(left + half, top);
    ctx.lineTo(left + half, bottom);
  }
  if (!joins.e) {
    ctx.moveTo(right - half, top);
    ctx.lineTo(right - half, bottom);
  }
  ctx.stroke();
  ctx.restore();
}

/** A round crown seen from above, with a darker rim and a light spot: an apple tree's. */
function crown(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  colours: { canopy: string; canopyDark: string; canopyLight: string },
): { cx: number; cy: number; r: number } {
  const cx = box.left + box.inner / 2;
  const cy = box.top + box.inner / 2;
  const r = box.inner * 0.42;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.12, cy + r * 0.18, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  gradient.addColorStop(0, colours.canopyLight);
  gradient.addColorStop(0.55, colours.canopy);
  gradient.addColorStop(1, colours.canopyDark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  // A lumpy outline: a circle with a few bumps.
  for (let k = 0; k <= 12; k += 1) {
    const angle = (k / 12) * Math.PI * 2;
    const bump = r * (0.9 + 0.1 * Math.cos(angle * 5));
    const pointX = cx + Math.cos(angle) * bump;
    const pointY = cy + Math.sin(angle) * bump;
    if (k === 0) ctx.moveTo(pointX, pointY);
    else ctx.lineTo(pointX, pointY);
  }
  ctx.fill();
  ctx.restore();
  return { cx, cy, r };
}

/**
 * An apple tree: part of the forest (it joins its neighbours like a tree),
 * with its own lighter crown in the middle and its apples (up to 3) on it;
 * the crown is bare once they are picked.
 */
export function drawAppleTree(
  ctx: CanvasRenderingContext2D,
  cell: CellRect,
  box: SquareBox,
  x: number,
  y: number,
  joins: ForestJoins,
  apples: number,
): void {
  drawForest(ctx, cell, box, x, y, joins);
  const { cx, cy, r } = crown(ctx, box, SURFACE_PAINT.appleTree);
  const spots = [
    { dx: -0.38, dy: -0.15 },
    { dx: 0.32, dy: -0.32 },
    { dx: 0.1, dy: 0.38 },
  ];
  for (let i = 0; i < Math.min(apples, spots.length); i += 1) {
    const spot = spots[i];
    if (spot === undefined) continue;
    const ax = cx + spot.dx * r;
    const ay = cy + spot.dy * r;
    const ar = Math.max(1.5, r * 0.2);
    ctx.fillStyle = SURFACE_PAINT.appleTree.apple;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SURFACE_PAINT.appleTree.appleLight;
    ctx.beginPath();
    ctx.arc(ax - ar * 0.35, ay - ar * 0.35, ar * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ----- Animals -----

/**
 * A stump where a tree was felled (question 157: it grows back): a small
 * ring of cut wood in the middle of the square, a sign that a tree will
 * stand there again. Drawn over the square's block.
 */
export function drawStump(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  const p = SURFACE_PAINT.wood;
  const cx = box.left + box.inner / 2;
  const cy = box.top + box.inner / 2;
  const r = box.inner * 0.2;
  ctx.save();
  ctx.fillStyle = p.bark;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ring;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.ringDark;
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * A sheep seen from above, centred at (cx, cy), `size` pixels across: a
 * woolly body, a dark face pointing `facing` (radians), four little legs.
 */
export function drawAnimal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  facing: number,
): void {
  const p = SURFACE_PAINT.animal;
  const r = size * 0.32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(facing);
  // Shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(r * 0.1, r * 0.25, r * 1.15, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs, peeking out under the wool.
  ctx.fillStyle = p.leg;
  for (const [lx, ly] of [
    [-0.55, -0.7],
    [0.55, -0.7],
    [-0.55, 0.7],
    [0.55, 0.7],
  ] as const) {
    ctx.beginPath();
    ctx.arc(lx * r, ly * r, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  // The woolly body: a few overlapping puffs.
  ctx.fillStyle = p.woolShade;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.08, r * 1.02, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.wool;
  for (const [px, py, pr] of [
    [-0.45, -0.2, 0.5],
    [0.1, -0.35, 0.52],
    [0.5, 0.05, 0.48],
    [-0.2, 0.3, 0.5],
    [0.25, 0.35, 0.45],
  ] as const) {
    ctx.beginPath();
    ctx.arc(px * r, py * r, pr * r, 0, Math.PI * 2);
    ctx.fill();
  }
  // The face, in front (facing 0 is east).
  ctx.fillStyle = p.face;
  ctx.beginPath();
  ctx.ellipse(r * 1.0, 0, r * 0.38, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ----- Icons for the counter and the cost chips -----

/** A small canvas showing the lab item `item`: wood, grass, apple, animal or clay. `null` for other items. */
export function labItemIcon(item: string, className: string): HTMLCanvasElement | null {
  const s = LAB_LOOK.texturePx;
  const icon = document.createElement('canvas');
  icon.className = className;
  icon.width = s;
  icon.height = s;
  const ctx = icon.getContext('2d');
  if (ctx === null) {
    return icon;
  }
  if (item === 'clay') {
    const tile = clayTexture(0, 0);
    if (tile !== null) ctx.drawImage(tile, 0, 0);
  } else if (item === 'grass') {
    ctx.fillStyle = '#5a3f26';
    ctx.fillRect(0, 0, s, s);
    drawGrass(ctx, { left: -s * 0.05, top: s * 0.12, inner: s * 1.1 }, 3, 5);
  } else if (item === 'apple') {
    ctx.fillStyle = '#2b3a22';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = SURFACE_PAINT.appleTree.apple;
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.56, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SURFACE_PAINT.appleTree.appleLight;
    ctx.beginPath();
    ctx.arc(s * 0.42, s * 0.46, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3b22';
    ctx.fillRect(s * 0.48, s * 0.16, s * 0.05, s * 0.14);
    ctx.fillStyle = '#6fae3d';
    ctx.beginPath();
    ctx.ellipse(s * 0.6, s * 0.2, s * 0.1, s * 0.05, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (item === 'animal') {
    ctx.fillStyle = '#4c7a2e';
    ctx.fillRect(0, 0, s, s);
    drawAnimal(ctx, s / 2, s / 2, s * 0.95, 0);
  } else if (item === 'wood') {
    const p = SURFACE_PAINT.wood;
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = p.bark;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.ring;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.ringDark;
    ctx.lineWidth = s * 0.03;
    for (const rr of [0.2, 0.11]) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    return null;
  }
  return icon;
}

/**
 * A key swatch for a surface feature, drawn with the map's own art on bare
 * dirt, so the key matches what the map shows: 'grass', 'tree' or
 * 'appleTree' (review of PR #122).
 */
export function featureSwatch(
  kind: 'grass' | 'tree' | 'appleTree',
  className: string,
): HTMLCanvasElement {
  const s = LAB_LOOK.texturePx;
  const swatch = document.createElement('canvas');
  swatch.className = className;
  swatch.width = s;
  swatch.height = s;
  const ctx = swatch.getContext('2d');
  if (ctx !== null) {
    const box = { left: 0, top: 0, inner: s };
    const cell = { px: 0, py: 0, c: s };
    const alone = { n: false, e: false, s: false, w: false };
    if (kind === 'grass') drawGrass(ctx, box, 3, 5);
    else if (kind === 'tree') drawForest(ctx, cell, box, 3, 5, alone);
    else drawAppleTree(ctx, cell, box, 3, 5, alone, 3);
  }
  return swatch;
}
