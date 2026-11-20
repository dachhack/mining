// The tap map of the phone preview (issues #66 and #86): the whole surface
// seen from above, drawn as coloured tiles on a canvas. Each square shows its
// top block, shaded by depth (deeper is darker); trees are drawn on top.
// Drag to pan, pinch to zoom, tap a square to mine it or cut its tree. There
// are no layers and no miner: only the top level is ever shown (owner, issue
// #82).
//
// It draws only from `buildTiles` (tiles.ts), which holds what the player
// knows and nothing else. It changes nothing itself: a tap is handed to
// `onTap` as a square, and the screen decides what it does (preview.ts).

import { BLOCKS, CAMPS } from '../../data';
import type { BlockId } from '../../data';
import type { GameState } from '../../engine';
import {
  VIEW_CELLS,
  cellAt,
  centredOn,
  clampCamera,
  isInView,
  panned,
  wholeMap,
  zoomedAbout,
} from './camera';
import type { Camera } from './camera';
import { BLOCK_LOOKS, MARK_COLOURS, PREVIEW_MAP, SURFACE_LOOKS, UNKNOWN_LOOK } from './palette';
import type { Pattern, SurfaceMark } from './palette';
import { FLOODED_EXTRA_AP } from '../text/squares';
import { NO_MARKS } from './targets';
import type { MapMarks } from './targets';
import { NO_TELLS, buildTiles, depthBrightness, openingSquare } from './tiles';
import type { Tile } from './tiles';

/** What the screen gets back from `createTapMap`. */
export interface TapMap {
  /** The map's whole element, to put on the page. */
  element: HTMLElement;
  /** The legend for what is on screen, to put further down the page. */
  legend: HTMLElement;
  /**
   * Show `state`, with `marks` drawn over it (the square a refused tap was
   * on, the neighbours that are too high, the squares a mine would make
   * unstable). `fresh` is true for a new or
   * resumed run: the map then opens on the pit, or on the nearest coal.
   */
  show(state: GameState, fresh: boolean, marks: MapMarks): void;
}

// ---------------------------------------------------------------------------
// Drawing one tile
// ---------------------------------------------------------------------------

/** Draw `pattern` in `ink` over the square at (x, y) with side `c`. */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  x: number,
  y: number,
  c: number,
  ink: string,
): void {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, c / 12);
  const mid = c / 2;
  const dot = Math.max(1, c / 10);
  switch (pattern) {
    case 'plain':
      break;
    case 'speckle':
      for (const [fx, fy] of [
        [0.25, 0.3],
        [0.7, 0.2],
        [0.5, 0.6],
        [0.2, 0.75],
        [0.8, 0.75],
      ] as const) {
        ctx.fillRect(x + fx * c, y + fy * c, dot, dot);
      }
      break;
    case 'dots':
      for (const [fx, fy] of [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.3, 0.7],
        [0.7, 0.7],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + fx * c, y + fy * c, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'hatch':
      // Diagonal lines, clipped to the tile.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, c, c);
      ctx.clip();
      ctx.beginPath();
      for (const f of [0.33, 0.66, 1.0, 1.33]) {
        ctx.moveTo(x + f * c, y);
        ctx.lineTo(x + (f - 1) * c, y + c);
      }
      ctx.stroke();
      ctx.restore();
      break;
    case 'stripes':
      ctx.beginPath();
      for (const f of [0.3, 0.5, 0.7]) {
        ctx.moveTo(x + f * c, y + 0.15 * c);
        ctx.lineTo(x + f * c, y + 0.85 * c);
      }
      ctx.stroke();
      break;
    case 'bars':
      ctx.beginPath();
      for (const f of [0.3, 0.5, 0.7]) {
        ctx.moveTo(x + 0.15 * c, y + f * c);
        ctx.lineTo(x + 0.85 * c, y + f * c);
      }
      ctx.stroke();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.2 * c);
      ctx.lineTo(x + 0.8 * c, y + mid);
      ctx.lineTo(x + mid, y + 0.8 * c);
      ctx.lineTo(x + 0.2 * c, y + mid);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.arc(x + mid, y + mid, c * 0.27, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'plus':
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.2 * c);
      ctx.lineTo(x + mid, y + 0.8 * c);
      ctx.moveTo(x + 0.2 * c, y + mid);
      ctx.lineTo(x + 0.8 * c, y + mid);
      ctx.stroke();
      break;
    case 'cross':
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.moveTo(x + 0.25 * c, y + 0.25 * c);
      ctx.lineTo(x + 0.75 * c, y + 0.75 * c);
      ctx.moveTo(x + 0.75 * c, y + 0.25 * c);
      ctx.lineTo(x + 0.25 * c, y + 0.75 * c);
      ctx.stroke();
      break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? c * 0.32 : c * 0.13;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = x + mid + Math.cos(a) * r;
        const py = y + mid + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'tree':
      // A fir: a triangle on a short trunk.
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.12 * c);
      ctx.lineTo(x + 0.8 * c, y + 0.7 * c);
      ctx.lineTo(x + 0.2 * c, y + 0.7 * c);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + 0.44 * c, y + 0.7 * c, 0.12 * c, 0.18 * c);
      break;
    case 'stump':
      // A cut trunk seen from above: a ring with a dot.
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.arc(x + mid, y + mid, c * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + mid, y + mid, dot, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'grass':
      // Three tufts: little V shapes.
      ctx.beginPath();
      for (const [fx, fy] of [
        [0.25, 0.4],
        [0.65, 0.3],
        [0.45, 0.75],
      ] as const) {
        ctx.moveTo(x + (fx - 0.08) * c, y + (fy - 0.1) * c);
        ctx.lineTo(x + fx * c, y + fy * c);
        ctx.lineTo(x + (fx + 0.08) * c, y + (fy - 0.1) * c);
      }
      ctx.stroke();
      break;
    case 'track':
      // Two ruts, dashed, along the tile.
      ctx.save();
      ctx.setLineDash([c / 8, c / 10]);
      ctx.beginPath();
      for (const f of [0.35, 0.65]) {
        ctx.moveTo(x + f * c, y + 0.1 * c);
        ctx.lineTo(x + f * c, y + 0.9 * c);
      }
      ctx.stroke();
      ctx.restore();
      break;
    case 'peak':
      // A rock: an outlined peak.
      ctx.lineWidth = Math.max(1.5, c / 9);
      ctx.beginPath();
      ctx.moveTo(x + 0.15 * c, y + 0.8 * c);
      ctx.lineTo(x + 0.45 * c, y + 0.25 * c);
      ctx.lineTo(x + 0.6 * c, y + 0.5 * c);
      ctx.lineTo(x + 0.7 * c, y + 0.4 * c);
      ctx.lineTo(x + 0.85 * c, y + 0.8 * c);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'grid':
      ctx.strokeRect(x + 0.2 * c, y + 0.2 * c, 0.6 * c, 0.6 * c);
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.2 * c);
      ctx.lineTo(x + mid, y + 0.8 * c);
      ctx.moveTo(x + 0.2 * c, y + mid);
      ctx.lineTo(x + 0.8 * c, y + mid);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** True if a square `c` pixels wide is too small for numbers (the whole-map zoom). */
function isSmall(c: number): boolean {
  return c < PREVIEW_MAP.numbersMinCellPx;
}

/**
 * Stroke the path that `trace` draws twice: first wide and dark, then
 * narrower in `colour`, so that a line shows on any rock.
 */
function strokeWithEdge(
  ctx: CanvasRenderingContext2D,
  colour: string,
  width: number,
  trace: () => void,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = MARK_COLOURS.tellOutline;
  ctx.lineWidth = width + Math.max(1.5, width * 0.9);
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.restore();
}

