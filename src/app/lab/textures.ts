// UI lab 1 (issue #116): a small painted texture for each block kind.
//
// Each kind gets `LAB_LOOK.textureVariants` tiles, painted once into small
// off-screen canvases and then scaled onto the map. A square picks its
// variant from its position, so the ground looks varied but is the same
// every time it is drawn.
//
// The textures are made from a tiny seeded random generator (`painter`), not
// `Math.random`, so every phone draws the same ground and screenshots can be
// compared.

import { BLOCKS } from '../../data';
import type { BlockId } from '../../data';
import { BLOCK_PAINT, LAB_LOOK } from './labLook';
import type { BlockPaint } from './labLook';

/** A random number from 0 (included) to 1 (not included), the same sequence for the same seed. */
type Random = () => number;

/** "mulberry32", a well-known tiny generator: good enough for paint, not for the game. */
function painter(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from `low` to `high`, both included. */
function between(random: Random, low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}

/** Many tiny squares of `colour`: the grain of earth or rock. */
function grain(
  ctx: CanvasRenderingContext2D,
  random: Random,
  colour: string,
  count: number,
  size: number,
): void {
  const s = LAB_LOOK.texturePx;
  ctx.fillStyle = colour;
  for (let i = 0; i < count; i += 1) {
    ctx.fillRect(between(random, 0, s - size), between(random, 0, s - size), size, size);
  }
}

/** Soft, large blotches: the mottling of stone. */
function blotches(
  ctx: CanvasRenderingContext2D,
  random: Random,
  colour: string,
  count: number,
  alpha: number,
): void {
  const s = LAB_LOOK.texturePx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      random() * s,
      random() * s,
      between(random, 6, 14),
      between(random, 4, 10),
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** An irregular polygon around (cx, cy): a pebble, a chunk of coal, an ore nugget. */
function chunk(
  ctx: CanvasRenderingContext2D,
  random: Random,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  highlight: string | null,
): void {
  const corners = between(random, 5, 7);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < corners; i += 1) {
    const angle = (i / corners) * Math.PI * 2 + random() * 0.6;
    const r = radius * (0.65 + random() * 0.45);
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (highlight !== null) {
    // A small bright facet at the top left, as if lit from there.
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.ellipse(
      cx - radius * 0.3,
      cy - radius * 0.3,
      radius * 0.32,
      radius * 0.2,
      -0.7,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Nuggets spread over the tile, kept away from its edges so neighbouring tiles do not join up. */
function nuggets(
  ctx: CanvasRenderingContext2D,
  random: Random,
  count: number,
  radius: number,
  fill: string,
  highlight: string | null,
): void {
  const s = LAB_LOOK.texturePx;
  for (let i = 0; i < count; i += 1) {
    const cx = between(random, radius + 4, s - radius - 4);
    const cy = between(random, radius + 4, s - radius - 4);
    chunk(ctx, random, cx, cy, radius * (0.75 + random() * 0.5), fill, highlight);
  }
}

/** A thin wandering line: a crack in stone or a root in earth. */
function wander(
  ctx: CanvasRenderingContext2D,
  random: Random,
  colour: string,
  width: number,
  steps: number,
): void {
  const s = LAB_LOOK.texturePx;
  let x = random() * s;
  let y = random() * s;
  let angle = random() * Math.PI * 2;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < steps; i += 1) {
    angle += (random() - 0.5) * 1.2;
    x += Math.cos(angle) * 6;
    y += Math.sin(angle) * 6;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** A crystal shard: a long thin diamond pointing up and to one side, with a white sparkle. */
function shard(ctx: CanvasRenderingContext2D, random: Random, paint: BlockPaint): void {
  const s = LAB_LOOK.texturePx;
  const cx = between(random, 14, s - 14);
  const cy = between(random, 14, s - 14);
  const length = between(random, 9, 14);
  const width = length * 0.38;
  const tilt = (random() - 0.5) * 1.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(0, -length);
  ctx.lineTo(width, 0);
  ctx.lineTo(0, length * 0.6);
  ctx.lineTo(-width, 0);
  ctx.closePath();
  ctx.fillStyle = paint.accent;
  ctx.fill();
  // The lit half of the shard.
  ctx.beginPath();
  ctx.moveTo(0, -length);
  ctx.lineTo(-width, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = paint.accentLight;
  ctx.fillRect(cx - 1, cy - length * 0.7, 2, 2);
}

/** Paint one tile of `id` onto `ctx`. Each block kind has its own pattern. */
function paintTile(ctx: CanvasRenderingContext2D, id: BlockId, random: Random): void {
  const s = LAB_LOOK.texturePx;
  const paint = BLOCK_PAINT[id];
  ctx.fillStyle = paint.base;
  ctx.fillRect(0, 0, s, s);

  switch (id) {
    case 'dirt':
      // Loose earth: dense dark and light crumbs, and a few small pebbles.
      grain(ctx, random, paint.dark, 160, 2);
      grain(ctx, random, paint.light, 90, 2);
      nuggets(ctx, random, 3, 3, paint.accentLight, null);
      break;
    case 'stone':
      // Grey stone: soft mottling and one or two hairline cracks.
      blotches(ctx, random, paint.light, 6, 0.5);
      blotches(ctx, random, paint.dark, 5, 0.45);
      grain(ctx, random, paint.dark, 40, 1);
      wander(ctx, random, paint.accent, 1, 5);
      break;
    case 'hardRock':
      // Hard rock: dark, with diagonal strata.
      blotches(ctx, random, paint.light, 4, 0.35);
      ctx.strokeStyle = paint.accent;
      ctx.lineWidth = 2;
      for (let i = -s; i < s; i += 11) {
        const shift = between(random, -2, 2);
        ctx.beginPath();
        ctx.moveTo(i + shift, s);
        ctx.lineTo(i + s + shift, 0);
        ctx.stroke();
      }
      grain(ctx, random, paint.light, 25, 1);
      break;
    case 'coalSeam':
      // Coal: black, glossy lumps with grey glints.
      grain(ctx, random, paint.light, 60, 2);
      nuggets(ctx, random, 6, 7, paint.accent, paint.accentLight);
      break;
    case 'timberRoot':
      // Earth threaded with green roots.
      grain(ctx, random, paint.dark, 110, 2);
      wander(ctx, random, paint.accent, 3, 12);
      wander(ctx, random, paint.accent, 2, 10);
      wander(ctx, random, paint.accentLight, 1, 8);
      break;
    case 'ironOre':
    case 'copperOre':
    case 'unstableOre':
    case 'relic':
      // Ore: stone with bright nuggets of the ore's colour.
      blotches(ctx, random, paint.light, 5, 0.45);
      grain(ctx, random, paint.dark, 40, 1);
      nuggets(ctx, random, 4, 6, paint.accent, paint.accentLight);
      break;
    case 'crystal':
      blotches(ctx, random, paint.light, 5, 0.4);
      for (let i = 0; i < 4; i += 1) {
        shard(ctx, random, paint);
      }
      break;
    case 'keystone':
      // Ivory with carved brick lines.
      ctx.strokeStyle = paint.dark;
      ctx.lineWidth = 2;
      for (let row = 0; row < 4; row += 1) {
        const y = row * 16;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
        const offset = row % 2 === 0 ? 0 : 16;
        for (let x = offset; x < s; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 16);
          ctx.stroke();
        }
      }
      grain(ctx, random, paint.light, 30, 2);
      break;
    case 'rubble':
      // Broken rock: many chunks of different shades.
      nuggets(ctx, random, 5, 7, paint.dark, null);
      nuggets(ctx, random, 5, 6, paint.light, null);
      nuggets(ctx, random, 3, 5, paint.accent, null);
      break;
    case 'sealed':
      // Sealed rock: slate with horizontal bars.
      ctx.fillStyle = paint.dark;
      for (let y = 6; y < s; y += 14) {
        ctx.fillRect(0, y, s, 4);
      }
      grain(ctx, random, paint.light, 30, 1);
      break;
    case 'bedrock':
      grain(ctx, random, paint.light, 50, 2);
      break;
    case 'air':
      break;
  }
}

/** The painted tiles: `tiles[blockCode][variant]`. Built once, the first time they are needed. */
let tiles: HTMLCanvasElement[][] | null = null;

function buildTiles(): HTMLCanvasElement[][] {
  const built: HTMLCanvasElement[][] = [];
  // `Object.keys` gives the block ids as plain strings; `as BlockId[]` says they are exactly the ids.
  const ids = Object.keys(BLOCKS) as BlockId[];
  for (const id of ids) {
    const code = BLOCKS[id].code;
    const variants: HTMLCanvasElement[] = [];
    for (let v = 0; v < LAB_LOOK.textureVariants; v += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = LAB_LOOK.texturePx;
      canvas.height = LAB_LOOK.texturePx;
      const ctx = canvas.getContext('2d');
      if (ctx !== null) {
        paintTile(ctx, id, painter(code * 1000 + v + 1));
      }
      variants.push(canvas);
    }
    built[code] = variants;
  }
  return built;
}

/** Which variant square (x, y) uses: scrambled, so neighbours rarely match. */
function variantOf(x: number, y: number): number {
  const mixed = Math.imul((x * 73856093) ^ (y * 19349663), 0x5bd1e995) >>> 0;
  return (mixed >>> 13) % LAB_LOOK.textureVariants;
}

/** The painted tile for block `code` on square (x, y), or `null` if the block has no tile. */
export function textureFor(code: number, x: number, y: number): HTMLCanvasElement | null {
  if (tiles === null) {
    tiles = buildTiles();
  }
  return tiles[code]?.[variantOf(x, y)] ?? null;
}
