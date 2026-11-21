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
  grass: { blade: '#6fae3d', bladeDark: '#4c8a2a', tip: '#9fd162' },
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

/** Grass: a few tufts of blades over the square's ground. */
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
  ctx.lineCap = 'round';
  for (let tuft = 0; tuft < 4; tuft += 1) {
    const bx = left + inner * (0.18 + random() * 0.64);
    const by = top + inner * (0.3 + random() * 0.55);
    for (let blade = 0; blade < 4; blade += 1) {
      const lean = (random() - 0.5) * inner * 0.22;
      const h = inner * (0.16 + random() * 0.14);
      ctx.strokeStyle = blade % 2 === 0 ? p.blade : p.bladeDark;
      ctx.lineWidth = Math.max(1, inner * 0.045);
      ctx.beginPath();
      ctx.moveTo(bx + (blade - 1.5) * inner * 0.03, by);
      ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.6, bx + lean, by - h);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A round canopy seen from above, with a darker rim and a light spot: a tree, or an apple tree. */
function canopy(
  ctx: CanvasRenderingContext2D,
  box: SquareBox,
  colours: { canopy: string; canopyDark: string; canopyLight: string },
): { cx: number; cy: number; r: number } {
  const cx = box.left + box.inner / 2;
  const cy = box.top + box.inner / 2;
  const r = box.inner * 0.44;
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
    const px = cx + Math.cos(angle) * bump;
    const py = cy + Math.sin(angle) * bump;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();
  ctx.restore();
  return { cx, cy, r };
}

export function drawTree(ctx: CanvasRenderingContext2D, box: SquareBox): void {
  canopy(ctx, box, SURFACE_PAINT.tree);
}

/** An apple tree: a lighter canopy with its apples (up to 3) on it; bare once picked. */
export function drawAppleTree(ctx: CanvasRenderingContext2D, box: SquareBox, apples: number): void {
  const { cx, cy, r } = canopy(ctx, box, SURFACE_PAINT.appleTree);
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