/** Draw one tile, with its top-left corner at (x, y) and side `c` pixels. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  c: number,
  grid = true,
): void {
  if (tile.surface === 'tree') {
    // A tree hides the square under it (issue #70): drawn solid.
    const look = SURFACE_LOOKS.tree;
    ctx.fillStyle = look.haze;
    ctx.fillRect(x, y, c, c);
    drawPattern(ctx, look.pattern, x, y, c, look.ink);
  } else {
    const look = tile.kind === 'floor' ? BLOCK_LOOKS.bedrock : BLOCK_LOOKS[tile.block ?? 'air'];
    ctx.fillStyle =
      tile.kind === 'block' && tile.block === null ? UNKNOWN_LOOK.colour : look.colour;
    ctx.fillRect(x, y, c, c);
    drawPattern(ctx, look.pattern, x, y, c, look.ink);
    if (tile.surface !== null) {
      // At ground level: what lies on the surface (a stump, a path, a meadow,
      // an outcrop), as its pattern drawn faintly over the block, so the
      // block still shows (issue #78).
      const kind = SURFACE_LOOKS[tile.surface];
      ctx.save();
      ctx.globalAlpha = PREVIEW_MAP.surfaceMarkAlpha;
      drawPattern(ctx, kind.pattern, x, y, c, kind.ink);
      ctx.restore();
    }
    // Depth shading: a black veil, thicker with every level down.
    const veil = 1 - depthBrightness(tile.depth);
    if (veil > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${veil})`;
      ctx.fillRect(x, y, c, c);
    }
  }
  // The shadow of each higher neighbour, along that side: the pit's walls.
  const w = Math.max(1.5, c * PREVIEW_MAP.wallShadowWidth);
  ctx.fillStyle = MARK_COLOURS.wallShadow;
  if (tile.higher.north) ctx.fillRect(x, y, c, w);
  if (tile.higher.south) ctx.fillRect(x, y + c - w, c, w);
  if (tile.higher.west) ctx.fillRect(x, y, w, c);
  if (tile.higher.east) ctx.fillRect(x + c - w, y, w, c);

  drawMarks(ctx, tile, x, y, c);
  if (tile.depth > 0 && c >= PREVIEW_MAP.depthNumberMinCellPx) {
    // The depth: a plain white number in the bottom-right corner. The other
    // numbers on a square sit in coloured badges in the top corners, so the
    // three are never taken for one another (issue #110).
    ctx.save();
    ctx.font = `bold ${Math.round(c * 0.38)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(2, c / 10);
    ctx.strokeStyle = MARK_COLOURS.depthNumberOutline;
    ctx.fillStyle = MARK_COLOURS.depthNumber;
    ctx.strokeText(String(tile.depth), x + c - 2, y + c - 2);
    ctx.fillText(String(tile.depth), x + c - 2, y + c - 2);
    ctx.restore();
  }
  if (grid) {
    ctx.strokeStyle = MARK_COLOURS.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
  }
}

/**
 * A number in a coloured badge in a top corner of a square: the units of
 * water or lava on the left, a crack's countdown on the right. `ring` draws
 * a bright edge round the badge (a lava source). Left out on a square too
 * small to read a number on.
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  corner: 'left' | 'right',
  fill: string,
  ring: string | null,
  x: number,
  y: number,
  c: number,
): void {
  if (isSmall(c)) {
    return;
  }
  const fontPx = Math.max(9, Math.round(c * 0.36));
  ctx.save();
  ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
  const width = Math.max(fontPx * 0.95, ctx.measureText(text).width + fontPx * 0.45);
  const height = fontPx * 1.05;
  const left = corner === 'left' ? x + 1 : x + c - 1 - width;
  const top = y + 1;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, fontPx * 0.3);
  ctx.fill();
  ctx.lineWidth = ring === null ? 1 : Math.max(1.5, c / 14);
  ctx.strokeStyle = ring ?? MARK_COLOURS.fluidOutline;
  ctx.stroke();
  ctx.fillStyle = MARK_COLOURS.badgeInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + width / 2, top + height / 2 + fontPx * 0.06);
  ctx.restore();
}

/**
 * Water or lava on a tile (design doc 6.3 and 6.4): a wash of colour over the
 * block and a pattern (waves for water, flames for lava, so the two never
 * differ by colour alone). The units are drawn later, in a badge
 * (`drawFluidBadge`), so that nothing covers them.
 */
function drawStanding(
  ctx: CanvasRenderingContext2D,
  fluid: 'water' | 'lava',
  x: number,
  y: number,
  c: number,
): void {
  const ink = fluid === 'water' ? MARK_COLOURS.waterInk : MARK_COLOURS.lavaInk;
  ctx.save();
  ctx.fillStyle = fluid === 'water' ? MARK_COLOURS.water : MARK_COLOURS.lava;
  ctx.fillRect(x, y, c, c);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, c / 14);
  if (fluid === 'water') {
    // Two wave lines across the lower half.
    for (const fy of [0.62, 0.84]) {
      ctx.beginPath();
      ctx.moveTo(x + 0.08 * c, y + fy * c);
      ctx.quadraticCurveTo(x + 0.2 * c, y + (fy - 0.12) * c, x + 0.33 * c, y + fy * c);
      ctx.quadraticCurveTo(x + 0.46 * c, y + (fy + 0.12) * c, x + 0.6 * c, y + fy * c);
      ctx.stroke();
    }
  } else {
    // Two flames along the bottom edge, clear of the depth number on the right.
    for (const fx of [0.2, 0.48]) {
      ctx.beginPath();
      ctx.moveTo(x + (fx - 0.12) * c, y + 0.92 * c);
      ctx.lineTo(x + fx * c, y + 0.58 * c);
      ctx.lineTo(x + (fx + 0.12) * c, y + 0.92 * c);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The units of water or lava on a tile, in a badge in the top-left corner. */
function drawFluidBadge(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  c: number,
) {
  if (tile.lava > 0) {
    // A source has a bright ring round its badge: it keeps pouring.
    const ring = tile.lavaSource ? MARK_COLOURS.lavaInk : null;
    drawBadge(ctx, String(tile.lava), 'left', MARK_COLOURS.lavaBadge, ring, x, y, c);
  } else if (tile.water > 0) {
    drawBadge(ctx, String(tile.water), 'left', MARK_COLOURS.waterBadge, null, x, y, c);
  }
}

/**
 * The mark for "water (or lava) flows onto this square when the shift ends".
 * Water: a round blue drop with a white edge. Lava: an orange flame with two
 * tongues and a yellow heart. They differ in shape as well as colour, and
 * neither is a plain triangle, which is the camp's tent (issue #110).
 */
function drawComing(
  ctx: CanvasRenderingContext2D,
  fluid: 'water' | 'lava',
  x: number,
  y: number,
  c: number,
): void {
  // Water's mark sits left of the middle and lava's right, so a square that
  // both will reach shows both. On a small square the marks are bigger.
  const r = c * (isSmall(c) ? 0.3 : 0.24);
  const cx = x + (fluid === 'water' ? 0.32 : 0.68) * c;
  const cy = y + 0.52 * c;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, c / 16);
  if (fluid === 'water') {
    // A drop: a point at the top, round at the bottom.
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.25);
    ctx.bezierCurveTo(cx + r * 1.3, cy, cx + r * 0.9, cy + r, cx, cy + r);
    ctx.bezierCurveTo(cx - r * 0.9, cy + r, cx - r * 1.3, cy, cx, cy - r * 1.25);
    ctx.fillStyle = MARK_COLOURS.waterComing;
    ctx.fill();
    ctx.strokeStyle = MARK_COLOURS.waterComingEdge;
    ctx.stroke();
  } else {
    // A flame: a wide foot and two tongues, the left one taller.
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.9, cy + r);
    ctx.lineTo(cx - r * 0.95, cy);
    ctx.lineTo(cx - r * 0.35, cy - r * 1.25);
    ctx.lineTo(cx + r * 0.05, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.6, cy - r * 0.85);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.2);
    ctx.lineTo(cx + r * 0.9, cy + r);
    ctx.closePath();
    ctx.fillStyle = MARK_COLOURS.lavaComing;
    ctx.fill();
    ctx.strokeStyle = MARK_COLOURS.fluidOutline;
    ctx.stroke();
    // The heart of the flame.
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.8);
    ctx.closePath();
    ctx.fillStyle = MARK_COLOURS.lavaComingHeart;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The marks for what is known under a square's top (design doc 7.2; owner
 * question 93), in a row from the left edge at mid-height: a gold diamond
 * for ore, a blue disc for a pocket, a white ring for a cavern. A scanned
 * square with only plain rock under it gets a small grey bar, so that the
 * player sees it has been scanned. Shapes differ as well as colours.
 */
