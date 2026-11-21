// UI labs (issues #116 and #118): drawing one square of the map, and the
// short cues after a tap. Lab 1 and Lab 2 both draw with these, so the two
// labs' blocks look exactly the same.
//
// Everything here only draws on a canvas; nothing reads or changes a world.

import type { HigherNeighbour, SquareDirection } from '../../engine';
import { LAB_LOOK, LAB_MARKS } from './labLook';
import { textureFor } from './textures';

/** Where a square is drawn: its inner box on the canvas, in CSS pixels (the gap is already taken off). */
export interface SquareBox {
  left: number;
  top: number;
  inner: number;
}

/** The inner box of a square whose top-left corner is at (px, py), for squares `c` pixels wide. */
export function squareBox(px: number, py: number, c: number): SquareBox {
  const gap = Math.max(1, c * LAB_LOOK.gapFraction);
  return { left: px + gap / 2, top: py + gap / 2, inner: c - gap };
}

/**
 * One square: block `code`'s texture (square (x, y) picks the variant),
 * dimmed by `depth`, then a faint bevel and a soft shadow along each edge in
 * `shadows` (the edges that face a higher neighbour).
 */
export function drawBlockSquare(
  ctx: CanvasRenderingContext2D,
  code: number,
  depth: number,
  shadows: SquareDirection[],
  x: number,
  y: number,
  box: SquareBox,
  /** A texture to draw in place of block `code`'s (Lab 2's clay); the block's own if left out. */
  override?: HTMLCanvasElement | null,
): void {
  const { left, top, inner } = box;
  const texture = override ?? textureFor(code, x, y);
  if (texture !== null) {
    ctx.drawImage(texture, left, top, inner, inner);
  }

  // Deeper squares are a little darker, so a pit reads as a pit even without its shadows.
  const brightness = Math.max(
    LAB_LOOK.depthMinBrightness,
    LAB_LOOK.depthBrightnessPerLevel ** depth,
  );
  if (brightness < 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - brightness})`;
    ctx.fillRect(left, top, inner, inner);
  }

  // A faint bevel: light along the top, dark along the bottom, so each block reads as a block.
  const bevel = Math.max(1, inner * 0.05);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fillRect(left, top, inner, bevel);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(left, top + inner - bevel, inner, bevel);

  for (const edge of shadows) {
    drawShadow(ctx, edge, box);
  }
}

/** A soft shadow inside the square, along one edge, fading towards the middle. */
function drawShadow(ctx: CanvasRenderingContext2D, edge: SquareDirection, box: SquareBox): void {
  const { left, top, inner } = box;
  const depth = inner * LAB_LOOK.shadowWidth;
  // Where the gradient starts (on the edge) and ends (inside the square).
  let fromX = left;
  let fromY = top;
  let toX = left;
  let toY = top;
  // The strip of the square the shadow covers: set by each branch below.
  let rect: { x: number; y: number; w: number; h: number };
  if (edge === 'north') {
    toY = top + depth;
    rect = { x: left, y: top, w: inner, h: depth };
  } else if (edge === 'south') {
    fromY = top + inner;
    toY = top + inner - depth;
    rect = { x: left, y: top + inner - depth, w: inner, h: depth };
  } else if (edge === 'west') {
    toX = left + depth;
    rect = { x: left, y: top, w: depth, h: inner };
  } else {
    fromX = left + inner;
    toX = left + inner - depth;
    rect = { x: left + inner - depth, y: top, w: depth, h: inner };
  }
  const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${LAB_LOOK.shadowAlpha})`);
  gradient.addColorStop(0.45, `rgba(0, 0, 0, ${LAB_LOOK.shadowAlpha * 0.35})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // A thin sharp line right on the edge, so the step reads even when zoomed out.
  const line = Math.max(1, inner * 0.035);
  ctx.fillStyle = `rgba(0, 0, 0, ${LAB_LOOK.shadowLineAlpha})`;
  if (edge === 'north') ctx.fillRect(left, top, inner, line);
  else if (edge === 'south') ctx.fillRect(left, top + inner - line, inner, line);
  else if (edge === 'west') ctx.fillRect(left, top, line, inner);
  else ctx.fillRect(left + inner - line, top, line, inner);
}

/** The cue on a square just mined, `t` of the way through (0 to 1): a flash, and the yield floating up. */
export function drawMinedCue(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  c: number,
  t: number,
  label: string,
): void {
  // A quick flash on the square...
  const flash = Math.max(0, 1 - t * 3);
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = LAB_MARKS.minedFlash;
    ctx.fillRect(px, py, c, c);
    ctx.globalAlpha = 1;
  }
  // ...and the yield floating up from it.
  if (label !== '') {
    drawFloatingLabel(ctx, px, py, c, t, label, LAB_MARKS.gain);
  }
}

/** A short label that floats up from a square and fades, `t` of the way through (0 to 1). */
export function drawFloatingLabel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  c: number,
  t: number,
  label: string,
  colour: string,
): void {
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.font = `600 ${Math.max(12, Math.min(18, c * 0.5))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = LAB_MARKS.gainOutline;
  const ly = py + c * 0.3 - t * c * 1.1;
  ctx.strokeText(label, px + c / 2, ly);
  ctx.fillStyle = colour;
  ctx.fillText(label, px + c / 2, ly);
  ctx.globalAlpha = 1;
}

/**
 * The cue after the level rule refused a tap, `t` of the way through (0 to
 * 1): the neighbours that are too high pulse yellow, and the tapped square
 * gets a dashed red outline. `toPx` turns a square into its top-left pixel.
 */
export function drawRefusedCue(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  c: number,
  t: number,
  higher: HigherNeighbour[],
  toPx: (x: number, y: number) => { px: number; py: number },
): void {
  // Two pulses that start bright and fade out.
  const pulse = Math.sqrt(Math.max(0, 1 - t)) * (0.75 + 0.25 * Math.cos(t * Math.PI * 4));
  ctx.globalAlpha = pulse;
  ctx.lineWidth = Math.max(2, c * 0.08);
  ctx.strokeStyle = LAB_MARKS.tooHigh;
  for (const n of higher) {
    const at = toPx(n.x, n.y);
    ctx.fillStyle = LAB_MARKS.tooHighWash;
    ctx.fillRect(at.px, at.py, c, c);
    ctx.strokeRect(
      at.px + ctx.lineWidth / 2,
      at.py + ctx.lineWidth / 2,
      c - ctx.lineWidth,
      c - ctx.lineWidth,
    );
  }
  ctx.strokeStyle = LAB_MARKS.refused;
  ctx.setLineDash([Math.max(3, c * 0.15), Math.max(2, c * 0.1)]);
  ctx.strokeRect(
    px + ctx.lineWidth / 2,
    py + ctx.lineWidth / 2,
    c - ctx.lineWidth,
    c - ctx.lineWidth,
  );
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/**
 * Size `canvas`'s pixels to its size on screen times the device's pixel
 * ratio (for a sharp picture), and return its 2D context set to draw in CSS
 * pixels, with its size in CSS pixels. `null` if it cannot be drawn on yet.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  const wantedWidth = Math.round(width * ratio);
  const wantedHeight = Math.round(height * ratio);
  if (canvas.width !== wantedWidth || canvas.height !== wantedHeight) {
    canvas.width = wantedWidth;
    canvas.height = wantedHeight;
  }
  const ctx = canvas.getContext('2d');
  if (ctx === null || width === 0) {
    return null;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = LAB_MARKS.gap;
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

/**
 * A redraw loop for the short cues after a tap. `frame(now)` draws one
 * frame and says whether any cue is still running; `start()` keeps calling
 * it, once per screen refresh, until it says no.
 */
export function cueLoop(frame: (now: number) => boolean): { start: () => void } {
  let running = false;
  function start(): void {
    if (running) {
      return;
    }
    running = true;
    const step = (now: number): void => {
      if (frame(now)) {
        requestAnimationFrame(step);
      } else {
        running = false;
      }
    };
    requestAnimationFrame(step);
  }
  return { start };
}
