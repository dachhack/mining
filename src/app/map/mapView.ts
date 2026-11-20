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

import { BLOCKS } from '../../data';
import type { BlockId } from '../../data';
import type { GameState } from '../../engine';
import {
  VIEW_CELLS,
  cellAt,
  centredOnMiddle,
  clampCamera,
  isInView,
  panned,
  wholeMap,
  zoomedAbout,
} from './camera';
import type { Camera } from './camera';
import { BLOCK_LOOKS, MARK_COLOURS, PREVIEW_MAP, SURFACE_LOOKS, UNKNOWN_LOOK } from './palette';
import type { Pattern, SurfaceMark } from './palette';
import { NO_MARKS } from './targets';
import type { MapMarks } from './targets';
import { buildTiles, depthBrightness } from './tiles';
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
   * resumed run: the map then centres on the middle.
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
    // The depth as a number in the bottom-right corner, white with a dark edge.
    ctx.save();
    ctx.font = `bold ${Math.round(c * 0.42)}px system-ui, sans-serif`;
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

/** The marks drawn over a tile: mineral traces, a structure and a crack. */
function drawMarks(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, c: number) {
  const mid = c / 2;
  if (tile.traced) {
    // Three small gold dots along the top edge: mineral traces seen on this rock.
    ctx.fillStyle = MARK_COLOURS.traces;
    for (const fx of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(x + fx * c, y + 0.16 * c, Math.max(1.2, c / 11), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (tile.structure === 'support') {
    // A T: a beam on a post.
    ctx.strokeStyle = MARK_COLOURS.support;
    ctx.lineWidth = Math.max(2, c / 7);
    ctx.beginPath();
    ctx.moveTo(x + 0.2 * c, y + 0.25 * c);
    ctx.lineTo(x + 0.8 * c, y + 0.25 * c);
    ctx.moveTo(x + mid, y + 0.25 * c);
    ctx.lineTo(x + mid, y + 0.85 * c);
    ctx.stroke();
  } else if (tile.structure === 'other') {
    ctx.strokeStyle = MARK_COLOURS.otherStructure;
    ctx.lineWidth = Math.max(1.5, c / 10);
    ctx.strokeRect(x + 0.25 * c, y + 0.25 * c, 0.5 * c, 0.5 * c);
  }
  if (tile.crack !== null) {
    // A jagged line from corner to corner, dark underneath so that it shows
    // on any rock, and the countdown in the top-right corner. Red while the
    // countdown is running; pale grey when it has stopped.
    const crackColour = tile.crackRunning ? MARK_COLOURS.crack : MARK_COLOURS.crackStopped;
    const zigzag: [number, number][] = [
      [0.1, 0.15],
      [0.42, 0.4],
      [0.3, 0.58],
      [0.7, 0.7],
      [0.9, 0.92],
    ];
    for (const [colour, width] of [
      [MARK_COLOURS.crackOutline, Math.max(3, c / 6)],
      [crackColour, Math.max(1.5, c / 11)],
    ] as const) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      zigzag.forEach(([fx, fy], index) => {
        if (index === 0) {
          ctx.moveTo(x + fx * c, y + fy * c);
        } else {
          ctx.lineTo(x + fx * c, y + fy * c);
        }
      });
      ctx.stroke();
    }
    ctx.font = `bold ${Math.max(8, Math.round(c * 0.42))}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(2, c / 10);
    ctx.strokeStyle = MARK_COLOURS.crackOutline;
    ctx.strokeText(String(tile.crack), x + c - 2, y + 1);
    ctx.fillStyle = crackColour;
    ctx.fillText(String(tile.crack), x + c - 2, y + 1);
  }
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
    structure: null,
    crack: null,
    crackRunning: false,
    surface: null,
    higher: { north: false, east: false, south: false, west: false },
    ...overrides,
  };
}

/** One legend entry: a little drawn tile and its meaning. */
function legendEntry(tile: Tile, label: string): HTMLElement {
  const entry = document.createElement('span');
  entry.className = 'legend-entry';
  const swatch = document.createElement('canvas');
  const px = 18;
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
  const blocks = new Set<BlockId>();
  const surfaceKinds = new Set<SurfaceMark>();
  const structures = new Set<string>();
  let floor = false;
  let dug = false;
  let traced = false;
  let cracked = false;
  let stoppedCrack = false;
  for (const tile of tiles) {
    if (tile.crack !== null && tile.crackRunning) cracked = true;
    if (tile.crack !== null && !tile.crackRunning) stoppedCrack = true;
    if (tile.kind === 'block' && tile.block !== null) blocks.add(tile.block);
    if (tile.kind === 'floor') floor = true;
    if (tile.surface !== null) surfaceKinds.add(tile.surface);
    if (tile.structure !== null) structures.add(tile.structure);
    if (tile.depth > 0) dug = true;
    if (tile.traced) traced = true;
  }
  // The surface kinds (issue #70), in a fixed order.
  const surfaceLabels: [SurfaceMark, string][] = [
    ['tree', 'tree (tap to cut; hides the block under it)'],
    ['stump', 'stump (a tree grows back)'],
    ['path', 'dirt path'],
    ['meadow', 'meadow'],
    ['outcrop', 'stone outcrop'],
  ];
  for (const [kind, label] of surfaceLabels) {
    if (surfaceKinds.has(kind)) {
      // Shown over dirt, as on the map (a tree hides it anyway).
      entries.push(legendEntry(sampleTile({ block: 'dirt', surface: kind }), label));
    }
  }
  // In the order of the data's block list, so the legend does not jump about.
  for (const id of Object.keys(BLOCKS) as BlockId[]) {
    if (blocks.has(id)) {
      entries.push(legendEntry(sampleTile({ block: id }), BLOCKS[id].name));
    }
  }
  if (floor) {
    entries.push(legendEntry(sampleTile({ kind: 'floor', block: null }), 'bedrock floor'));
  }
  if (dug) {
    entries.push(legendEntry(sampleTile({ depth: 3 }), 'dug: deeper is darker'));
    entries.push(
      legendEntry(
        sampleTile({
          depth: 1,
          higher: { north: true, east: false, south: false, west: true },
        }),
        'shadow: that side is higher',
      ),
    );
  }
  if (traced) {
    entries.push(legendEntry(sampleTile({ traced: true }), 'mineral traces'));
  }
  if (structures.has('support')) {
    entries.push(legendEntry(sampleTile({ structure: 'support' }), 'support'));
  }
  if (structures.has('other')) {
    entries.push(legendEntry(sampleTile({ structure: 'other' }), 'other structure'));
  }
  if (cracked) {
    entries.push(
      legendEntry(
        sampleTile({ block: 'dirt', crack: 1, crackRunning: true }),
        'crack: the block slumps into the pit; the number is its countdown (1 = when this shift ends)',
      ),
    );
  }
  if (stoppedCrack) {
    entries.push(
      legendEntry(
        sampleTile({ block: 'dirt', crack: 1, crackRunning: false }),
        'pale crack: countdown stopped (the square is stable or held); it goes on if that changes',
      ),
    );
  }
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
 * screen decides what the tap does (and then calls `show` again).
 */
export function createTapMap(onTap: (x: number, y: number) => void): TapMap {
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

  function cellPixels(): number {
    return frame.clientWidth / camera.cells;
  }

  /** A dashed outline round the square (x, y). */
  function outline(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, colour: string) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2.5, c / 7);
    ctx.setLineDash([c / 4, c / 8]);
    ctx.strokeRect((x - camera.x) * c + 1.5, (y - camera.y) * c + 1.5, c - 3, c - 3);
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
        drawTile(ctx, tile, (tile.x - camera.x) * c, (tile.y - camera.y) * c, c, grid);
        if (isInView(camera, tile.x, tile.y)) {
          drawn.push(tile);
        }
      }
    }
    legend.replaceChildren(...legendFor(drawn));

    // After a tap that was not taken: the tapped square in yellow, the
    // neighbours that are too high for the level rule in red, and the squares
    // a risky mine would make unstable in orange.
    for (const square of marks.tooHigh) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.tooHigh);
    }
    for (const square of marks.unstable) {
      outline(ctx, square.x, square.y, c, MARK_COLOURS.unstable);
    }
    if (marks.selected !== null) {
      outline(ctx, marks.selected.x, marks.selected.y, c, MARK_COLOURS.selected);
    }

    const across = Math.round(camera.cells);
    mapLabel.textContent =
      across >= Math.max(s.size.x, s.size.y)
        ? 'The whole map · tap a square'
        : `${across} of ${s.size.x} squares across · tap a square`;

    // For the tests: where the camera is, how big a cell is, what is marked.
    canvas.dataset['camX'] = String(camera.x);
    canvas.dataset['camY'] = String(camera.y);
    canvas.dataset['cellPx'] = String(c);
    canvas.dataset['cells'] = String(camera.cells);
    canvas.dataset['selected'] =
      marks.selected === null ? '' : `${marks.selected.x},${marks.selected.y}`;
    canvas.dataset['tooHigh'] = marks.tooHigh.map((square) => `${square.x},${square.y}`).join(' ');
    canvas.dataset['unstable'] = marks.unstable
      .map((square) => `${square.x},${square.y}`)
      .join(' ');
  }

  /** A tap (not a drag) at (px, py) pixels from the map's top-left corner. */
  function tap(px: number, py: number): void {
    if (state === null) {
      return;
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
    kind: 'press' | 'drag' | 'pinch';
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

  /** The midpoint of the first two fingers, in pixels from the map's corner, and their distance apart. */
  function twoFingers(): { midX: number; midY: number; distance: number } | null {
    const [a, b] = [...pointers.values()];
    if (a === undefined || b === undefined) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
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
      return;
    }
    // A second finger: from now on this gesture is a pinch.
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
        frame.clientWidth,
        state.size,
      );
      draw();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.kind === 'press' && Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) {
      gesture.kind = 'drag';
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
    if (ended.kind === 'pinch') {
      saveZoom(camera.cells);
    } else if (ended.kind === 'press' && !cancelled) {
      const rect = canvas.getBoundingClientRect();
      tap(event.clientX - rect.left, event.clientY - rect.top);
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
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      // Wheel down (positive deltaY) zooms out: more cells across.
      const cells = camera.cells * Math.exp(event.deltaY * PREVIEW_MAP.wheelZoomRate);
      camera = zoomedAbout(camera, cells, px, py, px, py, frame.clientWidth, state.size);
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
    const middle = frame.clientWidth / 2;
    camera = zoomedAbout(
      camera,
      cells,
      middle,
      middle,
      middle,
      middle,
      frame.clientWidth,
      state.size,
    );
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
    // A new or resumed run starts on the middle of the map, at the zoom the
    // player last used; otherwise the map stays where the player left it.
    camera = fresh ? centredOnMiddle(next.size, camera.cells) : clampCamera(camera, next.size);
    draw();
  }

  return { element, legend, show };
}