function drawBelowMarks(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  c: number,
): void {
  const below = tile.below;
  if (!below.any) {
    return;
  }
  ctx.save();
  const r = Math.max(1.8, c * 0.11);
  const cy = y + 0.46 * c;
  ctx.lineWidth = Math.max(1, c / 16);
  ctx.strokeStyle = MARK_COLOURS.belowOutline;
  if (!below.ore && !below.pocket && !below.cavern) {
    ctx.fillStyle = MARK_COLOURS.belowPlain;
    ctx.fillRect(x + 0.1 * c, cy - r * 0.3, 2.4 * r, r * 0.7);
    ctx.strokeRect(x + 0.1 * c, cy - r * 0.3, 2.4 * r, r * 0.7);
    ctx.restore();
    return;
  }
  let cx = x + 0.08 * c + r;
  if (below.ore) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = MARK_COLOURS.belowOre;
    ctx.fill();
    ctx.stroke();
    cx += 2.4 * r;
  }
  if (below.pocket) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = MARK_COLOURS.belowPocket;
    ctx.fill();
    ctx.stroke();
    cx += 2.4 * r;
  }
  if (below.cavern) {
    // A ring: dark underneath, white on top, hollow in the middle.
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2.5, c / 7);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.2, c / 14);
    ctx.strokeStyle = MARK_COLOURS.belowCavern;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Gas on a tile (design doc 6.5): a green-yellow wash and four small rings
 * (bubbles: neither waves nor flames, so gas never differs from water and
 * lava by colour alone). No number: the rules read only whether a square is
 * gassy, and the units of settled gas flip by one every shift (owner
 * question 120), so a number would flicker and say nothing. Inspect tells
 * the units.
 */
function drawGas(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  ctx.save();
  ctx.fillStyle = MARK_COLOURS.gas;
  ctx.fillRect(x, y, c, c);
  ctx.strokeStyle = MARK_COLOURS.gasInk;
  ctx.lineWidth = Math.max(1, c / 16);
  for (const [fx, fy, fr] of [
    [0.26, 0.3, 0.11],
    [0.62, 0.24, 0.08],
    [0.48, 0.58, 0.12],
    [0.22, 0.76, 0.07],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + fx * c, y + fy * c, fr * c, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * "Gas spreads onto this square when the shift ends": a cluster of three
 * rings in the middle, in the gas colour, with a dark edge. No wash: the gas
 * is not there yet.
 */
function drawGasComing(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  const scale = isSmall(c) ? 1.3 : 1;
  strokeWithEdge(ctx, MARK_COLOURS.gasInk, Math.max(1.2, c / 14), () => {
    for (const [fx, fy, fr] of [
      [0.4, 0.42, 0.13],
      [0.64, 0.56, 0.1],
      [0.42, 0.7, 0.08],
    ] as const) {
      ctx.moveTo(x + fx * c + fr * c * scale, y + fy * c);
      ctx.arc(x + fx * c, y + fy * c, fr * c * scale, 0, Math.PI * 2);
    }
  });
}

/**
 * A square a vent will clear of gas when the shift ends (issue #107): an
 * arrow pointing up out of the pit, along the right edge of the square, pale
 * green with a dark edge. A shape of its own, beside the rings of gas.
 */
function drawVented(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  strokeWithEdge(ctx, MARK_COLOURS.vent, Math.max(1.8, c / 11), () => {
    // The shaft, then the two sides of the head.
    ctx.moveTo(x + 0.84 * c, y + 0.56 * c);
    ctx.lineTo(x + 0.84 * c, y + 0.12 * c);
    ctx.moveTo(x + 0.72 * c, y + 0.26 * c);
    ctx.lineTo(x + 0.84 * c, y + 0.12 * c);
    ctx.lineTo(x + 0.96 * c, y + 0.26 * c);
  });
}

/**
 * A charge that goes off when the shift ends. A placed explosive is a round
 * red charge with a fuse; armed unstable ore is a red eight-pointed
 * starburst. Both have a dark edge so that they show on any rock.
 */
function drawCharge(
  ctx: CanvasRenderingContext2D,
  charge: 'explosive' | 'armedOre',
  x: number,
  y: number,
  c: number,
): void {
  const cx = x + 0.5 * c;
  const cy = y + 0.55 * c;
  ctx.save();
  ctx.fillStyle = MARK_COLOURS.charge;
  ctx.strokeStyle = MARK_COLOURS.fluidOutline;
  ctx.lineWidth = Math.max(1, c / 14);
  ctx.beginPath();
  if (charge === 'explosive') {
    ctx.arc(cx, cy, 0.22 * c, 0, Math.PI * 2);
  } else {
    // Sixteen points round the middle, long and short in turn.
    for (let point = 0; point < 16; point += 1) {
      const radius = (point % 2 === 0 ? 0.34 : 0.14) * c;
      const angle = (point * Math.PI) / 8;
      const px = cx + radius * Math.sin(angle);
      const py = cy - radius * Math.cos(angle);
      if (point === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (charge === 'explosive') {
    // The fuse: a short line up and to the right, with a bright tip.
    ctx.strokeStyle = MARK_COLOURS.chargeInk;
    ctx.lineWidth = Math.max(1.5, c / 11);
    ctx.beginPath();
    ctx.moveTo(cx + 0.12 * c, cy - 0.18 * c);
    ctx.lineTo(cx + 0.28 * c, cy - 0.38 * c);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * "This square will be in an explosion when the shift ends": a dashed yellow
 * frame just inside the square, dark underneath.
 */
function drawBlast(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  const inset = Math.max(2, c * 0.1);
  ctx.save();
  for (const [colour, width] of [
    [MARK_COLOURS.fluidOutline, Math.max(3, c / 7)],
    [MARK_COLOURS.blast, Math.max(1.5, c / 12)],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.setLineDash([c * 0.18, c * 0.12]);
    ctx.strokeRect(x + inset, y + inset, c - 2 * inset, c - 2 * inset);
  }
  ctx.restore();
}

/**
 * The hazard tells on a top block (design doc 3.7), drawn on the rock itself,
 * under whatever stands on the square. Each has a colour of the hazard it
 * warns of and a shape of its own:
 * - damp stone (water under or beside): two blue drips from the top edge;
 * - pitted rock (gas under or beside): three black pits in a row;
 * - warm glow (lava within 2): three orange heat lines rising from the bottom;
 * - hairline glow (unstable ore): a thin pale ring round the ore's cross.
 */
function drawTells(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, c: number) {
  const tells = tile.tells;
  if (tells.warm) {
    strokeWithEdge(ctx, MARK_COLOURS.tellWarm, Math.max(1.2, c / 13), () => {
      for (const fx of [0.3, 0.5, 0.7]) {
        // An S-shaped line from near the bottom edge up to the middle.
        ctx.moveTo(x + fx * c, y + 0.9 * c);
        ctx.bezierCurveTo(
          x + (fx - 0.14) * c,
          y + 0.76 * c,
          x + (fx + 0.14) * c,
          y + 0.62 * c,
          x + fx * c,
          y + 0.46 * c,
        );
      }
    });
  }
  if (tells.damp) {
    // The drips hang between the three dots of mineral traces, so both show.
    const drips: [number, number][] = [
      [0.375, 0.4],
      [0.625, 0.28],
    ];
    strokeWithEdge(ctx, MARK_COLOURS.tellDamp, Math.max(1.2, c / 13), () => {
      for (const [fx, length] of drips) {
        ctx.moveTo(x + fx * c, y + 0.04 * c);
        ctx.lineTo(x + fx * c, y + length * c);
      }
    });
    ctx.save();
    ctx.fillStyle = MARK_COLOURS.tellDamp;
    ctx.strokeStyle = MARK_COLOURS.tellOutline;
    ctx.lineWidth = Math.max(0.8, c / 26);
    for (const [fx, length] of drips) {
      // The bead at the end of the drip.
      ctx.beginPath();
      ctx.arc(x + fx * c, y + length * c, Math.max(1.5, c * 0.085), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  if (tells.pitted) {
    // Holes in the rock: three black dots in a row, each with a hair-thin
    // pale grey edge so that it shows on dark rock. Filled, in a row and
    // without colour, where gas that is arriving is hollow green bubbles in
    // a cluster (issue #110, review).
    ctx.save();
    ctx.fillStyle = MARK_COLOURS.tellPit;
    ctx.strokeStyle = MARK_COLOURS.tellPitRim;
    ctx.lineWidth = Math.max(0.6, c / 36);
    for (const fx of [0.26, 0.5, 0.74]) {
      ctx.beginPath();
      ctx.arc(x + fx * c, y + 0.62 * c, Math.max(1.6, c * 0.095), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  if (tells.hairline) {
    // A thin pale ring round the ore's cross: the glow.
    strokeWithEdge(ctx, MARK_COLOURS.tellHairline, Math.max(1, c / 20), () => {
      ctx.moveTo(x + 0.9 * c, y + 0.5 * c);
      ctx.arc(x + 0.5 * c, y + 0.5 * c, 0.4 * c, 0, Math.PI * 2);
    });
  }
}

/**
 * The corners of a square the crew worked this shift (design doc 5.2): four
 * white L shapes, dark underneath. A hazard that reaches the square when the
 * shift ends hurts the crew. Corners only, so that it is not taken for the
 * dashed frame of a blast, which may be on the same square.
 */
function drawWorked(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  c: number,
  hurt = false,
): void {
  if (hurt) {
    // The crew will be hurt here (the engine's forecast): a whole red frame,
    // dark underneath. A closed frame, so that it differs from the plain
    // white corners in shape as well as in colour.
    const edge = Math.max(1.5, c * 0.06);
    ctx.save();
    for (const [colour, width] of [
      [MARK_COLOURS.fluidOutline, Math.max(4, c / 5)],
      [MARK_COLOURS.crewHurt, Math.max(2.5, c / 8)],
    ] as const) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.strokeRect(x + edge, y + edge, c - 2 * edge, c - 2 * edge);
    }
    ctx.restore();
    // The frame stands in for the white corners: they would hide most of it.
    return;
  }
  const arm = c * 0.3;
  const inset = Math.max(1.5, c * 0.06);
  const left = x + inset;
  const right = x + c - inset;
  const top = y + inset;
  const bottom = y + c - inset;
  ctx.save();
  ctx.lineCap = 'square';
  for (const [colour, width] of [
    [MARK_COLOURS.fluidOutline, Math.max(3, c / 7)],
    [MARK_COLOURS.worked, Math.max(1.5, c / 13)],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(left, top + arm);
    ctx.lineTo(left, top);
    ctx.lineTo(left + arm, top);
    ctx.moveTo(right - arm, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + arm);
    ctx.moveTo(right, bottom - arm);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right - arm, bottom);
    ctx.moveTo(left + arm, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, bottom - arm);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The edge of the area where mining is cheaper (a camp is near): a dashed
 * green line along each side of the square that is on that edge. One line
 * round the whole area, drawn over water and lava, in place of a tick on
 * every square (issue #110).
 */
function drawCheaperEdge(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  c: number,
) {
  const edge = tile.cheaperEdge;
  if (!edge.north && !edge.east && !edge.south && !edge.west) {
    return;
  }
  const inset = Math.max(1, c * 0.05);
  ctx.save();
  ctx.setLineDash([c * 0.22, c * 0.14]);
  for (const [colour, width] of [
    [MARK_COLOURS.fluidOutline, Math.max(2.5, c / 8)],
    [MARK_COLOURS.cheaper, Math.max(1.2, c / 16)],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (edge.north) {
      ctx.moveTo(x, y + inset);
      ctx.lineTo(x + c, y + inset);
    }
    if (edge.south) {
      ctx.moveTo(x, y + c - inset);
      ctx.lineTo(x + c, y + c - inset);
    }
    if (edge.west) {
      ctx.moveTo(x + inset, y);
      ctx.lineTo(x + inset, y + c);
    }
    if (edge.east) {
      ctx.moveTo(x + c - inset, y);
      ctx.lineTo(x + c - inset, y + c);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A structure in the middle of a square: a support (a T), a pump (a disc with P), a vent (a disc with V). */
function drawStructure(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, c: number) {
  const mid = c / 2;
  if (tile.structure === 'support') {
    // A T: a beam on a post, dark underneath.
    strokeWithEdge(ctx, MARK_COLOURS.support, Math.max(2, c / 7), () => {
      ctx.moveTo(x + 0.22 * c, y + 0.27 * c);
      ctx.lineTo(x + 0.78 * c, y + 0.27 * c);
      ctx.moveTo(x + mid, y + 0.27 * c);
      ctx.lineTo(x + mid, y + 0.82 * c);
    });
  } else if (tile.structure === 'pump' || tile.structure === 'vent') {
    // A disc with a letter: blue with a white "P", pale green with a dark "V".
    const pump = tile.structure === 'pump';
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, 0.28 * c, 0, Math.PI * 2);
    ctx.fillStyle = pump ? MARK_COLOURS.pump : MARK_COLOURS.vent;
    ctx.fill();
    ctx.lineWidth = Math.max(1, c / 14);
    ctx.strokeStyle = MARK_COLOURS.belowOutline;
    ctx.stroke();
    ctx.font = `bold ${Math.max(7, Math.round(c * 0.4))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pump ? MARK_COLOURS.pumpInk : MARK_COLOURS.ventInk;
    ctx.fillText(pump ? 'P' : 'V', x + mid, y + mid + 0.02 * c);
    ctx.restore();
  } else if (tile.structure === 'other') {
    ctx.strokeStyle = MARK_COLOURS.otherStructure;
    ctx.lineWidth = Math.max(1.5, c / 10);
    ctx.strokeRect(x + 0.25 * c, y + 0.25 * c, 0.5 * c, 0.5 * c);
  }
}

/** A crack on a top block: a jagged line from corner to corner, and its countdown in a badge. */
function drawCrack(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, c: number) {
  if (tile.crack === null) {
    return;
  }
  // Red while the countdown is running; pale grey when it has stopped.
  const colour = tile.crackRunning ? MARK_COLOURS.crack : MARK_COLOURS.crackStopped;
  const zigzag: [number, number][] = [
    [0.08, 0.3],
    [0.4, 0.46],
    [0.3, 0.62],
    [0.66, 0.72],
    [0.9, 0.94],
  ];
  strokeWithEdge(ctx, colour, Math.max(1.5, c / 11), () => {
    zigzag.forEach(([fx, fy], index) => {
      if (index === 0) {
        ctx.moveTo(x + fx * c, y + fy * c);
      } else {
        ctx.lineTo(x + fx * c, y + fy * c);
      }
    });
  });
  const badge = tile.crackRunning ? MARK_COLOURS.crackBadge : MARK_COLOURS.crackStoppedBadge;
  drawBadge(ctx, String(tile.crack), 'right', badge, null, x, y, c);
}

/**
 * Everything drawn over a tile's rock, from the bottom up: the tells on the
 * rock; a camp; water, lava and gas; the edge of the cheaper area; mineral
 * traces; a structure or a charge; what is coming when the shift ends; the
 * blast frame and, over it, the scan marks and the corners of a worked square;
 * and last the crack and the number badges, which nothing may cover.
 */
function drawMarks(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, c: number) {
  const mid = c / 2;
  drawTells(ctx, tile, x, y, c);
  if (tile.camp) {
    // A camp square: a pale wash and a tent (a triangle with a door), dark
    // underneath so that it shows on any rock.
    ctx.fillStyle = MARK_COLOURS.campWash;
    ctx.fillRect(x, y, c, c);
    ctx.beginPath();
    ctx.moveTo(x + mid, y + 0.2 * c);
    ctx.lineTo(x + 0.84 * c, y + 0.8 * c);
    ctx.lineTo(x + 0.16 * c, y + 0.8 * c);
    ctx.closePath();
    ctx.fillStyle = MARK_COLOURS.camp;
    ctx.fill();
    ctx.lineWidth = Math.max(1, c / 14);
    ctx.strokeStyle = MARK_COLOURS.campOutline;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + mid, y + 0.5 * c);
    ctx.lineTo(x + mid, y + 0.8 * c);
    ctx.stroke();
  }
  if (tile.water > 0) {
    drawStanding(ctx, 'water', x, y, c);
  }
  if (tile.lava > 0) {
    drawStanding(ctx, 'lava', x, y, c);
  }
  if (tile.gas > 0) {
    drawGas(ctx, x, y, c);
  }
  drawCheaperEdge(ctx, tile, x, y, c);
  if (tile.traced) {
    // Three small gold dots along the top edge: mineral traces seen on this rock.
    ctx.save();
    ctx.fillStyle = MARK_COLOURS.traces;
    ctx.strokeStyle = MARK_COLOURS.tellOutline;
    ctx.lineWidth = Math.max(0.8, c / 26);
    for (const fx of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(x + fx * c, y + 0.16 * c, Math.max(1.2, c / 11), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  drawStructure(ctx, tile, x, y, c);
  if (tile.charge !== null) {
    drawCharge(ctx, tile.charge, x, y, c);
  }
  if (tile.waterComing) {
    drawComing(ctx, 'water', x, y, c);
  }
  if (tile.lavaComing) {
    drawComing(ctx, 'lava', x, y, c);
  }
  if (tile.gasComing) {
    drawGasComing(ctx, x, y, c);
  }
  if (tile.vented) {
    drawVented(ctx, x, y, c);
  }
  if (tile.blast) {
    drawBlast(ctx, x, y, c);
  }
  // The scan marks and the worked corners go over the blast frame, so that
  // the frame hides neither: a square that is worked and in a blast is the
  // one that matters most.
  drawBelowMarks(ctx, tile, x, y, c);
  // (The corners are drawn after the scan marks, which sit at the left edge.)
  if (tile.worked) {
    drawWorked(ctx, x, y, c, tile.crewHurt);
  }
  drawCrack(ctx, tile, x, y, c);
  drawFluidBadge(ctx, tile, x, y, c);
}

// ---------------------------------------------------------------------------
// The legend
// ---------------------------------------------------------------------------

/** A blank tile, to draw legend swatches from. */
function sampleTile(overrides: Partial<Tile>): Tile {
  return {
    x: 0,
    y: 0,
    depth: 0,
    kind: 'block',
    block: 'stone',
    traced: false,
    tells: NO_TELLS,
    worked: false,
    crewHurt: false,
    cheaperEdge: { north: false, east: false, south: false, west: false },
    structure: null,
    crack: null,
    crackRunning: false,
    water: 0,
    lava: 0,
    lavaSource: false,
    waterComing: false,
    lavaComing: false,
    gas: 0,
    gasComing: false,
    vented: false,
    charge: null,
    blast: false,
    surface: null,
    higher: { north: false, east: false, south: false, west: false },
    camp: false,
    cheaper: false,
    below: { any: false, ore: false, pocket: false, cavern: false },
    ...overrides,
  };
}

/** One legend entry: a little drawn tile and its meaning. */
function legendEntry(tile: Tile, label: string): HTMLElement {
  const entry = document.createElement('span');
  entry.className = 'legend-entry';
  const swatch = document.createElement('canvas');
  const px = 24;
  const dpr = window.devicePixelRatio || 1;
  swatch.width = px * dpr;
  swatch.height = px * dpr;
  swatch.className = 'legend-swatch';
  const ctx = swatch.getContext('2d');
  if (ctx !== null) {
    ctx.scale(dpr, dpr);
    drawTile(ctx, tile, 0, 0, px);
  }
  const text = document.createElement('span');
  text.textContent = label;
  entry.append(swatch, text);
  return entry;
}

/** The legend for what is on screen now: only the things actually drawn. */
function legendFor(tiles: Tile[]): HTMLElement[] {
  const entries: HTMLElement[] = [];
  /** Add an entry if any tile on screen passes `shown`. */
  const add = (shown: (tile: Tile) => boolean, sample: Partial<Tile>, label: string): void => {
    if (tiles.some(shown)) {
      entries.push(legendEntry(sampleTile(sample), label));
    }
  };
  const noSides = { north: false, east: false, south: false, west: false };
  const none = { any: true, ore: false, pocket: false, cavern: false };

  // The surface kinds (issue #70), in a fixed order. Shown over dirt, as on
  // the map (a tree hides it anyway).
  const surfaceLabels: [SurfaceMark, string][] = [
    ['tree', 'tree (tap to cut; hides the block under it)'],
    ['stump', 'stump (a tree grows back)'],
    ['path', 'dirt path'],
    ['meadow', 'meadow'],
    ['outcrop', 'stone outcrop'],
  ];
  for (const [kind, label] of surfaceLabels) {
    add((t) => t.surface === kind, { block: 'dirt', surface: kind }, label);
  }
  // The blocks, in the order of the data's block list, so the legend does not jump about.
  for (const id of Object.keys(BLOCKS) as BlockId[]) {
    add((t) => t.kind === 'block' && t.block === id, { block: id }, BLOCKS[id].name);
  }
  add((t) => t.kind === 'floor', { kind: 'floor', block: null }, 'bedrock floor');
  add((t) => t.depth > 0, { depth: 3 }, 'dug: deeper is darker; the white number is the depth');
  add(
    (t) => t.depth > 0,
    { depth: 1, higher: { ...noSides, north: true, west: true } },
    'shadow: that side is higher',
  );

  // Tells on top blocks (design doc 3.7).
  add((t) => t.traced, { traced: true }, 'mineral traces (gold dots): ore is near');
  add(
    (t) => t.tells.damp,
    { tells: { ...NO_TELLS, damp: true } },
    'damp stone (blue drips): water under or beside',
  );
  add(
    (t) => t.tells.pitted,
    { tells: { ...NO_TELLS, pitted: true } },
    'pitted rock (a row of black pits): gas under or beside',
  );
  add(
    (t) => t.tells.warm,
    { tells: { ...NO_TELLS, warm: true } },
    'warm glow (orange heat lines): lava within 2',
  );
  add(
    (t) => t.tells.hairline,
    { block: 'unstableOre', tells: { ...NO_TELLS, hairline: true } },
    'hairline glow (pale ring): unstable ore; mining beside it arms it, so brace it or mine it first',
  );

  // What the crew did and built.
  add(
    (t) => t.worked && !t.crewHurt,
    { worked: true },
    'white corners: the crew worked here this shift; a hazard that reaches it hurts the crew',
  );
  add(
    (t) => t.crewHurt,
    { worked: true, crewHurt: true },
    'red frame: the crew worked here and will or may be hurt when the shift ends (the list under End shift says by what)',
  );
  add((t) => t.structure === 'support', { structure: 'support' }, 'support: holds the square');
  add(
    (t) => t.structure === 'pump',
    { structure: 'pump' },
    'pump: takes water from the squares near it when a shift ends',
  );
  add(
    (t) => t.structure === 'vent',
    { structure: 'vent' },
    'vent: clears all the gas on the squares near it when a shift ends',
  );
  add((t) => t.structure === 'other', { structure: 'other' }, 'other structure');
  add((t) => t.camp, { camp: true }, 'camp square (cannot be mined)');
  add(
    (t) => t.cheaperEdge.north || t.cheaperEdge.east || t.cheaperEdge.south || t.cheaperEdge.west,
    { cheaperEdge: { ...noSides, north: true, west: true } },
    `green dashed line: inside it (near a camp) mining costs ${CAMPS.mineDiscountAp} AP less, ` +
      `never below ${CAMPS.mineMinAp}`,
  );

  // What a scan has shown under the tops (hold a square for the list).
  add((t) => t.below.ore, { below: { ...none, ore: true } }, 'gold diamond: ore known below');
  add(
    (t) => t.below.pocket,
    { below: { ...none, pocket: true } },
    'blue disc: a pocket (water, lava or gas) known below',
  );
  add((t) => t.below.cavern, { below: { ...none, cavern: true } }, 'ring: a cavern known below');
  add(
    (t) => t.below.any && !t.below.ore && !t.below.pocket && !t.below.cavern,
    { below: none },
    'grey bar: plain rock known below',
  );

  // Hazards standing on squares, and what happens when this shift ends.
  add(
    (t) => t.crack !== null && t.crackRunning,
    { block: 'dirt', crack: 1, crackRunning: true },
    'crack: the block slumps into the pit; the red number is its countdown (1 = when this shift ends)',
  );
  add(
    (t) => t.crack !== null && !t.crackRunning,
    { block: 'dirt', crack: 1, crackRunning: false },
    'grey crack: countdown stopped (the square is stable or held); it goes on if that changes',
  );
  add(
    (t) => t.water > 0,
    { depth: 2, water: 2 },
    `water (waves): the blue number is its units; mining there costs ${FLOODED_EXTRA_AP} AP more`,
  );
  add(
    (t) => t.lava > 0,
    { depth: 2, lava: 2 },
    'lava (flames): the dark red number is its units; the square cannot be mined',
  );
  add(
    (t) => t.lavaSource,
    { depth: 2, lava: 2, lavaSource: true },
    'ringed number: a lava source, which keeps pouring',
  );
  add(
    (t) => t.gas > 0,
    { depth: 2, gas: 4 },
    'gas (bubbles): it hurts a crew working there, and lava or a blast sets it off; Inspect says how much',
  );
  add(
    (t) => t.waterComing,
    { depth: 2, waterComing: true },
    'blue drop: water flows here when this shift ends',
  );
  add(
    (t) => t.lavaComing,
    { depth: 2, lavaComing: true },
    'orange flame: lava flows here when this shift ends',
  );
  add(
    (t) => t.gasComing,
    { depth: 2, gasComing: true },
    'bubbles with no wash: gas spreads here when this shift ends',
  );
  add(
    (t) => t.vented,
    { depth: 2, gas: 4, vented: true },
    'arrow: a vent clears the gas here when this shift ends',
  );
  add(
    (t) => t.charge === 'explosive',
    { charge: 'explosive' },
    'charge with a fuse: a placed explosive; it goes off when this shift ends',
  );
  add(
    (t) => t.charge === 'armedOre',
    { block: 'unstableOre', charge: 'armedOre' },
    'red starburst: armed unstable ore; it goes off when this shift ends',
  );
  add(
    (t) => t.blast,
    { blast: true },
    'dashed yellow frame: in an explosion when this shift ends (a charge, armed ore, or burning gas)',
  );
  return entries;
}

// ---------------------------------------------------------------------------
// The map itself
// ---------------------------------------------------------------------------

function button(className: string, text: string): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = className;
  made.textContent = text;
  return made;
}

/** The `localStorage` key the zoom level is kept under, per device (issue #69). */
export const ZOOM_KEY = 'mining-game.preview.zoom';

/** The zoom saved on this device (cells across), or `null` if none or storage cannot be read. */
function loadZoom(): number | null {
  try {
    const text = window.localStorage.getItem(ZOOM_KEY);
    const cells = text === null ? NaN : Number(text);
    return Number.isFinite(cells) && cells > 0 ? cells : null;
  } catch {
    return null;
  }
}

/** Remember the zoom on this device. Storage that refuses is ignored: it is only a convenience. */
function saveZoom(cells: number): void {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(Math.round(cells * 100) / 100));
  } catch {
    // Nothing to do.
  }
}

/**
 * Make the tap map. `onTap` is called with the square the player tapped; the
 * screen decides what the tap does (and then calls `show` again). `onHold`
 * is called with the square the player pressed and held still on for
 * `PREVIEW_MAP.holdMs`: the screen lists what is known of it (design doc
 * 7.2). A hold is never also a tap.
 */
export function createTapMap(
  onTap: (x: number, y: number) => void,
  onHold: (x: number, y: number) => void = () => undefined,
): TapMap {
  const element = document.createElement('section');
  element.className = 'tap-map';
  element.dataset['testid'] = 'tap-map';

  // The row of buttons over the map.
  const bar = document.createElement('div');
  bar.className = 'map-bar';
  const mapLabel = document.createElement('span');
  mapLabel.className = 'map-label';
  mapLabel.dataset['testid'] = 'map-label';
  // Zoom right out, and back to the usual size (issue #69).
  const wholeButton = button('small', 'Whole map');
  wholeButton.dataset['testid'] = 'whole-map';
  const zoomButton = button('small', 'Zoom in');
  zoomButton.dataset['testid'] = 'zoom-in';
  zoomButton.setAttribute('aria-label', `Zoom in to ${VIEW_CELLS} squares across`);
  bar.append(mapLabel, wholeButton, zoomButton);

  const frame = document.createElement('div');
  frame.className = 'map-frame';
  const canvas = document.createElement('canvas');
  canvas.className = 'map-canvas';
  canvas.dataset['testid'] = 'map-canvas';
  frame.append(canvas);

  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.dataset['testid'] = 'map-legend';

  element.append(bar, frame);

  // ----- What the map is showing -----
  let state: GameState | null = null;
  let marks: MapMarks = NO_MARKS;
  // The zoom starts where the player left it last time on this device.
  let camera: Camera = { x: 0, y: 0, cells: loadZoom() ?? VIEW_CELLS };

  // The map is square. Strips along its top and left hold the rulers (the x
  // and y of the squares), so the squares themselves start `ruler` pixels in
  // from the canvas's top-left corner.
  const ruler = PREVIEW_MAP.rulerPx;

  /** The width (and height) in pixels of the part of the canvas that shows squares. */
  function mapPixels(): number {
    return Math.max(1, frame.clientWidth - ruler);
  }

  function cellPixels(): number {
    return mapPixels() / camera.cells;
  }

  /**
   * The rulers: the x of the squares along the top and the y down the left,
   * so that "x17 y12" in the text under the map can be found. Every square is
   * named while the squares are big enough, and every fifth when they are not.
   */
  function drawRulers(ctx: CanvasRenderingContext2D, c: number, sidePx: number): void {
    ctx.save();
    ctx.fillStyle = MARK_COLOURS.rulerBackground;
    ctx.fillRect(0, 0, sidePx, ruler);
    ctx.fillRect(0, 0, ruler, sidePx);
    ctx.fillStyle = MARK_COLOURS.ruler;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const every = c >= PREVIEW_MAP.rulerEveryCellPx ? 1 : 5;
    const first = Math.floor(camera.x);
    const firstY = Math.floor(camera.y);
    ctx.textAlign = 'center';
    for (let x = first; x <= first + Math.ceil(camera.cells); x += 1) {
      const px = ruler + (x - camera.x + 0.5) * c;
      if (x % every === 0 && px > ruler + 4 && px < sidePx - 4) {
        ctx.fillText(String(x), px, ruler / 2 + 0.5);
      }
    }
    ctx.textAlign = 'right';
    for (let y = firstY; y <= firstY + Math.ceil(camera.cells); y += 1) {
      const py = ruler + (y - camera.y + 0.5) * c;
      if (y % every === 0 && py > ruler + 4 && py < sidePx - 4) {
        ctx.fillText(String(y), ruler - 2, py + 0.5);
      }
    }
    ctx.restore();
  }

  /** A dashed outline round the square (x, y). */
  function outline(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, colour: string) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2.5, c / 7);
    ctx.setLineDash([c / 4, c / 8]);
    ctx.strokeRect(
      ruler + (x - camera.x) * c + 1.5,
      ruler + (y - camera.y) * c + 1.5,
      c - 3,
      c - 3,
    );
    ctx.restore();
  }

  function draw(): void {
    if (state === null) {
      return;
    }
    const s = state;
    const c = cellPixels();
    const dpr = window.devicePixelRatio || 1;
    const sidePx = Math.round(frame.clientWidth);
    if (canvas.width !== Math.round(sidePx * dpr)) {
      canvas.width = Math.round(sidePx * dpr);
      canvas.height = Math.round(sidePx * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sidePx, sidePx);

    // One cell more than the window, for the part-cells while dragging.
    const x0 = Math.floor(camera.x);
    const y0 = Math.floor(camera.y);
    const span = Math.ceil(camera.cells) + 1;
    // Grid lines only where the cells are big enough for them not to crowd the marks.
    const grid = c >= PREVIEW_MAP.gridMinCellPx;
    const drawn: Tile[] = [];
    for (const row of buildTiles(s, { x0, y0, size: span })) {
      for (const tile of row) {
        drawTile(
          ctx,
          tile,
          ruler + (tile.x - camera.x) * c,
          ruler + (tile.y - camera.y) * c,
          c,
          grid,
        );
        if (isInView(camera, tile.x, tile.y)) {
          drawn.push(tile);
        }
      }
    }
    legend.replaceChildren(...legendFor(drawn));
    // What the canvas shows of water and lava, as text, for the tests: the
    // squares in view with their units ("3,4:2"), and the squares each will
    // flow onto when the shift ends.
    const list = (pick: (tile: Tile) => string | null): string => {
      const parts: string[] = [];
      for (const tile of drawn) {
        const part = pick(tile);
        if (part !== null) {
          parts.push(part);
        }
      }
      return parts.join(' ');
    };
    const at = (tile: Tile): string => `${tile.x},${tile.y}`;
    canvas.dataset['water'] = list((t) => (t.water > 0 ? `${at(t)}:${t.water}` : null));
    canvas.dataset['lava'] = list((t) => (t.lava > 0 ? `${at(t)}:${t.lava}` : null));
    canvas.dataset['waterComing'] = list((t) => (t.waterComing ? at(t) : null));
    canvas.dataset['lavaComing'] = list((t) => (t.lavaComing ? at(t) : null));
    // The same for gas, charges ("3,4:explosive") and the squares that will
    // be in an explosion when the shift ends.
    canvas.dataset['gas'] = list((t) => (t.gas > 0 ? `${at(t)}:${t.gas}` : null));
    canvas.dataset['gasComing'] = list((t) => (t.gasComing ? at(t) : null));
    canvas.dataset['vented'] = list((t) => (t.vented ? at(t) : null));
    canvas.dataset['charges'] = list((t) => (t.charge !== null ? `${at(t)}:${t.charge}` : null));
    canvas.dataset['blast'] = list((t) => (t.blast ? at(t) : null));

    // After a tap that was not taken: the tapped square in yellow, the
    // neighbours that are too high for the level rule in red, and the squares
    // a risky mine would make unstable in orange.
    for (const square of marks.tooHigh) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.tooHigh);
    }
    for (const square of marks.unstable) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.unstable);
    }
    // The squares that stop a camp being founded on the tapped patch, in red.
    for (const square of marks.blocked) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.blocked);
    }
    // The blast of a charge about to be placed, or of ore a mine would arm.
    for (const square of marks.blast) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.blastPreview);
    }
    // The range of a pump or of a scan, in light blue.
    for (const square of marks.range) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.range);
    }
    if (marks.selected !== null) {
      outline(ctx, marks.selected.x, marks.selected.y, c, MARK_COLOURS.selected);
    }

    // The rulers go on last, over the part-squares that reach into their strips.
    drawRulers(ctx, c, sidePx);

    const across = Math.round(camera.cells);
    mapLabel.textContent =
      across >= Math.max(s.size.x, s.size.y)
        ? 'The whole map'
        : `${across} of ${s.size.x} squares across`;

    // For the tests: where the camera is, how big a cell is, what is marked.
    canvas.dataset['camX'] = String(camera.x);
    canvas.dataset['camY'] = String(camera.y);
    canvas.dataset['cellPx'] = String(c);
    // Where the squares start on the canvas: after the rulers.
    canvas.dataset['originPx'] = String(ruler);
    canvas.dataset['worked'] = list((t) => (t.worked ? at(t) : null));
    canvas.dataset['crewHurt'] = list((t) => (t.crewHurt ? at(t) : null));
    // The cracks in view with their countdowns: "3,4:2", or "3,4:2:stopped".
    canvas.dataset['cracks'] = list((t) => {
      if (t.crack === null) {
        return null;
      }
      return `${at(t)}:${t.crack}${t.crackRunning ? '' : ':stopped'}`;
    });
    // The tells in view: "3,4:dp" (d damp, p pitted, w warm glow, h hairline glow).
    canvas.dataset['tells'] = list((t) => {
      const letters =
        (t.tells.damp ? 'd' : '') +
        (t.tells.pitted ? 'p' : '') +
        (t.tells.warm ? 'w' : '') +
        (t.tells.hairline ? 'h' : '');
      return letters === '' ? null : `${at(t)}:${letters}`;
    });
    canvas.dataset['cells'] = String(camera.cells);
    canvas.dataset['selected'] =
      marks.selected === null ? '' : `${marks.selected.x},${marks.selected.y}`;
    canvas.dataset['tooHigh'] = marks.tooHigh.map((square) => `${square.x},${square.y}`).join(' ');
    canvas.dataset['unstable'] = marks.unstable
      .map((square) => `${square.x},${square.y}`)
      .join(' ');
    canvas.dataset['blocked'] = marks.blocked.map((square) => `${square.x},${square.y}`).join(' ');
    canvas.dataset['blastMarks'] = marks.blast.map((square) => `${square.x},${square.y}`).join(' ');
    canvas.dataset['range'] = marks.range.map((square) => `${square.x},${square.y}`).join(' ');
    // The structures and scan marks in view: "3,4:pump", and "3,4:op" for a
    // square with ore and a pocket known below (o ore, p pocket, c cavern,
    // "-" for plain rock).
    canvas.dataset['structures'] = list((t) =>
      t.structure === null ? null : `${at(t)}:${t.structure}`,
    );
    canvas.dataset['below'] = list((t) => {
      if (!t.below.any) {
        return null;
      }
      const letters =
        (t.below.ore ? 'o' : '') + (t.below.pocket ? 'p' : '') + (t.below.cavern ? 'c' : '');
      return `${at(t)}:${letters === '' ? '-' : letters}`;
    });
  }

  /** A tap (not a drag) at (px, py) pixels from the map's top-left corner. */
  function tap(px: number, py: number): void {
    if (state === null) {
      return;
    }
    if (px < 0 || py < 0) {
      return; // on a ruler
    }
    const cell = cellAt(camera, px, py, cellPixels());
    if (cell.x < 0 || cell.y < 0 || cell.x >= state.size.x || cell.y >= state.size.y) {
      return;
    }
    onTap(cell.x, cell.y);
  }

  // ----- Touch and mouse: a drag pans, a pinch zooms, a tap acts -----
  // Pointer events cover both touch and mouse. Every finger (or the mouse)
  // that is down is kept in `pointers`, by its pointer id. A gesture starts
  // with the first finger down and ends when the last one lifts:
  // - one finger that moves more than `dragThresholdPx` is a drag (it pans);
  // - a second finger turns the gesture into a pinch (it zooms, and pans as
  //   the fingers' midpoint moves);
  // - only a single finger that never moved far counts as a tap. A gesture
  //   that was ever a drag or a pinch never does, even when it ends with one
  //   finger lifting on its own (issue #69).
  const pointers = new Map<number, { x: number; y: number }>();
  interface Gesture {
    /** 'held': a press that lasted long enough to be a hold; it is not a tap. */
    kind: 'press' | 'drag' | 'pinch' | 'held';
    /** The camera when the drag or pinch started. */
    camera: Camera;
    /** Where the first finger went down (page pixels). */
    startX: number;
    startY: number;
    /** For a pinch: the distance between the fingers and their midpoint (map pixels) at its start. */
    pinchDistance: number;
    pinchMidX: number;
    pinchMidY: number;
  }
  let gesture: Gesture | null = null;
  // The timer of a press that may become a hold; `null` when none is running.
  // `ReturnType<typeof setTimeout>` is "whatever `setTimeout` returns here".
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelHold(): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  /** The midpoint of the first two fingers, in pixels from the map's corner, and their distance apart. */
  function twoFingers(): { midX: number; midY: number; distance: number } | null {
    const [a, b] = [...pointers.values()];
    if (a === undefined || b === undefined) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      midX: (a.x + b.x) / 2 - rect.left - ruler,
      midY: (a.y + b.y) / 2 - rect.top - ruler,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gesture = {
        kind: 'press',
        camera: { ...camera },
        startX: event.clientX,
        startY: event.clientY,
        pinchDistance: 0,
        pinchMidX: 0,
        pinchMidY: 0,
      };
      // If the finger stays down and still for `holdMs`, this is a hold.
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left - ruler;
      const py = event.clientY - rect.top - ruler;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (gesture === null || gesture.kind !== 'press' || state === null) {
          return;
        }
        // Not a tap any more: lifting the finger then does nothing.
        gesture.kind = 'held';
        const cell = cellAt(camera, px, py, cellPixels());
        const onMap = px >= 0 && py >= 0;
        if (onMap && cell.x >= 0 && cell.y >= 0 && cell.x < state.size.x && cell.y < state.size.y) {
          onHold(cell.x, cell.y);
        }
      }, PREVIEW_MAP.holdMs);
      return;
    }
    // A second finger: from now on this gesture is a pinch.
    cancelHold();
    const fingers = twoFingers();
    if (gesture !== null && fingers !== null) {
      gesture.kind = 'pinch';
      gesture.camera = { ...camera };
      gesture.pinchDistance = fingers.distance;
      gesture.pinchMidX = fingers.midX;
      gesture.pinchMidY = fingers.midY;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || gesture === null || state === null) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.kind === 'pinch') {
      const fingers = twoFingers();
      if (fingers === null) {
        return; // one finger already lifted: the pinch is over, wait for the other
      }
      // Fingers twice as far apart show half as many cells across.
      const cells = (gesture.camera.cells * gesture.pinchDistance) / fingers.distance;
      camera = zoomedAbout(
        gesture.camera,
        cells,
        gesture.pinchMidX,
        gesture.pinchMidY,
        fingers.midX,
        fingers.midY,
        mapPixels(),
        state.size,
      );
      draw();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.kind === 'press' && Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) {
      gesture.kind = 'drag';
      cancelHold();
    }
    if (gesture.kind === 'drag') {
      camera = panned(gesture.camera, dx, dy, cellPixels(), state.size);
      draw();
    }
  });

  /** A finger lifted, or the browser took it over (pointercancel: never a tap). */
  function liftPointer(event: PointerEvent, cancelled: boolean): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.delete(event.pointerId);
    if (gesture === null) {
      return;
    }
    if (pointers.size >= 2 && gesture.kind === 'pinch') {
      // With three fingers down, lifting one of the first two makes a new
      // pair: start the pinch afresh from where it is now, or the map would
      // jump once (review of PR #71).
      const fingers = twoFingers();
      if (fingers !== null) {
        gesture.camera = { ...camera };
        gesture.pinchDistance = fingers.distance;
        gesture.pinchMidX = fingers.midX;
        gesture.pinchMidY = fingers.midY;
      }
    }
    if (pointers.size > 0) {
      return; // other fingers are still down: the gesture goes on
    }
    const ended = gesture;
    gesture = null;
    cancelHold();
    if (ended.kind === 'pinch') {
      saveZoom(camera.cells);
    } else if (ended.kind === 'press' && !cancelled) {
      const rect = canvas.getBoundingClientRect();
      tap(event.clientX - rect.left - ruler, event.clientY - rect.top - ruler);
    }
  }
  canvas.addEventListener('pointerup', (event) => {
    liftPointer(event, false);
  });
  canvas.addEventListener('pointercancel', (event) => {
    liftPointer(event, true);
  });

  // The mouse wheel (and a trackpad pinch, which browsers send as a wheel
  // with the ctrl key held) zooms about the pointer. `passive: false` lets
  // `preventDefault` stop the page from scrolling or zooming instead.
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (state === null) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left - ruler;
      const py = event.clientY - rect.top - ruler;
      // Wheel down (positive deltaY) zooms out: more cells across.
      const cells = camera.cells * Math.exp(event.deltaY * PREVIEW_MAP.wheelZoomRate);
      camera = zoomedAbout(camera, cells, px, py, px, py, mapPixels(), state.size);
      draw();
      saveZoom(camera.cells);
    },
    { passive: false },
  );

  // ----- The buttons -----
  /** Zoom to `cells` across about the middle of what is on screen. */
  function zoomTo(cells: number): void {
    if (state === null) {
      return;
    }
    const middle = mapPixels() / 2;
    camera = zoomedAbout(camera, cells, middle, middle, middle, middle, mapPixels(), state.size);
    draw();
    saveZoom(camera.cells);
  }
  wholeButton.addEventListener('click', () => {
    if (state !== null) {
      zoomTo(wholeMap(state.size).cells);
    }
  });
  zoomButton.addEventListener('click', () => {
    zoomTo(VIEW_CELLS);
  });
  window.addEventListener('resize', () => {
    draw();
  });

  function show(next: GameState, fresh: boolean, nextMarks: MapMarks): void {
    state = next;
    marks = nextMarks;
    // A new or resumed run opens on its pit, or, with nothing dug yet, on the
    // nearest coal in sight (`openingSquare`), at the zoom the player last
    // used; otherwise the map stays where the player left it.
    if (fresh) {
      const opening = openingSquare(next);
      camera = centredOn(opening.x, opening.y, next.size, camera.cells);
    } else {
      camera = clampCamera(camera, next.size);
    }
    draw();
  }

  return { element, legend, show };
}
